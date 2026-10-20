// Spec: 04 §13.5 / CR-0022 §(c) `LiveStamp` (asOf, refreshable: "Data as of {time}" + Refresh), 08-1 §3.2 `kit:refresh`
// (`{ chatId; messageId?; cardId?; surfaceId }` → one MainToEngine `kit.refresh`), 02 F19.3 (times "9:41 AM"), CR-0022
// AT-352, AT-368 (Refresh updates the surface's data model and "Data as of"), X-180. R1 T7.
// The new data arrives as a later foo reply naming the same surfaceId, so this piece only asks; it never fetches.
import { useEffect, useState } from 'react';
import { t } from '../../shared/copy/t';
import { formatDate, formatTime } from '../../shared/format';
import { TID } from '../../shared/testids';
import { invoke } from '../ipc/client';
import { clockNow } from '../store/apply';
import { useStore } from '../store/index';
import { selectTimeZone } from '../store/settings';
import { Button } from '../ui/Button';
import type { SurfaceHost } from './KitSurface';
import styles from './KitSurface.module.css';

/** How long Refresh rests after a tap when no newer stamp arrives. */
const REFRESH_REST_MS = 30_000;

export function LiveStamp({
  asOf,
  refreshable,
  host,
  surfaceId,
}: {
  asOf: number;
  refreshable: boolean;
  host: SurfaceHost;
  surfaceId: string;
}) {
  const timeZone = useStore(selectTimeZone);
  // The asOf the last Refresh was asked from: the button rests until a reply brings a newer stamp.
  const [asked, setAsked] = useState<number | null>(null);
  const waiting = asked === asOf;
  // A reply that brings no newer stamp (or a turn that failed) frees the button again after a while.
  useEffect(() => {
    if (!waiting) return;
    const id = setTimeout(() => setAsked(null), REFRESH_REST_MS);
    return () => clearTimeout(id);
  }, [waiting]);
  const refresh = () => {
    setAsked(asOf);
    void invoke('kit:refresh', { ...host, surfaceId }).then(
      (r) => !r.ok && setAsked(null),
      () => setAsked(null),
    );
  };
  return (
    <div className={styles.live} data-testid={TID.kitLiveStamp} data-as-of={asOf}>
      <span className={styles.text_caption} title={formatDate(asOf, 'full', { timeZone, now: clockNow() })}>
        {t('kit.live.as_of', { time: formatTime(asOf, { timeZone }) })}
      </span>
      {refreshable && (
        <Button variant="subtle" icon="ArrowClockwise" data-testid={TID.kitLiveRefresh} disabled={waiting} onClick={refresh}>
          {t('kit.live.refresh')}
        </Button>
      )}
    </div>
  );
}
