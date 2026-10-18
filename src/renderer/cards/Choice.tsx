// Spec: 05-1 §5.3 Choice card (root `card-choice` with `data-purpose`; Narrator "Question: {question}"), 08-1 §4.5
// ChoicePayload. M5-T1 stub (CR-0009): the frame, the question and the root ids; M5-T5 builds the rows, stepper and keys.
import { t } from '../../shared/copy/t';
import type { CardRow, ChoicePayload } from '../../shared/types';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import styles from './Card.module.css';

export function Choice({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as ChoicePayload;
  return (
    <div data-purpose={p.purpose}>
      <CardFrame tid="cardChoice" card={card} state={card.state} label={t('cards.choice.label', { question: p.question })}>
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
    </div>
  );
}
