// Spec: 04-2 §22.1 (voice notes: hold ≥ 150 ms → hold mode, a click under 150 ms → locked mode; level bars from the microphone
// level sampled every 100 ms, newest at the right; from 4:30 the timer is --warn; at 5:00 recording stops and the note is
// sent; under 0.5 s it is discarded; microphone problems become the mic_blocked / no_mic / mic_busy banners and recording
// does not start), J7 (the file is kept under `{DATA}\data\voice\`), 08-1 §3.2 files:stage + voice:submit. MediaRecorder
// writes WebM Opus, 48 kHz mono where the device allows (implementation-notes M2 builder B). Transcription is M11.
import type { ComposerBannerType } from '../../shared/types';

export const HOLD_ARM_MS = 150;
export const MIN_VOICE_MS = 500;
export const WARN_AT_MS = 4 * 60_000 + 30_000;
export const MAX_VOICE_MS = 5 * 60_000;
export const LEVEL_EVERY_MS = 100;
/** §22.1 slide to cancel: the pointer moved this far left of where it went down. */
export const SLIDE_CANCEL_PX = 120;
/** Bars that fit the recording pill's level strip (2px bar + 2px gap). */
export const LEVEL_BARS = 48;

/** "0:03" (tabular minutes:seconds). */
export function timerText(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** §22.1 bar height 4–24px from a 0–1 level. */
export function barHeight(level: number): number {
  return Math.round(4 + Math.min(1, Math.max(0, level)) * 20);
}

/** The microphone error → the composer banner (§22.1 table). */
export function micBanner(e: unknown): ComposerBannerType {
  const name = e instanceof Error || (typeof e === 'object' && e !== null && 'name' in e) ? String((e as { name: unknown }).name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'mic_blocked';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no_mic';
  return 'mic_busy';
}

export interface Recording {
  /** Stops and returns the note (null when there was nothing). */
  stop(): Promise<{ blob: Blob; durationMs: number } | null>;
  /** Stops and throws the audio away. */
  cancel(): void;
}

/** Opens the microphone and starts recording. `onLevel` gets a 0–1 level every 100 ms. Rejects with the getUserMedia error. */
export async function startRecording(onLevel: (level: number) => void, now: () => number = () => performance.now()): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 48_000, echoCancellation: true } });
  const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const audio = new AudioContext();
  const analyser = audio.createAnalyser();
  analyser.fftSize = 512;
  audio.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  const timer = setInterval(() => {
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
    onLevel(peak);
  }, LEVEL_EVERY_MS);
  const started = now();
  recorder.start();
  let done = false;
  const close = () => {
    done = true;
    clearInterval(timer);
    stream.getTracks().forEach((tr) => tr.stop());
    void audio.close().catch(() => undefined);
  };
  return {
    stop: () =>
      new Promise((resolve) => {
        if (done) return resolve(null);
        const durationMs = now() - started;
        recorder.onstop = () => {
          close();
          resolve(chunks.length ? { blob: new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), durationMs } : null);
        };
        recorder.stop();
      }),
    cancel: () => {
      if (done) return;
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      close();
    },
  };
}

/** The staged file name for a recording's type. */
export function voiceFileName(mime: string): string {
  return mime.includes('ogg') ? 'voice.ogg' : 'voice.webm';
}
