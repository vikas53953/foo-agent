// Spec: CR-0021 pick 5 (scales in from its anchor: transform-origin from originFrom), 04 §13.4 (citation popover: `--bg-raised`, `--r-md`, `--shadow-16`, width 320, padding 12), §17.2 (feedback
// popover: `--r-lg`, padding 16, anchored above the 👎 button), §19.6 (why popover: `--r-lg`, padding 16); 02-3 §F27 / 03-shell-2
// §3.9.4 (a popover handles its own Esc and returns focus to its opener). Placed above the anchor, or below when there is
// no room; never leaves the window.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TID } from '../../shared/testids';
import { cx } from './cx';
import { originFrom } from './Menu';
import styles from './Popover.module.css';

export interface PopoverProps {
  anchor: HTMLElement;
  onClose: () => void;
  label: string;
  children: ReactNode;
  tid?: keyof typeof TID;
  /** `lg` = 16 padding and `--r-lg` (feedback, why); `md` = 12 padding and `--r-md` (citations). */
  size?: 'md' | 'lg';
  side?: 'above' | 'below';
  /** Focus the first control on open (keyboard opens). */
  autoFocus?: boolean;
  /** Called on hover-out (citation popovers that opened on hover). */
  onPointerLeave?: () => void;
  onPointerEnter?: () => void;
}

const GAP = 8;

export function Popover({
  anchor,
  onClose,
  label,
  children,
  tid,
  size = 'lg',
  side = 'above',
  autoFocus,
  onPointerLeave,
  onPointerEnter,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const opened = useRef({ anchor, side, autoFocus });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = opened.current.anchor.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    let y = opened.current.side === 'above' ? a.top - GAP - r.height : a.bottom + GAP;
    if (y < GAP) y = a.bottom + GAP;
    if (y + r.height > window.innerHeight - GAP) y = Math.max(GAP, a.top - GAP - r.height);
    const x = Math.min(Math.max(GAP, a.left), window.innerWidth - r.width - GAP);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.transformOrigin = originFrom(a, x, y, r);
    el.style.visibility = 'visible';
    if (opened.current.autoFocus) el.querySelector<HTMLElement>('button, [href], input, textarea, [tabindex="0"]')?.focus();
  }, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !opened.current.anchor.contains(t)) onClose();
    };
    const onBlur = () => onClose();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={cx(styles.popover, styles[size])}
      style={{ visibility: 'hidden', left: 0, top: 0 }}
      data-menu=""
      onPointerLeave={onPointerLeave}
      onPointerEnter={onPointerEnter}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
        opened.current.anchor.focus();
      }}
      {...(tid ? { 'data-testid': TID[tid] } : {})}
    >
      {children}
    </div>,
    document.body,
  );
}
