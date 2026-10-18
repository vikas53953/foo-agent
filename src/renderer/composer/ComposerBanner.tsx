// Spec: 04-2 §23.2 (the composer's own banners, one at a time: 1 microphone problem (Warn, with Dismiss), 2 this helper is
// paused (Info, "Turn on"); 06 §0.6 shape: --banner-h 40, padding 0 12, icon 16 + 8 + one line --t-small + one --btn-h-sm 32
// Secondary button; announced once, polite; `composer-banner` data-state = ComposerBannerType, `composer-banner-action`,
// `composer-banner-dismiss`), §22.1 (microphone copy and buttons), §20.2 (16px icons in the composer strips, UX-28).
import { useEffect } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { ComposerBannerType } from '../../shared/types';
import { announce } from '../a11y/announce';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Tooltip } from '../ui/Tooltip';
import styles from './Composer.module.css';

function copy(type: ComposerBannerType, helper: string): { text: string; action: string } {
  switch (type) {
    case 'mic_blocked':
      return { text: t('composer.banner.mic_blocked.text'), action: t('composer.banner.mic_blocked.action') };
    case 'no_mic':
      return { text: t('composer.banner.no_mic.text'), action: t('composer.banner.no_mic.action') };
    case 'mic_busy':
      return { text: t('composer.banner.mic_busy.text'), action: t('composer.banner.mic_busy.action') };
    case 'helper_paused':
      return { text: t('composer.banner.helper_paused.text', { helper }), action: t('composer.banner.helper_paused.action') };
  }
}

export function ComposerBanner({
  type,
  helper,
  onAction,
  onDismiss,
}: {
  type: ComposerBannerType;
  helper: string;
  onAction: () => void;
  onDismiss: () => void;
}) {
  const { text, action } = copy(type, helper);
  useEffect(() => announce(text), [text]);
  const mic = type !== 'helper_paused';
  return (
    <div className={styles.banner} data-tone={mic ? 'warn' : 'info'} data-testid={TID.composerBanner} data-state={type}>
      <span className={styles.bannerIcon}>
        <Icon name={mic ? 'Warning' : 'Info'} size={16} />
      </span>
      <span className={styles.bannerText}>{text}</span>
      <Button variant="secondary" size="sm" data-testid={TID.composerBannerAction} onClick={onAction}>
        {action}
      </Button>
      {mic && (
        <Tooltip text={t('composer.banner.dismiss')} side="top">
          <button
            type="button"
            className={styles.close}
            aria-label={t('composer.banner.dismiss')}
            data-testid={TID.composerBannerDismiss}
            onClick={onDismiss}
          >
            <Icon name="Dismiss" size={16} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
