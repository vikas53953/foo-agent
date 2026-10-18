// Spec: 02-3 §F21.3 Undo bar life (`--dur-undo` 5000ms; the timer pauses while the pointer is over the bar or focus is
// inside it) and keys (Ctrl+Z when focus is not in a text field = Undo while the bar shows). Kept apart from UndoBar.tsx so
// the timing and key rules are testable without a page.
import { motion } from '../../shared/tokens';

export interface PausableTimer {
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

/** Fires `onFire` once after `ms` of un-paused time. */
export function pausableTimer(onFire: () => void, ms: number = motion['dur-undo']): PausableTimer {
  let left = ms;
  let startedAt = 0;
  let handle: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    if (handle !== null) clearTimeout(handle);
    handle = null;
  };
  const resume = () => {
    if (handle !== null || left <= 0) return;
    startedAt = Date.now();
    handle = setTimeout(() => {
      handle = null;
      left = 0;
      onFire();
    }, left);
  };
  const pause = () => {
    if (handle === null) return;
    stop();
    left = Math.max(0, left - (Date.now() - startedAt));
  };
  resume();
  return {
    pause,
    resume,
    cancel: () => {
      stop();
      left = 0;
    },
  };
}

/** Ctrl+Z means Undo for the bar only when focus is not in a text field (the field keeps its own undo). */
export function isUndoKey(e: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }, target: Element | null): boolean {
  if (!e.ctrlKey || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return false;
  return !isTextField(target);
}

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  }
  return el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '';
}
