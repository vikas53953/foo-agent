// Spec: 03-shell-2 §3.7.3.1 (Doing now: label <h2> + "Open the window"; X-148 In progress / Scheduled / Done tabs; rows
// glyph · two lines · Watch live · Stop; 5 rows max, "See all ({n})" → Activity filtered to this chat, unfiltered in foo's
// chat; click / Enter opens the job's chat and reveals its checklist card; empty lines), §3.7.4 (scope per chat kind),
// 02-3 §F25.3 (roving tabindex in the list).
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { t } from '../../shared/copy/t';
import { formatDate } from '../../shared/format';
import { TID } from '../../shared/testids';
import type { ChatRow, JobRow, RoutineRow } from '../../shared/types';
import { useRovingTabIndex } from '../a11y/useRovingTabIndex';
import { invoke } from '../ipc/client';
import { loadChat } from '../store/apply';
import { navigate, useStore } from '../store/index';
import { selectAi, selectNow } from '../store/live';
import { selectTimeZone } from '../store/settings';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Segmented } from '../ui/Segmented';
import { Spinner } from '../ui/Spinner';
import { openChat } from './actions';
import { requestReveal } from '../messages/reveal';
import styles from './DoingNow.module.css';
import { canStop, doingGlyph, doingLine, doingRows, doneRows, hasLiveBrowser, jobsInScope, scheduledRows } from './doingNowRows';
import section from './PanelSection.module.css';

type Tab = 'progress' | 'scheduled' | 'done';

export function DoingNow({ chat }: { chat: ChatRow }) {
  const [tab, setTab] = useState<Tab>('progress');
  const jobsById = useStore((s) => s.jobs.byId);
  const chats = useStore((s) => s.chats.byId);
  const cards = useStore((s) => s.cards.byId);
  const aiName = useStore(selectAi)?.displayName ?? '';
  const now = useStore(selectNow);
  const timeZone = useStore(selectTimeZone);
  const routines = useRoutines(tab === 'scheduled');
  useJobsOfBusyChats(chat);

  const scoped = useMemo(() => jobsInScope(Object.values(jobsById), chat), [jobsById, chat]);
  const progress = useMemo(() => doingRows(scoped, now, timeZone), [scoped, now, timeZone]);
  const done = useMemo(() => doneRows(scoped, now), [scoped, now]);
  const scheduled = useMemo(() => scheduledRows(routines ?? [], chat.id), [routines, chat.id]);
  const shown = tab === 'progress' ? progress : tab === 'done' ? done : scheduled;
  const empty = shown.total === 0;
  const openTarget = progress.rows.find(hasLiveBrowser);

  const seeAll = () => {
    if (tab === 'scheduled') navigate({ kind: 'screen', id: 'routines' });
    else
      navigate(
        chat.kind === 'foo' && !chat.private
          ? { kind: 'screen', id: 'activity' }
          : { kind: 'screen', id: 'activity', params: { chatId: chat.id } },
      );
  };

  return (
    <section
      className={section.section}
      data-testid={TID.appPanelDoing}
      data-empty={empty || undefined}
      aria-labelledby="app-panel-doing-title"
    >
      <h2 className={section.label} id="app-panel-doing-title">
        <span>{t('app.panel.doing.title')}</span>
        {openTarget && (
          <IconButton
            icon="ArrowMaximize"
            iconSize={16}
            label={t('app.panel.doing.open.label')}
            data-testid={TID.appPanelDoingOpen}
            onClick={() => void invoke('job:watch', { jobId: openTarget.id, on: true }).catch(() => undefined)}
          />
        )}
      </h2>
      <Segmented<Tab>
        label={t('app.panel.doing.tabs.label')}
        value={tab}
        onChange={setTab}
        tid="appPanelJobsTab"
        options={[
          { value: 'progress', label: t('app.panel.doing.tab.progress') },
          { value: 'scheduled', label: t('app.panel.doing.tab.scheduled') },
          { value: 'done', label: t('app.panel.doing.tab.done') },
        ]}
      />
      {empty ? (
        <p className={section.empty}>
          {tab === 'progress'
            ? t('app.panel.doing.empty')
            : tab === 'done'
              ? t('app.panel.doing.empty_done')
              : t('app.panel.doing.empty_scheduled')}
        </p>
      ) : tab === 'scheduled' ? (
        <RoutineList rows={scheduled.rows} now={now} timeZone={timeZone} />
      ) : (
        <JobList
          rows={shown.rows as JobRow[]}
          chat={chat}
          chats={chats}
          line={(j) => doingLine(j, { now, timeZone, ai: aiName, cards })}
          signIn={(j) => j.state === 'needs_you' && cards[j.needsYouCardId ?? '']?.type === 'signin'}
        />
      )}
      {shown.total > shown.rows.length && (
        <button type="button" className={section.link} data-testid={TID.appPanelDoingSeeAll} onClick={seeAll}>
          {t('app.panel.doing.see_all', { count: shown.total })}
        </button>
      )}
    </section>
  );
}

/**
 * foo's chat lists every job (§3.7.4), but the store holds jobs only for chats that were opened (chat:open) or patched since
 * (job:upsert); 08-1 §3.2 has no job list read. So foo's chat opens, once each, the chats whose pill says a job is live.
 */
