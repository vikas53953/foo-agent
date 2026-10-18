// Spec: 05-2 §5.5 Approval card (root `card-approval`; Narrator "Approval needed: {title}"; status edge while PENDING,
// 05-1 §0.5), 08-1 §4.5 approval payload, 07-2 §5 states. M5-T1 stub (CR-0009): the frame, the title and the root ids;
// M5-T4 builds the kinds, buttons, countdown, scope and every state's look.
import { t } from '../../shared/copy/t';
import type { ApprovalPayload, CardRow } from '../../shared/types';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import styles from './Card.module.css';

export function Approval({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as ApprovalPayload;
  return (
    <CardFrame
      tid="cardApproval"
      card={card}
      state={card.state}
      gated={card.state === 'PENDING'}
      label={t('cards.approval.label', { title: p.title })}
    >
      <div className={styles.head}>
        <span className={styles.title} data-copy="external">
          {p.title}
        </span>
      </div>
      <div className={styles.foot}>
        <span className={styles.footSpacer} />
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );
}
