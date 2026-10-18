// Spec: 08-3 §12.2 (memory file format: parser regex, brace tokens, the 7 origin labels, brace-less lines, `## Private`,
// CRLF in / LF out, no BOM, unparseable lines kept and reported), §12.4 (`add.text` ≤ 120, `kind='person'` needs `person`),
// 08-1 §2.5 (parsing and hashing run in worker_threads). Expected values are copied from the spec text.
import { describe, expect, it } from 'vitest';
import { ORIGIN_LABELS, parseMemoryFile, validateAdd, writeMemoryFile, type MemoryOrigin } from '../../src/engine/memory/fileFormat';
import { factHash } from '../../src/engine/memory/hash';
import { createParseWorker } from '../../src/engine/memory/parseWorker';

// The §12.2 example file, verbatim.
const SPEC_EXAMPLE = [
  '# About you',
  '- Vegetarian on Tuesdays  {you said · 2026-10-02 · chat · f_01929a3e-7c41-7d2a-9b1e-3f5a2c8d4e61}',
  '- Prefers window seats  {I guessed · 2026-10-09 · from 4 bookings · f_0193b2c4-1a07-7e3f-8c55-0d9e6f7a1b22}',
  '',
  '## Private',
  '- Lives at 14 Hill Road, Bandra  {you said · 2026-10-03 · chat · private · f_0194c1d0-5e22-7f10-a3b4-6c7d8e9f0a13}',
  '',
].join('\n');

const ABOUT = 'memory/about-you.md';
const TODAY = '2026-10-16';
let n = 0;
const ids = () => `f_0199aaaa-0000-7000-8000-${String(++n).padStart(12, '0')}`;
const opts = (file = ABOUT) => ({ file, today: TODAY, newId: ids });

