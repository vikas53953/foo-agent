// Spec: 05-1 §5.2 Checklist (one card per job edited in place, Art. 17; status only from the runner, Art. 12): header with no
// icon, title = the job title, right label "live checklist" / "Paused" pill (`--warn-soft`, `--warn`, Clock 16) / "Didn't
// finish" (`--bad`); step rows 30 high with a 16px mark (Done CheckmarkCircle `--ok`, Current spinner ring `--accent`, Waiting
// HandRight `--warn`, Next 16px circle `--fg-3`, Failed ErrorCircle `--bad`, Stopped Stop `--fg-2`, Took over HandRight
// `--fg-2`); the waiting row is a Link button that focuses the card that needs the user; slow and paused lines under the
// current row, and after a failed tool call "Slow here, trying another way" in the slow line's place (CR-0024 F10);
// footer buttons Watch live (only while the job uses the browser) and Stop, text "{n} min · uses about ₹{x} of your AI";
// DONE collapses to the summary row "Done · {n} steps · {m} min" + "Details" (read-only list, "Replay" when frames
// exist); FAILED and CANCELLED stay expanded with no buttons; Stop → "Stopping…" (§5.2.3). §5.2.4: Tab order, no Primary
// (Ctrl+Enter does nothing), label "Job checklist: {title}, step {k} of {n}", steps a list read "{state word}, {text}".
// Steps come from `job:details`, refetched when the runner writes the job (`job:upsert`; `steps:upsert` is not wired, T1).
// P1 (CR-0021 picks 12–14, 02 §F7.1 Cards, AT-310, AT-312): each step keeps its runner words and gets its 16px icon by
// `StepKind` (`shared/timeSaved.ts`); the running step's words shimmer (`--m-shimmer`); the sites a read or search step
// read show as letter tiles (§F17.6: no bundled logo, no remote image) that fold into a pile of at most 5, "+{n}" after 3
// when there are more; a DONE card with proof adds "{job title} · saved you about {n} min." from the fixed table (hidden
// under 5 min, never on DONE "⚠ Not checked live") and tilts 1° on hover.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { t } from '../../shared/copy/t';
import { formatInr } from '../../shared/format';
import { TID } from '../../shared/testids';
import { minutesSaved, stepKind, type StepKind } from '../../shared/timeSaved';
import type { CardRow, ChecklistPayload, JobDetails, JobRow, StepRow } from '../../shared/types';
import { invoke, useFooEvent } from '../ipc/client';
import { useStore } from '../store/index';
import { selectJob } from '../store/jobs';
import { selectAi } from '../store/live';
import { Icon, type IconName } from '../ui/Icon';
import { Spinner } from '../ui/Spinner';
import { cx } from '../ui/cx';
import { CardButton } from './CardButton';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import { checklistFooter, checklistRightLabel, checklistView, pausedLine, stepOf, wholeMinutes, type ChecklistRowState } from './jobCards';
import { useCardAction } from './useCardAction';
import styles from './Checklist.module.css';

const LIVE: readonly JobRow['state'][] = ['queued', 'working', 'needs_you', 'waiting'];

const MARK: Record<ChecklistRowState, { icon?: IconName; tone: string } | null> = {
  done: { icon: 'CheckmarkCircle', tone: styles.ok! },
  current: null,
  waiting: { icon: 'HandRight', tone: styles.warn! },
  next: { tone: styles.next! },
  failed: { icon: 'ErrorCircle', tone: styles.bad! },
  stopped: { icon: 'Stop', tone: styles.dim! },
  took_over: { icon: 'HandRight', tone: styles.dim! },
};
/** Pick 12: the step kind's 16px Fluent icon. */
const KIND_ICON: Record<StepKind, IconName> = {
  search: 'Search',
  read: 'Document',
  fill: 'Edit',
  send: 'Send',
  sign_in: 'Key',
  pay: 'Wallet',
  wait: 'Clock',
};
/** Pick 12: the source pile shows every site up to 5; beyond that the first 3 and "+{n}". */
export const PILE_MAX = 5;
export const PILE_FOLDED = 3;
const PILE_KINDS: readonly StepKind[] = ['read', 'search'];

/** The sites a started read or search step names in its `site` / `sites` slot, split like the watchdog ("A, B and C"). */
export function stepSources(step: Pick<StepRow, 'phraseKey' | 'slots' | 'state'> | undefined): string[] {
  if (!step || step.state === 'pending') return [];
  const kind = stepKind(step.phraseKey);
  if (!kind || !PILE_KINDS.includes(kind)) return [];
  const raw = step.slots.sites ?? step.slots.site;
  if (typeof raw !== 'string') return [];
  const seen = new Set<string>();
  return raw
    .split(/,|\band\b|&/)
    .map((x) => x.trim())
    .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
}

