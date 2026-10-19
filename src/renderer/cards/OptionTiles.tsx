// Spec: 05-1 §5.4 Option tiles (root `card-tiles`; Narrator "Question: {title}"), 08-1 §4.5 ChoicePayload (tiles). M5-T1
// stub (CR-0009): the frame, the question and the root ids; M5-T5 builds the tiles, photos and menus.
import { t } from '../../shared/copy/t';
import type { CardRow, ChoicePayload } from '../../shared/types';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import styles from './Card.module.css';

export function OptionTiles({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as ChoicePayload;
  return (
    <CardFrame tid="cardTiles" card={card} state={card.state} wide label={t('cards.tiles.label', { title: p.question })}>
      <div className={styles.head}>
        <span className={styles.title} data-copy="external">
          {p.question}
        </span>
      </div>
      <div className={styles.foot}>
        <span className={styles.footSpacer} />
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );
}
