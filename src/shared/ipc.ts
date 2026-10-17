// Spec: 08-1 §3 (IPC contract), §3.1 (platform info on window.foo). M0 exposes only platform facts.
export type ThemeName = 'light' | 'dark';

export interface PlatformInfo {
  os: 'win32' | 'linux' | 'darwin';
  /** Value at launch; the renderer follows matchMedia afterwards (02 F7, FE-31). */
  reducedMotion: boolean;
  animations: 'full' | 'basic' | 'off';
}

export interface FooBridge {
  platform: PlatformInfo;
}

declare global {
  interface Window {
    foo: FooBridge;
  }
}
