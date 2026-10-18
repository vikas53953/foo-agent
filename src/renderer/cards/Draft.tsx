// Spec: 05-2 §5.7 Draft card (root `card-draft`; title "Draft · not sent"; Narrator "Draft, not sent: {channel} to {name}";
// status edge while pending, 05-1 §0.5), 08-1 §4.5 draft payload. M5-T1 stub (CR-0009): the frame, the title and the root
// ids; M5-T6 builds the body, Send / Change / Discard, the 5 s undo and every state.
import { t } from '../../shared/copy/t';
import type { CardRow, DraftPayload } from '../../shared/types';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import styles from './Card.module.css';

export function Draft({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as DraftPayload;
  return (
    <CardFrame
      tid="cardDraft"
      card={card}
      state={card.state}
      edge={card.state === 'pending' ? 'accent' : undefined}
      label={t('cards.draft.label', { channel: p.channel, name: p.to?.name ?? '' })}
    >
      <div className={styles.head}>
        <span className={styles.title}>{t('cards.draft.title')}</span>
      </div>
      <div className={styles.foot}>
        <span className={styles.footSpacer} />
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );
}
