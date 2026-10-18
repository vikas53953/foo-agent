// M3 prompt files (08-4 §24.0): resources/prompts/*.md are exactly the fenced blocks of 08-4 §24 (no leading/trailing blank
// line, LF, UTF-8) and MANIFEST.json records each file's sha256 (11 §11.1.2).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'resources/prompts';

/** The plain ``` blocks of each "### 24.n" section of 08-4, in order. */
function specBlocks(): Record<string, string[]> {
  const lines = readFileSync('spec/constitution/08-functions-and-engine-4.md', 'utf8').split('\n');
  const out: Record<string, string[]> = {};
  let sec: string | null = null;
  let mode: 'none' | 'plain' | 'other' = 'none';
  let buf: string[] = [];
  for (const l of lines) {
    if (mode === 'none' && /^#{2,3} /.test(l)) sec = /^### (24\.\d+)/.exec(l)?.[1] ?? null;
    if (l.startsWith('```')) {
      if (mode !== 'none') {
        if (mode === 'plain' && sec) (out[sec] ??= []).push(buf.join('\n'));
        mode = 'none';
        buf = [];
      } else mode = l === '```' ? 'plain' : 'other';
      continue;
    }
    if (mode !== 'none') buf.push(l);
  }
  return out;
}

const FILE_SECTIONS: Record<string, string> = {
  'rules.md': '24.3',
  'protocol.md': '24.4',
  'intake.md': '24.5',
  'step.md': '24.6',
  'second_look.md': '24.7',
  'repair.md': '24.8',
  'rewrite.md': '24.9',
  'memory_review.md': '24.10',
  'routine.md': '24.11',
  'brief.md': '24.12',
  'stuck.md': '24.13',
  'untrusted.md': '24.14',
  'catch_up.md': '24.17',
  'read_attachment.md': '24.18',
  'group_intake.md': '24.19',
  'group_member.md': '24.20',
};

describe('m3 prompt files', () => {
  const blocks = specBlocks();

  it('each file is its spec block byte for byte', () => {
    for (const [file, sec] of Object.entries(FILE_SECTIONS)) {
      expect(readFileSync(`${DIR}/${file}`, 'utf8'), file).toBe(blocks[sec]![0]);
    }
  });

  it('identity.md holds the foo form, one blank line, then the helper form (§24.2)', () => {
    const [foo, helper] = blocks['24.2']!;
    expect(readFileSync(`${DIR}/identity.md`, 'utf8')).toBe(`${foo}\n\n${helper}`);
    expect(foo).not.toContain('\n\n');
  });

  it('LF only, no leading or trailing blank line, valid UTF-8', () => {
    for (const f of readdirSync(DIR).filter((n) => n.endsWith('.md'))) {
      const buf = readFileSync(`${DIR}/${f}`);
      const t = buf.toString('utf8');
      expect(Buffer.from(t, 'utf8').equals(buf), f).toBe(true);
      expect(t.includes('\r'), f).toBe(false);
      expect(/^\s|\s$/.test(t), f).toBe(false);
    }
  });

  it('MANIFEST.json lists every prompt file with its sha256', () => {
    const manifest = JSON.parse(readFileSync(`${DIR}/MANIFEST.json`, 'utf8')) as Record<string, string>;
    const files = readdirSync(DIR)
      .filter((n) => n.endsWith('.md'))
      .sort();
    expect(Object.keys(manifest).sort()).toEqual(files);
    expect(files).toHaveLength(17);
    for (const f of files) {
      expect(manifest[f], f).toBe(
        createHash('sha256')
          .update(readFileSync(`${DIR}/${f}`))
          .digest('hex'),
      );
    }
  });
});
