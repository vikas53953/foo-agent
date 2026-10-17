// Spec: 05-3 §5.24 Place card (no map: Location 20 + name; address `--t-small` `--fg-2`; a hours / rating line; "Open in
// Maps" opens `payload.mapsUrl` in the default browser, disabled offline with the offline tooltip; "Copy address" reads
// "Copied" for 2 s; two Tab stops; Narrator "Place: {name}, {address}"; ids card-place, card-place-open-maps, card-place-copy),
// 08-5 §4.1 PlacePayload.
import { useEffect, useState } from 'react';
import { t } from '../../shared/copy/t';
import { motion } from '../../shared/tokens';
import type { CardRow, PlacePayload } from '../../shared/types';
import { TID } from '../../shared/testids';
import { useStore } from '../store/index';
import { selectConnection } from '../store/live';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { copyText, openUrl } from '../messages/linkActions';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import styles from './Card.module.css';

export function PlaceCard({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as PlacePayload;
  const offline = useStore(selectConnection) === 'offline';
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), motion['dur-confirm']);
    return () => clearTimeout(id);
  }, [copied]);
  const line = [p.hoursLine, p.rating].filter(Boolean).join(' · ');
  return (
    <CardFrame tid="cardPlace" state={card.state} label={t('cards.place.accessible_name', { name: p.name, address: p.address })}>
      <div className={styles.head}>
        <Icon name="Location" size={20} className={styles.headIcon} />
        <span className={styles.title} data-copy="external">
          {p.name}
        </span>
      </div>
      <div className={styles.small} data-copy="external">
        {p.address}
      </div>
      {line && (
        <div className={styles.small} data-copy="external">
          {line}
        </div>
      )}
      <div className={styles.foot}>
        <div className={styles.buttons}>
          <Button variant="secondary" size="md" disabled={offline} data-testid={TID.cardPlaceOpenMaps} onClick={() => openUrl(p.mapsUrl)}>
            {t('cards.place.open_maps')}
          </Button>
          <Button
            variant="secondary"
            size="md"
            data-testid={TID.cardPlaceCopy}
            onClick={() => void copyText(p.address).then((ok) => ok && setCopied(true))}
          >
            {copied ? t('cards.place.copied') : t('cards.place.copy')}
          </Button>
        </div>
        <span className={styles.footSpacer} />
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );
}
