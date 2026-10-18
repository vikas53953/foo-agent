// Spec: 06 §0.4 Row group (rows stacked in a box: 1px `--line`, `--r-lg`, `--bg-app`; 1px `--line` divider between rows
// inset 16px left), 06 §0.8 (row groups are `role="list"`, each row `role="listitem"`), 08-0 §E.3 (screens/shared).
import type { ReactNode } from 'react';
import styles from './RowGroup.module.css';

export interface RowGroupProps {
  /** The group's name for Narrator, usually its section label. */
  label?: string;
  children: ReactNode;
}

export function RowGroup({ label, children }: RowGroupProps) {
  return (
    <div role="list" aria-label={label} className={styles.group}>
      {children}
    </div>
  );
}
