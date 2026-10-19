// Spec: 05-1 §5.3 Choice card: §5.3.1 anatomy (`--card-w`; rows: one button each, min 56, padding 8 12, `--r-md`, 1px
// `--line`, `--bg-raised`, 8 apart; number badge 20 `--r-xs` `--bg-sunken` `--t-caption` `--fg-2`; label `--t-body`, detail
// `--t-small` `--fg-2` one line with the full text in the tooltip; Best fit row 1.5px `--accent` on `--accent-soft` with the
// right-aligned "Best fit" tag; "Something else…" 40 high `--fg-2`, no badge; Skip a Link button; multi-select checkboxes
// (20, `--r-xs`, 1.5px `--line-input`; ticked `--accent` + Checkmark 16 `--on-accent`) and a Primary "Done" disabled until a
// row is ticked; stepper pager "{k} of {n}", a tap advances after `--m-card` with no Next button, "Back" from question 2),
// §5.3.2 copy, §5.3.3 states (hover, pressed 0.97, focus ring, Submitting: the tapped row's badge becomes the spinner and the
// other rows are disabled; answered / auto-picked / cancelled / superseded / withdrawn summary rows; offline keeps rows
// enabled with the offline line), §5.3.4 (Art. 6: a tap, a typed answer or a reaction answer it), §5.3.5 (radiogroup or a
// group of checkboxes; ↑/↓ move, 1–4 pick, Enter picks, Ctrl+Enter = Done; Narrator "Question: {question}", rows "{n} of
// {total}, {label}, {detail}{, best fit}", answered "You chose {answer}."), §5.3 purposes (file_in / photo_notice: no Best fit,
// no Skip; photo_notice has no "Something else…" row), 05-1 §0.5 (summary row: 16 icon + 8 + `--t-small` + time; click or
// Enter toggles the read-only expanded view with the chosen row ticked), X-155, CR-0009 G-M5-17 (`--m-card`).
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { CardRow } from '../../shared/types';
import { invoke } from '../ipc/client';
import { setComposerHint, useStore } from '../store/index';
import { selectConnection } from '../store/live';
import { Icon } from '../ui/Icon';
import { Spinner } from '../ui/Spinner';
import { Tooltip } from '../ui/Tooltip';
import { cx } from '../ui/cx';
import { CardButton } from './CardButton';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import { answerLines, chosenIds, questionsOf, type ChoiceQuestion, type ChoiceView } from './choiceText';
import styles from './Card.module.css';
import cs from './Choice.module.css';

const FOLDED = new Set(['answered', 'auto_picked', 'skipped', 'expired', 'superseded', 'withdrawn']);
const MUTED = new Set(['expired', 'superseded', 'withdrawn']);

export const hasBestFit = (p: ChoiceView) => p.purpose !== 'file_in' && p.purpose !== 'photo_notice';
export const showsSkip = hasBestFit;
export const showsSomethingElse = (p: ChoiceView) => p.purpose !== 'photo_notice';

/** `--m-card` in ms, read from the theme (Basic motion and reduced motion shorten it). */
function cardMs(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--m-card').trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? (v.endsWith('ms') ? n : n * 1000) : 167;
}

