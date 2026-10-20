// Spec: 03-shell-1 §3.4.7 Loading (48 circle + two bars 60 % / 85 % wide, 12px tall, `--r-xs`, `--bg-sunken`, no
// shimmer, replaced by 02 §F7.1 X-179: the shimmer lives in the CSS), 02-3 §F26 (loading rows carry data-loading).
import type { CSSProperties } from 'react';
import { cx } from './cx';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  shape: 'circle' | 'bar';
  /** CSS width, e.g. "60%" or a token: "var(--avatar-list)". */
  width?: string;
  height?: string;
  className?: string;
}

export function Skeleton({ shape, width, height, className }: SkeletonProps) {
  const style: CSSProperties = {};
  if (width) style.width = width;
  if (height) style.height = height;
  return <span className={cx(styles.skeleton, styles[shape], className)} style={style} aria-hidden="true" data-loading="" />;
}