export function pileOf(sites: readonly string[]): { shown: string[]; more: number } {
  return sites.length <= PILE_MAX
    ? { shown: [...sites], more: 0 }
    : { shown: sites.slice(0, PILE_FOLDED), more: sites.length - PILE_FOLDED };
}

function SourcePile({ sites }: { sites: readonly string[] }) {
  if (sites.length === 0) return null;
  const { shown, more } = pileOf(sites);
  return (
    // The step's own words already name the sites, so the pile is decoration for Narrator.
    <span className={styles.pile} data-testid={TID.cardChecklistSources} data-count={sites.length} aria-hidden="true">
      {shown.map((site, i) => (
        <span key={site} className={styles.source} title={site} data-site={site} style={{ '--i': i } as CSSProperties}>
          {site.charAt(0).toUpperCase()}
        </span>
      ))}
      {more > 0 && (
        <span className={styles.more} style={{ '--i': shown.length } as CSSProperties}>
          {t('cards.checklist.sources_more', { n: more })}
        </span>
      )}
    </span>
  );
}

const word = (state: ChecklistRowState): string | null =>
  state === 'done'
    ? t('cards.checklist.narrator.step_done')
    : state === 'current'
      ? t('cards.checklist.narrator.step_current')
      : state === 'waiting'
        ? t('cards.checklist.narrator.step_waiting')
        : null;

/** The job's steps, refetched whenever the runner writes the job or one of its steps. */
export function useJobSteps(jobId: string | null): JobDetails | null {
  const [details, setDetails] = useState<JobDetails | null>(null);
  const seq = useRef(0);
  const load = useCallback(() => {
    if (!jobId) return;
    const mine = ++seq.current;
    void invoke('job:details', { jobId })
      .then((r) => {
        if (r.ok && mine === seq.current) setDetails(r.value);
      })
      .catch(() => undefined);
  }, [jobId]);
  useEffect(load, [load]);
  useFooEvent('job:upsert', (row) => {
    if (row.id === jobId) load();
  });
  return details;
}

function StepMark({ state }: { state: ChecklistRowState }) {
  const m = MARK[state];
  if (!m) return <Spinner size={16} className={styles.ring} />;
  if (!m.icon) return <span className={cx(styles.circle, m.tone)} aria-hidden="true" />;
  return <Icon name={m.icon} size={16} className={m.tone} />;
}

function StepList({
  job,
  steps,
  showAll,
  onShowAll,
}: {
  job: JobRow;
  steps: readonly StepRow[];
  showAll: boolean;
  onShowAll?: () => void;
}) {
  const view = checklistView(job, steps, showAll);
  const byIdx = new Map(steps.map((s) => [s.idx, s]));
  const focusNeed = () => {
    const el = job.needsYouCardId ? document.querySelector<HTMLElement>(`[data-card-id="${job.needsYouCardId}"]`) : null;
    el?.scrollIntoView({ block: 'nearest' });
    el?.querySelector<HTMLElement>('button')?.focus();
  };
  const paused = job.state === 'waiting' ? pausedLine(job.waitingReason) : null;
  return (
    <>
      {view.folded > 0 && (
        <button type="button" className={styles.foldLink} data-testid={TID.cardChecklistShowDone} onClick={onShowAll}>
          <Icon name="Checkmark" size={16} />
          {t('cards.checklist.show_done', { n: view.folded })}
        </button>
      )}
      <ul className={styles.steps}>
        {view.lines.map((l) => {
          const text = l.text;
          const said = word(l.state);
          const current = l.state === 'current' || l.state === 'waiting';
          const step = byIdx.get(l.index);
          const kind = step ? stepKind(step.phraseKey) : null;
          return (
            <li
              key={`${l.state}:${l.index}`}
              className={cx(styles.step, current && styles.current)}
              data-testid={TID.cardChecklistStep}
              data-index={l.index}
              data-state={l.state}
              aria-label={said ? `${said}, ${text}` : text}
            >
              <span className={styles.mark}>
                <StepMark state={l.state} />
              </span>
              {kind ? (
                <Icon name={KIND_ICON[kind]} size={16} className={styles.kind} />
              ) : (
                // A row with no kind keeps the icon column so every row's words line up.
                <span className={styles.kind} aria-hidden="true" />
              )}
              <span className={styles.stepText}>
                {l.state === 'waiting' ? (
                  <button type="button" className={styles.waitLink} data-testid={TID.cardChecklistWaitingLink} onClick={focusNeed}>
                    {text}
                  </button>
                ) : (
                  <span data-copy="ai" className={cx(l.state === 'current' && job.state === 'working' && styles.shimmer)}>
                    {text}
                  </span>
                )}
                <SourcePile sites={stepSources(step)} />
                {current && job.state === 'working' && (job.retrying || job.slow) && (
                  <span className={styles.caption}>{job.retrying ? t('cards.checklist.retry_other_way') : t('cards.checklist.slow')}</span>
                )}
                {l.state === 'current' && paused && <span className={styles.caption}>{paused}</span>}
              </span>
            </li>
          );
        })}
        {paused && !view.lines.some((l) => l.state === 'current') && <li className={styles.caption}>{paused}</li>}
      </ul>
    </>
  );
}

