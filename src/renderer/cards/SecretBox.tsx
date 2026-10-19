// Spec: 05-2 §5.8 Secret box (root `card-secret`; Narrator "Secret box: {title}"; never a value in the DOM), 08-1 §4.5
// secret payload. M5-T1 stub (CR-0009): the frame, the name and the root ids; M5-T2 builds the fields, eye, save and states.
import { t } from '../../shared/copy/t';
import type { CardRow, SecretPayload } from '../../shared/types';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import styles from './Card.module.css';

export function SecretBox({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as SecretPayload;
  return (
    <CardFrame tid="cardSecret" card={card} state={card.state} label={t('cards.secret.label', { title: p.name })}>
      <div className={styles.head}>
        <span className={styles.title} data-copy="external">
          {p.name}
        </span>
      </div>
      <div className={styles.foot}>
        <span className={styles.footSpacer} />
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );
}