describe('08-3 §12.2 parser', () => {
  it('reads the spec example: provenance, date, origin, reason, private, full id, kind from the file', () => {
    const r = parseMemoryFile(SPEC_EXAMPLE, opts());
    expect(r.badLines).toEqual([]);
    expect(r.rewrite).toBe(false);
    expect(r.facts.map((f) => [f.text, f.provenance, f.date, f.reason, f.private, f.id, f.kind])).toEqual([
      ['Vegetarian on Tuesdays', 'said', '2026-10-02', null, false, 'f_01929a3e-7c41-7d2a-9b1e-3f5a2c8d4e61', 'fact'],
      ['Prefers window seats', 'guessed', '2026-10-09', 'from 4 bookings', false, 'f_0193b2c4-1a07-7e3f-8c55-0d9e6f7a1b22', 'fact'],
      ['Lives at 14 Hill Road, Bandra', 'said', '2026-10-03', null, true, 'f_0194c1d0-5e22-7f10-a3b4-6c7d8e9f0a13', 'fact'],
    ]);
    expect(r.facts.map((f) => f.lineNo)).toEqual([2, 3, 6]);
    // CR-0010 G-M6-13: a brace with no origin label (the example's guessed fact) reads as `manual`.
    expect(r.facts.map((f) => f.origin)).toEqual(['chat', 'manual', 'chat']);
  });

  it('maps exactly the 7 origin labels 1:1 to MemoryOrigin, case-sensitive', () => {
    const table: [string, MemoryOrigin][] = [
      ['chat', 'chat'],
      ['Gmail', 'gmail'],
      ['Calendar', 'gcal'],
      ['WhatsApp', 'whatsapp'],
      ['you typed it', 'manual'],
      ['setup', 'setup'],
      ['a task', 'job'],
    ];
    expect(Object.entries(ORIGIN_LABELS).sort()).toEqual(table.map(([l, o]) => [o, l]).sort());
    for (const [label, origin] of table) {
      const r = parseMemoryFile(`- Likes tea  {you said · 2026-10-02 · ${label} · f_01929a3e-7c41-7d2a-9b1e-3f5a2c8d4e61}`, opts());
      expect(r.facts[0]?.origin).toBe(origin);
    }
    const bad = parseMemoryFile('- Likes tea  {you said · 2026-10-02 · gmail · private · f_01929a3e-7c41-7d2a-9b1e-3f5a2c8d4e61}', opts());
    expect(bad.facts).toEqual([]);
    expect(bad.badLines).toEqual([
      { lineNo: 1, text: '- Likes tea  {you said · 2026-10-02 · gmail · private · f_01929a3e-7c41-7d2a-9b1e-3f5a2c8d4e61}' },
    ]);
  });

  it('reads the optional kind token, and derives kind from the folder when missing (X-06)', () => {
    const line = '- Mom likes jasmine  {you said · 2026-10-02 · chat · f_01929a3e-7c41-7d2a-9b1e-3f5a2c8d4e61}';
    expect(parseMemoryFile(line, opts('memory/people/mom.md')).facts[0]?.kind).toBe('person');
    expect(parseMemoryFile(line, opts('memory/preferences/food.md')).facts[0]?.kind).toBe('preference');
    expect(parseMemoryFile(line, opts('helpers/h_1/notes.md')).facts[0]?.kind).toBe('fact');
    const placed = '- Office in Andheri  {you said · 2026-10-02 · chat · place · f_01929a3e-7c41-7d2a-9b1e-3f5a2c8d4e61}';
    expect(parseMemoryFile(placed, opts()).facts[0]?.kind).toBe('place');
  });

  it('reads chat:{chatId} only in about-you.md (scope chat, X-112)', () => {
    const line = '- Wants short replies here  {you said · 2026-10-02 · chat · chat:c_7 · f_01929a3e-7c41-7d2a-9b1e-3f5a2c8d4e61}';
    expect(parseMemoryFile(line, opts()).facts[0]?.chatId).toBe('c_7');
    const elsewhere = parseMemoryFile(line, opts('memory/people/mom.md'));
    expect(elsewhere.facts).toEqual([]);
    expect(elsewhere.badLines).toHaveLength(1);
  });

  it('refuses truncated ids (`f_0192…` is not legal in a file)', () => {
    const r = parseMemoryFile('- Likes tea  {you said · 2026-10-02 · chat · f_0192…}', opts());
    expect(r.facts).toEqual([]);
    expect(r.badLines).toHaveLength(1);
  });

  it('a brace-less "- " line is you said, today, manual, with a new id, and asks for one rewrite', () => {
    const r = parseMemoryFile('# About you\n- Hates loud ringtones\n', opts());
    expect(r.rewrite).toBe(true);
    expect(r.facts).toHaveLength(1);
    expect(r.facts[0]).toMatchObject({ text: 'Hates loud ringtones', provenance: 'said', date: TODAY, origin: 'manual', private: false });
    expect(r.facts[0]!.id).toMatch(/^f_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('a line under ## Private without the token gains private (and a rewrite)', () => {
    const r = parseMemoryFile(
      '# About you\n\n## Private\n- Blood group B+  {you said · 2026-10-03 · chat · f_0194c1d0-5e22-7f10-a3b4-6c7d8e9f0a13}\n',
      opts(),
    );
    expect(r.facts[0]?.private).toBe(true);
    expect(r.rewrite).toBe(true);
  });

  it('the private token is authoritative: a private fact above ## Private stays private and moves under it on write', () => {
    const text = '# About you\n- Blood group B+  {you said · 2026-10-03 · chat · private · f_0194c1d0-5e22-7f10-a3b4-6c7d8e9f0a13}\n';
    const r = parseMemoryFile(text, opts());
    expect(r.facts[0]?.private).toBe(true);
    expect(writeMemoryFile(r.doc)).toBe(
      '# About you\n\n## Private\n- Blood group B+  {you said · 2026-10-03 · chat · private · f_0194c1d0-5e22-7f10-a3b4-6c7d8e9f0a13}\n',
    );
  });

  it('reads CRLF and a BOM', () => {
    const r = parseMemoryFile('\uFEFF' + SPEC_EXAMPLE.replace(/\n/g, '\r\n'), opts());
    expect(r.badLines).toEqual([]);
    expect(r.facts.map((f) => f.text)).toEqual(['Vegetarian on Tuesdays', 'Prefers window seats', 'Lives at 14 Hill Road, Bandra']);
  });

  it('keeps unparseable lines in place and reports them (MEMORY_PARSE list)', () => {
    const text = [
      '# About you',
      '- Likes tea  {you said · 2026-10-02 · chat · f_01929a3e-7c41-7d2a-9b1e-3f5a2c8d4e61}',
      'remember to call the plumber',
      '- Broken  {you said · yesterday · chat · f_0193b2c4-1a07-7e3f-8c55-0d9e6f7a1b22}',
      '- Likes chai  {you said · 2026-10-02 · chat · f_0194c1d0-5e22-7f10-a3b4-6c7d8e9f0a13}',
      '',
    ].join('\n');
    const r = parseMemoryFile(text, opts());
    expect(r.badLines).toEqual([
      { lineNo: 3, text: 'remember to call the plumber' },
      { lineNo: 4, text: '- Broken  {you said · yesterday · chat · f_0193b2c4-1a07-7e3f-8c55-0d9e6f7a1b22}' },
    ]);
    expect(r.facts.map((f) => f.text)).toEqual(['Likes tea', 'Likes chai']);
    expect(writeMemoryFile(r.doc)).toBe(text);
  });
});

describe('08-3 §12.2 writer', () => {
  it('writes the spec example back as UTF-8, LF, no BOM; the label-less fact gains `you typed it` (CR-0010 G-M6-13)', () => {
    const r = parseMemoryFile(SPEC_EXAMPLE.replace(/\n/g, '\r\n'), opts());
    const out = writeMemoryFile(r.doc);
    expect(out).toBe(
      SPEC_EXAMPLE.replace('{I guessed · 2026-10-09 · from 4 bookings', '{I guessed · 2026-10-09 · you typed it · from 4 bookings'),
    );
    expect(out.includes('\r')).toBe(false);
    expect(out.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('parse(write(x)) = x, including a brace-less line once it has its brace', () => {
    const first = parseMemoryFile('# About you\n- Hates loud ringtones\n- माँ का जन्मदिन 18 अक्टूबर\n', opts());
    const written = writeMemoryFile(first.doc);
    expect(written).toContain(`- Hates loud ringtones  {you said · ${TODAY} · you typed it · ${first.facts[0]!.id}}`);
    const again = parseMemoryFile(written, opts());
    expect(again.rewrite).toBe(false);
    const withoutLine = (fs: typeof first.facts) => fs.map((f) => ({ ...f, lineNo: 0 }));
    expect(withoutLine(again.facts)).toEqual(withoutLine(first.facts));
    expect(writeMemoryFile(again.doc)).toBe(written);
  });

  it('writes the optional tokens in the §12.2 order: from, kind, private, chat, id', () => {
    const r = parseMemoryFile(
      '- Quiet hotel rooms  {I guessed · 2026-10-09 · chat · chat:c_9 · private · place · from 3 trips · f_0193b2c4-1a07-7e3f-8c55-0d9e6f7a1b22}',
      opts(),
    );
    expect(writeMemoryFile(r.doc)).toBe(
      '## Private\n- Quiet hotel rooms  {I guessed · 2026-10-09 · chat · from 3 trips · place · private · chat:c_9 · f_0193b2c4-1a07-7e3f-8c55-0d9e6f7a1b22}\n',
    );
  });
});

describe('08-3 §12.4 add validation', () => {
  it('text ≤ 120 chars; kind person needs person', () => {
    expect(validateAdd({ text: 'x'.repeat(120), kind: 'fact' })).toEqual({ ok: true });
    expect(validateAdd({ text: 'x'.repeat(121), kind: 'fact' }).ok).toBe(false);
    expect(validateAdd({ text: '  ', kind: 'fact' }).ok).toBe(false);
    expect(validateAdd({ text: 'Birthday 18 Oct', kind: 'person' }).ok).toBe(false);
    expect(validateAdd({ text: 'Birthday 18 Oct', kind: 'person', person: 'Asha' })).toEqual({ ok: true });
  });
});

describe('08-1 §2.5 parse worker', () => {
  it('parses and hashes in a worker thread with the same result as in-process', async () => {
    const w = createParseWorker({ execArgv: ['--require', 'tsx/cjs'] });
    try {
      const r = await w.parse(SPEC_EXAMPLE, { file: ABOUT, today: TODAY });
      expect(r.facts.map((f) => f.text)).toEqual(['Vegetarian on Tuesdays', 'Prefers window seats', 'Lives at 14 Hill Road, Bandra']);
      expect(r.facts[0]!.hash).toBe(factHash('Vegetarian on Tuesdays'));
      const fresh = await w.parse('- Hates loud ringtones', { file: ABOUT, today: TODAY });
      expect(fresh.rewrite).toBe(true);
      expect(fresh.facts[0]!.id).toMatch(/^f_[0-9a-f-]{36}$/);
    } finally {
      await w.close();
    }
  });
});
