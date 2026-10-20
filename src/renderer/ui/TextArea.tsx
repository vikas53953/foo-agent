// Spec: 08-0 §E.3 (TextArea), 06 §0.4 Text field look (padding 0 12px, `--r-sm`, `--t-body`, `--bg-sunken`, 1px
// `--line-input`, focus 1px `--accent` + ring), 06-2 §7.3 "+ Add something" / §7.4 Edit (multi-line field that auto-grows
// to 4 lines). Rest props land on the textarea.
import { useLayoutEffect, useRef, type ComponentProps } from 'react';
import { cx } from './cx';
import styles from './TextArea.module.css';

export interface TextAreaProps extends ComponentProps<'textarea'> {
  /** Grows with its text up to this many lines, then scrolls. */
  maxLines?: number;
}

export function TextArea({ maxLines = 4, className, value, ...rest }: TextAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const border = el.offsetHeight - el.clientHeight;
    const max = (parseFloat(cs.lineHeight) || 0) * maxLines + pad;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, max) + border}px`;
  }, [value, maxLines]);
  return <textarea ref={ref} rows={1} {...rest} value={value} className={cx(styles.area, className)} />;
}
