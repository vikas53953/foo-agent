// Spec: 05-3 §5.23.2 Link preview (`--card-w`; optional image 1.91:1 with top corners `--r-lg`; info block `--bg-sunken`:
// title `--t-body-strong` 2 lines, description `--t-small` `--fg-2` 2 lines, the domain `--t-caption` `--fg-3` always shown;
// the whole card is one button that opens the default browser; one Tab stop; Narrator "Link: {title}, {domain}"),
// 08-5 §4.1 LinkPreviewPayload (`imageRef` under {DATA}).
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { CardRow, LinkPreviewPayload } from '../../shared/types';
import { cx } from '../ui/cx';
import { mediaUrl } from '../messages/bubbleContext';
import { openUrl } from '../messages/linkActions';
import { CardTimeLabel, type CardTime } from './CardFrame';
import styles from './Card.module.css';

export function LinkPreview({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as LinkPreviewPayload;
  const img = p.imageRef ? mediaUrl(p.imageRef) : null;
  return (
    <button
      type="button"
      className={cx(styles.card, styles.surface, styles.preview)}
      data-testid={TID.cardLinkPreview}
      data-card-state={card.state}
      data-state={card.state}
      aria-label={t('cards.link_preview.accessible_name', { title: p.title, domain: p.domain })}
      onClick={() => openUrl(p.url)}
    >
      {img && <img className={styles.previewImg} src={img} alt="" />}
      <span className={styles.previewInfo}>
        <span className={cx(styles.previewTitle, styles.clamp2)} data-copy="external">
          {p.title}
        </span>
        {p.description && (
          <span className={cx(styles.previewDesc, styles.clamp2)} data-copy="external">
            {p.description}
          </span>
        )}
        <span className={styles.previewDomain} data-copy="external">
          {p.domain}
        </span>
      </span>
      <span className={styles.cardFoot}>
        <CardTimeLabel {...time} />
      </span>
    </button>
  );
}
