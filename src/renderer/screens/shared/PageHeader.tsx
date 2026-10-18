// Spec: 06 §0.2 Page header (60px `--header-h`, 1px `--line` bottom border; back button `--icon-btn` 36 with `ArrowLeft`
// 20, tooltip "Back (Esc)", Narrator name "Back to {previous place}"; title `--t-title` `--fg-1`, one line, ellipsis;
// header actions right-aligned, 8px gap, right pad 16; ids `screen-back`, `screen-title`), 06 §0.8 (on open focus moves to
// the title, `tabindex="-1"`, so Narrator reads "{Title}, heading level 1"), 08-0 §E.3 (screens/shared composite).
import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../../../shared/copy/t';
import { TID } from '../../../shared/testids';
import { IconButton } from '../../ui/IconButton';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  /** The place the back button returns to, e.g. "chat with foo" (06 §0.2 Narrator name). */
  backTo: string;
  onBack: () => void;
  /** Icon buttons or 32px Secondary buttons. */
  actions?: ReactNode;
  /** 1 for a page; 2 for a sub-page inside a page that already has an h1. */
  level?: 1 | 2;
  /** Focus the title when the page opens (06 §0.8). */
  focusOnOpen?: boolean;
}

export function PageHeader({ title, backTo, onBack, actions, level = 1, focusOnOpen = true }: PageHeaderProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnOpen) ref.current?.focus({ preventScroll: true });
  }, [focusOnOpen]);
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <header className={styles.header}>
      <IconButton
        icon="ArrowLeft"
        label={t('screen.common.back_to', { place: backTo })}
        tooltip={t('screen.common.back_tooltip')}
        data-testid={TID.screenBack}
        onClick={onBack}
      />
      <Heading ref={ref} tabIndex={-1} className={styles.title} data-testid={TID.screenTitle}>
        {title}
      </Heading>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
