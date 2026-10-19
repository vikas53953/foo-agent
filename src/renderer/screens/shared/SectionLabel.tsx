// Spec: 06 §0.4 Section label (`--t-caption-strong`, uppercase, tracking +0.08em, `--fg-3`; 24px above, 8px below).
import type { ReactNode } from 'react';
import styles from './SectionLabel.module.css';

export function SectionLabel({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className={styles.label}>
      {children}
    </h2>
  );
}
