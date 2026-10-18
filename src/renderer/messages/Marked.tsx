// Spec: 03-shell-2 §3.6.3 (find matches `--warn-soft`, the current match a 2px `--accent` outline, `--r-xs`), 04 §1.10 (inside
// the user's bubble the match keeps `--warn-soft` with `--fg-1` text).
import type { ReactNode } from 'react';
import styles from './MessageList.module.css';

export function Marked({
  text,
  ranges,
  current,
}: {
  text: string;
  ranges: { start: number; end: number }[];
  current?: { messageId: string; start: number };
}) {
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach((r, i) => {
    parts.push(text.slice(at, r.start));
    parts.push(
      <mark key={i} className={styles.match} data-current={current?.start === r.start || undefined}>
        {text.slice(r.start, r.end)}
      </mark>,
    );
    at = r.end;
  });
  parts.push(text.slice(at));
  return <>{parts}</>;
}
