// Spec: 08-0 §E.3 (TextField), 06 §0.4 (fields: `sm` 36 = --field-h, `md` 40; 1px --line-input, focus --accent), 03-shell-2
// §3.6.3 (the find field: `search` shape, --r-full, Search 16 icon, no border, --bg-sunken). Rest props land on the input.
import type { ComponentProps } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import styles from './TextField.module.css';

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'size'> {
  size?: 'sm' | 'md';
  shape?: 'field' | 'search';
}

export function TextField({ size = 'md', shape = 'field', className, ...rest }: TextFieldProps) {
  return (
    <label className={cx(styles.field, styles[size], styles[shape], className)}>
      {shape === 'search' && <Icon name="Search" size={16} />}
      <input {...rest} className={styles.input} />
    </label>
  );
}
