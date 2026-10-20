// Spec: 02-3 §F21.3 undo bar (height `--undo-h` 48 min, width fits, min 280, max min(560, column − 32); bottom-centre, 24px
// above the pane bottom in Pages; `--bg-raised`, `--r-md`, `--shadow-16` (dark + 1px `--line`); padding 0 8 0 16; text
// `--t-body` one line; Link "Undo" 16px after the text; `--z-undo`; life `--dur-undo`, paused while hovered or focused; a
// second removal replaces the bar and makes the first final; Ctrl+Z (focus not in a text field) = Undo; Esc in the bar
// closes it; enter fade + rise 8px; `role="status"`, focus does not move to it), SV-34, X-32. 08-0 §E.3 component name.
// P1 (02 §F7.1 Cards, CR-0021): the bar slides up on the spring and a 2px timer line drains over `--dur-undo`, pausing with
// the timer while hovered or focused (decorative: the bar's words carry the meaning).
import { useEffect, useRef } from 'react';
import { TID } from '../../shared/testids';
import { motion } from '../../shared/tokens';
import styles from './UndoBar.module.css';

export interface UndoBarProps {
  text: string;
  actionLabel: string;
  onUndo: () => void;
  /** The bar went away without Undo: the removal is final. */
  onFinal: () => void;
}

const inTextField = (el: Element | null) =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement && el.type !== 'checkbox') ||
  (el as HTMLElement | null)?.isContentEditable === true;

export function UndoBar({ text, actionLabel, onUndo, onFinal }: UndoBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const left = useRef<number>(motion['dur-undo']);
  const started = useRef<number>(0);
  const timer = useRef<number | null>(null);
  const calls = useRef({ onUndo, onFinal });
  useEffect(() => {
    calls.current = { onUndo, onFinal };
  });

  useEffect(() => {
    const stop = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
        left.current -= Date.now() - started.current;
      }
    };
    const start = () => {
      if (timer.current !== null) return;
      started.current = Date.now();
      timer.current = window.setTimeout(() => calls.current.onFinal(), Math.max(0, left.current));
    };
    const el = ref.current;
    const paused = () => !!el && (el.matches(':hover') || el.contains(document.activeElement));
    let resumeAt: number | undefined;
    const resume = () => {
      resumeAt = window.setTimeout(() => !paused() && start(), 0);
    };
    el?.addEventListener('pointerenter', stop);
    el?.addEventListener('pointerleave', resume);
    el?.addEventListener('focusin', stop);
    el?.addEventListener('focusout', resume);
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && !inTextField(document.activeElement)) {
        e.preventDefault();
        calls.current.onUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    start();
    return () => {
      window.clearTimeout(resumeAt);
      stop();
      window.removeEventListener('keydown', onKey);
      el?.removeEventListener('pointerenter', stop);
      el?.removeEventListener('pointerleave', resume);
      el?.removeEventListener('focusin', stop);
      el?.removeEventListener('focusout', resume);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={styles.bar}
      role="status"
      data-testid={TID.appUndo}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onFinal();
        }
      }}
    >
      <span className={styles.text}>{text}</span>
      <span className={styles.timer} aria-hidden="true" />
      <button type="button" className={styles.action} data-testid={TID.appUndoAction} onClick={onUndo}>
        {actionLabel}
      </button>
    </div>
  );
}
