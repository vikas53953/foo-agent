// Spec: 08-3 §19.4.1 (memory-only export `foo-memory-{d-Mon-yyyy}.zip`: `README.txt` + `memory/` only, the {DATA}\memory
// folder as is, including helpers' notes.md files; README says "Keys, passwords and cards are never included."), §19.4
// (final secret scan: any hit aborts the whole export with EXPORT_SECRET_FOUND, nothing is saved; a finished export writes
// activity `kind='changed'`, `event='exported'`), 08-1 §3.2 `data:export` (returns at once; progress and the end on
// `data:exportProgress`), 06-2 §7.4 "Export what I know", 06-3 §9.4 (the `exported` summary), 08-0 §E.7 `safeName()`.
// CR-0010 G-M6-11. Helpers' notes sit at `memory/helpers/{helperId}/notes.md` inside the zip (T6 pick, implementation-notes).
import { appendFileSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { t } from '../../shared/copy/t';
import type { EventPayload } from '../../shared/ipc';
import { newId } from '../../shared/ids';
import { checkSecret } from '../../shared/redactor';
import type { Db } from '../store/db';

export interface MemoryExportCtx {
  dataDir: string;
  folder: string;
  exportId: string;
  now: number;
  /** The user's time zone (settings `locale.timeZone`) for the date in the file name. */
  timeZone?: string;
  /** Where the `exported` activity row is written; without it no row (unit tests of the zip alone). */
  db?: Db;
  progress(p: EventPayload['data:exportProgress']): void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const README = 'Keys, passwords and cards are never included.';

/** `foo-memory-{d-Mon-yyyy}.zip` for `now` in `timeZone` (08-3 §19.4.1 example `16-Oct-2026`). */
export function exportFileName(now: number, timeZone = 'Asia/Kolkata'): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return `foo-memory-${part('day')}-${MONTHS[part('month') - 1]}-${part('year')}.zip`;
}

/** "{Documents › foo-memory-16-Oct-2026.zip}": the folder's name and the file (06-2 §7.4, 06-3 §9.4). */
export function shownPath(path: string): string {
  return `${basename(dirname(path))} › ${basename(path)}`;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

/** Zip entries: README.txt, then {DATA}\memory as is, then each helper's notes.md. Paths use forward slashes. */
function entries(dataDir: string): { name: string; bytes: Buffer }[] {
  const memory = join(dataDir, 'memory');
  const helpers = join(dataDir, 'helpers');
  const files = [
    ...walk(memory).map((p) => ({ name: `memory/${relative(memory, p).replace(/\\/g, '/')}`, path: p })),
    ...(existsSync(helpers) ? readdirSync(helpers).sort() : [])
      .map((id) => join(helpers, id, 'notes.md'))
      .filter((p) => existsSync(p))
      .map((p) => ({ name: `memory/helpers/${basename(dirname(p))}/notes.md`, path: p })),
  ];
  const names = files.map((f) => f.name);
  const readme = `${README}\n\n${['README.txt', ...names].join('\n')}\n`;
  return [{ name: 'README.txt', bytes: Buffer.from(readme, 'utf8') }, ...files.map((f) => ({ name: f.name, bytes: readFileSync(f.path) }))];
}

/** A plain zip (deflate, UTF-8 names, no zip64: memory files are small). */
export function zip(files: { name: string; bytes: Buffer }[], now: Date): Buffer {
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = deflateRawSync(f.bytes);
    const crc = crc32(f.bytes);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // UTF-8 names
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt16LE(dosTime, 10);
    head.writeUInt16LE(dosDate, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(f.bytes.length, 22);
    head.writeUInt16LE(name.length, 26);
    local.push(head, name, data);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(dosTime, 12);
    dir.writeUInt16LE(dosDate, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(f.bytes.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += head.length + name.length + data.length;
  }
  const dirBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dirBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, dirBytes, end]);
}

function logExported(db: Db, dataDir: string, path: string, now: number): void {
  const id = newId('act', now);
  const summary = t('activity.exported.summary', { path: shownPath(path) });
  db.prepare(
    "INSERT INTO activity (id, at, kind, event, actor, summary, outcome) VALUES (?, ?, 'changed', 'exported', 'user', ?, 'done')",
  ).run(id, now, summary);
  const line = { id, at: now, kind: 'changed', event: 'exported', actor: 'user', summary, outcome: 'done' };
  appendFileSync(join(dataDir, 'activity.jsonl'), `${JSON.stringify(line)}\n`, 'utf8');
}

/** Writes the memory zip into `folder`, reporting on `data:exportProgress`; the last event carries `path` or `error`. */
export async function runMemoryExport(ctx: MemoryExportCtx): Promise<void> {
  const target = join(ctx.folder, exportFileName(ctx.now, ctx.timeZone));
  const tmp = `${target}.part`;
  try {
    ctx.progress({ pct: 0, phase: 'reading' });
    const files = entries(ctx.dataDir);
    // The final scan (R9): one hit anywhere stops the whole export before anything is written.
    if (files.some((f) => checkSecret(f.bytes.toString('utf8')) !== null)) {
      ctx.progress({ pct: 100, phase: 'done', error: 'EXPORT_SECRET_FOUND' });
      return;
    }
    ctx.progress({ pct: 50, phase: 'writing' });
    writeFileSync(tmp, zip(files, new Date(ctx.now)));
    renameSync(tmp, target);
    if (ctx.db) logExported(ctx.db, ctx.dataDir, target, ctx.now);
    ctx.progress({ pct: 100, phase: 'done', path: target });
  } catch (e) {
    rmSync(tmp, { force: true });
    const code = (e as NodeJS.ErrnoException).code;
    ctx.progress({ pct: 100, phase: 'done', error: code === 'ENOSPC' ? 'DISK_FULL' : 'UNKNOWN' });
  }
  return Promise.resolve();
}
