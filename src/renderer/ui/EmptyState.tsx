// Spec: 06 §0.5 First time / Empty (icon 24 `--fg-3`, title `--t-subtitle` `--fg-1`, body `--t-small` `--fg-2` max 360px,
// centred, one button, Secondary unless stated; 48px above; filter-empty always offers "Clear filters" as a Link button;
// test ids `screen-empty` with `data-state` first_time / empty / filter_empty, `screen-empty-action`). 08-0 §E.3.
import { TID } from '../../shared/testids';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  state: 'first_time' | 'empty' | 'filter_empty';
  icon?: IconName;
  title?: string;
  body: string;
  action?: { label: string; onClick: () => void; variant?: 'secondary' | 'link' };
}

export function EmptyState({ state, icon, title, body, action }: EmptyStateProps) {
  return (
    <div className={styles.empty} data-testid={TID.screenEmpty} data-state={state}>
      {icon && <Icon name={icon} size={24} className={styles.icon} />}
      {title && <h2 className={styles.title}>{title}</h2>}
      <p className={styles.body}>{body}</p>
      {action && (
        <Button variant={action.variant ?? 'secondary'} size="sm" data-testid={TID.screenEmptyAction} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
