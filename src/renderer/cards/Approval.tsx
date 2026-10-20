// Spec: 05-2 §5.5 Approval card: §5.5.1 anatomy (header icon per kind + title + countdown; impact built only from structured
// fields; risk lines; payload quote for sends with "Show all"; booking rows; scope control only when allowed; [ Primary ]
// [ Change ] [ Not now ]; hard-limit line "I'll always ask for this one."; footer expiry + promise), §5.5.2 kinds (icon,
// primary, expiry; deadline-reminder variant [ Keep it ] [ Cancel booking ]), §5.5.3 scope, §5.5.4 states (Submitting
// "Checking…", HELD strip and two value buttons, APPROVED/RUNNING "Approved by you at {time}. Doing it now…", COMPLETED,
// DECLINED, EXPIRED + "Ask me again", SUPERSEDED, WITHDRAWN, FAILED + "Try again", CHECKING, Offline), §5.5.5 (Ctrl+Enter
// does nothing, Approve has no shortcut; card label "Approval needed: {title}"; Primary label "{Primary} to {object}"),
// §5.5.4 read-only in history (the folded row toggles the card as approved plus "Approved by you at {time} · {scope}"),
// 05-1 §0.5 status edges and summary row, §0.6 (Esc never declines; the Primary is never focused automatically), 09 §9.17.4, X-01, X-03,
// X-04. CR-0009 G-M5-14 (Change focuses the composer; the typed text steers). Card words come from the card's fields and
// copy keys, never AI free text. M5 T14: CHECKING → FAILED ("I can't tell if {site} did it…" + [ It went through ]
// [ It didn't ], no Try again; a tap collapses it to "You said…", the card staying FAILED; G-M5-39, G-M5-32 (b)).
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { t } from '../../shared/copy/t';
import { formatDate, formatInr, formatTime } from '../../shared/format';
import { TID } from '../../shared/testids';
import type { ApprovalFields, ApprovalPayload, ApprovalScope, ApprovalState, CardRow, PermissionApp } from '../../shared/types';
import { invoke } from '../ipc/client';
import { useStore } from '../store/index';
import { selectConnection } from '../store/live';
import { Icon, type IconName } from '../ui/Icon';
import { CardButton } from './CardButton';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import { Countdown } from './parts/Countdown';
import { HeldStrip } from './parts/HeldStrip';
import { SCOPE_LABEL, ScopeControl } from './parts/ScopeControl';
import { useSummaryToggle } from './parts/useSummaryToggle';
import { useCardAction } from './useCardAction';
import styles from './Approval.module.css';

/** 05-1 §0.5 status edge per approval state (gated pending, held / checking, failed). */
const APPROVAL_EDGE: Partial<Record<ApprovalState, 'accent' | 'warn' | 'bad'>> = {
  PENDING: 'accent',
  HELD: 'warn',
  CHECKING: 'warn',
  FAILED: 'bad',
};
/** 05-1 §0.5 Declined / Expired / Superseded / Withdrawn: the muted look. */
const MUTED: ReadonlySet<string> = new Set(['DECLINED', 'EXPIRED', 'SUPERSEDED', 'WITHDRAWN']);
/** 05-2 §5.5.4: the folded states whose summary expands to the card as approved plus the decision line. */
const DECIDED: ReadonlySet<string> = new Set(['APPROVED', 'RUNNING', 'COMPLETED']);

const APP_NAME: Record<PermissionApp, () => string> = {
  gmail: () => t('cards.approval.app.gmail'),
  calendar: () => t('cards.approval.app.calendar'),
  contacts: () => t('cards.approval.app.contacts'),
  whatsapp: () => t('cards.approval.app.whatsapp'),
  browser: () => t('cards.approval.app.browser'),
  outlook: () => t('cards.approval.app.outlook'),
};

type Kind = 'send_email' | 'send_whatsapp' | 'book' | 'cancel_booking' | 'delete' | 'share' | 'switch' | 'use_app' | 'calendar_add';

