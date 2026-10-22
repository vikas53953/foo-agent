// Spec: CR-0043 (X-201), 08-4 §25.6 as amended, 08-0 §A.3, 06 §0.13 (the chat mini line "Changed: {row label} → {value}.
// [ Undo ]", `settings:undo { changeId }`; "That's one for you to change. [ Open Settings ]" opens the page at the row), 04
// §19.5 (a system line: `thread-marker` `data-state="system_line"`; its button is `thread-marker-link`, as the mirror's Open).
import { useState } from 'react';
import { t } from '../../shared/copy/t';
import type { SettingLineData } from '../../shared/settingsByChat';
import { TID } from '../../shared/testids';
import type { MessageRow } from '../../shared/types';
import { invoke } from '../ipc/client';
import { navigate } from '../store/index';
import styles from './Bubble.module.css';

export const settingLineOf = (m: MessageRow): SettingLineData | null =>
  ((m.why as { settingLine?: SettingLineData } | null)?.settingLine as SettingLineData | undefined) ?? null;

export function SettingLine({ m, line }: { m: MessageRow; line: SettingLineData }) {
  const [busy, setBusy] = useState(false);
  const undo = line.kind === 'changed' && line.changeId && !line.state ? line.changeId : null;
  return (
    <div className={styles.marker} data-testid={TID.threadMarker} data-state="system_line" data-setting={line.state ?? line.kind}>
      {m.text}
      {line.state === 'too_late' ? ` ${t('thread.setting.too_late')}` : null}
      {undo ? (
        <>
          {' '}
          <button
            type="button"
            className={styles.markerLink}
            data-testid={TID.threadMarkerLink}
            data-action="undo"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void invoke('settings:undo', { changeId: undo }).finally(() => setBusy(false));
            }}
          >
            {t('thread.setting.button.undo')}
          </button>
        </>
      ) : null}
      {line.kind === 'refused' || line.kind === 'bad_value' ? (
        <>
          {' '}
          <button
            type="button"
            className={styles.markerLink}
            data-testid={TID.threadMarkerLink}
            data-action="open_settings"
            onClick={() => navigate({ kind: 'settings', page: line.page ?? 'account' })}
          >
            {t('thread.setting.button.open_settings')}
          </button>
        </>
      ) : null}
    </div>
  );
}
