// Spec: 02-3 §F27 (tooltips: after `--delay-tooltip` on hover, at once on keyboard focus, `--delay-tooltip-warm` while
// another tooltip was just shown; max width `--tooltip-max`; Esc hides), 03-shell-2 §3.9.4 (Esc ladder step 1),
// §3.9.5 (icon-only buttons always have a tooltip showing the shortcut). The control keeps its own accessible name.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { tokenMs } from './tokens';
import styles from './Tooltip.module.css';

let lastHiddenAt = 0;

export interface TooltipProps {
  text: string;
  children: ReactNode;
  /** Shown below the control by default; `top` for controls at the bottom of the window. */
  side?: 'bottom' | 'top';
  className?: string;
}

export function Tooltip({ text, children, side = 'bottom', className }: TooltipProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const id = useId();

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (now: boolean) => {
    clear();
    const warm = performance.now() - lastHiddenAt < tokenMs('--delay-tooltip-warm', 300);
    const delay = now || warm ? 0 : tokenMs('--delay-tooltip', 500);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clear();
    setOpen((o) => {
      if (o) lastHiddenAt = performance.now();
      return false;
    });
  };
  useEffect(() => clear, []);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) return;
    const a = anchor.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const gap = 4;
    const x = Math.min(Math.max(gap, a.left + a.width / 2 - t.width / 2), window.innerWidth - t.width - gap);
    const below = a.bottom + gap;
    const y = side === 'top' || below + t.height > window.innerHeight ? a.top - gap - t.height : below;
    // Placed straight on the node after measuring (no second render).
    tip.current.style.left = `${x}px`;
    tip.current.style.top = `${y}px`;
    tip.current.style.visibility = 'visible';
  }, [open, side]);

  return (
    <span
      ref={anchor}
      className={`${styles.anchor} ${className ?? ''}`}
      onPointerEnter={() => show(false)}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(e) => {
        if (e.target.matches(':focus-visible')) show(true);
      }}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          hide();
        }
      }}
    >
      {children}
      {open &&
        createPortal(
          <div ref={tip} id={id} role="tooltip" className={styles.tip} style={{ visibility: 'hidden', left: 0, top: 0 }}>
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}