function useJobsOfBusyChats(chat: ChatRow): void {
  const busy = useStore(
    useShallow((s) =>
      chat.kind === 'foo' && !chat.private
        ? s.chats.order.filter((id) => {
            const p = s.chats.byId[id]?.pill;
            return id !== chat.id && (p === 'working' || p === 'needs_you' || p === 'paused');
          })
        : NO_IDS,
    ),
  );
  useEffect(() => {
    for (const id of busy) loadChat(id).catch((e: unknown) => console.warn('chat:open', id, e));
  }, [busy]);
}

const NO_IDS: string[] = [];

/** Routines load only when the Scheduled tab is opened (`routine:list`); a failure reads as "none". */
function useRoutines(active: boolean): RoutineRow[] | null {
  const [rows, setRows] = useState<RoutineRow[] | null>(null);
  useEffect(() => {
    if (!active) return;
    let live = true;
    invoke('routine:list', {})
      .then((r) => live && setRows(r.ok ? r.value : []))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [active]);
  return rows;
}

function openJob(j: JobRow, current: ChatRow) {
  if (j.chatId !== current.id) openChat(j.chatId);
  requestReveal(j.chatId, j.id);
}

function JobList({
  rows,
  chat,
  chats,
  line,
  signIn,
}: {
  rows: JobRow[];
  chat: ChatRow;
  chats: Record<string, ChatRow>;
  line: (j: JobRow) => string;
  signIn: (j: JobRow) => boolean;
}) {
  const roving = useRovingTabIndex(rows.length);
  const prefixOthers = chat.kind === 'foo' && !chat.private;
  return (
    <ul className={styles.list} onKeyDown={roving.onKeyDown}>
      {rows.map((j, i) => {
        const glyph = doingGlyph(j.state);
        const other = prefixOthers && j.chatId !== chat.id ? chats[j.chatId] : undefined;
        const onKey = (e: KeyboardEvent<HTMLLIElement>) => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
            e.preventDefault();
            openJob(j, chat);
          }
        };
        return (
          <li
            key={j.id}
            className={styles.row}
            data-testid={TID.appPanelDoingRow}
            data-row-id={j.id}
            data-index={i}
            data-state={j.state}
            aria-label={`${other ? t('app.panel.doing.chat_prefix', { chat: other.title }) : ''}${j.title}, ${line(j)}`}
            {...roving.itemProps(i)}
            onClick={(e) => {
              if (!(e.target as Element).closest('button')) openJob(j, chat);
            }}
            onKeyDown={onKey}
          >
            <span className={styles.glyph} data-tone={glyph.tone} aria-hidden>
              {glyph.icon ? <Icon name={glyph.icon} size={16} /> : <Spinner size={16} />}
            </span>
            <span className={styles.lines}>
              <span className={styles.line1}>
                {other && <span className={styles.prefix}>{t('app.panel.doing.chat_prefix', { chat: other.title })}</span>}
                {j.title}
              </span>
              <span className={styles.line2} data-tone={j.state === 'needs_you' ? 'warn' : undefined}>
                {line(j)}
              </span>
            </span>
            {hasLiveBrowser(j) && (
              <IconButton
                icon="Window"
                iconSize={16}
                className={styles.action}
                data-always={signIn(j) || undefined}
                label={t('app.panel.doing.watch_live.label', { title: j.title })}
                tooltip={t('app.panel.doing.watch_live.tooltip')}
                data-testid={TID.appPanelDoingWatchLive}
                onClick={() => void invoke('job:watch', { jobId: j.id, on: true }).catch(() => undefined)}
              />
            )}
            {canStop(j) && (
              <IconButton
                icon="Stop"
                className={styles.action}
                label={t('app.panel.doing.stop.label', { title: j.title })}
                data-testid={TID.appPanelDoingStop}
                onClick={() => void invoke('job:stop', { jobId: j.id }).catch(() => undefined)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RoutineList({ rows, now, timeZone }: { rows: RoutineRow[]; now: number; timeZone: string }) {
  const roving = useRovingTabIndex(rows.length);
  const open = (r: RoutineRow) => navigate({ kind: 'screen', id: 'routines', params: { routineId: r.id } });
  return (
    <ul className={styles.list} onKeyDown={roving.onKeyDown}>
      {rows.map((r, i) => {
        const text = r.nextRunAt
          ? t('app.panel.doing.line.scheduled', { title: r.title, when: formatDate(r.nextRunAt, 'full', { now, timeZone }) })
          : r.title;
        return (
          <li
            key={r.id}
            className={styles.row}
            data-testid={TID.appPanelDoingRow}
            data-row-id={r.id}
            data-index={i}
            data-state="scheduled"
            {...roving.itemProps(i)}
            onClick={() => open(r)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                e.preventDefault();
                open(r);
              }
            }}
          >
            <span className={styles.glyph} data-tone="fg2" aria-hidden>
              <Icon name="ArrowRepeatAll" size={16} />
            </span>
            <span className={styles.lines}>
              <span className={styles.line1}>{text}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
