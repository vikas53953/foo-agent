// Spec: 06 §0.4 (Segmented: a radiogroup of options, 32 visual inside a 40 hit row, --bg-sunken track, the chosen option
// --bg-raised with --shadow-1; ←/→ move and choose), 02-3 §F25.3 (one Tab stop: the chosen option), §F26 (data-state).
import type { KeyboardEvent } from 'react';
import { TID } from '../../shared/testids';
import styles from './Segmented.module.css';

export interface SegmentedProps<V extends string> {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
  tid?: keyof typeof TID;
}

export function Segmented<V extends string>({ label, value, options, onChange, tid }: SegmentedProps<V>) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + d + options.length) % options.length]!;
    onChange(next.value);
    e.currentTarget.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={styles.segmented}
      {...(tid ? { 'data-testid': TID[tid] } : {})}
      data-state={value}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={styles.option}
          data-value={o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
