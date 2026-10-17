// Spec: 04 §9.3 (reaction picker: 44px pill, `--r-full`, `--bg-raised`, `--shadow-16`, 8px above the bubble (below when
// there is no room); six 36px emoji buttons 👍 ❤️ 😂 😮 🙏 👎 at 20px, then "+" (Add 16, "More emoji") that opens the Windows
// emoji panel bound to an off-screen one-character input — the first emoji received becomes the reaction, closing the panel
// with nothing chosen cancels; ←/→ move, Enter picks, Esc closes; focus starts on 👍), §8 (one reaction per person).
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { invoke } from '../ipc/client';
import { Icon } from '../ui/Icon';
import { isEmojiGrapheme } from './textRules';
import styles from './Bubble.module.css';

export const DEFAULT_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '👎'] as const;

const GAP = 8;

export function ReactionPicker({
  anchorRef,
  onPick,
  onClose,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const panelInput = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = anchorRef.current?.getBoundingClientRect() ?? el.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    let y = a.top - GAP - r.height;
    if (y < GAP) y = a.bottom + GAP;
    const x = Math.min(Math.max(GAP, a.left), window.innerWidth - r.width - GAP);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.visibility = 'visible';
    el.querySelector<HTMLButtonElement>('button')?.focus();
  }, [anchorRef]);

  useEffect(() => {
    const onDown = (e: globalThis.PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [onClose]);

  const buttons = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const onKeyDown = (e: KeyboardEvent) => {
    const list = buttons();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length]?.focus();
    } else if (e.key === 'Escape') {
      onClose();
      anchorRef.current?.closest<HTMLElement>('[data-message-id]')?.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const morePanel = () => {
    const input = panelInput.current;
    if (!input) return;
    input.value = '';
    input.focus();
    void invoke('app:showEmojiPanel', {});
  };

  return createPortal(
    <div
      ref={ref}
      role="toolbar"
      aria-label={t('bubble.toolbar.react')}
      className={styles.picker}
      style={{ visibility: 'hidden', left: 0, top: 0 }}
      data-testid={TID.bubbleReactPicker}
      data-menu=""
      onKeyDown={onKeyDown}
    >
      {DEFAULT_REACTIONS.map((e, i) => (
        <button
          key={e}
          type="button"
          className={styles.pickerOption}
          data-testid={TID.bubbleReactOption}
          data-index={i}
          onClick={() => onPick(e)}
        >
          {e}
        </button>
      ))}
      <button
        type="button"
        className={styles.pickerMore}
        aria-label={t('bubble.react_picker.more')}
        title={t('bubble.react_picker.more')}
        data-testid={TID.bubbleReactMore}
        onClick={morePanel}
      >
        <Icon name="Add" size={16} />
      </button>
      <input
        ref={panelInput}
        className={styles.offscreen}
        tabIndex={-1}
        aria-hidden="true"
        onInput={(e) => {
          const v = e.currentTarget.value.trim();
          const seg = new Intl.Segmenter('en-IN', { granularity: 'grapheme' }).segment(v)[Symbol.iterator]().next().value?.segment;
          e.currentTarget.value = '';
          if (seg && isEmojiGrapheme(seg)) onPick(seg);
        }}
      />
    </div>,
    document.body,
  );
}
