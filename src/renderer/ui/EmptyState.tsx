// Spec: 06 §0.5 common states First time / Empty (one block: icon 24 `--fg-3`, title `--t-subtitle` `--fg-1`, body
// `--t-small` `--fg-2` max 360 centred, one button, Secondary unless stated; 48px above, centred in the content column;
// filter-empty always offers "Clear filters" as a Link button), 08-0 §C (`screen-empty` with `data-state` first_time /
// empty / filter_empty, `screen-empty-action`), 08-0 §E.3 (EmptyState is a primitive).
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Button, type ButtonVariant } from './Button';
import { Icon, type IconName } from './Icon';
import styles from './EmptyState.module.css';

export type EmptyKind = 'first_time' | 'empty' | 'filter_empty';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  /** Secondary unless the screen says otherwise (06 §0.5). */
  variant?: ButtonVariant;
}

export interface EmptyStateProps {
  state: EmptyKind;
  icon: IconName;
  title: string;
  body?: string;
  /** The one button. For `filter_empty` it defaults to the "Clear filters" Link button calling `onClearFilters`. */
  action?: EmptyStateAction;
  onClearFilters?: () => void;
}

/** The block's one button: the screen's, or "Clear filters" on a filter that matches nothing. */
export function emptyAction(p: Pick<EmptyStateProps, 'state' | 'action' | 'onClearFilters'>): EmptyStateAction | null {
  if (p.action) return p.action;
  if (p.state === 'filter_empty' && p.onClearFilters)
    return { label: t('screen.common.clear_filters'), onClick: p.onClearFilters, variant: 'link' };
  return null;
}

export function EmptyState(props: EmptyStateProps) {
  const { state, icon, title, body } = props;
  const action = emptyAction(props);
  return (
    <div className={styles.empty} data-testid={TID.screenEmpty} data-state={state}>
      <Icon name={icon} size={24} className={styles.icon} />
      <h2 className={styles.title}>{title}</h2>
      {body && <p className={styles.body}>{body}</p>}
      {action && (
        <Button
          variant={action.variant ?? 'secondary'}
          size={action.variant === 'link' ? 'sm' : 'md'}
          data-testid={TID.screenEmptyAction}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
