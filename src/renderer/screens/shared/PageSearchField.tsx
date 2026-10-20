// Spec: 06 §0.4 "Search field (in pages)" (`TextField size='sm' shape='search'`: `--field-h` 36, `--r-full`, `--bg-sunken`,
// `Search` 16 at 12px left; a `Dismiss` 16 clear button appears when text exists), 06-2 §7.3 (240px wide), §7.6 (Ctrl+F
// focuses it).
import { forwardRef } from 'react';
import { t } from '../../../shared/copy/t';
import { TID } from '../../../shared/testids';
import { IconButton } from '../../ui/IconButton';
import { TextField } from '../../ui/TextField';
import styles from './PageSearchField.module.css';

export interface PageSearchFieldProps {
  value: string;
  placeholder: string;
  tid: keyof typeof TID;
  onChange: (q: string) => void;
}

export const PageSearchField = forwardRef<HTMLInputElement, PageSearchFieldProps>(function PageSearchField(
  { value, placeholder, tid, onChange },
  ref,
) {
  return (
    <div className={styles.wrap}>
      <TextField
        ref={ref}
        size="sm"
        shape="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        data-testid={TID[tid]}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
        }}
      />
      {value && (
        <IconButton icon="Dismiss" iconSize={16} label={t('sidebar.search.clear')} className={styles.clear} onClick={() => onChange('')} />
      )}
    </div>
  );
});
