// Spec: 08-0 §E.3 (TextArea: multi-line field, auto-grow `rows` prop), 06 §0.4 Text field (padding 0 12px, `--r-sm`,
// `--t-body`; `--bg-sunken`, 1px `--line-input`, placeholder `--fg-3`; hover border `--fg-3`; focus 1px `--accent` + ring
// on keyboard focus; disabled `--fg-disabled` with border `--line`; Field error: 1px `--bad` border + `aria-invalid`),
// 02-3 §F27.1 (cursor `text`). `rows` is the starting height; the field grows with its text up to `maxRows`, then scrolls.
import type { ComponentProps, CSSProperties } from 'react';
import { cx } from './cx';
import styles from './TextArea.module.css';

export interface TextAreaProps extends Omit<ComponentProps<'textarea'>, 'rows'> {
  rows?: number;
  maxRows?: number;
  invalid?: boolean;
}

export function TextArea({ rows = 3, maxRows, invalid, className, style, ...rest }: TextAreaProps) {
  const vars = { '--rows': rows, ...(maxRows ? { '--max-rows': maxRows } : {}) } as CSSProperties;
  return (
    <textarea
      {...rest}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cx(styles.area, maxRows !== undefined && styles.capped, invalid && styles.invalid, className)}
      style={{ ...vars, ...style }}
    />
  );
}