/** 05-2 §5.5.2: the kind row a card's fields pick (cancelling a booking is `delete` with cancel terms, X-55). */
export function approvalKind(f: ApprovalFields): Kind {
  switch (f.verb) {
    case 'send':
      return f.channel === 'whatsapp' ? 'send_whatsapp' : 'send_email';
    case 'book':
      return 'book';
    case 'delete':
      return f.cancelTerms ? 'cancel_booking' : 'delete';
    case 'share':
      return 'share';
    case 'use_app':
      return 'use_app';
    case 'calendar_write':
      return 'calendar_add';
    default:
      return 'switch';
  }
}

const KIND_ICON: Record<Kind, IconName> = {
  send_email: 'Mail',
  send_whatsapp: 'Send',
  book: 'Calendar',
  cancel_booking: 'Calendar',
  delete: 'Delete',
  share: 'PersonCircle',
  switch: 'Globe',
  use_app: 'PlugConnected',
  calendar_add: 'Calendar',
};

const bookThing = (f: ApprovalFields): 'table' | 'slot' | 'stay' => (f.item === 'slot' || f.item === 'stay' ? f.item : 'table');

/** 05-2 §5.5.2 Primary label per kind (the Destructive look of delete / cancel is M10's button set; here the words). */
function primaryLabel(k: Kind, f: ApprovalFields): string {
  switch (k) {
    case 'send_email':
    case 'switch':
      return t('cards.approval.send_email.primary');
    case 'send_whatsapp':
      return t('cards.approval.send_whatsapp.primary');
    case 'book':
      return bookThing(f) === 'slot'
        ? t('cards.approval.book.primary.slot')
        : bookThing(f) === 'stay'
          ? t('cards.approval.book.primary.stay')
          : t('cards.approval.book.primary.table');
    case 'cancel_booking':
      return t('cards.approval.cancel_booking.primary');
    case 'delete':
      return t('cards.approval.delete.primary', { items: f.item ?? '' });
    case 'share':
      return t('cards.approval.share.primary', { short: f.personalShared?.[0] ?? '' });
    case 'use_app':
      return t('cards.approval.use_app.primary', { app: f.app ? APP_NAME[f.app]() : '' });
    case 'calendar_add':
      return t('cards.approval.calendar_add.button.approve');
  }
}

/** The past-tense word of the folded lines ("Nothing was {sent | booked | deleted | shared}"). */
type Done = 'sent' | 'booked' | 'deleted' | 'shared' | 'allowed';
const DONE: Record<Kind, Done> = {
  send_email: 'sent',
  send_whatsapp: 'sent',
  switch: 'sent',
  book: 'booked',
  cancel_booking: 'deleted',
  delete: 'deleted',
  share: 'shared',
  use_app: 'allowed',
  calendar_add: 'allowed',
};

function completedLine(d: Done, time: string): string {
  if (d === 'sent') return t('cards.approval.body.completed.sent', { time });
  if (d === 'booked') return t('cards.approval.body.completed.booked', { time });
  if (d === 'deleted') return t('cards.approval.body.completed.deleted', { time });
  if (d === 'shared') return t('cards.approval.body.completed.shared', { time });
  return t('cards.approval.body.completed.allowed', { time });
}
function declinedLine(d: Done): string {
  if (d === 'booked') return t('cards.approval.body.declined.booked');
  if (d === 'deleted') return t('cards.approval.body.declined.deleted');
  if (d === 'shared' || d === 'allowed') return t('cards.approval.body.declined.shared');
  return t('cards.approval.body.declined.sent');
}
/** 05-2 §5.5.4 EXPIRED names only sent | booked. */
const expiredLine = (k: Kind, time: string) =>
  k === 'book' || k === 'calendar_add'
    ? t('cards.approval.body.expired.booked', { time })
    : t('cards.approval.body.expired.sent', { time });