export function Checklist({ card, time }: { card: CardRow; time: CardTime }) {
  // 05-1 §0.1: the payload names the job; rows written before M4 (the ux-world's Goa card) carry it only on `cards.job_id`.
  const jobId = (card.payload as Partial<ChecklistPayload>).jobId ?? card.jobId;
  const job = useStore((s) => (jobId ? selectJob(jobId)(s) : undefined));
  const ai = useStore(selectAi);
  const details = useJobSteps(jobId);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(false);
  const { busy, run } = useCardAction<'stop' | 'watch'>();
  const row = details?.job && (!job || details.job.rev > job.rev) ? details.job : job;
  if (!row) return null;
  const steps = details?.steps ?? [];
  const { k, n } = stepOf(row);
  const label = t('cards.checklist.label', { title: row.title, k, n });

  if (card.state === 'done' || card.state === 'done_unverified') {
    const m = wholeMinutes(row.startedAt ?? row.createdAt, row.finishedAt ?? time.now);
    // Pick 13: only a DONE with proof gets the end-card line and the hover tilt; "⚠ Not checked live" gets neither.
    const proven = card.state === 'done';
    const saved = proven ? minutesSaved(steps) : null;
    return (
      <CardFrame tid="cardChecklist" card={card} state={card.state} label={label} className={proven ? styles.finished : undefined}>
        <div className={styles.summary}>
          <Icon name="CheckmarkCircle" size={16} className={styles.ok} />
          <span className={styles.summaryText}>{t('cards.checklist.summary_done', { n: row.stepCount, m })}</span>
          <button
            type="button"
            className={styles.link}
            data-testid={TID.cardChecklistDetails}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {t('cards.checklist.details')}
          </button>
          <span className={styles.spacer} />
          <CardTimeLabel {...time} />
        </div>
        {saved !== null && (
          <div className={styles.saved} data-testid={TID.cardDoneSaved}>
            <span data-copy="ai">{t('cards.done.saved', { title: row.title, n: saved })}</span>
          </div>
        )}
        {open && (
          <>
            <StepList job={row} steps={steps} showAll />
          </>
        )}
      </CardFrame>
    );
  }

  const live = LIVE.includes(row.state) && card.state === 'live';
  const watch = live && row.usesBrowser && (row.state === 'working' || row.state === 'needs_you');
  const footer = checklistFooter(row, time.now, ai?.billing);
  const duration = footer.duration;
  const footText =
    footer.costPaise !== null ? t('cards.checklist.footer_text.key', { duration, x: formatInr(footer.costPaise) }) : duration;
  const right = checklistRightLabel(row.state);
  return (
    <CardFrame tid="cardChecklist" card={card} state={card.state} label={label} busy={busy !== null}>
      <div className={styles.head}>
        <span className={styles.title} data-copy="ai">
          {row.title}
        </span>
        {row.state === 'waiting' ? (
          <span className={styles.paused}>
            <Icon name="Clock" size={16} />
            {right}
          </span>
        ) : (
          <span className={cx(styles.right, row.state === 'failed' && styles.bad)}>{right}</span>
        )}
      </div>
      <StepList job={row} steps={steps} showAll={showAll} onShowAll={() => setShowAll(true)} />
      <div className={styles.foot}>
        {live && (
          <div className={styles.buttons}>
            {watch && (
              <CardButton
                tid="cardChecklistWatchLive"
                kind="secondary"
                disabled={busy !== null}
                busy={busy === 'watch'}
                onClick={() => run('watch', () => invoke('job:openWindow', { jobId: row.id }))}
              >
                <Icon name="Window" size={16} />
                {t('cards.checklist.watch_live')}
              </CardButton>
            )}
            <CardButton
              tid="cardChecklistStop"
              kind="secondary"
              busy={busy === 'stop'}
              busyLabel={t('cards.checklist.stopping')}
              disabled={busy !== null && busy !== 'stop'}
              onClick={() => run('stop', () => invoke('job:stop', { jobId: row.id }))}
            >
              <Icon name="Stop" size={16} />
              {t('cards.checklist.stop_button')}
            </CardButton>
          </div>
        )}
        <span className={styles.spacer} />
        {live && <span className={styles.footText}>{footText}</span>}
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );
}