/** The answering logic Choice and tiles share: picks per question, the stepper, one invoke per answer. */
export function useChoice(card: CardRow) {
  const p = card.payload as unknown as ChoiceView;
  const qs = questionsOf(p);
  const [k, setK] = useState(0);
  const [picks, setPicks] = useState<string[][]>(() => qs.map(() => []));
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => void (timer.current !== null && window.clearTimeout(timer.current)), []);
  const q = qs[k]!;

  const send = (answer: { optionId: string } | { optionIds: string[] } | { skip: true }, by: 'tap' | 'keyboard', busyKey: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(busyKey);
    void invoke('card:answer', { cardId: card.id, nonce: card.nonce, answer, resolvedBy: by })
      .catch(() => undefined)
      .finally(() => {
        inFlight.current = false;
        setBusy(null);
      });
  };

  /** A tap (or 1–4) on a row: multi toggles; a single answers, or on a stepper selects and advances after `--m-card`. */
  const pick = (id: string, by: 'tap' | 'keyboard') => {
    if (inFlight.current || timer.current !== null) return;
    if (q.multi) {
      setPicks((all) => all.map((row, i) => (i === k ? (row.includes(id) ? row.filter((x) => x !== id) : [...row, id]) : row)));
      return;
    }
    if (qs.length === 1) return send({ optionId: id }, by, id);
    const next = picks.map((row, i) => (i === k ? [id] : row));
    setPicks(next);
    if (k === qs.length - 1) return send({ optionIds: next.map((row) => row[0]!) }, by, id);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setK((x) => x + 1);
    }, cardMs());
  };
  const done = (by: 'tap' | 'keyboard') => {
    const ids = picks[k] ?? [];
    if (ids.length) send({ optionIds: q.options.filter((o) => ids.includes(o.id)).map((o) => o.id) }, by, 'done');
  };
  const skip = () => send({ skip: true }, 'tap', 'skip');
  const backStep = () => {
    if (timer.current !== null || inFlight.current) return;
    setK((x) => Math.max(0, x - 1));
  };
  const somethingElse = () => {
    setComposerHint({ chatId: card.chatId, text: t('cards.choice.something_else_placeholder') });
    document.querySelector<HTMLElement>(`[data-testid="${TID.composerField}"]`)?.focus();
  };
  return { p, qs, k, q, picks: picks[k] ?? [], busy, pick, done, skip, backStep, somethingElse };
}

/** 05-1 §5.3.5 / §5.4.4 keys inside the card: 1–4 pick, arrows move between options, Ctrl+Enter = Done (multi). */
export function choiceKeys(c: ReturnType<typeof useChoice>, optionSelector: string, horizontal = false) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.metaKey) return;
    if (e.ctrlKey) {
      if (e.key === 'Enter' && c.q.multi) {
        e.preventDefault();
        c.done('keyboard');
      }
      return;
    }
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= c.q.options.length && e.key.length === 1) {
      e.preventDefault();
      c.pick(c.q.options[n - 1]!.id, 'keyboard');
      return;
    }
    const step =
      e.key === 'ArrowDown' || (horizontal && e.key === 'ArrowRight')
        ? 1
        : e.key === 'ArrowUp' || (horizontal && e.key === 'ArrowLeft')
          ? -1
          : 0;
    if (!step) return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>(optionSelector)];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    rows[Math.min(rows.length - 1, Math.max(0, at + step))]?.focus();
  };
}

/** A click from the keyboard (Enter / Space on a focused row) has no pointer. */
export const byOf = (e: MouseEvent) => (e.detail === 0 ? 'keyboard' : 'tap');

