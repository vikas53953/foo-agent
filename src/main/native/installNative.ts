// Spec: 08-2 §5.4 l.119, CR-0007 §(e), 08-5 §6 (G-M11-01, G-M11-02). CR-0015: stub landed by M11 T1 so src/main/index.ts never changes again; M11 T2 replaces this file.
import type { InstallDeps } from '../installDeps';
/** Wires the Job Object handlers (proc.track / proc.kill) and voice.synthesize into the engine bridge. Until T2: the bridge's fallbacks answer `{ native: false }` and VOICE_UNAVAILABLE, so ProcessHost keeps its taskkill sweep. */
export function installNative(deps: InstallDeps): void {
  void deps;
}
