// Spec: 03-shell-2 §3.7.3.2 (Using: "{AI} (your AI)" chip always first, then apps used in the last 24 h or in use now, most
// recent first; 8 chips max then a "+{n}" chip that expands in place; in-use dot + Narrator ", in use now"; click → Settings →
// Connections at that app, the AI chip → Settings → Account & your AI (X-07); empty line), §3.7.4 (scope per chat kind).
import { useMemo, useState } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { ChatRow } from '../../shared/types';
import { navigate, useStore } from '../store/index';
import { selectAi, selectNow } from '../store/live';
import { jobsInScope } from './doingNowRows';
import { USING_MAX, usingChips, type UsingChip } from './panelData';
import section from './PanelSection.module.css';
import styles from './UsingChips.module.css';

const APP_LABEL: Record<UsingChip['app'], () => string> = { browser: () => t('app.panel.using.app.browser') };

export function UsingChips({ chat }: { chat: ChatRow }) {
  const aiName = useStore(selectAi)?.displayName ?? '';
  const jobsById = useStore((s) => s.jobs.byId);
  const now = useStore(selectNow);
  const [expanded, setExpanded] = useState(false);
  const chips = useMemo(() => usingChips(jobsInScope(Object.values(jobsById), chat), now), [jobsById, chat, now]);
  // The AI chip takes one of the 8 places.
  const room = USING_MAX - 1;
  const shown = expanded || chips.length <= room ? chips : chips.slice(0, room - 1);
  const hidden = chips.length - shown.length;
  const aiLabel = t('app.panel.using.ai', { ai: aiName });

  return (
    <section
      className={section.section}
      data-testid={TID.appPanelUsing}
      data-empty={!chips.length || undefined}
      aria-labelledby="app-panel-using-title"
    >
      <h2 className={section.label} id="app-panel-using-title">
        {t('app.panel.using.title')}
      </h2>
      <ul className={styles.chips}>
        <li>
          <button
            type="button"
            className={styles.chip}
            data-testid={TID.appPanelUsingChip}
            data-index={0}
            onClick={() => navigate({ kind: 'settings', page: 'account' })}
          >
            <span className={styles.name}>{aiLabel}</span>
          </button>
        </li>
        {shown.map((c, i) => {
          const name = APP_LABEL[c.app]();
          return (
            <li key={c.app}>
              <button
                type="button"
                className={styles.chip}
                data-testid={TID.appPanelUsingChip}
                data-index={i + 1}
                data-state={c.inUse ? 'in_use' : undefined}
                aria-label={c.inUse ? `${name}${t('app.panel.using.in_use')}` : undefined}
                onClick={() => navigate({ kind: 'settings', page: 'connections', row: c.app })}
              >
                {c.inUse && <span className={styles.dot} aria-hidden />}
                <span className={styles.name}>{name}</span>
              </button>
            </li>
          );
        })}
        {hidden > 0 && (
          <li>
            <button type="button" className={styles.chip} data-testid={TID.appPanelUsingMore} onClick={() => setExpanded(true)}>
              <span className={styles.name}>{t('app.panel.using.more', { count: hidden })}</span>
            </button>
          </li>
        )}
      </ul>
      {!chips.length && <p className={styles.empty}>{t('app.panel.using.empty')}</p>}
    </section>
  );
}