/** 05-1 §0.5 summary row for a folded Choice or tiles card, with the read-only expanded view on click or Enter. */
export function ChoiceSummary({
  card,
  time,
  tid,
  wide,
  thumb,
  expanded,
}: {
  card: CardRow;
  time: CardTime;
  tid: 'cardChoice' | 'cardTiles';
  wide?: boolean;
  /** §5.4.3 tiles: the chosen photo's 40 × 40 thumb before the text. */
  thumb?: ReactNode;
  /** The read-only card as it was asked, the chosen row ticked. */
  expanded: ReactNode;
}) {
  const p = card.payload as unknown as ChoiceView;
  const [open, setOpen] = useState(false);
  const cards = useStore((s) => s.cards.byId);
  const newer = Object.values(cards).find((c) => c.supersedesId === card.id && c.deletedAt === null);
  const lines = answerLines(p, card.answer);
  const s = card.state;
  const text =
    s === 'skipped'
      ? [t('cards.choice.summary.skipped', { option: p.options[0]?.label ?? '' })]
      : s === 'expired'
        ? [t('cards.choice.summary.expired', { question: p.question })]
        : s === 'withdrawn'
          ? [t('cards.common.content.withdrawn')]
          : s === 'superseded'
            ? [newer ? t('cards.choice.summary.superseded') : t('cards.choice.collapsed.superseded_steer', { question: p.question })]
            : lines.map((l) => t('cards.choice.summary.answered', { question: l.question, answer: l.answer }));
  const icon = s === 'answered' || s === 'skipped' ? 'CheckmarkCircle' : s === 'auto_picked' || s === 'expired' ? 'Clock' : null;
  const answered = s === 'answered' || s === 'auto_picked' || s === 'skipped';
  const label = answered
    ? t('cards.choice.answered', { answer: lines.map((l) => l.answer).join(', ') })
    : t(
        tid === 'cardTiles' ? 'cards.tiles.label' : 'cards.choice.label',
        tid === 'cardTiles' ? { title: p.question } : { question: p.question },
      );
  const toggle = () => setOpen((o) => !o);
  const seeNew = () => {
    const el = newer && document.querySelector<HTMLElement>(`[data-card-id="${newer.id}"]`);
    el?.scrollIntoView({ block: 'center' });
    el?.querySelector<HTMLElement>('button')?.focus();
  };
  return (
    <CardFrame
      tid={tid}
      card={card}
      state={s}
      wide={wide}
      muted={MUTED.has(s)}
      label={label}
      data={{ 'data-purpose': p.purpose, 'data-expanded': open ? 'true' : undefined }}
    >
      <div
        className={cs.summary}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
      >
        {icon && <Icon name={icon} size={16} className={s === 'answered' || s === 'skipped' ? cs.ok : cs.dim} />}
        {thumb}
        <span className={cs.summaryText}>
          {text.map((line, i) => (
            <span key={i} className={cs.summaryLine} data-copy="external">
              {line}
            </span>
          ))}
        </span>
        <CardTimeLabel {...time} />
      </div>
      {s === 'superseded' && newer && (
        <div className={styles.foot}>
          <button type="button" className={styles.link} onClick={seeNew}>
            {t('cards.common.see_new_card')}
          </button>
        </div>
      )}
      {open && expanded}
    </CardFrame>
  );
}

function OptionRow({
  q,
  index,
  bestFit,
  multi,
  checked,
  busy,
  disabled,
  onPick,
}: {
  q: ChoiceQuestion;
  index: number;
  bestFit: boolean;
  multi: boolean;
  checked: boolean;
  busy: boolean;
  disabled: boolean;
  onPick?: (e: MouseEvent) => void;
}) {
  const o = q.options[index]!;
  const label = t('cards.choice.option_label', {
    n: index + 1,
    total: q.options.length,
    label: o.label,
    detail: o.detail ?? '',
    bestFit: bestFit ? 'yes' : 'no',
  });
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={onPick ? undefined : -1}
      className={cx(cs.row, bestFit && cs.best, checked && cs.checked)}
      data-testid={TID.cardChoiceOption}
      data-index={index + 1}
      onClick={disabled || !onPick ? undefined : onPick}
    >
      {busy ? (
        <span className={cs.badge}>
          <Spinner size={16} />
        </span>
      ) : multi ? (
        <span className={cx(cs.box, checked && cs.boxOn)}>{checked && <Icon name="Checkmark" size={16} />}</span>
      ) : checked && !onPick ? (
        <span className={cs.badge}>
          <Icon name="CheckmarkCircle" size={16} className={cs.ok} />
        </span>
      ) : (
        <span className={cs.badge} aria-hidden="true">
          {index + 1}
        </span>
      )}
      <span className={cs.text}>
        <span className={cs.labelLine}>
          <span className={cs.label} data-copy="external">
            {o.label}
          </span>
          {bestFit && <span className={cs.tag}>{t('cards.choice.tag')}</span>}
        </span>
        {o.detail && (
          <Tooltip text={o.detail} className={cs.detailTip}>
            <span className={cs.detail} data-copy="external">
              {o.detail}
            </span>
          </Tooltip>
        )}
      </span>
    </button>
  );
}

