// Spec: 05 §0.1 (CR-0022: the `ai_page` card, an AI page the engine posts as its own card; payload `html`), 04 §13.6 (the
// sealed frame and its states building, ready, failed, kept), 08-0 §G.1 (27 card types), CR-0022 AT-357..AT-362, X-180.
import { TID } from '../../shared/testids';
import type { CardRow } from '../../shared/types';
import { cx } from '../ui/cx';
import { CardTimeLabel, type CardTime } from '../cards/CardFrame';
import styles from '../cards/Card.module.css';
import { PageView, type PageState } from './PageView';

const STATES: readonly PageState[] = ['building', 'ready', 'failed', 'kept'];

export function AiPageCard({ card, time }: { card: CardRow; time: CardTime }) {
  const state = (STATES as readonly string[]).includes(card.state) ? (card.state as PageState) : 'failed';
  return (
    <div className={cx(styles.card, styles.surface)} data-testid={TID.cardAiPage} data-card-state={card.state} data-state={card.state}>
      <PageView chatId={card.chatId} source={{ cardId: card.id }} state={state} />
      <span className={styles.cardFoot}>
        <CardTimeLabel {...time} />
      </span>
    </div>
  );
}
