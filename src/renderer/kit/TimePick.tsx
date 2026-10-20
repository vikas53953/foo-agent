// Spec: 04 §13.5 (kit TimePick: the picked slot goes renderer → main `kit:action` → engine `kit.action`, and foo replies),
// CR-0022 §(c) (date + slots ≤ 24), AT-350 (the picked slot goes back to foo, who confirms it), X-180. R1 T3.
// The slots are a radiogroup like ListPick's rows: arrows move, Enter or Space picks, the picked slot keeps a Checkmark.
import { useState, type KeyboardEvent } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { cx } from '../ui/cx';
import { Icon } from '../ui/Icon';
import { moveFocus, usePicked } from './ListPick';
import styles from './ListPick.module.css';

export function TimePick({
  date,
  slots,
  pickKey,
  onPick,
}: {
  date: string;
  slots: string[];
  pickKey: string;
  /** Sends the pick; resolves true once main took it. */
  onPick: (slot: string) => Promise<boolean>;
}) {
  const [picked, setPicked] = usePicked(pickKey);
  const [busy, setBusy] = useState(false);
  const pick = (slot: string) => {
    if (picked !== null || busy) return;
    setBusy(true);
    void onPick(slot).then((ok) => {
      setBusy(false);
      if (ok) setPicked(slot);
    });
  };
  return (
    <div className={styles.pick} data-testid={TID.kitTimePick} data-state={picked === null ? 'asking' : 'answered'}>
      <p className={styles.date} data-copy="ai">
        {date}
      </p>
      <div
        role="radiogroup"
        aria-label={date}
        className={styles.slots}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => moveFocus(e, '[role="radio"]')}
      >
        {slots.map((slot, i) => {
          const on = slot === picked;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={(picked === null ? i === 0 : on) ? 0 : -1}
              className={cx(styles.slot, on && styles.on)}
              disabled={picked !== null && !on}
              onClick={() => pick(slot)}
              data-copy="ai"
            >
              {on && <Icon name="Checkmark" size={16} />}
              {slot}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p className={styles.chosen} role="status">
          {t('kit.pick.chosen', { choice: picked })}
        </p>
      )}
    </div>
  );
}
