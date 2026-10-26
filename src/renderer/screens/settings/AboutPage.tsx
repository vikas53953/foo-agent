// Spec: 06-2 §6.11 About (the "foo" wordmark in `--t-wordmark`, "Version {1.0.3}" in `--t-small` `--fg-2`), CR-0060 (X-217):
// the batch-1 part. The Updates, What's new, Send a report, Repair, What leaves this PC and Open-source parts rows arrive with
// the dialogs and services they open, so the page never shows a row that does nothing.
import { t } from '../../../shared/copy/t';
import { TID } from '../../../shared/testids';
import { useStore } from '../../store/index';
import styles from './AboutPage.module.css';

export function AboutPage() {
  const version = useStore((s) => s.live.appVersion);
  return (
    <div className={styles.about}>
      <span className={styles.wordmark}>{t('sidebar.header.wordmark')}</span>
      {version && (
        <span className={styles.version} data-testid={TID.settingsRowAboutVersion}>
          {t('settings.about.version', { version })}
        </span>
      )}
    </div>
  );
}
