// Spec: 06 §0.4 Settings row (min-height 56, padding 0 16px, grows with text; label `--t-body` `--fg-1`, optional second
// line `--t-small` `--fg-2`; control right-aligned 16px from the edge; `--bg-hover` / `--bg-pressed` only when the whole
// row is clickable; ring around the row `--r-sm`; disabled label `--fg-disabled`; test id `settings-row-{page}-{rowId}`,
// §0.13), 06 §0.5 Saving ("Saved" `--t-caption` `--ok` + `Checkmark` 16 for 2s next to a typed field; a failed write shows
// the row-level line "That didn't save. Try again." + Link button "Try again", `screen-saving-retry`), 06 §0.8 (each row
// `role="listitem"`; its name reads label, then value, then state), 02-3 §F27.1 (rows use the arrow cursor). The row's
// test id is passed from TID by key; `data-row-id` carries the row id.
import { useId, type ReactNode } from 'react';
import { t } from '../../../shared/copy/t';
import { TID } from '../../../shared/testids';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { Icon } from '../../ui/Icon';
import styles from './SettingsRow.module.css';

export interface SettingsRowProps {
  page: string;
  rowId: string;
  tid?: keyof typeof TID;
  label: string;
  description?: string;
  /** The control on the right; a function gets the label's id for `aria-labelledby`. */
  control?: ReactNode | ((labelId: string) => ReactNode);
  /** Whole-row button variant: the row opens something; `control` is then the value text before the chevron. */
  chevron?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  /** Show "Saved" (the owner drives the 2s with useSavedFlash). */
  saved?: boolean;
  /** The last write failed: show the row-level retry line. */
  saveFailed?: boolean;
  onRetry?: () => void;
}

export function SettingsRow(p: SettingsRowProps) {
  const labelId = useId();
  const control = typeof p.control === 'function' ? p.control(labelId) : p.control;
  const text = (
    <span className={styles.text}>
      <span id={labelId} className={styles.label}>
        {p.label}
      </span>
      {p.description && <span className={styles.description}>{p.description}</span>}
    </span>
  );
  const saved = p.saved && (
    <span className={styles.saved} role="status">
      <Icon name="Checkmark" size={16} />
      {t('screen.common.saved')}
    </span>
  );
  return (
    <div
      role="listitem"
      className={cx(styles.row, p.disabled && styles.disabled)}
      data-row-id={p.rowId}
      data-page={p.page}
      data-state={p.saveFailed ? 'save_failed' : p.saved ? 'saved' : undefined}
      {...(p.tid ? { 'data-testid': TID[p.tid] } : {})}
    >
      {p.chevron ? (
        <button
          type="button"
          className={cx(styles.main, styles.button)}
          aria-disabled={p.disabled || undefined}
          onClick={p.disabled ? undefined : p.onClick}
        >
          {text}
          {control && <span className={styles.value}>{control}</span>}
          <Icon name="ChevronRight" size={16} className={styles.chevron} />
        </button>
      ) : (
        <div className={styles.main}>
          {text}
          {saved}
          {control && <span className={styles.control}>{control}</span>}
        </div>
      )}
      {p.saveFailed && (
        <p className={styles.failed}>
          <span>{t('screen.common.saving_failed')}</span>
          <Button variant="link" data-testid={TID.screenSavingRetry} onClick={p.onRetry}>
            {t('screen.common.try_again')}
          </Button>
        </p>
      )}
    </div>
  );
}