const failedLine = (k: Kind, site: string) =>
  k === 'book' ? t('cards.approval.body.failed.booked', { site }) : t('cards.approval.body.failed.sent', { site });
function supersededLine(s: ApprovalPayload['superseded']): string {
  if (s === 'price') return t('cards.approval.body.superseded.price');
  if (s === 'time') return t('cards.approval.body.superseded.time');
  if (s === 'recipient') return t('cards.approval.body.superseded.recipient');
  if (s === 'fee') return t('cards.approval.body.superseded.fee');
  return t('cards.approval.line.superseded_steer');
}

/** Who or what the action is for, for the Primary's Narrator label (05-2 §5.5.5 "Send email to Priya Nair"). */
const objectOf = (f: ApprovalFields) => f.recipients?.[0]?.name ?? f.payee ?? f.item ?? f.siteDomain ?? '';

/** 05-2 §5.5.1 payload quote: at most 6 lines, then the Link button "Show all" (shown only when the text is cut). */
function Quote({ text }: { text: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [cut, setCut] = useState(false);
  const [showAll, setShowAll] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (el) setCut(el.scrollHeight > el.clientHeight + 1);
  }, [text]);
  return (
    <div className={styles.quote} data-testid={TID.cardApprovalQuote}>
      <div ref={box} className={styles.quoteText} data-expanded={showAll || undefined} data-copy="external">
        {text}
      </div>
      {cut && !showAll && (
        <span className={styles.showAll}>
          <CardButton tid="cardApprovalShowAll" kind="link" onClick={() => setShowAll(true)}>
            {t('cards.approval.show_all')}
          </CardButton>
        </span>
      )}
    </div>
  );
}

/** The deadline-reminder buttons until T7 wires them (they render disabled). */
const noop = () => undefined;

/** 09 §9.17.4: Ctrl+Enter inside an Approval card does nothing (and goes no further). */
const swallowCtrlEnter = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();
  }
};

