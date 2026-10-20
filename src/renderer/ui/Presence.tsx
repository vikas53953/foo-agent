// Spec: 02 §F7 FE-24 (mount and unmount transitions use one wrapper: `<Presence show exitMs>` keeps the child mounted for
// `exitMs` after `show` turns false and sets `data-exit` on it meanwhile; CSS keys the exit animation on `[data-exit]`;
// `exitMs` is a token value, `motion.normal` unless the component's row says otherwise), CR-0021 pick 2 (exits are
// faster than entrances), 02-3 §F25.4 (reduced motion: the child leaves at once).
import { cloneElement, isValidElement, useEffect, useState, type ReactElement } from 'react';
import { reducedMotionNow } from '../a11y/useReducedMotion';
import { motion } from '../../shared/tokens';

export interface PresenceProps {
  show: boolean;
  /** How long the child stays after `show` turns false. A `motion` token value; defaults to `motion.normal`. */
  exitMs?: number;
  /** One element that accepts a `data-exit` attribute. */
  children: ReactElement<{ 'data-exit'?: '' }>;
}

export function Presence({ show, exitMs = motion.normal, children }: PresenceProps) {
  const [prevShow, setPrevShow] = useState(show);
  const [leaving, setLeaving] = useState(false);
  // Adjust state while rendering when `show` flips (React's "storing information from previous renders" pattern).
  if (show !== prevShow) {
    setPrevShow(show);
    setLeaving(!show && exitMs > 0 && !reducedMotionNow());
  }

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(false), exitMs);
    return () => clearTimeout(timer);
  }, [leaving, exitMs]);

  if ((!show && !leaving) || !isValidElement(children)) return null;
  return leaving ? cloneElement(children, { 'data-exit': '' }) : children;
}
