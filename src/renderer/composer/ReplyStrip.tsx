// Spec: 04-2 §21.6 (reply strip inside the pill: 52 tall, --r-sm, --bg-sunken, padding 8 12 8 16, 4px left bar in the quoted
// sender's colour — foo --fg-1, a helper its --h-*, the user --accent; sender --t-caption-strong in the bar colour (dark theme:
// --fg-1 for helpers) over one line of --t-small --fg-2; an image quote adds a 40×40 thumbnail at the right; Dismiss 16 in a
// 24 visual / 40 hit, "Cancel reply (Esc)"; `composer-reply`, `composer-reply-close`), 04 §6.4 (a deleted original reads
// "Deleted message"). R1 T6 (04 §17.5, X-180): `side` marks the strip "Side question" (`composer.side.label`) above the
// quoted words, with its own ids `composer-side-strip`, `composer-side-strip-close` and close label.
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Icon } from '../ui/Icon';
import { Tooltip } from '../ui/Tooltip';
import styles from './Composer.module.css';

export interface ReplyQuote {
  sender: string;
  /** CSS colour of the bar and the name. */
  color: string;
  helper: boolean;
  text: string;
  deleted: boolean;
  thumb: string | null;
}

export function ReplyStrip({ quote, side = false, onClose }: { quote: ReplyQuote; side?: boolean; onClose: () => void }) {
  const close = side ? t('composer.side.close') : t('composer.reply.close');
  return (
    <div className={styles.reply} data-testid={TID[side ? 'composerSideStrip' : 'composerReply']}>
      <span className={styles.replyBar} style={{ background: quote.color }} />
      <span className={styles.replyText}>
        <span className={styles.replySender} style={{ color: quote.color }} data-helper={quote.helper || undefined}>
          {side ? t('composer.side.label') : quote.sender}
        </span>
        <span className={styles.replyLine}>{quote.deleted ? t('bubble.quote.deleted') : quote.text}</span>
      </span>
      {quote.thumb && !quote.deleted && <img className={styles.thumb} src={quote.thumb} alt="" />}
      <Tooltip text={close} side="top">
        <button
          type="button"
          className={styles.close}
          aria-label={close}
          data-testid={TID[side ? 'composerSideStripClose' : 'composerReplyClose']}
          onClick={onClose}
        >
          <Icon name="Dismiss" size={16} />
        </button>
      </Tooltip>
    </div>
  );
}
