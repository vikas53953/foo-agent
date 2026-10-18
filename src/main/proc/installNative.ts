// Spec: M11 pack §3 / §4.1 (G-M11-01, G-M11-02, CR-0015): main loads `foo-native` and owns the Job Objects; the engine
// reaches them through `proc.track` / `proc.kill` and asks for spoken replies with `voice.synthesize`. CR-0007 §(e) pick 1:
// every tracked tree is killed when the engine exits.
import { fooNative, type FooNative } from '../native/fooNative';
import { JobObjects } from './JobObjects';

export interface NativeInstall {
  native: FooNative;
  jobs: JobObjects;
  synthesize(text: string, lang: string, outPath: string): Promise<void>;
}

export function installNative(native: FooNative = fooNative()): NativeInstall {
  const jobs = new JobObjects(native);
  return { native, jobs, synthesize: (text, lang, outPath) => native.synthesize(text, lang, outPath) };
}
