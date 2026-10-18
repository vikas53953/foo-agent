// Spec: 08-2 §5.4 l.119 (Stop: Job Object first, taskkill fallback), CR-0007 §(e) pick 1 (no orphaned CLI tree after an
// engine crash), 08-3 §18.2 + 08-5 §6 (`synthesize` → WAV, rejects VOICE_UNAVAILABLE), M11 pack §4.1 (G-M11-01,
// G-M11-02, CR-0015): main holds the Job Objects the engine asks for with proc.track / proc.kill, kills them all when the
// engine exits, and runs voice.synthesize on the addon. Addon missing → every kill answers native:false (taskkill).
import type { NativeHost } from '../engine-supervisor/EngineBridge';
import type { InstallDeps } from '../installDeps';
import type { LoadedNative } from './fooNative';
import { JobObjects } from '../proc/JobObjects';

export function nativeHost(native: LoadedNative, jobs: JobObjects): NativeHost {
  return {
    track: (pid, purpose) => jobs.track(pid, purpose),
    kill: (pid) => jobs.kill(pid),
    synthesize: (text, lang, outPath) =>
      native.api.synthesize(text, lang, outPath).then(
        () => ({ ok: true, value: undefined }),
        () => ({ ok: false, error: { kind: 'VOICE_UNAVAILABLE' } }),
      ),
  };
}

export function jobObjectsFor(native: LoadedNative): JobObjects {
  return new JobObjects({
    available: native.available,
    assignToJobObject: (pid) => native.api.assignToJobObject(pid),
    killJobObject: (pid) => native.api.killJobObject(pid),
  });
}

/** Wires the Job Object handlers (proc.track / proc.kill) and voice.synthesize into the engine bridge. */
export function installNative(deps: InstallDeps): void {
  const jobs = jobObjectsFor(deps.native);
  const bridge = deps.ctx.engine;
  if (!bridge) return;
  bridge.native = nativeHost(deps.native, jobs);
  bridge.engineExited = () => void jobs.killAll();
}