/** The rows of one question, read-only (expanded history view) or live. */
function Rows({ c, live }: { c: ReturnType<typeof useChoice>; live: boolean }) {
  const { p, q, picks, busy } = c;
  return (
    <div className={cs.rows} role={q.multi ? 'group' : 'radiogroup'} aria-label={q.question}>
      {q.options.map((o, i) => (
        <OptionRow
          key={o.id}
          q={q}
          index={i}
          bestFit={i === 0 && hasBestFit(p)}
          multi={!!q.multi}
          checked={picks.includes(o.id)}
          busy={busy === o.id}
          disabled={busy !== null && busy !== o.id}
          onPick={live ? (e) => c.pick(o.id, byOf(e)) : undefined}
        />
      ))}
    </div>
  );
}

function ReadOnly({ card }: { card: CardRow }) {
  const p = card.payload as unknown as ChoiceView;
  const q = questionsOf(p)[0]!;
  const ids = chosenIds(card.answer);
  return (
    <div className={cs.rows} aria-label={q.question}>
      {q.options.map((o, i) => (
        <OptionRow
          key={o.id}
          q={q}
          index={i}
          bestFit={i === 0 && hasBestFit(p)}
          multi={!!q.multi}
          checked={ids.includes(o.id)}
          busy={false}
          disabled
        />
      ))}
    </div>
  );
}

export function Choice({ card, time }: { card: CardRow; time: CardTime }) {
  if (FOLDED.has(card.state)) return <ChoiceSummary card={card} time={time} tid="cardChoice" expanded={<ReadOnly card={card} />} />;
  return <AskingChoice card={card} time={time} />;
}

function AskingChoice({ card, time }: { card: CardRow; time: CardTime }) {
  const c = useChoice(card);
  const offline = useStore(selectConnection) === 'offline';
  const { p, qs, k, q, busy } = c;
  return (
    <CardFrame
      tid="cardChoice"
      card={card}
      state={card.state}
      data={{ 'data-purpose': p.purpose, 'data-step': qs.length > 1 ? String(k + 1) : undefined }}
      label={t('cards.choice.label', { question: q.question })}
      busy={busy !== null}
      onKeyDown={choiceKeys(c, `[data-testid="${TID.cardChoiceOption}"]`)}
    >
      <div className={styles.head}>
        <span className={styles.title} data-copy="external">
          {q.question}
        </span>
        {qs.length > 1 && (
          <span className={styles.right} data-testid={TID.cardChoicePager}>
            {t('cards.choice.pager', { k: k + 1, n: qs.length })}
          </span>
        )}
      </div>
      <Rows key={k} c={c} live />
      {showsSomethingElse(p) && (
        <button type="button" className={cx(cs.row, cs.else)} data-testid={TID.cardChoiceSomethingElse} onClick={c.somethingElse}>
          {t('cards.choice.something_else')}
        </button>
      )}
      {q.multi && (
        <div className={styles.buttons}>
          <CardButton
            tid="cardChoiceDone"
            kind="primary"
            busy={busy === 'done'}
            disabled={busy !== null || c.picks.length === 0}
            onClick={() => c.done('tap')}
          >
            {t('cards.choice.done')}
          </CardButton>
        </div>
      )}
      {offline && (
        <div className={cs.offline}>
          <Icon name="Globe" size={16} className={cs.dim} />
          {t('cards.common.offline_line')}
        </div>
      )}
      <div className={styles.foot}>
        <span className={styles.footSpacer} />
        {k > 0 && (
          <CardButton tid="cardChoiceBack" kind="link" disabled={busy !== null} onClick={c.backStep}>
            {t('cards.choice.back')}
          </CardButton>
        )}
        {showsSkip(p) && (
          <CardButton tid="cardChoiceSkip" kind="link" busy={busy === 'skip'} disabled={busy !== null} onClick={c.skip}>
            {t('cards.choice.skip')}
          </CardButton>
        )}
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );
}
