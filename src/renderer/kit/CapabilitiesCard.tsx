// Spec: 04 §13.7 (Capabilities card: test ids `kit-capabilities`, each row `kit-capabilities-row` with `data-key`, each
// button `kit-capabilities-try`; rows, icon tile, label, hint and a Link button "Try it ›" that fills the composer and never
// sends; footer = the safety line, and no ideas link line while the Ideas page is a placeholder), 05 §0.1 (card type
// `kit`), 05-1 §0.2 (card frame), 02-3 §F25.2 (each "Try it" is described by its row's label; the rows are a list). C1 T2, CR-0024 F3 and §(e) 1, 2, 4.
import { useId } from 'react';
import { t } from '../../shared/copy/t';
import type { CapabilitiesSurface } from '../../shared/kit/capabilities';
import { TID } from '../../shared/testids';
import type { CardRow } from '../../shared/types';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { cx } from '../ui/cx';
import { composerFill, composerFillAction } from './composerFill';
import card_ from '../cards/Card.module.css';
import styles from './CapabilitiesCard.module.css';

export function CapabilitiesCard({ card, surface }: { card: CardRow; surface: CapabilitiesSurface }) {
  const ids = useId();
  return (
    <div
      className={cx(card_.card, card_.wide)}
      data-testid={TID.kitCapabilities}
      data-card-id={card.id}
      data-card-type={card.type}
      data-card-state={card.state}
      data-state={card.state}
    >
      <ul className={styles.rows}>
        {surface.rows.map((r) => (
          <li key={r.key} className={styles.row} data-testid={TID.kitCapabilitiesRow} data-key={r.key}>
            <span className={styles.tile}>
              <Icon name={r.icon} size={16} />
            </span>
            <span className={styles.words}>
              <span className={styles.label} id={`${ids}-${r.key}`}>
                {r.label}
              </span>
              <span className={styles.hint}>{r.hint}</span>
            </span>
            <Button
              variant="link"
              className={styles.try}
              data-testid={TID.kitCapabilitiesTry}
              data-key={r.key}
              aria-describedby={`${ids}-${r.key}`}
              onClick={() => composerFill(card.chatId, composerFillAction(r.fill))}
            >
              {t('kit.capabilities.try')}
            </Button>
          </li>
        ))}
      </ul>
      <p className={styles.safety}>{surface.safety}</p>
    </div>
  );
}
