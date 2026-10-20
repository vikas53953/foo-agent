// Spec: 05-2 §5.7.1 X variant (no To / Subject; under the body `--t-caption` `--fg-3` "{n} characters left"), §5.7.2 X too
// long (the counter in `--bad`: "Too long for X by {34} characters."), 08-3 §16.3 (`twitter-text` weighted length; main
// counts it and keeps it on the payload as `xRemaining`). M8 T7.
import { t } from '../../../shared/copy/t';
import styles from '../Draft.module.css';

export function XCounter({ remaining }: { remaining: number }) {
  return remaining >= 0 ? (
    <div className={styles.xCount} data-state="ok">
      {t('cards.draft.x_chars_left', { n: remaining })}
    </div>
  ) : (
    <div className={styles.xCountBad} data-state="too_long">
      {t('cards.draft.line.x_too_long', { n: -remaining })}
    </div>
  );
}
