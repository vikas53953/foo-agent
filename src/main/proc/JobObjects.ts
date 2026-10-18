// Spec: 08-2 §5.4 l.119 (Stop kills the CLI tree via the Job Object, `TerminateJobObject`; fallback taskkill), CR-0007 §(e)
// pick 1 (no orphaned CLI child after an engine crash), M11 pack §4.1 / G-M11-01 (CR-0015): `foo-native` is loaded in main
// only, so main keeps one Job Object per pid the engine tracks (`proc.track`), kills it on `proc.kill`, and kills them
// all when the engine exits. The addon's KILL_ON_JOB_CLOSE kills every tracked tree when main itself exits.
export type ProcPurpose = 'ai_cli' | 'whisper';

/** The slice of `foo-native` this file uses (08-5 §6 `assignToJobObject`, `killJobObject`). */
export interface JobNative {
  available: boolean;
  assignToJobObject(pid: number): void;
  killJobObject(pid: number): void;
}

export interface JobAnswer {
  /** True when the addon holds (or just terminated) the pid's job; false → the engine runs `taskkill /PID /T /F`. */
  native: boolean;
}

export class JobObjects {
  private readonly tracked = new Map<number, ProcPurpose>();

  constructor(private readonly native: JobNative) {}

  get size(): number {
    return this.tracked.size;
  }

  track(pid: number, purpose: ProcPurpose): JobAnswer {
    if (!this.native.available) return { native: false };
    if (this.tracked.has(pid)) return { native: true };
    try {
      this.native.assignToJobObject(pid);
    } catch {
      return { native: false }; // the process already exited, or access denied: taskkill covers it
    }
    this.tracked.set(pid, purpose);
    return { native: true };
  }

  kill(pid: number): JobAnswer {
    if (!this.native.available || !this.tracked.delete(pid)) return { native: false };
    try {
      this.native.killJobObject(pid);
    } catch {
      return { native: false };
    }
    return { native: true };
  }

  /** Engine exit or crash: every tracked tree goes. Returns how many jobs were killed. */
  killAll(): number {
    let n = 0;
    for (const pid of [...this.tracked.keys()]) if (this.kill(pid).native) n += 1;
    return n;
  }
}
