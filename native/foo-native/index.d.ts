// Spec: 08-5 §6 (the literal `foo-native` export list and fallbacks, X-111), 08-0 §E.2 (window tracker and OCR
// signatures, OcrResult), 09 §9.19.2 (one C++/WinRT N-API addon, loaded as require('foo-native') in main only).
// G-M11-03 (CR-0015): M11 T2 creates the scaffold with the full list; M10 adds hello.cc, M9 wintrack.cc, ocr.cc later.

export type NetworkCost = 'unrestricted' | 'fixed' | 'variable' | 'unknown';
export type ToastSetting = 'enabled' | 'disabled_app' | 'disabled_user' | 'disabled_policy' | 'disabled_manifest';
export type VerifyResult = 'verified' | 'canceled' | 'retries_exhausted' | 'device_busy' | 'unavailable';

export interface WindowEvent {
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

/** jobobject.cc: one Job Object per pid with KILL_ON_JOB_CLOSE. Fallback: no-op. */
export function assignToJobObject(pid: number): void;
/** jobobject.cc: TerminateJobObject + CloseHandle; unknown pid → no-op. Fallback: no-op. */
export function killJobObject(pid: number): void;
/** hello.cc (M10). Fallback: 'unavailable'. */
export function verifyUser(message: string, hwnd?: number): Promise<VerifyResult>;
/** speech.cc: WinRT SpeechSynthesizer → WAV at outPath. Fallback: rejects VOICE_UNAVAILABLE. */
export function synthesize(text: string, lang: string, outPath: string): Promise<void>;
/** netcost.cc: ConnectionCost.NetworkCostType. Fallback: 'unknown'. */
export function networkCost(): NetworkCost;
/** toasthistory.cc (AUMID com.foo.desktop). Fallback: no-op. */
export function toastRemove(tag: string, group: string): void;
export function toastRemoveGroup(group: string): void;
export function toastClear(): void;
/** toastsetting.cc: ToastNotifier.Setting. Fallback: 'enabled'. */
export function toastSetting(): ToastSetting;
/** textscale.cc: HKCU\Software\Microsoft\Accessibility\TextScaleFactor / 100. Fallback: 1, no-op. */
export function textScaleFactor(): number;
export function watchTextScale(cb: (factor: number) => void): void;
/** keyboard.cc: GetKeyboardLayoutList as BCP-47 tags. Fallback: []. */
export function keyboardLayouts(): string[];
/** focus.cc: FocusSessionManager.IsFocusActive (Windows 11 only). Fallback: null. */
export function focusActive(): boolean | null;
/** wintrack.cc (M9). Fallback: -1, no-op, null. */
export function trackWindow(hwnd: number, cb: (e: WindowEvent) => void): number;
export function untrackWindow(id: number): void;
export function findWindowByPid(pid: number, titlePrefix?: string): number | null;
/** ocr.cc (its milestone). Fallback: { status: 'unavailable', lines: [] }, rejects. */
export function ocrRead(path: string): Promise<OcrResult>;
export function blackout(inPath: string, outPath: string, rects: { x: number; y: number; w: number; h: number }[]): Promise<void>;

/** True when the compiled `.node` loaded; false when every export is the fallback. */
export const available: boolean;
