// Spec: 04-2 §22.1 (voice notes: press and hold the mic ≥ 150 ms → hold mode, a shorter click → locked mode; hold {talkKey}
// ≥ 150 ms while foo's window is focused → hold mode, releasing Space or Ctrl ends it, a shorter tap does nothing; Space or
// Enter on the focused mic → locked mode; slide ≥ 120 px left of where the pointer went down → "Let go to cancel"; Esc cancels;
// shorter than 0.5 s → discarded and "Hold to record" for 2 s; from 4:30 the timer warns and at 5:00 the note is sent;
// Narrator "Recording voice note." / "Voice note sent, {length}." / "Voice note cancelled"; microphone problems become the
// composer banner and recording does not start), J7 (the file is copied into {DATA}\data\voice by main: files:stage, then
// voice:submit; transcription arrives in M11). The recording itself is voice.ts.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { t } from '../../shared/copy/t';
import type { ComposerBannerType } from '../../shared/types';
import { announce } from '../a11y/announce';
import { invoke } from '../ipc/client';
import { stageFile } from './send';
import type { RecordingView } from './VoiceRecorder';
import {
  HOLD_ARM_MS,
  LEVEL_BARS,
  LEVEL_EVERY_MS,
  MAX_VOICE_MS,
  micBanner,
  MIN_VOICE_MS,
  SLIDE_CANCEL_PX,
  startRecording,
  timerText,
  voiceFileName,
  type Recording,
} from './voice';

/** "Hold to record" shows this long after a too-short note (§22.1, J7). */
export const TOO_SHORT_MS = 2_000;

export interface VoiceApi {
  rec: RecordingView | null;
  tooShort: boolean;
  /** Pointer down on the Mic state. */
  micDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  /** Space or Enter on the focused mic → locked mode. */
  micKey: () => void;
  /** The {talkKey} chord went down (hold after 150 ms). */
  talkDown: () => void;
  /** Space or Ctrl went up. */
  talkUp: () => void;
  /** Send the locked note (round button or Enter). */
  finish: () => void;
  cancel: () => void;
}

export function useVoice(o: { chatId: string; enabled: boolean; onBanner: (b: ComposerBannerType | null) => void }): VoiceApi {
  const [rec, setRec] = useState<RecordingView | null>(null);
  const [tooShort, setTooShort] = useState(false);
  const recording = useRef<Recording | null>(null);
  const view = useRef<RecordingView | null>(null);
  const started = useRef(0);
  const arm = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ticker = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const shortTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** A hold ended while the microphone was still opening: what to do once it is open. */
  const starting = useRef(false);
  const early = useRef<'finish' | 'cancel' | null>(null);
  const opts = useRef(o);
  useEffect(() => {
    opts.current = o;
  });

  const set = useCallback((v: RecordingView | null) => {
    view.current = v;
    setRec(v);
  }, []);

  const stopTicker = () => {
    clearInterval(ticker.current);
    ticker.current = undefined;
  };

  const cancel = useCallback(() => {
    clearTimeout(arm.current);
    arm.current = undefined;
    stopTicker();
    const r = recording.current;
    recording.current = null;
    if (starting.current) early.current = 'cancel';
    if (!r && !view.current) return;
    r?.cancel();
    set(null);
    announce(t('composer.recording.announce_cancelled'));
  }, [set]);

  const finish = useCallback(async () => {
    stopTicker();
    const r = recording.current;
    recording.current = null;
    if (!r) {
      if (starting.current) early.current = 'finish';
      return;
    }
    const out = await r.stop();
    set(null);
    if (!out || out.durationMs < MIN_VOICE_MS) {
      setTooShort(true);
      clearTimeout(shortTimer.current);
      shortTimer.current = setTimeout(() => setTooShort(false), TOO_SHORT_MS);
      return;
    }
    const durationMs = Math.min(out.durationMs, MAX_VOICE_MS);
    try {
      const staged = await stageFile(voiceFileName(out.blob.type), await out.blob.arrayBuffer());
      if (!staged.ok) throw new Error(staged.kind);
      const sent = await invoke('voice:submit', { chatId: opts.current.chatId, attachmentId: staged.id, durationMs });
      if (!sent.ok) throw new Error(sent.error.kind);
      announce(t('composer.recording.announce_sent', { length: timerText(durationMs) }));
    } catch (e) {
      // The §23.2a error notices (X-149) are not built yet (implementation-notes GAP); the note is lost with a console line.
      console.warn('voice:submit', e);
    }
  }, [set]);

  const begin = useCallback(
    async (mode: RecordingView['mode'], source: RecordingView['source']) => {
      if (!opts.current.enabled || recording.current || starting.current) return;
      const levels: number[] = Array.from({ length: LEVEL_BARS }, () => 0);
      starting.current = true;
      early.current = null;
      try {
        const r = await startRecording((level) => {
          levels.push(level);
          levels.shift();
        });
        recording.current = r;
      } catch (e) {
        opts.current.onBanner(micBanner(e));
        return;
      } finally {
        starting.current = false;
      }
      opts.current.onBanner(null);
      started.current = performance.now();
      set({ mode, source, elapsedMs: 0, levels: [...levels], cancelArmed: false });
      announce(t('composer.recording.announce_start'));
      ticker.current = setInterval(() => {
        const v = view.current;
        if (!v) return;
        const elapsedMs = performance.now() - started.current;
        set({ ...v, elapsedMs, levels: [...levels] });
        if (elapsedMs >= MAX_VOICE_MS) void finish();
      }, LEVEL_EVERY_MS);
      if (early.current === 'finish') void finish();
      else if (early.current === 'cancel') cancel();
      early.current = null;
    },
    [cancel, finish, set],
  );

  const micDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (recording.current || arm.current) return;
      const x0 = e.clientX;
      let held = false;
      arm.current = setTimeout(() => {
        arm.current = undefined;
        held = true;
        void begin('hold', 'mouse');
      }, HOLD_ARM_MS);
      const move = (ev: PointerEvent) => {
        const v = view.current;
        if (!v || v.mode !== 'hold') return;
        const armed = x0 - ev.clientX >= SLIDE_CANCEL_PX;
        if (armed !== v.cancelArmed) set({ ...v, cancelArmed: armed });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (!held) {
          clearTimeout(arm.current);
          arm.current = undefined;
          void begin('locked', 'mouse');
          return;
        }
        if (view.current?.cancelArmed) cancel();
        else void finish();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [begin, cancel, finish, set],
  );

  const micKey = useCallback(() => void begin('locked', 'keyboard'), [begin]);

  const talkDown = useCallback(() => {
    if (recording.current || arm.current) return;
    arm.current = setTimeout(() => {
      arm.current = undefined;
      void begin('hold', 'keyboard');
    }, HOLD_ARM_MS);
  }, [begin]);

  const talkUp = useCallback(() => {
    if (arm.current) {
      // A tap shorter than 150 ms does nothing (§22.1).
      clearTimeout(arm.current);
      arm.current = undefined;
      return;
    }
    if (view.current?.mode === 'hold' && view.current.source === 'keyboard') void finish();
  }, [finish]);

  useEffect(
    () => () => {
      clearTimeout(arm.current);
      clearTimeout(shortTimer.current);
      stopTicker();
      recording.current?.cancel();
    },
    [],
  );

  return { rec, tooShort, micDown, micKey, talkDown, talkUp, finish: () => void finish(), cancel };
}
