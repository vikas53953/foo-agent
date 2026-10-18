// Spec: 06 §0.4 Search field (in pages): `TextField size='sm' shape='search'` (02-3 §F32.4, X-119): `--field-h` 36,
// `--r-full`, `--bg-sunken`, no border, `Search` 16 icon, `--t-body`; a `Dismiss` 16 clear button appears when text
// exists (named "Clear search", the left-shell search's words). 08-0 §E.3 (screens/shared composite).
import { t } from '../../../shared/copy/t';
import { TID } from '../../../shared/testids';
import { IconButton } from '../../ui/IconButton';
import { TextField } from '../../ui/TextField';
import styles from './PageSearchField.module.css';

export interface PageSearchFieldProps {
  value: string;
  onChange: (v: string) => void;
  /** Placeholder and accessible name (the screen's copy). */
  label: string;
  tid?: keyof typeof TID;
  clearTid?: keyof typeof TID;
}

export function PageSearchField({ value, onChange, label, tid, clearTid }: PageSearchFieldProps) {
  return (
    <div className={styles.search}>
      <TextField
        size="sm"
        shape="search"
        value={value}
        placeholder={label}
        aria-label={label}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            e.stopPropagation();
            onChange('');
          }
        }}
        {...(tid ? { 'data-testid': TID[tid] } : {})}
      />
      {value && (
        <IconButton
          icon="Dismiss"
          iconSize={16}
          label={t('sidebar.search.clear')}
          className={styles.clear}
          {...(clearTid ? { 'data-testid': TID[clearTid] } : {})}
          onClick={() => onChange('')}
        />
      )}
    </div>
  );
}
