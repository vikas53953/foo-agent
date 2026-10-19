// Spec: 06-1 §2.2 Step 1 of 4 · foo finds your AI: lead line "I'm looking for the AI you already use…"; the rows (56 high, 26px
// letter disc on --bg-sunken, name --t-body-strong, detail --t-small --fg-2, status or Secondary 32px control right) in a Row
// group; every found AI tested with one tiny real request (20 s); the choice block after every row settled or 25 s; the note
// line (plan / key with "Change cap"); "Use …" → `ai:choose` (backup = next working AI) and main collapses the card to
// "✓ Using {Claude} (your AI)"; branches: Pick another, nothing found, maker consent → maker page → waiting for the helper (re-
// detect every 5 s and on focus; 10 min → "Not installed yet."), "Not now" → "Needs its helper" + "Open page", "I have a key" →
// "Which key is it?" → the key's Secret box (saved → tested), offline strip (Try again, auto-retry 30 s), local-only question,
// plan-limited "Continue anyway". Keyboard: rows one Tab stop (↑/↓), → into a row's button; Narrator "{Claude}, {signed in},
// {works}", state changes announced politely at most once per 2 s. 08-2 §6.6 (detect, verify), X-42 (foo installs nothing).
// CR-0020 (b): sign-in runs in the maker's own app (pick 5: "Sign in in the {Claude} app, then come back.").
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { announce } from '../../a11y/announce';
import { AI_NAME, isKeyProvider } from '../../../shared/aiNames';
import { t } from '../../../shared/copy/t';
import { formatInr, formatTime } from '../../../shared/format';
import type { VerifyResult } from '../../../shared/ipc';
import { TID } from '../../../shared/testids';
import type { CardRow, KeyProviderId, ProviderId, SetupCardPayload } from '../../../shared/types';
import { invoke } from '../../ipc/client';
import { useStore } from '../../store/index';
import { selectConnection } from '../../store/live';
import { selectSettings } from '../../store/settings';
import { Icon } from '../../ui/Icon';
import { Spinner } from '../../ui/Spinner';
import { cx } from '../../ui/cx';
import { CardButton } from '../CardButton';
import { CardFrame, CardTimeLabel, type CardTime } from '../CardFrame';
import cardStyles from '../Card.module.css';
import { CapDialog } from './CapDialog';
import { FinderChoice } from './FinderChoice';
import {
  backupFor,
  billingOf,
  choiceBlock,
  HELPER_LIMIT_MS,
  HELPER_POLL_MS,
  initialRows,
  makerOf,
  OFFLINE_RETRY_MS,
  rowAction,
  rowDetail,
  rowName,
  rowsFromDetect,
  rowStatus,
  rowTone,
  SETTLE_LIMIT_MS,
  stateAfterVerify,
  upsertRow,
  VERIFY_LIMIT_MS,
  type FinderRow,
  type RowAction,
  type RowId,
} from './aiFinderModel';
import styles from './AiFinder.module.css';

type View =
  | { kind: 'block' }
  | { kind: 'pick' }
  | { kind: 'key' }
  | { kind: 'nothing' }
  | { kind: 'consent'; id: ProviderId }
  | { kind: 'waiting'; id: ProviderId; since: number }
  | { kind: 'not_installed'; id: ProviderId }
  | { kind: 'signin'; id: ProviderId };

/** "Nothing found": the sign-in options (ChatGPT is the Best fit) and "I have a key". */
const nothingOptions = () => [
  { id: 'codex-cli', label: t('setup.ai_finder.nothing.chatgpt'), bestFit: true },
  { id: 'claude-cli', label: t('setup.ai_finder.nothing.claude') },
  { id: 'gemini-cli', label: t('setup.ai_finder.nothing.gemini') },
  { id: 'key', label: t('setup.ai_finder.nothing.key') },
];
const keyOptions = () => [
  { id: 'openai-key', label: t('setup.ai_finder.key.openai') },
  { id: 'anthropic-key', label: t('setup.ai_finder.key.anthropic') },
  { id: 'google-key', label: t('setup.ai_finder.key.google') },
];
const ANNOUNCE_GAP_MS = 2_000;
const actionLabel = (a: RowAction): string => {
  switch (a) {
    case 'sign_in':
      return t('setup.ai_finder.action.sign_in');
    case 'add_key':
      return t('setup.ai_finder.action.add_key');
    case 'replace_key':
      return t('setup.ai_finder.action.replace_key');
    case 'test_again':
      return t('setup.ai_finder.action.test_again');
    case 'try_again':
      return t('setup.ai_finder.action.try_again');
  }
};

