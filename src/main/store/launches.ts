// Spec: 08-1 §4.1.3 (`{DATA}\launches.json` = `{ launches: { at, clean, version, engineCrashes }[] }`, newest last, at most
// 10; the field is `clean`, never `cleanExit`), §2.2 step 1 (read it, decide safe mode, append this launch unclean), §2.1
// (each engine crash increments the current record's `engineCrashes`), §2.3 step 4 (a normal quit sets `clean: true`),
// 08-0 §G.14 / X-77 (safe mode: 3 previous unclean launches within 10 min, or 3 engine crashes in this launch), CR-0008
// G-M4-13 (main owns the file and tells the engine; the engine never reads it).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface LaunchRecord {
  at: number;
  clean: boolean;
  version: string;
  engineCrashes: number;
}

export const KEEP_LAUNCHES = 10;
const SAFE_WINDOW_MS = 10 * 60_000;
const SAFE_COUNT = 3;

function read(file: string): LaunchRecord[] {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { launches?: unknown };
    if (!Array.isArray(parsed.launches)) return [];
    return parsed.launches.filter(
      (r): r is LaunchRecord =>
        !!r &&
        typeof r === 'object' &&
        typeof (r as LaunchRecord).at === 'number' &&
        typeof (r as LaunchRecord).clean === 'boolean' &&
        typeof (r as LaunchRecord).engineCrashes === 'number',
    );
  } catch {
    // Missing or unreadable: no history (a damaged record never blocks startup).
    return [];
  }
}

function write(file: string, launches: LaunchRecord[]): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ launches }, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

/** What the engine is told on each (re)start (protocol `settings.changed.launch`). */
export interface EngineLaunch {
  safeMode: boolean;
  cleanStart: boolean;
}

/** The current launch's record and the decisions taken from the file. */
export class LaunchLog {
  private starts = 0;
  readonly safeModeAtStart: boolean;
  readonly previousClean: boolean;

  private constructor(
    private file: string,
    private records: LaunchRecord[],
  ) {
    const prev = records.slice(0, -1);
    this.previousClean = prev.at(-1)?.clean ?? true;
    const now = records.at(-1)!.at;
    this.safeModeAtStart = prev.filter((r) => !r.clean && r.at >= now - SAFE_WINDOW_MS).length >= SAFE_COUNT;
  }

  /** §2.2 step 1: read, decide, append this launch as unclean (kept to the last 10). */
  static start(file: string, now: number, version: string): LaunchLog {
    const records = [...read(file), { at: now, clean: false, version, engineCrashes: 0 }].slice(-KEEP_LAUNCHES);
    write(file, records);
    return new LaunchLog(file, records);
  }

  private get current(): LaunchRecord {
    return this.records.at(-1)!;
  }

  get engineCrashes(): number {
    return this.current.engineCrashes;
  }

  safeMode(): boolean {
    return this.safeModeAtStart || this.current.engineCrashes >= SAFE_COUNT;
  }

  /** §2.1: the engine crashed in this launch. */
  engineCrashed(): void {
    this.current.engineCrashes += 1;
    write(this.file, this.records);
  }

  /** §2.3 step 4: a normal quit. */
  markClean(): void {
    if (this.current.clean) return;
    this.current.clean = true;
    write(this.file, this.records);
  }

  /** Each engine start: the first one after a clean exit keeps queued jobs queued; every later start is after a crash. */
  nextEngineStart(): EngineLaunch {
    const cleanStart = this.starts === 0 && this.previousClean;
    this.starts += 1;
    return { safeMode: this.safeMode(), cleanStart };
  }
}
