// M6 T6 memory-only export (06-2 §7.4 "Export what I know", 08-3 §19.4.1): `foo-memory-{d-Mon-yyyy}.zip` holds only
// `README.txt` and `memory/`, the {DATA}\memory folder as is plus helpers' notes.md files (the layout's "includes helpers'
// notes.md files", placed at memory/helpers/{helperId}/notes.md); every file passes the final secret scan and
// any hit aborts with EXPORT_SECRET_FOUND and leaves nothing behind; a finished export writes activity `changed` /
// `exported` (08-0 §G.4) and its line in activity.jsonl.
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportFileName, runMemoryExport } from '../../src/main/memory/export';
import { migrate, type Db } from '../../src/main/store/db';
import type { EventPayload } from '../../src/shared/ipc';

const NOW = Date.UTC(2026, 9, 16, 6, 30); // 16 Oct 2026 IST
let data: string;
let out: string;
let db: Db;
let events: EventPayload['data:exportProgress'][];

function write(rel: string, text: string) {
  const p = join(data, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, text, 'utf8');
}
const run = () =>
  runMemoryExport({
    dataDir: data,
    folder: out,
    exportId: 'exp_1',
    now: NOW,
    timeZone: 'Asia/Kolkata',
    db,
    progress: (p) => events.push(p),
  });
const listZip = (file: string) => execFileSync('zipinfo', ['-1', file], { encoding: 'utf8' }).split('\n').filter(Boolean).sort();

beforeEach(() => {
  const base = mkdtempSync(join(tmpdir(), 'foo-m6-export-'));
  data = join(base, 'data');
  out = join(base, 'out');
  mkdirSync(out, { recursive: true });
  db = new Database(':memory:');
  migrate(db);
  events = [];
  write('memory/about-you.md', '# About you\n\n- Prefers window seats  {you said · 2026-10-02 · you typed it · fact · f_1}\n');
  write('memory/people/meera.md', '- Sister Meera lives in Pune  {you said · 2026-10-03 · chat · person · f_2}\n');
  write('memory/preferences/travel.md', '- Likes beach stays  {I guessed · 2026-10-04 · chat · preference · f_3}\n');
  write('helpers/h_trips/notes.md', '- Goa trip in Dec  {you said · 2026-10-05 · chat · fact · f_4}\n');
  write('settings.json', '{}');
});

describe('memory export (08-3 §19.4.1)', () => {
  it('names the zip foo-memory-{d-Mon-yyyy}.zip in the user’s time zone', () => {
    expect(exportFileName(NOW, 'Asia/Kolkata')).toBe('foo-memory-16-Oct-2026.zip');
    expect(exportFileName(Date.UTC(2026, 1, 3, 20, 0), 'Asia/Kolkata')).toBe('foo-memory-4-Feb-2026.zip');
  });

  it('writes README.txt and the memory folder only, and reports the path last', async () => {
    await run();
    const zip = join(out, 'foo-memory-16-Oct-2026.zip');
    expect(listZip(zip)).toEqual([
      'README.txt',
      'memory/about-you.md',
      'memory/helpers/h_trips/notes.md',
      'memory/people/meera.md',
      'memory/preferences/travel.md',
    ]);
    const readme = execFileSync('unzip', ['-p', zip, 'README.txt'], { encoding: 'utf8' });
    expect(readme).toContain('Keys, passwords and cards are never included.');
    expect(execFileSync('unzip', ['-p', zip, 'memory/people/meera.md'], { encoding: 'utf8' })).toBe(
      readFileSync(join(data, 'memory/people/meera.md'), 'utf8'),
    );
    expect(events.at(-1)).toEqual({ pct: 100, phase: 'done', path: zip });
  });

  it('logs activity changed / exported, never the fact text', async () => {
    await run();
    const row = db.prepare("SELECT kind, event, actor, outcome, summary FROM activity WHERE event = 'exported'").get() as Record<
      string,
      string
    >;
    expect(row).toMatchObject({ kind: 'changed', event: 'exported', actor: 'user', outcome: 'done' });
    expect(row.summary).not.toContain('window seats');
    const lines = readFileSync(join(data, 'activity.jsonl'), 'utf8').trim().split('\n');
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({ kind: 'changed', event: 'exported' });
  });

  it('a secret in any file aborts the whole export with EXPORT_SECRET_FOUND and saves nothing', async () => {
    write(
      'memory/preferences/work.md',
      '- My key is sk-proj-abcdefghij1234567890ABCDEFGHIJ  {you said · 2026-10-06 · chat · fact · f_5}\n',
    );
    await run();
    expect(events.at(-1)).toEqual({ pct: 100, phase: 'done', error: 'EXPORT_SECRET_FOUND' });
    expect(readdirSync(out)).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) FROM activity WHERE event = 'exported'").pluck().get()).toBe(0);
  });

  it('an empty memory folder still exports README.txt', async () => {
    const base = mkdtempSync(join(tmpdir(), 'foo-m6-export-empty-'));
    data = base;
    await run();
    expect(existsSync(join(out, 'foo-memory-16-Oct-2026.zip'))).toBe(true);
    expect(listZip(join(out, 'foo-memory-16-Oct-2026.zip'))).toEqual(['README.txt']);
  });
});
