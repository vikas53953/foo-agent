// Spec: 04 §1.9 (Ask about this: a selection inside one foo or helper bubble shows a pill "Ask about this" (Chip, 06 §0.4,
// 8px above the selection's end, `bubble-ask-pill`); click opens the side-question strip of §17.5 quoting the selected
// words; Copy is unchanged), §9.2 (the hover toolbar itself is unchanged), CR-0022 pick 6 (X-180), AT-364. R1 T6.
import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { clockNow } from '../store/apply';
import { requestComposer } from '../store/messages';
import { Chip } from '../ui/Chip';
import styles from './AskPill.module.css';

/** 04-2 §21.6 the strip shows one line; the AI gets the words as picked, up to this many characters. */
export const ASK_QUOTE_MAX = 2_000;

interface Picked {
  messageId: string;
  quote: string;
  x: number;
  y: number;
}

/** The selection, when it sits inside one foo or helper bubble (`data-ask-about` on the bubble). */
export function pickedIn(sel: Selection | null): (Omit<Picked, 'x' | 'y'> & { rect: DOMRect }) | null {
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const holder = (n: Node | null) => (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>('[data-ask-about]') ?? null;
  const a = holder(range.startContainer);
  if (!a || a !== holder(range.endContainer)) return null;
  const quote = sel.toString().replace(/\s+/gu, ' ').trim().slice(0, ASK_QUOTE_MAX);
  const messageId = a.dataset.askAbout;
  if (!quote || !messageId) return null;
  const rects = range.getClientRects();
  const rect = rects.length ? rects[rects.length - 1]! : range.getBoundingClientRect();
  return { messageId, quote, rect };
}

export function AskPill({ chatId, scrollRef }: { chatId: string; scrollRef: RefObject<HTMLElement | null> }) {
  const [picked, setPicked] = useState<Picked | null>(null);
  useEffect(() => {
    const read = () => {
      const p = pickedIn(document.getSelection());
      setPicked(p ? { messageId: p.messageId, quote: p.quote, x: p.rect.right, y: p.rect.top } : null);
    };
    const hide = () => setPicked(null);
    const scroller = scrollRef.current;
    document.addEventListener('selectionchange', read);
    scroller?.addEventListener('scroll', hide, { passive: true });
    return () => {
      document.removeEventListener('selectionchange', read);
      scroller?.removeEventListener('scroll', hide);
    };
  }, [scrollRef]);
  if (!picked) return null;
  return createPortal(
    <div className={styles.at} style={{ left: picked.x, top: picked.y }}>
      <Chip
        className={styles.pill}
        data-testid={TID.bubbleAskPill}
        // The selection must survive the press, or the click would clear what it asks about.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          requestComposer(chatId, { kind: 'side', messageId: picked.messageId, quote: picked.quote, at: clockNow() });
          document.getSelection()?.removeAllRanges();
          setPicked(null);
        }}
      >
        {t('bubble.ask.pill')}
      </Chip>
    </div>,
    document.body,
  );
}
