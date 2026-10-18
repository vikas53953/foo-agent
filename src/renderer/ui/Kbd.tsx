// Spec: 02-3 §F30.2 (key caps: `<kbd>` min-width and height `--kbd-h` 24, `--bg-sunken`, 1px `--line-strong`, bottom
// border 2px, `--r-xs`, `--t-caption` `--fg-1`, 4px between caps, "+" not drawn between caps; Windows key names), 06-2
// §6.10 (one cap per key; Narrator reads "Control plus K"), 08-0 §E.3 (Kbd is a primitive). The caps are hidden from
// Narrator; the group is one named image (`role="img"` + aria-label) so the name is read once.
import { t } from '../../shared/copy/t';
import { cx } from './cx';
import styles from './Kbd.module.css';

export interface KbdProps {
  /** Windows key names in order, e.g. ['Ctrl', 'K'] (02-3 §F30.2). */
  keys: string[];
  className?: string;
}

/** The spoken name of a key: "Ctrl" is read "Control" (06-2 §6.10); other names are read as written. */
function spokenKey(key: string): string {
  return key === 'Ctrl' ? t('screen.kbd.key.ctrl') : key;
}

/** "Control plus K" for ['Ctrl', 'K']. */
export function kbdName(keys: string[]): string {
  return keys.map(spokenKey).reduce((left, right) => t('screen.kbd.joined', { left, right }));
}

export function Kbd({ keys, className }: KbdProps) {
  const name = keys.length ? kbdName(keys) : '';
  return (
    <kbd className={cx(styles.keys, className)} role="img" aria-label={name}>
      {keys.map((k, i) => (
        <kbd key={`${i}-${k}`} className={styles.cap} aria-hidden="true">
          {k}
        </kbd>
      ))}
    </kbd>
  );
}
