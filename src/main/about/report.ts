// Spec: 06-3 §18.2 Send a report (the preview is exactly the redacted logs that will be saved; Save report writes a .zip
// to `Documents\foo\reports\` and shows it in File Explorer; nothing is ever uploaded, X-12), 08-1 §3.2 `app:reportPreview`
// / `app:reportSave` (`DISK_FULL`, `EXPORT_SECRET_FOUND`), 08-3 §19.1 (the tech log, already redacted when written), §19.4
// R9 (the final scan before anything is written), 08-1 §0.7 rule 5 (every string reaching an export passes the Redactor);
// CR-0061 (X-218) pick: the last 7 days of the log (it keeps 14).
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { release } from 'node:os';
import { join } from 'node:path';
import { systemClock } from '../../shared/clock';
import { checkSecret, Redactor } from '../../shared/redactor';
import { mainRegistry } from '../secrets/registerValue';
import { zip } from '../memory/export';
import { writeRedacted } from '../store/writeRedacted';

/**
 * X-44: every build so far is unsigned, for the named test group. Set false in the commit that turns code signing on (the
 * public release gate, 10-1 §A.4); About then drops " · tester build".
 */
export const UNSIGNED_BUILD = true;

export const REPORT_DAYS = 7;
const DAY_MS = 86_400_000;

/** R9 covers the registry of record too (08-2 §11.4: "any registry or pattern hit"), not only the patterns. */
const redactor = new Redactor({ clock: systemClock, registry: mainRegistry() });
const hasSecret = (text: string) => checkSecret(text) !== null || redactor.redact(text).hits > 0;

/** `yyyy-mm-dd hh:mm` in the user's time zone (`locale.timeZone`, as the memory export names its file). The log files
 * are named by UTC day. */
function localStamp(now: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const p = (type: string) => parts.find((x) => x.type === type)?.value ?? '';
  return `${p('year')}-${p('month')}-${p('day')} ${p('hour')}:${p('minute')}`;
}

export interface ReportCtx {
  dataDir: string;
  version: string;
  now: number;
  timeZone: string;
}

/** The report text: one header line, then the log lines of the last {@link REPORT_DAYS} days, oldest first. */
export function reportText(ctx: ReportCtx): string {
  const dir = join(ctx.dataDir, 'logs');
  const from = new Date(ctx.now - (REPORT_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(f) && f.slice(4, 14) >= from)
        .sort()
    : [];
  const head = `foo ${ctx.version} · Windows ${release()} · ${localStamp(ctx.now, ctx.timeZone)}`;
  const lines = files.flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean));
  return [head, ...lines].join('\n');
}

const previews = new Map<string, string>();

/** `app:reportPreview`: the exact text Save report writes, under an id the save names. */
export function reportPreview(ctx: ReportCtx): { previewId: string; text: string } {
  const previewId = globalThis.crypto.randomUUID();
  const text = reportText(ctx);
  previews.clear();
  previews.set(previewId, text);
  return { previewId, text };
}

export type ReportSave =
  { ok: true; zipPath: string } | { ok: false; error: 'NOT_FOUND' | 'EXPORT_SECRET_FOUND' | 'DISK_FULL' | 'UNKNOWN' };

/** `app:reportSave`: the previewed text (and the user's note, redacted) as `foo-report-{yyyy-mm-dd-hhmm}.zip` in `folder`. */
export function reportSave(previewId: string, note: string | undefined, folder: string, now: number, timeZone: string): ReportSave {
  const text = previews.get(previewId);
  if (text === undefined) return { ok: false, error: 'NOT_FOUND' };
  const files = [{ name: 'report.txt', bytes: Buffer.from(text, 'utf8') }];
  if (note?.trim()) files.push({ name: 'note.txt', bytes: Buffer.from(writeRedacted(note.trim()), 'utf8') });
  // R9: one hit anywhere stops the save before anything is written.
  if (files.some((f) => hasSecret(f.bytes.toString('utf8')))) return { ok: false, error: 'EXPORT_SECRET_FOUND' };
  const stamp = localStamp(now, timeZone).replace(' ', '-').replace(':', '');
  const target = join(folder, `foo-report-${stamp}.zip`);
  const tmp = `${target}.part`;
  try {
    mkdirSync(folder, { recursive: true });
    writeFileSync(tmp, zip(files, new Date(now)));
    renameSync(tmp, target);
    previews.delete(previewId);
    return { ok: true, zipPath: target };
  } catch (e) {
    rmSync(tmp, { force: true });
    return { ok: false, error: (e as NodeJS.ErrnoException).code === 'ENOSPC' ? 'DISK_FULL' : 'UNKNOWN' };
  }
}
