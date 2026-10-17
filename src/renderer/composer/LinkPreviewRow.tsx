// Spec: 04-2 §21.5 (link preview row inside the pill: only the first URL; 56 tall, --r-md, --bg-sunken, padding 8 12; 40×40
// image when there is one, title --t-caption-strong --fg-1 over the domain --t-caption --fg-3; remove 24 (40 hit) keeps the
// URL text and sends no preview; nothing shows while fetching or when the fetch fails; `composer-preview`,
// `composer-preview-remove`). The fetch is main's (public hosts only, 3 s, no cookies); 08-1 §3.2 has no channel for it yet,
// so nothing feeds this row in M2 (implementation-notes GAP, same as 04 §10.6 on the bubble side).
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Icon } from '../ui/Icon';
import styles from './Composer.module.css';

export interface ComposerPreview {
  title: string;
  domain: string;
  image: string | null;
}

export function LinkPreviewRow({ preview, onRemove }: { preview: ComposerPreview; onRemove: () => void }) {
  return (
    <div className={styles.preview} data-testid={TID.composerPreview}>
      {preview.image && <img className={styles.previewImg} src={preview.image} alt="" />}
      <span className={styles.fileText}>
        <span className={styles.previewTitle}>{preview.title}</span>
        <span className={styles.previewDomain}>{preview.domain}</span>
      </span>
      <button
        type="button"
        className={styles.close}
        aria-label={t('composer.chip.remove', { name: preview.domain })}
        data-testid={TID.composerPreviewRemove}
        onClick={onRemove}
      >
        <Icon name="Dismiss" size={16} />
      </button>
    </div>
  );
}
