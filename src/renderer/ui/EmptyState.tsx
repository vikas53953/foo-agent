// Spec: 06 §0.5 First time / Empty (icon 24 `--fg-3`, title `--t-subtitle` `--fg-1`, body `--t-small` `--fg-2` max 360px,
// centred, one button, Secondary unless stated; 48px above; filter-empty always offers "Clear filters" as a Link button;
// test ids `screen-empty` with `data-state` first_time / empty / filter_empty, `screen-empty-action`). 08-0 §E.3.
// 02-2 §F16.2 Block face (X-179, CR-0021 pick 6): `pose` puts foo's 64px face in the icon slot, decorative, never a mood.
import { TID } from '../../shared/testids';
import type { FacePoseName } from '../../shared/face';
import { Button } from './Button';
import { FacePose } from './Face';
import { Icon, type IconName } from './Icon';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  state: 'first_time' | 'empty' | 'filter_empty';
  icon?: IconName;
  /** Shown instead of the icon: foo's face in a decorative pose (no ring, `aria-hidden`). */
  pose?: FacePoseName;
  title?: string;
  body: string;
  action?: { label: string; onClick: () => void; variant?: 'secondary' | 'link' };
}

export function EmptyState({ state, icon, pose, title, body, action }: EmptyStateProps) {
  return (
    <div className={styles.empty} data-testid={TID.screenEmpty} data-state={state}>
      {pose ? <FacePose pose={pose} className={styles.pose} /> : icon && <Icon name={icon} size={24} className={styles.icon} />}
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
