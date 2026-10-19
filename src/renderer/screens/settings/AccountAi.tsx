// Spec: 06-2 §6.1 Account & your AI, section "YOUR AI": rows `ai-using` ("Using" · "{Claude} (your AI)" + status line;
// [ Test now ] runs the J2 one-word test, 20 s limit, disabled offline; [ Change ] switches to foo's chat and posts the
// 06-1 §2.2 card), `ai-backup` (Menu of each other AI that passed a test, and "None"; writes `ai.backup`), `ai-paid` (plan:
// "Uses your {Claude} plan"; key: "Uses your {OpenAI} key · saved {16 Oct}" + [ Replace key ] → `dialog-replace-key`),
// `ai-add` (› → the same card). Row ids `settings/account/{row}`, test ids `settings-row-account-{row}`; rows 56 in a 06 §0.4
// Row group. The YOU rows (name, start with Windows, close choice, graphics), "Run setup again" and foo's profile row arrive
// with the Settings milestone (M13; CR-0020 (b)).
import { useEffect, useRef, useState } from 'react';
import { AI_MAKER, AI_NAME } from '../../../shared/aiNames';
import { t } from '../../../shared/copy/t';
import { formatDate, formatTime } from '../../../shared/format';
import { TID } from '../../../shared/testids';
import type { ProviderId, SecretIndexRow } from '../../../shared/types';
import { absoluteTime } from '../../ui/time';
import { invoke } from '../../ipc/client';
import { navigate, useStore } from '../../store/index';
import { selectAi, selectConnection } from '../../store/live';
import { selectSettings, selectTimeZone } from '../../store/settings';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Menu, type MenuEntry } from '../../ui/Menu';
import { Spinner } from '../../ui/Spinner';
import { Tooltip } from '../../ui/Tooltip';
import { agoOf, backupChoices, lineTone, paidByKey, usingLine, type Ago, type UsingLine } from './aiRows';
import { RowGroup } from '../shared/RowGroup';
import { ReplaceKeyDialog } from './ReplaceKeyDialog';
import styles from './SettingsPage.module.css';

function agoText(a: Ago): string {
  switch (a.unit) {
    case 'now':
      return t('settings.account.ai_using.ago_now');
    case 'min':
      return t('settings.account.ai_using.ago_min', { n: a.n });
    case 'hour':
      return t('settings.account.ai_using.ago_hour', { n: a.n });
    default:
      return t('settings.account.ai_using.ago_day', { n: a.n });
  }
}

function lineText(l: UsingLine, now: number, timeZone: string): string {
  switch (l.kind) {
    case 'works':
      return t('settings.account.ai_using.works', { ago: agoText(agoOf(l.at ?? now, now)) });
    case 'testing':
      return t('settings.account.ai_using.testing');
    case 'not_answering':
      return t('settings.account.ai_using.not_answering');
    case 'signed_out':
      return t('settings.account.ai_using.signed_out');
    case 'limit':
      return l.resetAt !== null
        ? t('settings.account.ai_using.limit', { time: formatTime(l.resetAt, { timeZone }) })
        : t('setup.ai_finder.status.plan_limit_no_time');
    case 'key_failed':
      return t('settings.account.ai_using.key_failed');
    case 'offline':
      return t('settings.account.ai_using.offline');
    default:
      return '';
  }
}

/** "Change" and "Add another AI": foo's chat with a fresh 06-1 §2.2 card. */
function openFinder() {
  void invoke('ai:openFinder', {})
    .then((r) => r.ok && navigate({ kind: 'chat', chatId: r.value.chatId }))
    .catch(() => undefined);
}