export function AiFinder({ card, time }: { card: CardRow; time: CardTime }) {
  if (card.state === 'shown') return <LiveFinder card={card} time={time} />;
  const using = (card.payload as unknown as SetupCardPayload).using;
  return (
    <CardFrame
      tid="cardSetup"
      card={card}
      state={card.state}
      label={t('setup.ai_finder.label')}
      muted={card.state === 'skipped'}
      className={styles.setup}
      data={{ 'data-row-id': 'ai_finder' }}
    >
      <div className={styles.summary}>
        {using ? (
          <span className={styles.summaryText}>{t('setup.ai_finder.chosen', { AI: AI_NAME[using] })}</span>
        ) : (
          <span className={styles.summaryText}>{t('setup.ai_finder.lead')}</span>
        )}
        <span className={styles.spacer} />
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );
}

/** Polite row announcements, at most one every 2 s (the newest waits for the gap). */
function useThrottledAnnounce(): (text: string) => void {
  const last = useRef(0);
  const pending = useRef<number | null>(null);
  const text = useRef('');
  useEffect(
    () => () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    },
    [],
  );
  return useCallback((next: string) => {
    text.current = next;
    const wait = last.current + ANNOUNCE_GAP_MS - Date.now();
    if (wait <= 0) {
      last.current = Date.now();
      announce(next);
      return;
    }
    if (pending.current !== null) return;
    pending.current = window.setTimeout(() => {
      pending.current = null;
      last.current = Date.now();
      announce(text.current);
    }, wait);
  }, []);
}

