// Spec: 06-2 §6.11 About (the "foo" wordmark in `--t-wordmark`, "Version {1.0.3}" in `--t-small` `--fg-2`, " · tester
// build" for an unsigned tester build, X-44; then the row group; test ids `settings-row-about-{row}`), CR-0061 (X-218,
// superseding X-217 item 4): the batch-1 rows. What's new, Send a report, What leaves this PC and Open-source parts open
// their dialogs; Updates (09 §9.20 needs the updater and a release feed) and Repair foo (it repairs foo's browser, the `web`
// feature) are not shown until their parts exist, so the page never shows a row that does nothing.
import { t } from '../../../shared/copy/t';
import type { DialogId } from '../../../shared/types';
import { TID } from '../../../shared/testids';
import { openDialog, useStore } from '../../store/index';
import { Icon } from '../../ui/Icon';
import { RowGroup } from '../shared/RowGroup';
import page from './SettingsPage.module.css';
import styles from './AboutPage.module.css';

// GAP: GAPS.md 2026-10-26 "**Open:** Settings → About hides Updates" (and Repair foo)
const ROWS: { id: string; tid: keyof typeof TID; label: () => string; dialog: DialogId }[] = [
  { id: 'whats-new', tid: 'settingsRowAboutWhatsNew', label: () => t('settings.about.row.whats_new'), dialog: 'whats-new' },
  { id: 'report', tid: 'settingsRowAboutReport', label: () => t('settings.about.row.report'), dialog: 'report' },
  { id: 'leaves', tid: 'settingsRowAboutLeaves', label: () => t('settings.about.row.leaves'), dialog: 'privacy' },
  { id: 'licences', tid: 'settingsRowAboutLicences', label: () => t('settings.about.row.licences'), dialog: 'licences' },
];

export function AboutPage() {
  const version = useStore((s) => s.live.appVersion);
  const tester = useStore((s) => s.live.testerBuild);
  return (
    <>
      <div className={styles.about}>
        <span className={styles.wordmark}>{t('sidebar.header.wordmark')}</span>
        {version && (
          <span className={styles.version} data-testid={TID.settingsRowAboutVersion}>
            {tester ? t('settings.about.version_tester', { version }) : t('settings.about.version', { version })}
          </span>
        )}
      </div>
      <RowGroup>
        {ROWS.map((r) => (
          <li key={r.id} className={page.rowItem}>
            <button
              type="button"
              className={page.row}
              data-testid={TID[r.tid]}
              data-row-id={`settings/about/${r.id}`}
              onClick={() => openDialog(r.dialog)}
            >
              <span className={page.rowText}>
                <span className={page.rowLabel}>{r.label()}</span>
              </span>
              <Icon name="ChevronRight" size={20} className={page.chevron} />
            </button>
          </li>
        ))}
      </RowGroup>
    </>
  );
}