export function AccountAi() {
  const ai = useStore(selectAi);
  const settings = useStore(selectSettings);
  const offline = useStore(selectConnection) === 'offline';
  const timeZone = useStore(selectTimeZone);
  const now = useStore((s) => s.live.now);
  const [testing, setTesting] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [keys, setKeys] = useState<SecretIndexRow[]>([]);
  const alive = useRef(true);
  const primary = ai?.primary ?? null;
  const keyId = paidByKey(primary);

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  // The key's saved date ("· saved {16 Oct}") comes from the vault index, never the key (08-1 §3.2 `secret:list`).
  useEffect(() => {
    if (!keyId) return;
    void invoke('secret:list', {})
      .then((r) => r.ok && alive.current && setKeys(r.value))
      .catch(() => undefined);
  }, [keyId, replacing]);

  const testNow = () => {
    if (!primary || testing || offline) return;
    setTesting(true);
    void invoke('ai:verify', { providerId: primary })
      .catch(() => undefined)
      .finally(() => alive.current && setTesting(false));
  };

  const line = usingLine(ai, testing, offline);
  const text = lineText(line, now, timeZone);
  const tone = lineTone(line);
  const name = primary ? AI_NAME[primary] : '';
  const backups = backupChoices(settings?.ai.providers ?? {}, primary);
  const backup = settings?.ai.backup ?? null;
  const saved = keyId ? keys.find((k) => k.kind === 'ai_key' && k.name === keyId) : undefined;

  const setBackup = (id: ProviderId | null) => {
    if (!primary) return;
    void invoke('ai:choose', { primary, backup: id }).catch(() => undefined);
  };
  const entries: MenuEntry[] = [
    ...backups.map((id): MenuEntry => ({ kind: 'item', id, label: AI_NAME[id], onSelect: () => setBackup(id) })),
    { kind: 'item', id: 'none', label: t('settings.account.ai_backup.none'), onSelect: () => setBackup(null) },
  ];

  const status = text && (
    <span className={styles.status} data-tone={tone} role="status">
      {line.kind === 'testing' ? <Spinner size={16} /> : null}
      {line.kind === 'works' && line.at !== null ? (
        <Tooltip text={absoluteTime(line.at, now, timeZone)}>
          <span>{text}</span>
        </Tooltip>
      ) : (
        <span>{text}</span>
      )}
      {line.kind === 'signed_out' && (
        <button type="button" className={styles.link} onClick={openFinder}>
          {t('settings.account.ai_using.sign_in')}
        </button>
      )}
      {line.kind === 'key_failed' && keyId && (
        <button type="button" className={styles.link} onClick={() => setReplacing(true)}>
          {t('settings.account.ai_using.replace_key')}
        </button>
      )}
    </span>
  );

  const paid = !primary
    ? ''
    : keyId
      ? saved
        ? t('settings.account.ai_paid.key', {
            maker: AI_MAKER[keyId],
            date: formatDate(saved.updatedAt, 'date', { timeZone, now }),
          })
        : t('settings.account.ai_paid.key_no_date', { maker: AI_MAKER[keyId] })
      : primary === 'ollama'
        ? t('settings.account.ai_paid.local')
        : t('settings.account.ai_paid.plan', { AI: name });

  return (
    <section aria-labelledby="settings-account-your-ai">
      <h3 id="settings-account-your-ai" className={styles.sectionLabel}>
        {t('settings.account.section.your_ai')}
      </h3>
      <RowGroup>
        <li className={styles.row} data-testid={TID.settingsRowAccountAiUsing} data-row-id="settings/account/ai-using">
          <span className={styles.rowText}>
            <span className={styles.rowLabel}>{t('settings.account.ai_using.label')}</span>
            <span className={styles.rowSecond}>
              {primary ? t('settings.account.ai_using.value', { AI: name }) : t('settings.account.ai_using.none')}
            </span>
            {status}
          </span>
          {primary && (
            <Button variant="secondary" disabled={offline || testing} onClick={testNow}>
              {t('settings.account.ai_using.test_now')}
            </Button>
          )}
          <Button variant="secondary" onClick={openFinder}>
            {t('settings.account.ai_using.change')}
          </Button>
        </li>
        {primary && (
          <li className={styles.row} data-testid={TID.settingsRowAccountAiBackup} data-row-id="settings/account/ai-backup">
            <span className={styles.rowText}>
              <span className={styles.rowLabel}>{t('settings.account.ai_backup.label')}</span>
              <span className={styles.rowSecond}>{t('settings.account.ai_backup.second', { AI: name })}</span>
            </span>
            <button
              type="button"
              className={styles.menuButton}
              aria-haspopup="menu"
              aria-expanded={menu !== null}
              onClick={(e) => setMenu(e.currentTarget)}
            >
              {backup ? AI_NAME[backup] : t('settings.account.ai_backup.none')}
              <Icon name="ChevronDown" size={16} />
            </button>
            {menu && (
              <Menu
                entries={entries}
                anchor={{ el: menu, align: 'end' }}
                label={t('settings.account.ai_backup.label')}
                onClose={() => setMenu(null)}
              />
            )}
          </li>
        )}
        {primary && (
          <li className={styles.row} data-testid={TID.settingsRowAccountAiPaid} data-row-id="settings/account/ai-paid">
            <span className={styles.rowText}>
              <span className={styles.rowLabel}>{t('settings.account.ai_paid.label')}</span>
              <span className={styles.rowSecond}>{paid}</span>
            </span>
            {keyId && (
              <Button variant="secondary" onClick={() => setReplacing(true)}>
                {t('settings.account.ai_paid.replace')}
              </Button>
            )}
          </li>
        )}
        <li className={styles.rowItem}>
          <button
            type="button"
            className={styles.row}
            data-testid={TID.settingsRowAccountAiAdd}
            data-row-id="settings/account/ai-add"
            onClick={openFinder}
          >
            <span className={styles.rowText}>
              <span className={styles.rowLabel}>{t('settings.account.ai_add.label')}</span>
            </span>
            <Icon name="ChevronRight" size={20} className={styles.chevron} />
          </button>
        </li>
      </RowGroup>
      {replacing && keyId && <ReplaceKeyDialog providerId={keyId} onClose={() => setReplacing(false)} />}
    </section>
  );
}
