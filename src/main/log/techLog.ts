// Spec: 08-3 §19.1 (tech log `logs\app-{date}.log`: JSON lines `{ t, lvl, mod, evt, ids: { chatId?, jobId?, approvalId? },
// kind?, ms? }`; MUST NOT contain message text, page text, prompt text, AI replies, email addresses, phone numbers or secret
// values; levels info/warn/error, debug only in FOO_TEST or a "Send a report" session; 10 MB/day cap, oldest lines dropped),
// 08-2 §11.4 R7 (logs go through the Redactor with channel `log`), 08-0 §G.6 (`registry:add` values never reach a log).
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { systemClock, type Clock } from '../../shared/clock';
import { Redactor } from '../../shared/redactor';
import { mainRegistry } from '../secrets/registerValue';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** What a caller may hand the log. Anything else it passes (a message text, a payload, a value) is dropped. */
export interface TechLogEntry {
  lvl: LogLevel;
  mod: string;
  evt: string;
  ids?: { chatId?: string; jobId?: string; approvalId?: string };
  kind?: string;
  ms?: number;
}

/** §19.1: 10 MB per day. */
export const LOG_DAY_CAP_BYTES = 10 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Main↔engine registry messages carry the values themselves; only their name is ever logged. */
const REGISTRY_EVENT = /^registry[:.]/;

/**
 * R7: the one line §19.1 allows, or null (a debug line outside a debug session). Only the six fields survive; the strings
 * go through the Redactor (registry, patterns, every email and phone masked); ids that are not ids are dropped.
 */
export function techLogLine(entry: TechLogEntry, ctx: { now: number; debug: boolean; redactor: Redactor }): string | null {
  const e = entry as TechLogEntry & Record<string, unknown>;
  if (e.lvl === 'debug' && !ctx.debug) return null;
  const clean = (s: unknown) => (typeof s === 'string' ? ctx.redactor.redact(s, { channel: 'log' }).text.slice(0, 200) : undefined);
  const line: Record<string, unknown> = {
    t: ctx.now,
    lvl: ['debug', 'info', 'warn', 'error'].includes(String(e.lvl)) ? e.lvl : 'info',
    mod: clean(e.mod) ?? '',
    evt: clean(e.evt) ?? '',
  };
  if (REGISTRY_EVENT.test(String(line.evt))) return JSON.stringify(line);
  const ids: Record<string, string> = {};
  for (const k of ['chatId', 'jobId', 'approvalId'] as const) {
    const v = e.ids?.[k];
    if (typeof v === 'string' && ID.test(v)) ids[k] = v;
  }
  if (Object.keys(ids).length) line.ids = ids;
  const kind = clean(e.kind);
  if (kind) line.kind = kind;
  if (typeof e.ms === 'number' && Number.isFinite(e.ms)) line.ms = Math.round(e.ms);
  return JSON.stringify(line);
}

function day(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** The tech log writer (R7). One file per day under `{DATA}\logs\`. */
export class TechLog {
  private readonly redactor: Redactor;

  constructor(private readonly o: { dir: string; clock: Clock; debug?: boolean; capBytes?: number; redactor?: Redactor }) {
    this.redactor = o.redactor ?? new Redactor({ clock: o.clock, registry: mainRegistry() });
  }

  write(entry: TechLogEntry): void {
    const now = this.o.clock.now();
    const line = techLogLine(entry, { now, debug: !!this.o.debug, redactor: this.redactor });
    if (!line) return;
    mkdirSync(this.o.dir, { recursive: true });
    const file = join(this.o.dir, `app-${day(now)}.log`);
    const cap = this.o.capBytes ?? LOG_DAY_CAP_BYTES;
    const add = Buffer.byteLength(line) + 1;
    if (existsSync(file) && statSync(file).size + add > cap) {
      // Oldest lines dropped: keep the newest lines that fit in half the cap, then append.
      const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
      let size = 0;
      let from = lines.length;
      while (from > 0 && size + Buffer.byteLength(lines[from - 1]!) + 1 <= cap / 2) size += Buffer.byteLength(lines[--from]!) + 1;
      writeFileSync(
        file,
        lines
          .slice(from)
          .map((l) => `${l}\n`)
          .join(''),
        'utf8',
      );
    }
    appendFileSync(file, `${line}\n`, 'utf8');
  }
}

let appLog: TechLog | null = null;

/** Startup step 2 opens the app's tech log; until then (a deep link at launch) lines go to the console, still filtered. */
export function setAppTechLog(log: TechLog | null): void {
  appLog = log;
}

/** Main's one log sink (R7): every line passes {@link techLogLine}. A failed write never takes the app down. */
export function logEvent(entry: TechLogEntry): void {
  try {
    if (appLog) appLog.write(entry);
    else {
      const line = techLogLine(entry, {
        now: systemClock.now(),
        debug: false,
        redactor: new Redactor({ clock: systemClock, registry: mainRegistry() }),
      });
      if (line) console.warn(line);
    }
  } catch {
    // The log is best effort; the work it describes goes on.
  }
}
