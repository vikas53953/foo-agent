// Spec: 06 §0.4 Row group (rows stacked in a box: 1px `--line`, `--r-lg`, `--bg-app`; a 1px `--line` divider between rows
// inset 16px left), §0.8 (row groups are `role="list"`).
import type { ComponentProps } from 'react';
import { cx } from '../../ui/cx';
import styles from './RowGroup.module.css';

export function RowGroup({ className, ...rest }: ComponentProps<'ul'>) {
  return <ul role="list" {...rest} className={cx(styles.group, className)} />;
}
