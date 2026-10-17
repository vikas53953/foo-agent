// Spec: 02-3 §F25.3 (lists are one Tab stop: roving tabindex; ↑/↓ move, Home/End jump; focus follows the moved item).
import { useState, type KeyboardEvent } from 'react';

/** One item tabIndex 0, the rest −1. Items carry `data-roving-index`; the container takes onKeyDown. */
export function useRovingTabIndex(count: number) {
  const [current, setCurrent] = useState(0);
  const active = Math.min(current, Math.max(0, count - 1));
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!(e.target as HTMLElement | null)?.hasAttribute?.('data-roving-index')) return;
    const next =
      e.key === 'ArrowDown' ? active + 1 : e.key === 'ArrowUp' ? active - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? count - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const i = Math.max(0, Math.min(count - 1, next));
    setCurrent(i);
    e.currentTarget.querySelector<HTMLElement>(`[data-roving-index="${i}"]`)?.focus();
  };
  const itemProps = (i: number) => ({ 'data-roving-index': i, tabIndex: i === active ? 0 : -1, onFocus: () => setCurrent(i) });
  return { active, onKeyDown, itemProps };
}
