// Spec: 02-3 §F22 as amended by X-179: two soft tones made in the renderer with Web Audio (no audio files, no network),
// CR-0021 pick 20. Toast sounds stay Windows' own (09 §9.9.1).
import type { SoundName } from './gate';

/** Notes (Hz) and their start offsets (s): Approve is a soft rising pair, Done a gentle three-note chime. */
const NOTES: Record<SoundName, [number, number][]> = {
  approve: [
    [659.25, 0],
    [987.77, 0.09],
  ],
  done: [
    [523.25, 0],
    [659.25, 0.11],
    [783.99, 0.22],
  ],
};
const PEAK = 0.05;
const ATTACK = 0.012;
const DECAY = 0.32;

let ctx: AudioContext | null = null;

/** Plays one tone set at a quiet level. A missing audio device is not an error: the visible change is the signal. */
export function playTone(name: SoundName): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    for (const [freq, at] of NOTES[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0 + at);
      gain.gain.linearRampToValueAtTime(PEAK, t0 + at + ATTACK);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + DECAY);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + DECAY + 0.02);
    }
  } catch {
    // No audio output: nothing to do.
  }
}