function LiveFinder({ card, time }: { card: CardRow; time: CardTime }) {
  const settings = useStore(selectSettings);
  const offlineNow = useStore(selectConnection) === 'offline';
  const timeZone = settings?.locale.timeZone ?? time.timeZone;
  const capPaise = settings?.money.aiCapPaise ?? 100_000;
  const [rows, setRows] = useState<FinderRow[]>(initialRows);
  const [timeUp, setTimeUp] = useState(false);
  const [view, setView] = useState<View>({ kind: 'block' });
  const [needsHelper, setNeedsHelper] = useState<ProviderId[]>([]);
  const [keyWatch, setKeyWatch] = useState<{ id: KeyProviderId; cardId: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [capOpen, setCapOpen] = useState(false);
  const [focusRow, setFocusRow] = useState(0);
  const watched = useRef(new Set<ProviderId>());
  const alive = useRef(true);
  const rowsRef = useRef(rows);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const listRef = useRef<HTMLDivElement>(null);
  const say = useThrottledAnnounce();

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const setRow = useCallback(
    (row: FinderRow) => {
      if (!alive.current) return;
      setRows((cur) => upsertRow(cur, row));
      const status = rowStatus(row, timeZone);
      if (status) say(t('setup.ai_finder.row.announce', { AI: rowName(row), status }));
    },
    [say, timeZone],
  );

  /** One tiny real request (08-2 §6.6), 20 s limit; a late answer still updates the row. */
  const test = useCallback(
    (id: ProviderId) => {
      const base = rowsRef.current.find((r) => r.id === id) ?? { id, state: 'testing' as const, found: true };
      setRow({ ...base, state: 'testing', found: true });
      let answered = false;
      const slow = window.setTimeout(() => {
        if (!answered) setRow({ ...base, state: 'slow', found: true });
      }, VERIFY_LIMIT_MS);
      void invoke('ai:verify', { providerId: id })
        .catch((): null => null)
        .then((r) => {
          answered = true;
          window.clearTimeout(slow);
          const v: VerifyResult = r?.ok ? r.value : { ok: false, providerId: id, kind: 'AI_TIMEOUT' };
          const { resetAt, ...next } = stateAfterVerify(v);
          const row: FinderRow = { ...base, ...next, found: true };
          if (resetAt !== undefined) row.resetAt = resetAt;
          else delete row.resetAt;
          setRow(row);
        });
    },
    [setRow],
  );

  /** Detection (rows stream in fixed order), then a test of every AI that is ready. */
  const detect = useCallback(async () => {
    const r = await invoke('ai:detect', {}).catch(() => null);
    if (!alive.current) return;
    const next = rowsFromDetect(r?.ok ? r.value : []);
    setRows(next);
    for (const row of next) if (row.state === 'testing') test(row.id as ProviderId);
  }, [test]);

  useEffect(() => {
    void detect();
    const settle = window.setTimeout(() => alive.current && setTimeUp(true), SETTLE_LIMIT_MS);
    return () => window.clearTimeout(settle);
  }, [detect]);

  /** A helper the user went to install or sign in to: look again every 5 s and when the window regains focus. */
  const recheck = useCallback(async () => {
    if (!watched.current.size) return;
    const r = await invoke('ai:detect', {}).catch(() => null);
    if (!alive.current || !r?.ok) return;
    const fresh = rowsFromDetect(r.value);
    for (const id of [...watched.current]) {
      const d = fresh.find((x) => x.id === id);
      if (!d?.found) continue;
      if (d.state === 'testing') {
        watched.current.delete(id);
        setNeedsHelper((cur) => cur.filter((x) => x !== id));
        setView({ kind: 'block' });
        test(id);
      } else {
        setRow(d);
        setNeedsHelper((cur) => cur.filter((x) => x !== id));
        setView((v) => (v.kind === 'waiting' && v.id === id ? { kind: 'signin', id } : v));
      }
    }
  }, [setRow, test]);

  useEffect(() => {
    const poll = window.setInterval(() => void recheck(), HELPER_POLL_MS);
    const onFocus = () => void recheck();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('focus', onFocus);
    };
  }, [recheck]);

  // 10 minutes without the helper: "Not installed yet." and no timer after this.
  useEffect(() => {
    if (view.kind !== 'waiting') return;
    const left = Math.max(0, view.since + HELPER_LIMIT_MS - Date.now());
    const id = view.id;
    const timer = window.setTimeout(() => {
      watched.current.delete(id);
      setView({ kind: 'not_installed', id });
    }, left);
    return () => window.clearTimeout(timer);
  }, [view]);

  // A key saved in its Secret box is tested at once (06-1 §2.2 "Saved key is tested").
  useEffect(() => {
    if (!keyWatch) return;
    const unsubscribe = useStore.subscribe((s) => {
      if (s.cards.byId[keyWatch.cardId]?.state !== 'saved') return;
      unsubscribe();
      setKeyWatch(null);
      test(keyWatch.id);
    });
    return unsubscribe;
  }, [keyWatch, test]);

  // Offline: rows wait for the internet and are tested again every 30 s.
  const offlineIds = rows.filter((r) => r.state === 'offline').map((r) => r.id as ProviderId);
  const retryOffline = useCallback(() => {
    for (const id of rowsRef.current.filter((r) => r.state === 'offline').map((r) => r.id as ProviderId)) test(id);
  }, [test]);
  const hasOffline = offlineIds.length > 0;
  useEffect(() => {
    if (!hasOffline) return;
    const timer = window.setInterval(retryOffline, OFFLINE_RETRY_MS);
    return () => window.clearInterval(timer);
  }, [hasOffline, retryOffline]);

  const choose = (id: ProviderId, action: string) => {
    if (busy) return;
    setBusy(action);
    void invoke('ai:choose', { primary: id, backup: backupFor(id, rowsRef.current) })
      .catch(() => null)
      .finally(() => alive.current && setBusy(null));
  };

  const askKey = (id: KeyProviderId) => {
    if (busy) return;
    setBusy(`key:${id}`);
    void invoke('ai:askKey', { providerId: id })
      .then((r) => {
        if (r.ok && alive.current) {
          setKeyWatch({ id, cardId: r.value.id });
          setView({ kind: 'block' });
        }
      })
      .catch(() => undefined)
      .finally(() => alive.current && setBusy(null));
  };

  const openPage = (id: ProviderId) => {
    if (busy) return;
    setBusy('open_page');
    void invoke('app:openExternal', { target: 'maker_page', providerId: id })
      .then((r) => {
        if (!r.ok || !alive.current) return;
        watched.current.add(id);
        setView({ kind: 'waiting', id, since: Date.now() });
      })
      .catch(() => undefined)
      .finally(() => alive.current && setBusy(null));
  };

  const signIn = (id: ProviderId) => {
    watched.current.add(id);
    setView({ kind: 'signin', id });
  };

  /** A sign-in option from "nothing found": sign in where the helper is, else ask before opening the maker's page. */
  const pickSignIn = (id: ProviderId) => {
    const row = rowsRef.current.find((r) => r.id === id);
    if (row?.found && row.signedIn === false) signIn(id);
    else if (row?.found) test(id);
    else setView({ kind: 'consent', id });
  };

  const onRowAction = (row: FinderRow, action: RowAction) => {
    if (action === 'add_key') {
      if (row.id === 'own-key') setView({ kind: 'key' });
      else if (isKeyProvider(row.id)) askKey(row.id);
    } else if (action === 'replace_key' && isKeyProvider(row.id)) askKey(row.id);
    else if (action === 'sign_in') signIn(row.id as ProviderId);
    else test(row.id as ProviderId);
  };

  const rowKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>(`[data-testid="${TID.setupAiRow}"]`) ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (i < 0) return;
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
      setFocusRow(next);
      items[next]?.focus();
    } else if (e.key === 'ArrowRight' && i >= 0) {
      const btn = items[i]?.querySelector<HTMLElement>('button');
      if (btn) {
        e.preventDefault();
        btn.focus();
      }
    } else if (e.key === 'ArrowLeft' && i < 0) {
      const owner = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(`[data-testid="${TID.setupAiRow}"]`);
      if (owner) {
        e.preventDefault();
        owner.focus();
      }
    }
  };

  const block = choiceBlock(rows, timeUp);
  const shownView: View = view.kind === 'block' && block.kind === 'nothing' ? { kind: 'nothing' } : view;
  const working = rows.filter((r) => r.state === 'works' && r.id !== 'own-key').map((r) => r.id as ProviderId);

  const note = (id: ProviderId) => {
    const billing = billingOf(id);
    if (billing === 'local') return null;
    return (
      <p className={styles.note}>
        {billing === 'plan'
          ? t('setup.ai_finder.note.plan', { AI: AI_NAME[id] })
          : t('setup.ai_finder.note.key', { maker: makerOf(id), cap: formatInr(capPaise) })}
        {billing === 'key' && (
          <>
            {' '}
            <CardButton tid="setupAiChangeCap" kind="link" onClick={() => setCapOpen(true)}>
              {t('setup.ai_finder.note.change_cap')}
            </CardButton>
          </>
        )}
      </p>
    );
  };

  const chooseLine = (pick: ProviderId, many: boolean) => (
    <div className={styles.block}>
      <p className={styles.line}>
        {many ? t('setup.ai_finder.choose.many', { AI: AI_NAME[pick] }) : t('setup.ai_finder.choose.one', { AI: AI_NAME[pick] })}
      </p>
      <div className={cardStyles.buttons}>
        <CardButton tid="setupAiUse" kind="primary" busy={busy === 'use'} disabled={busy !== null} onClick={() => choose(pick, 'use')}>
          {t('setup.ai_finder.choose.use', { AI: AI_NAME[pick] })}
        </CardButton>
        {many && (
          <CardButton tid="setupAiPickAnother" kind="secondary" disabled={busy !== null} onClick={() => setView({ kind: 'pick' })}>
            {t('setup.ai_finder.choose.pick_another')}
          </CardButton>
        )}
      </div>
      {note(pick)}
    </div>
  );

  const renderBlock = () => {
    switch (shownView.kind) {
      case 'pick':
        return (
          <FinderChoice
            question={t('setup.ai_finder.choose.pick_question')}
            options={working.map((id) => ({ id, label: AI_NAME[id] }))}
            busy={busy?.startsWith('pick:') ? busy.slice(5) : busy}
            onPick={(id) => choose(id as ProviderId, `pick:${id}`)}
          />
        );
      case 'key':
        return (
          <FinderChoice
            question={t('setup.ai_finder.key.question')}
            options={keyOptions()}
            busy={busy?.startsWith('key:') ? busy.slice(4) : busy}
            onPick={(id) => askKey(id as KeyProviderId)}
          />
        );
      case 'nothing':
        return (
          <FinderChoice
            question={t('setup.ai_finder.nothing.question')}
            options={nothingOptions()}
            busy={busy}
            onPick={(id) => (id === 'key' ? setView({ kind: 'key' }) : pickSignIn(id as ProviderId))}
          />
        );
      case 'consent':
        return (
          <div className={styles.block}>
            <p className={styles.line}>{t('setup.ai_finder.maker_consent', { AI: AI_NAME[shownView.id], maker: makerOf(shownView.id) })}</p>
            <div className={cardStyles.buttons}>
              <CardButton
                tid="setupAiOpenPage"
                kind="primary"
                busy={busy === 'open_page'}
                disabled={busy !== null}
                onClick={() => openPage(shownView.id)}
              >
                {t('setup.ai_finder.open_maker', { maker: makerOf(shownView.id) })}
              </CardButton>
              <CardButton
                tid="setupAiNotNow"
                kind="secondary"
                disabled={busy !== null}
                onClick={() => {
                  setNeedsHelper((cur) => (cur.includes(shownView.id) ? cur : [...cur, shownView.id]));
                  setView({ kind: 'nothing' });
                }}
              >
                {t('setup.ai_finder.not_now')}
              </CardButton>
            </div>
          </div>
        );
      case 'waiting':
        return (
          <p className={cx(styles.line, styles.waiting)}>
            <Spinner size={16} />
            {t('setup.ai_finder.waiting_helper', { AI: AI_NAME[shownView.id] })}
          </p>
        );
      case 'not_installed':
        return (
          <div className={styles.block}>
            <p className={styles.line}>{t('setup.ai_finder.not_installed')}</p>
            <div className={cardStyles.buttons}>
              <CardButton
                tid="setupAiOpenPage"
                kind="secondary"
                busy={busy === 'open_page'}
                disabled={busy !== null}
                onClick={() => openPage(shownView.id)}
              >
                {t('setup.ai_finder.open_again')}
              </CardButton>
              <CardButton tid="setupAiPickAnother" kind="secondary" disabled={busy !== null} onClick={() => setView({ kind: 'nothing' })}>
                {t('setup.ai_finder.pick_another_ai')}
              </CardButton>
            </div>
          </div>
        );
      case 'signin':
        return <p className={styles.line}>{t('setup.ai_finder.signin_in_app', { AI: AI_NAME[shownView.id] })}</p>;
      case 'block':
        break;
    }
    switch (block.kind) {
      case 'many':
        return chooseLine(block.pick, true);
      case 'one':
        return chooseLine(block.pick, false);
      case 'local':
        return (
          <FinderChoice
            question={t('setup.ai_finder.local.question')}
            options={[
              { id: 'use', label: t('setup.ai_finder.local.use') },
              { id: 'add', label: t('setup.ai_finder.local.add') },
            ]}
            busy={busy}
            onPick={(id) => (id === 'use' ? choose('ollama', 'use') : setView({ kind: 'nothing' }))}
          />
        );
      case 'plan_limited':
        return (
          <div className={styles.block}>
            <p className={styles.line}>{t('setup.ai_finder.plan_limited.text', { time: formatTime(block.resetAt, { timeZone }) })}</p>
            <div className={cardStyles.buttons}>
              <CardButton
                tid="setupAiUse"
                kind="primary"
                busy={busy === 'use'}
                disabled={busy !== null}
                onClick={() => choose(block.pick, 'use')}
              >
                {t('setup.ai_finder.plan_limited.continue')}
              </CardButton>
            </div>
            {note(block.pick)}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <CardFrame
      tid="cardSetup"
      card={card}
      state={card.state}
      label={t('setup.ai_finder.label')}
      className={styles.setup}
      busy={busy !== null}
      data={{ 'data-row-id': 'ai_finder' }}
    >
      {hasOffline && (
        <div className={styles.offline} role="status">
          <Icon name="CloudOff" size={16} className={styles.offlineIcon} />
          <span className={styles.offlineText}>{t('setup.ai_finder.offline.text')}</span>
          <CardButton tid="setupAiRowAction" kind="link" disabled={offlineNow} onClick={retryOffline}>
            {t('setup.ai_finder.offline.retry')}
          </CardButton>
        </div>
      )}
      <p className={styles.lead}>{t('setup.ai_finder.lead')}</p>
      <div ref={listRef} className={styles.rows} role="list" aria-label={t('setup.ai_finder.rows_label')} onKeyDown={rowKeys}>
        {rows.map((row, i) => (
          <FinderRowView
            key={row.id}
            row={row}
            timeZone={timeZone}
            needsHelper={needsHelper.includes(row.id as ProviderId)}
            tabIndex={i === Math.min(focusRow, rows.length - 1) ? 0 : -1}
            disabled={busy !== null}
            onFocus={() => setFocusRow(i)}
            onAction={(a) => onRowAction(row, a)}
            onOpenPage={() => openPage(row.id as ProviderId)}
          />
        ))}
      </div>
      {renderBlock()}
      {capOpen && <CapDialog capPaise={capPaise} onClose={() => setCapOpen(false)} />}
    </CardFrame>
  );
}

function FinderRowView({
  row,
  timeZone,
  needsHelper,
  tabIndex,
  disabled,
  onFocus,
  onAction,
  onOpenPage,
}: {
  row: FinderRow;
  timeZone: string;
  needsHelper: boolean;
  tabIndex: number;
  disabled: boolean;
  onFocus: () => void;
  onAction: (a: RowAction) => void;
  onOpenPage: () => void;
}) {
  const name = rowName(row);
  const detail = rowDetail(row, needsHelper);
  const status = needsHelper ? '' : rowStatus(row, timeZone);
  const action = needsHelper ? null : rowAction(row);
  const tone = rowTone(row);
  const spinning = row.state === 'looking' || row.state === 'testing';
  const state = needsHelper ? 'needs_helper' : row.id === 'own-key' ? 'not_found' : row.state;
  return (
    <div
      role="listitem"
      className={styles.row}
      tabIndex={tabIndex}
      aria-label={t('setup.ai_finder.row.narrator', { AI: name, detail, status })}
      data-testid={TID.setupAiRow}
      data-row-id={row.id as RowId}
      data-state={state}
      onFocus={(e) => e.target === e.currentTarget && onFocus()}
    >
      <span className={styles.disc} aria-hidden="true">
        {name.charAt(0)}
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{name}</span>
        {detail && <span className={styles.detail}>{detail}</span>}
      </span>
      <span className={styles.status} data-tone={tone}>
        {spinning && <Spinner size={16} />}
        {row.state === 'works' && <Icon name="CheckmarkCircle" size={16} />}
        {status && <span className={styles.statusText}>{status}</span>}
        {needsHelper && (
          <CardButton tid="setupAiRowOpenPage" kind="link" disabled={disabled} onClick={onOpenPage}>
            {t('setup.ai_finder.action.open_page')}
          </CardButton>
        )}
        {action && (
          <button
            type="button"
            tabIndex={-1}
            className={styles.action}
            data-testid={TID.setupAiRowAction}
            aria-disabled={disabled || undefined}
            onClick={disabled ? undefined : () => onAction(action)}
          >
            {actionLabel(action)}
          </button>
        )}
      </span>
    </div>
  );
}
