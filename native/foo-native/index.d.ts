// Spec: 08-5 §6 (the literal export list, X-111), 08-0 §E.2 (wintrack, ocr shapes), 09 §9.19.2 (loaded in main only).
// CR-0015 (G-M11-03): M11 owns this file with the full list; M10 adds hello.cc, M9 wintrack.cc, a later milestone ocr.cc.
// Every export has a JS fallback that returns the "unsupported" value (src/main/native/fooNative.ts). All toast functions
// use AUMID com.foo.desktop.

export type HelloResult = 'verified' | 'canceled' | 'retries_exhausted' | 'device_busy' | 'unavailable';
export type NetworkCost = 'unrestricted' | 'fixed' | 'variable' | 'unknown';
export type ToastSetting = 'enabled' | 'disabled_app' | 'disabled_user' | 'disabled_policy' | 'disabled_manifest';
export interface TrackedWindowEvent {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  foreground: boolean;
  destroyed: boolean;
}
export interface OcrResult {
  status: 'ok' | 'unavailable' | 'failed';
  lang?: string;
  lines: { text: string; words: { text: string; x: number; y: number; w: number; h: number }[] }[];
}

/** jobobject.cc (fallback: no-op). */
export function assignToJobObject(pid: number): void;
export function killJobObject(pid: number): void;
/** hello.cc, M10 (fallback: 'unavailable'). */
export function verifyUser(message: string, hwnd?: number): Promise<HelloResult>;
/** speech.cc (fallback: rejects VOICE_UNAVAILABLE). */
export function synthesize(text: string, lang: string, outPath: string): Promise<void>;
/** netcost.cc (fallback: 'unknown'). */
export function networkCost(): NetworkCost;
/** toasthistory.cc (fallback: no-op). */
export function toastRemove(tag: string, group: string): void;
export function toastRemoveGroup(group: string): void;
export function toastClear(): void;
/** toastsetting.cc (fallback: 'enabled'). */
export function toastSetting(): ToastSetting;
/** textscale.cc (fallback: 1, no-op). */
export function textScaleFactor(): number;
export function watchTextScale(cb: (factor: number) => void): void;
/** keyboard.cc (fallback: []). */
export function keyboardLayouts(): string[];
/** focus.cc (fallback: null). */
export function focusActive(): boolean | null;
/** wintrack.cc, M9 (fallback: -1, no-op, null). */
export function trackWindow(hwnd: number, cb: (e: TrackedWindowEvent) => void): number;
export function untrackWindow(id: number): void;
export function findWindowByPid(pid: number, titlePrefix?: string): number | null;
/** ocr.cc, later (fallback: { status: 'unavailable', lines: [] }, rejects). */
export function ocrRead(path: string): Promise<OcrResult>;
export function blackout(inPath: string, outPath: string, rects: { x: number; y: number; w: number; h: number }[]): Promise<void>;
