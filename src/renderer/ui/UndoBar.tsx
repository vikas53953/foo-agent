// Spec: 02-3 §F21.3 Undo bar (the one in-app toast: height `--undo-h` 48 min, width fits, min 280, max min(560, column −
// 32); bottom-centre of the content column, 16px above the composer in chats or 24px above the pane bottom in Pages;
// `--bg-raised`, `--r-md`, `--shadow-16` (dark + 1px `--line`); padding 0 8px 0 16px; text `--t-body` `--fg-1`, one line,
// ellipsis; Link button "Undo" 16px after the text; `--z-undo`; life `--dur-undo` 5 s, paused on hover / focus inside;
// Ctrl+Z (not in a text field) = Undo; Esc with focus in the bar closes it; enter fade + rise 8px `--m-normal`
// `--ease-in`; `role="status"` reads "{text}. Undo available, press Control Z."; focus does not move to it), 02-3 §F32
// (`app-undo`, `app-undo-action`; `app.undo.action`, `app.undo.narrator`). A second removal replaces the bar: the host
// remounts it with a new `key` after calling the first bar's `onDone`. The host is `position: relative`.
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Button } from './Button';
import { cx } from './cx';
import { isUndoKey, pausableTimer, type PausableTimer } from './undoTimer';
import styles from './UndoBar.module.css';

export interface UndoBarProps {
  /** The past-tense line in the 02-3 §F21.3 copy pattern, e.g. Forgot "{fact}". */
  text: string;
  onUndo: () => void;
  /** The bar is gone and the removal is final (timeout or Esc). */
  onDone: () => void;
  place?: 'chat' | 'page';
}

export function UndoBar({ text, onUndo, onDone, place = 'page' }: UndoBarProps) {
  const timer = useRef<PausableTimer | null>(null);
  const handlers = useRef({ onUndo, onDone });
  useEffect(() => {
    handlers.current = { onUndo, onDone };
  });

  useEffect(() => {
    const tm = pausableTimer(() => handlers.current.onDone());
    timer.current = tm;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!isUndoKey(e, document.activeElement)) return;
      e.preventDefault();
      tm.cancel();
      handlers.current.onUndo();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      tm.cancel();
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const undo = () => {
    timer.current?.cancel();
    onUndo();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    timer.current?.cancel();
    onDone();
  };

  return (
    <div
      className={cx(styles.bar, styles[place])}
      data-testid={TID.appUndo}
      onPointerEnter={() => timer.current?.pause()}
      onPointerLeave={() => timer.current?.resume()}
      onFocus={() => timer.current?.pause()}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) timer.current?.resume();
      }}
      onKeyDown={onKeyDown}
    >
      <span role="status" className={styles.spoken}>
        {t('app.undo.narrator', { text })}
      </span>
      <span className={styles.text} aria-hidden="true">
        {text}
      </span>
      <Button variant="link" data-testid={TID.appUndoAction} onClick={undo}>
        {t('app.undo.action')}
      </Button>
    </div>
  );
}
