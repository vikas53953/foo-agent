// Spec: 03-shell-1 §3.4.11 sidebar footer (64 min-height, 1px `--line` top, padding 0 12; the left part is one button to
// Settings → Account & your AI [X-07]: the user's 26 initial on `--h-slate`, line 1 "{You} · ● {AI status}", line 2 the
// spend; Settings 20 in a 36 icon button "Settings", tooltip "Settings (Ctrl+,)"; the AI status and spend tables; the
// Narrator name "{You}, {AI status text}, {spend text}. Open AI settings."), Article 21 (the plan-limit time is absolute).
import { useShallow } from 'zustand/react/shallow';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { navigate, useStore } from '../store/index';
import { selectFirstName, selectSetupComplete, selectTimeZone } from '../store/settings';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import { aiText, footerAi, footerSpend } from './footer';
import styles from './SidebarFooter.module.css';

const openAiSettings = () => navigate({ kind: 'settings', page: 'account' });

export function SidebarFooter() {
  const { ai, spend, offline, now } = useStore(
    useShallow((s) => ({ ai: s.live.ai, spend: s.spend.summary, offline: s.live.connection === 'offline', now: s.live.now })),
  );
  const setupComplete = useStore(selectSetupComplete);
  const firstName = useStore(selectFirstName);
  const tz = useStore(selectTimeZone);
  const status = footerAi(ai, { setupComplete, offline, now });
  const statusText = aiText(status, ai, now, tz);
  const spendLine = footerSpend(spend, ai?.displayName ?? '');
  const name = t('sidebar.footer.status.name', { you: firstName ?? 'none', status: statusText, spend: spendLine?.text ?? '' });

  return (
    <div className={styles.footer}>
      <button type="button" className={styles.status} aria-label={name} data-testid={TID.sidebarFooterStatus} onClick={openAiSettings}>
        <Avatar
          face={`letter:${(firstName ?? '').slice(0, 1).toLocaleUpperCase('en-IN')}`}
          name={firstName ?? ''}
          kind="user"
          size="inline"
        />
        <span className={styles.lines}>
          <span className={styles.line1}>
            {firstName && (
              <>
                <span className={styles.you}>{firstName}</span>
                <span className={styles.sep} aria-hidden="true">
                  {' · '}
                </span>
              </>
            )}
            <span className={styles.dot} data-tone={status.tone} data-state={status.key} />
            <span className={styles.ai}>{statusText}</span>
          </span>
          {spendLine && (
            <span className={styles.spend} data-tone={spendLine.tone}>
              {spendLine.text}
            </span>
          )}
        </span>
      </button>
      <IconButton
        icon="Settings"
        label={t('sidebar.footer.settings.label')}
        tooltip={t('sidebar.footer.settings.tooltip')}
        tooltipSide="top"
        data-testid={TID.sidebarFooterSettings}
        onClick={openAiSettings}
      />
    </div>
  );
}
