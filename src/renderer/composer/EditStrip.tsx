// Spec: 04-2 §21.6 (edit strip inside the pill: 36 tall, no fill, padding 0 4; Edit 16 --fg-2 + 8 + "Editing your message"
// --t-caption-strong --fg-2; Dismiss "Cancel edit (Esc)" restores the previous draft; `composer-edit`, `composer-edit-close`),
// 04 §6.2.
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Icon } from '../ui/Icon';
import { Tooltip } from '../ui/Tooltip';
import styles from './Composer.module.css';

export function EditStrip({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.edit} data-testid={TID.composerEdit}>
      <Icon name="Edit" size={16} />
      <span className={styles.editLabel}>{t('composer.edit.label')}</span>
      <Tooltip text={t('composer.edit.close')} side="top">
        <button
          type="button"
          className={styles.close}
          aria-label={t('composer.edit.close')}
          data-testid={TID.composerEditClose}
          onClick={onClose}
        >
          <Icon name="Dismiss" size={16} />
        </button>
      </Tooltip>
    </div>
  );
}
