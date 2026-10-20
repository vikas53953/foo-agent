// Spec: 05-1 §0.7 (countdowns: the ticking text is `aria-live="off"`; the card announces "{n} minutes left to answer" at
// 5:00 and 1:00, and "Expired" at 0:00), §0.4 times (a countdown "Expires in 9:59" is a duration and allowed; the absolute
// time is in the tooltip and the Narrator label, Article 21), §0.10 (no animation, text swaps only), 05-2 §5.5.1
// (`card-approval-expiry`). The clock is main's (clockNow), so a test clock moves it too.
import { useEffect, useRef, useState } from 'react';
import { t } from '../../../shared/copy/t';
import { formatDate, formatDuration } from '../../../shared/format';
import { TID } from '../../../shared/testids';
import { clockNow } from '../../store/apply';
import { Tooltip } from '../../ui/Tooltip';
import styles from '../Approval.module.css';

/** The announcement due when the countdown crosses 5:00, 1:00 or 0:00 (05-1 §0.7); null between them. */
export function countdownAnnouncement(prevLeftMs: number, leftMs: number): string | null {
  if (prevLeftMs > 0 && leftMs <= 0) return t('cards.common.expired_announce');
  for (const n of [1, 5]) if (prevLeftMs > n * 60_000 && leftMs <= n * 60_000) return t('cards.common.minutes_left', { n });
  return null;
}

export function Countdown({ expiresAt, timeZone }: { expiresAt: number; timeZone: string }) {
  const [now, setNow] = useState(clockNow);
  const [said, setSaid] = useState('');
  const last = useRef(expiresAt - clockNow());
  useEffect(() => {
    const id = setInterval(() => setNow(clockNow()), 1_000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, expiresAt - now);
  useEffect(() => {
    const line = countdownAnnouncement(last.current, left);
    last.current = left;
    if (line) setSaid(line);
  }, [left]);
  const absolute = formatDate(expiresAt, 'full', { timeZone, now });
  return (
    <>
      <Tooltip text={absolute} className={styles.countdownTip}>
        <span
          className={styles.countdown}
          data-testid={TID.cardApprovalExpiry}
          aria-live="off"
          aria-label={t('cards.approval.expires', { time: absolute })}
        >
          {t('cards.common.countdown', { duration: formatDuration(left) })}
        </span>
      </Tooltip>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {said}
      </span>
    </>
  );
}