export function Approval({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as ApprovalPayload;
  const expiresAt = p.expiresAt ?? card.expiresAt ?? 0;
  const f = p.fields ?? ({ verb: p.verb, irreversible: true } as ApprovalFields);
  const state = card.state as ApprovalState;
  const offline = useStore(selectConnection) === 'offline';
  const [scope, setScope] = useState<ApprovalScope>('once');
  const { busy, run } = useCardAction<'approve' | 'decline' | 'held' | 'again' | 'retry' | 'report'>();
  const kind = approvalKind(f);
  const tz = time.timeZone;
  const at = (ms: number) => formatDate(ms, 'full', { timeZone: tz, now: time.now });
  const tap = { cardId: card.id, nonce: card.nonce, resolvedBy: 'tap' as const };
  const label = t('cards.approval.label', { title: p.title });
  const frame = { tid: 'cardApproval' as const, card, state, label, onKeyDown: swallowCtrlEnter };
  const folded = useSummaryToggle();

  const quote = kind === 'send_email' || kind === 'send_whatsapp' ? f.contentSummary : undefined;
  const risks = [
    ...(kind === 'send_email' && f.personalShared?.includes('address') ? [t('cards.approval.risk.home_address')] : []),
    ...(kind === 'send_email' && f.amountPaise ? [t('cards.approval.risk.agrees_to_pay', { amount: formatInr(f.amountPaise) })] : []),
  ];
  const free = f.cancelTerms?.freeUntil;
  const rows =
    kind === 'book'
      ? [
          { label: t('cards.approval.book.row.charged_now'), value: formatInr(f.amountPaise ?? 0) },
          ...(f.cancelTerms?.feePaise !== undefined
            ? [{ label: t('cards.approval.book.row.no_show_fee'), value: formatInr(f.cancelTerms.feePaise) }]
            : []),
        ]
      : [];
  // The card's read-only body: the live card shows it above its buttons, a folded card's expanded view above its decision line.
  const details = (
    <>
      <div className={styles.impact} data-testid={TID.cardApprovalImpact} data-copy="external">
        {p.impact}
      </div>
      {risks.map((r, i) => (
        <div key={i} className={styles.risk} data-testid={TID.cardApprovalRisk} data-index={i}>
          <Icon name="Warning" size={16} className={styles.warnIcon} />
          {r}
        </div>
      ))}
      {quote && <Quote text={quote} />}
      {rows.length > 0 && (
        <dl className={styles.rows}>
          {rows.map((r) => (
            <div key={r.label} className={styles.row}>
              <dt>{r.label}</dt>
              <dd className={styles.money}>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {kind === 'book' && free !== undefined && (
        <div className={styles.small}>{t('cards.approval.book.row.free_cancel_until', { time: at(free) })}</div>
      )}
    </>
  );

  const resolvedAt = card.resolvedAt ?? card.updatedAt;
  // 05-2 §5.5.4 read-only in history: the expanded view shows the card as approved plus "Approved by you at {time} · {scope}".
  const answer = card.answer as { optionId?: string; scope?: ApprovalScope } | null;
  // Only a card the user approved and that has not failed gets the toggle: a FAILED summary keeps its own buttons.
  const decision =
    DECIDED.has(state) &&
    // A HELD card's "action" pick (SM-A4) is the user approving the action's terms once.
    (answer?.optionId === 'approve' || answer?.optionId === 'action')
      ? t('cards.approval.decision_line', {
          time: formatTime(resolvedAt, { timeZone: tz }),
          scope: SCOPE_LABEL[answer.scope ?? 'once'](),
        })
      : null;
  const summary = (icon: IconName, iconClass: string | undefined, text: string, extra?: ReactNode) => (
    <CardFrame
      {...frame}
      muted={MUTED.has(state)}
      edge={APPROVAL_EDGE[state]}
      data={decision ? { 'data-expanded': folded.open ? 'true' : undefined } : undefined}
    >
      <div className={styles.head}>
        <Icon name={KIND_ICON[kind]} size={20} className={styles.headIcon} />
        <span className={styles.title} data-copy="external">
          {p.title}
        </span>
      </div>
      <div className={styles.summary} {...folded.rowProps(decision !== null)}>
        <Icon name={icon} size={16} className={iconClass} />
        <span className={styles.summaryText}>{text}</span>
        {extra}
        <CardTimeLabel {...time} />
      </div>
      {decision !== null && folded.open && (
        <>
          {details}
          <div className={styles.decisionLine}>{decision}</div>
        </>
      )}
    </CardFrame>
  );

  // M5 T14 (05-2 §5.5.4 CHECKING → FAILED): foo can't tell, so it never says "Nothing was booked." and never offers Try again.
  const unknownResult = (phone: string | undefined, unconfirmed = false) => {
    const said = (card.answer as { optionId?: unknown } | null)?.optionId;
    if (said === 'went_through') return summary('ErrorCircle', styles.badIcon, t('cards.approval.body.said_went_through'));
    if (said === 'did_not') return summary('ErrorCircle', styles.badIcon, t('cards.approval.body.said_did_not'));
    const site = f.siteDomain ?? f.payee ?? '';
    const report = (outcome: 'went_through' | 'did_not') =>
      run('report', () => invoke('approval:report', { cardId: card.id, nonce: card.nonce, outcome, resolvedBy: 'tap' }));
    return (
      <CardFrame {...frame} edge="bad" busy={busy !== null}>
        <div className={styles.head}>
          <Icon name={KIND_ICON[kind]} size={20} className={styles.headIcon} />
          <span className={styles.title} data-copy="external">
            {p.title}
          </span>
        </div>
        <div className={styles.impact}>
          {/* G-M5-32 (b): with no verified phone the call clause is left out with its words. */}
          {/* M9 T8 (G-M9-07): a booking its site's history page never showed. */}
          {unconfirmed
            ? t('cards.approval.failed.unconfirmed', { site })
            : phone
              ? t('cards.approval.body.checking_failed', { site, phone })
              : t('cards.approval.body.checking_failed_no_phone', { site })}
        </div>
        <div className={styles.buttons}>
          <CardButton
            tid="cardApprovalWentThrough"
            kind="secondary"
            busy={busy === 'report'}
            disabled={busy !== null}
            onClick={() => report('went_through')}
          >
            {t('cards.approval.button.went_through')}
          </CardButton>
          <CardButton tid="cardApprovalDidNot" kind="secondary" disabled={busy !== null} onClick={() => report('did_not')}>
            {t('cards.approval.button.did_not')}
          </CardButton>
        </div>
        <div className={styles.footRow}>
          <span className={styles.spacer} />
          <CardTimeLabel {...time} />
        </div>
      </CardFrame>
    );
  };

  switch (state) {
    case 'APPROVED':
    case 'RUNNING':
      return summary('ArrowSync', styles.dimIcon, t('cards.approval.body.running', { time: at(resolvedAt) }));
    case 'COMPLETED':
      return summary('CheckmarkCircle', styles.okIcon, completedLine(DONE[kind], at(card.updatedAt)));
    case 'DECLINED':
      return summary('Dismiss', styles.dimIcon, declinedLine(DONE[kind]));
    case 'EXPIRED':
      return p.variant === 'deadline_reminder'
        ? summary('Clock', styles.dimIcon, t('cards.approval.deadline_reminder.expired', { time: at(expiresAt) }))
        : summary(
            'Clock',
            styles.dimIcon,
            expiredLine(kind, at(expiresAt)),
            <CardButton
              tid="cardApprovalAskAgain"
              kind="link"
              busy={busy === 'again'}
              onClick={() => run('again', () => invoke('card:askAgain', { cardId: card.id }))}
            >
              {t('cards.approval.button.ask_again')}
            </CardButton>,
          );
    case 'SUPERSEDED':
      return summary('Dismiss', styles.dimIcon, supersededLine(p.superseded));
    case 'WITHDRAWN':
      return summary('Dismiss', styles.dimIcon, t('cards.common.withdrawn'));
    case 'FAILED':
      if (p.unknownResult) return unknownResult(p.unknownResult.phone, p.unknownResult.unconfirmed === true);
      return summary(
        'ErrorCircle',
        styles.badIcon,
        failedLine(kind, f.siteDomain ?? f.payee ?? ''),
        card.jobId ? (
          <CardButton
            tid="cardApprovalTryAgain"
            kind="link"
            busy={busy === 'retry'}
            onClick={() => run('retry', () => invoke('job:retry', { jobId: card.jobId! }))}
          >
            {t('cards.approval.button.try_again')}
          </CardButton>
        ) : undefined,
      );
    case 'CHECKING':
      return (
        <CardFrame {...frame} edge="warn">
          <div className={styles.head}>
            <Icon name="Clock" size={16} className={styles.warnIcon} />
            <span className={styles.title} data-copy="external">
              {p.title}
            </span>
          </div>
          <HeldStrip word={t('cards.common.held_word')}>{t('cards.approval.body.checking')}</HeldStrip>
          <div className={styles.footRow}>
            <span className={styles.spacer} />
            <CardTimeLabel {...time} />
          </div>
        </CardFrame>
      );
    default:
      break;
  }

  // PENDING and HELD: the full card.
  const held = state === 'HELD' ? p.held : undefined;
  const reminder = p.variant === 'deadline_reminder';
  const primary = primaryLabel(kind, f);
  const canApprove = !offline && busy === null;
  const approve = () => run('approve', () => invoke('card:approve', { ...tap, scope }));
  const decline = () => run('decline', () => invoke('card:decline', tap));
  const pick = (optionId: 'own' | 'action') => run('held', () => invoke('card:heldPick', { ...tap, optionId }));
  const change = () => document.querySelector<HTMLElement>(`[data-testid="${TID.composerField}"]`)?.focus();
  const footer =
    kind === 'book' ? t('cards.approval.footer.book', { time: at(expiresAt) }) : t('cards.approval.footer.do', { time: at(expiresAt) });

  return (
    <CardFrame
      {...frame}
      // §5.5.5: impact line + extra risk lines + "Expires {absolute time}".
      description={[p.impact, ...risks, t('cards.approval.expires', { time: at(expiresAt) })].filter(Boolean).join(' ')}
      edge={APPROVAL_EDGE[state]}
      busy={busy !== null}
    >
      <div className={styles.head}>
        <Icon name={KIND_ICON[kind]} size={20} className={styles.headIcon} />
        <span className={styles.title} data-copy="external">
          {p.title}
        </span>
        <Countdown expiresAt={expiresAt} timeZone={tz} />
      </div>
      {details}
      {held ? (
        <>
          <HeldStrip word={t('cards.common.held_word')}>
            {held.reason === 'mismatch'
              ? t('cards.approval.held.mismatch', { userSaid: held.userSaid ?? '', actionHas: held.actionHas ?? '' })
              : held.reason === 'cannot_check'
                ? t('cards.approval.held.cannot_check', { verbing: held.verbing ?? '' })
                : t('cards.approval.held.no_user_words')}
          </HeldStrip>
          {held.reason === 'mismatch' && (
            <div className={styles.buttons}>
              {(['own', 'action'] as const).map((o, i) => (
                <CardButton
                  key={o}
                  tid="cardApprovalHeldOption"
                  index={i}
                  kind="secondary"
                  disabled={busy !== null}
                  onClick={() => pick(o)}
                >
                  {o === 'own' ? held.userSaid : held.actionHas}
                </CardButton>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {(p.scopes ?? []).length > 1 && <ScopeControl scopes={p.scopes} value={scope} onChange={setScope} verbPhrase={objectOf(f)} />}
          <div className={styles.buttons}>
            {reminder ? (
              <>
                {/* 05-2 §5.5.2: Keep it → COMPLETED "Kept."; Cancel booking → a new cancel card + SUPERSEDED. Neither is
                    card:approve / card:decline, so both stay disabled until T7 lands their main side. */}
                <CardButton tid="cardApprovalKeep" kind="primary" disabled onClick={noop}>
                  {t('cards.approval.button.keep')}
                </CardButton>
                <CardButton tid="cardApprovalCancelBooking" kind="secondary" disabled onClick={noop}>
                  {t('cards.approval.button.cancel_booking')}
                </CardButton>
              </>
            ) : (
              <>
                <CardButton
                  tid="cardApprovalApprove"
                  kind="primary"
                  busy={busy === 'approve'}
                  busyLabel={t('cards.approval.submitting')}
                  disabled={!canApprove}
                  label={t('cards.approval.primary_label', { primary, object: objectOf(f) })}
                  onClick={approve}
                >
                  {primary}
                </CardButton>
                {(kind === 'send_email' || kind === 'send_whatsapp' || kind === 'book') && (
                  <CardButton tid="cardApprovalChange" kind="secondary" disabled={busy !== null} onClick={change}>
                    {t('cards.approval.button.change')}
                  </CardButton>
                )}
                <CardButton tid="cardApprovalNotNow" kind="secondary" disabled={busy !== null} busy={busy === 'decline'} onClick={decline}>
                  {t('cards.approval.button.not_now')}
                </CardButton>
              </>
            )}
          </div>
          {offline && (
            <div className={styles.reason}>
              <Icon name="Globe" size={16} className={styles.dimIcon} />
              {t('cards.approval.body.offline')}
            </div>
          )}
        </>
      )}
      {p.hardLimit && !reminder && <div className={styles.hardLine}>{t('cards.approval.hard_limit_line')}</div>}
      <div className={styles.footRow}>
        <span className={styles.footer} data-testid={TID.cardApprovalFooter}>
          {footer}
        </span>
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );
}
