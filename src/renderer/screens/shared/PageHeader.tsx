// Spec: 06 §0.2 page header (60px `--header-h`, 1px `--line` bottom; back button 36 `ArrowLeft` 20 `--fg-2`, tooltip "Back
// (Esc)"; title `--t-title` one line, ellipsis, `tabindex="-1"` so focus lands on it when the page opens (§0.8); header
// actions right-aligned, 8px gap, right pad 16; ids `screen-back`, `screen-title`).
import { useEffect, useRef, type ReactNode } from 'react';
import { TID } from '../../../shared/testids';
import { IconButton } from '../../ui/IconButton';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  backLabel: string;
  onBack: () => void;
  children?: ReactNode;
}

export function PageHeader({ title, backLabel, onBack, children }: PageHeaderProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  return (
    <header className={styles.header}>
      <IconButton icon="ArrowLeft" label={backLabel} data-testid={TID.screenBack} onClick={onBack} />
      <h1 ref={titleRef} className={styles.title} data-testid={TID.screenTitle} tabIndex={-1}>
        {title}
      </h1>
      <div className={styles.actions}>{children}</div>
    </header>
  );
}
