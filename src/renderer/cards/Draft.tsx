// Spec: 05-2 §5.7 Draft card (base, email): §5.7.1 anatomy (header Document 20 + "Draft · not sent" + right label "Email" /
// "Email · edited"; To and Subject rows; 1px rule; body pre-wrap, max 10 lines then "Show all"; Gmail signature --t-small
// --fg-2; the pending look of X-65: "Will send to {address} from your {Gmail}. Can't be unsent." and the footer "Expires
// {time} · If you don't answer, I won't send it."; no status edge), Change mode (body textarea auto-growing to 10 lines,
// Subject a Text field, To not editable; [ Save changes ] [ Cancel ]), §5.7.2 copy (Send → "Sending in {5}…" + Undo; Undo →
// "Not sent. The draft is still here."; Sent "✓ Sent · {time}" + the Sent-folder proof chip; Discarded; Expired + "Ask me
// again"; Superseded / Withdrawn; No send permission → "Open in Gmail"; Failed; Queued), §5.7.3 states (`cards.state`:
// pending, editing, undo_window, sending, sent, discarded, opened_in_app, queued_offline, failed, expired, superseded,
// withdrawn; read-only in history: the Sent row toggles the final sent text and "Sent by you at {time}"), §5.7.4 (Tab order Show all → Send → Change → Discard; Ctrl+Enter = Save changes in Change mode only, never
// sends; Esc cancels the edit; Undo is focused in the countdown; card label "Draft, not sent: {Email} to {name}"; Send
// label "Send email to {name}"), 05-1 §0.5 muted and failed looks, 09 §9.17.4. Email only in M5; the WhatsApp and X variants,
// the offline queue and real send errors arrive with M8 (review fix 5). Card words come from copy keys and the draft's own
// fields, never AI free text. M5 T14: HELD (second look, Art. 10; a look of `pending`): the Held strip "Before I send this,
// one check: you said {Monday}, the draft says {Tuesday 20 Oct}. Which one?" and one Secondary button per value in place
// of Send / Change / Discard (cannot_check / no_user_words: the strip alone, 08-4 §28.6).
// M8 T6: 05-2 §5.7.2 Send to someone new ("Waiting for your OK below ›", the Link focuses the full Approval card), Offline at
// Send (the line + [ Yes, send when online ] [ No, keep the draft ]; Queued + Link "Cancel"), Failed [ Try again ] (a fresh
// Draft that needs its own Send), 08-3 §16.1.4 ("That didn't save. Try again." keeps Change mode), CR-0012 G-M8-04 (no send
// permission: Primary "Open in Gmail" and no "saved as a draft there" line; after it the card stays readable, muted, and Open
// in Gmail opens it again). The channel's words come from `channelWords` (T7 adds WhatsApp and X there).
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { t } from '../../shared/copy/t';
import { formatDate, formatTime } from '../../shared/format';
import { TID } from '../../shared/testids';
import type { CardRow, DraftPayload } from '../../shared/types';
import type { Result } from '../../shared/errors';
import { invoke } from '../ipc/client';
import { ProofChip } from '../messages/ProofChip';
import { clockNow } from '../store/apply';
import { Icon, type IconName } from '../ui/Icon';
import { CardButton } from './CardButton';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import { HeldStrip } from './parts/HeldStrip';
import { useSummaryToggle } from './parts/useSummaryToggle';
import { useCardAction } from './useCardAction';
import styles from './Draft.module.css';

/** 05-1 §0.5 Discarded / Expired / Superseded / Withdrawn / opened elsewhere: the muted look. */
const MUTED: ReadonlySet<string> = new Set(['discarded', 'expired', 'superseded', 'withdrawn', 'opened_in_app']);

/** 05-2 §5.7.2 / 08-0 §G.7: the local undo window after Send. */
const UNDO_MS = 5_000;

// M8 T6
/** The words that change with the draft's channel (05-2 §5.7.2 Right label, Buttons). Email only until T7. */
function channelWords(channel: DraftPayload['channel']): { label: string; primary: string; app: string } {
  switch (channel) {
    default:
      return { label: t('cards.draft.right_label.email'), primary: t('cards.draft.button.send_email'), app: t('cards.approval.app.gmail') };
  }
}

/** "Sending in {n}…": whole seconds left in the 5 s window, counting 5 → 1 (05-2 §5.7.2). */
export function undoSecondsLeft(undoUntil: number, now: number): number {
  return Math.max(0, Math.ceil((undoUntil - now) / 1_000));
}

/** 05-2 §5.7.1 body: at most 10 lines, then the Link button "Show all" (shown only when the text is cut). */
function Body({ text, signature }: { text: string; signature?: string | undefined }) {
  const box = useRef<HTMLDivElement>(null);
  const [cut, setCut] = useState(false);
  const [showAll, setShowAll] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (el) setCut(el.scrollHeight > el.clientHeight + 1);
  }, [text]);
  return (
    <>
      <div ref={box} className={styles.body} data-testid={TID.cardDraftBody} data-expanded={showAll || undefined} data-copy="external">
        {text}
      </div>
      {cut && !showAll && (
        <span className={styles.showAll}>
          <CardButton tid="cardDraftShowAll" kind="link" onClick={() => setShowAll(true)}>
            {t('cards.draft.show_all')}
          </CardButton>
        </span>
      )}
      {signature && (
        <div className={styles.signature} data-copy="external">
          {signature}
        </div>
      )}
    </>
  );
}

/**
 * The 5 s countdown line. It counts the window main opened (`undoUntil` − the Send time) from when this card first showed
 * it, so the words count 5 → 1 in step with the user even when the renderer's clock and main's differ (a test clock);
 * main alone decides when the window has closed.
 */
function UndoCountdown({ windowMs }: { windowMs: number }) {
  const [start] = useState(clockNow);
  const [now, setNow] = useState(start);
  useEffect(() => {
    const id = setInterval(() => setNow(clockNow()), 250);
    return () => clearInterval(id);
  }, []);
  const n = undoSecondsLeft(start + windowMs, now);
  return (
    <span className={styles.countdown} data-testid={TID.cardDraftCountdown} data-left={n}>
      {n > 0 ? t('cards.draft.line.undo_window', { n }) : t('cards.draft.sending')}
    </span>
  );
}

/** 09 §9.17.4: outside Change mode, Ctrl+Enter inside a Draft card does nothing (it never sends). */
const swallowCtrlEnter = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();
  }
};

export function Draft({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as DraftPayload;
  const tz = time.timeZone;
  const name = p.to?.name ?? '';
  const words = channelWords(p.channel);
  const channel = words.label;
  const { busy, run } = useCardAction<'send' | 'save' | 'discard' | 'undo' | 'open' | 'again' | 'held' | 'queue' | 'cancel'>();
  const [editing, setEditing] = useState(false);
  // M8 T6: what the last tap answered that only this card shows (05-2 §5.7.2 Offline at Send; a Change that didn't save).
  const [offline, setOffline] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [subject, setSubject] = useState(p.subject ?? '');
  const [body, setBody] = useState(p.body);
  // Change mode is the renderer's (no invoke opens it); a card that left `pending` is out of it.
  const state = editing && card.state === 'pending' ? 'editing' : card.state;
  const tap = { cardId: card.id, nonce: card.nonce, resolvedBy: 'tap' as const };
  const folded = useSummaryToggle();
  const at = (ms: number) => formatDate(ms, 'full', { timeZone: tz, now: time.now });

  // §5.7.4: in the countdown, Undo receives focus (it is the safe action).
  useEffect(() => {
    if (card.state !== 'undo_window') return;
    document.querySelector<HTMLElement>(`[data-card-id="${card.id}"] [data-testid="${TID.cardDraftUndo}"]`)?.focus();
  }, [card.state, card.id]);

  const head = (right?: ReactNode) => (
    <div className={styles.head}>
      <Icon name="Document" size={20} className={styles.headIcon} />
      <span className={styles.title}>{t('cards.draft.title')}</span>
      {right}
    </div>
  );
  const frame = {
    tid: 'cardDraft' as const,
    card,
    state,
    label: t('cards.draft.label', { channel, name }),
    // §5.7.4: "Subject {subject}. {first 200 characters of body}".
    description: t('cards.draft.description', { subject: p.subject ?? '', preview: p.body.slice(0, 200) }),
  };

  const summary = (icon: IconName, iconClass: string | undefined, text: string, extra?: ReactNode) => (
    <CardFrame {...frame} muted={MUTED.has(state)}>
      {head()}
      <div className={styles.summary}>
        <Icon name={icon} size={16} className={iconClass} />
        <span className={styles.summaryText}>{text}</span>
        {extra}
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );

  const rows = (
    <dl className={styles.rows}>
      <div className={styles.row}>
        <dt>{t('cards.draft.row_label.to')}</dt>
        <dd data-copy="external">{p.to ? `${p.to.name} <${p.to.address}>` : ''}</dd>
      </div>
      {p.subject !== undefined && (
        <div className={styles.row}>
          <dt>{t('cards.draft.row_label.subject')}</dt>
          {editing ? (
            <dd>
              <input
                className={styles.subjectField}
                data-testid={TID.cardDraftSubject}
                aria-label={t('cards.draft.row_label.subject')}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </dd>
          ) : (
            <dd data-testid={TID.cardDraftSubject} data-copy="external">
              {p.subject}
            </dd>
          )}
        </div>
      )}
    </dl>
  );

  switch (state) {
    case 'sent': {
      const sentAt = formatTime(p.sentAt ?? card.updatedAt, { timeZone: tz });
      return (
        <CardFrame {...frame} data={{ 'data-expanded': folded.open ? 'true' : undefined }}>
          {head()}
          <div className={styles.summary} {...folded.rowProps(true)}>
            <Icon name="CheckmarkCircle" size={16} className={styles.okIcon} />
            <span className={styles.sentText}>{t('cards.draft.summary.sent', { time: sentAt })}</span>
            <CardTimeLabel {...time} />
          </div>
          {p.sentMessageId && <ProofChip proof={{ kind: 'sent_folder', connectionId: '', messageId: p.sentMessageId }} />}
          {/* 05-2 §5.7.3 read-only in history: the final sent text and "Sent by you at {time}". */}
          {folded.open && (
            <>
              {rows}
              <hr className={styles.rule} />
              <Body text={p.body} signature={p.signature} />
              <div className={styles.decisionLine}>{t('cards.draft.decision_line', { time: sentAt })}</div>
            </>
          )}
        </CardFrame>
      );
    }
    case 'discarded':
      return summary('Dismiss', styles.dimIcon, t('cards.draft.summary.discarded'));
    case 'expired':
      return summary(
        'Clock',
        styles.dimIcon,
        t('cards.draft.summary.expired', { time: at(card.expiresAt ?? card.updatedAt) }),
        <CardButton
          tid="cardDraftAskAgain"
          kind="link"
          busy={busy === 'again'}
          onClick={() => run('again', () => invoke('card:askAgain', { cardId: card.id }))}
        >
          {t('cards.draft.button.ask_again')}
        </CardButton>,
      );
    case 'superseded':
      return summary('Dismiss', styles.dimIcon, t('cards.common.superseded'));
    case 'withdrawn':
      return summary('Dismiss', styles.dimIcon, t('cards.common.withdrawn'));
    case 'queued_offline':
      return summary(
        'CloudOff',
        styles.dimIcon,
        t('cards.draft.summary.queued'),
        <CardButton
          tid="cardDraftCancelQueued"
          kind="link"
          busy={busy === 'cancel'}
          disabled={busy !== null}
          onClick={() => run('cancel', () => invoke('draft:undo', { approvalId: p.approvalId }))}
        >
          {t('cards.draft.button.cancel_queued')}
        </CardButton>,
      );
    default:
      break;
  }

  const rightLabel = <span className={styles.right}>{p.edited ? t('cards.draft.right_label.edited', { channel }) : channel}</span>;
  const footer = (
    <div className={styles.footRow}>
      <span className={styles.footer}>{t('cards.draft.footer', { time: at(card.expiresAt ?? card.updatedAt) })}</span>
      <CardTimeLabel {...time} />
    </div>
  );

  // Change mode (X-79): Save changes / Cancel; Ctrl+Enter saves, Esc cancels; To stays as it is.
  if (state === 'editing') {
    const save = () =>
      run('save', () =>
        invoke('draft:update', {
          cardId: card.id,
          nonce: card.nonce,
          fields: { ...(p.subject !== undefined ? { subject } : {}), body },
        }).then((r) => {
          setSaveFailed(!r.ok);
          if (r.ok) setEditing(false);
          return r;
        }),
      );
    const cancel = () => {
      setSubject(p.subject ?? '');
      setBody(p.body);
      setSaveFailed(false);
      setEditing(false);
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        save();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
    return (
      <CardFrame {...frame} busy={busy !== null} onKeyDown={keys}>
        {head(rightLabel)}
        {rows}
        <hr className={styles.rule} />
        <textarea
          className={styles.bodyField}
          data-testid={TID.cardDraftBody}
          aria-label={t('cards.draft.title')}
          value={body}
          autoFocus
          onChange={(e) => setBody(e.target.value)}
        />
        {p.signature && (
          <div className={styles.signature} data-copy="external">
            {p.signature}
          </div>
        )}
        {saveFailed && <div className={styles.badLine}>{t('cards.draft.line.save_failed')}</div>}
        <div className={styles.buttons}>
          <CardButton tid="cardDraftSave" kind="primary" busy={busy === 'save'} disabled={busy !== null || !body.trim()} onClick={save}>
            {t('cards.draft.button.save')}
          </CardButton>
          <CardButton tid="cardDraftCancelEdit" kind="secondary" disabled={busy !== null} onClick={cancel}>
            {t('cards.draft.button.cancel_edit')}
          </CardButton>
        </div>
        {footer}
      </CardFrame>
    );
  }

  const primary = words.primary;
  // 05-2 §5.7.2 Offline at Send: main answers NET_OFFLINE and nothing moved; the card asks.
  const send = () =>
    run('send', () =>
      invoke('draft:send', tap).then((r: Result<unknown>) => {
        setOffline(!r.ok && r.error.kind === 'NET_OFFLINE');
        return r;
      }),
    );
  const openGmail = () => run('open', () => invoke('draft:openInApp', { cardId: card.id }));
  const discard = () => run('discard', () => invoke('draft:discard', tap));
  const change = () => {
    setSubject(p.subject ?? '');
    setBody(p.body);
    setSaveFailed(false);
    setOffline(false);
    setEditing(true);
  };
  // 05-2 §5.7.2 Send to someone new: the full Approval card under the draft is the only tap; this Link focuses it.
  const waiting = state === 'pending' && p.approvalCardId !== undefined;
  const focusApproval = () =>
    document.querySelector<HTMLElement>(`[data-card-id="${p.approvalCardId ?? ''}"]`)?.focus({ preventScroll: false });

  let buttons: ReactNode;
  // M5 T14 (05-2 §5.7.2 HELD): only the user's pick answers a held draft.
  const held = state === 'pending' ? p.held : undefined;
  if (held) {
    const pick = (optionId: 'own' | 'action') => run('held', () => invoke('card:heldPick', { ...tap, optionId }));
    buttons = (
      <>
        <HeldStrip word={t('cards.common.held_word')}>
          {held.reason === 'mismatch'
            ? t('cards.draft.held', { userSaid: held.userSaid ?? '', draftHas: held.actionHas ?? '' })
            : held.reason === 'cannot_check'
              ? t('cards.approval.held.cannot_check', { verbing: held.verbing ?? '' })
              : t('cards.approval.held.no_user_words')}
        </HeldStrip>
        {held.reason === 'mismatch' && (
          <div className={styles.buttons}>
            {(['own', 'action'] as const).map((o, i) => (
              <CardButton key={o} tid="cardDraftHeldOption" index={i} kind="secondary" disabled={busy !== null} onClick={() => pick(o)}>
                {o === 'own' ? held.userSaid : held.actionHas}
              </CardButton>
            ))}
          </div>
        )}
      </>
    );
  } else if (state === 'undo_window' && p.undoUntil !== undefined) {
    buttons = (
      <div className={styles.buttons}>
        <UndoCountdown key={p.undoUntil} windowMs={p.undoUntil - (card.resolvedAt ?? p.undoUntil - UNDO_MS)} />
        <CardButton
          tid="cardDraftUndo"
          kind="secondary"
          busy={busy === 'undo'}
          disabled={busy !== null}
          onClick={() => run('undo', () => invoke('draft:undo', { approvalId: p.approvalId }))}
        >
          {t('cards.draft.button.undo')}
        </CardButton>
      </div>
    );
  } else if (state === 'sending' || state === 'undo_window') {
    buttons = (
      <div className={styles.buttons}>
        <CardButton tid="cardDraftSend" kind="primary" busy busyLabel={t('cards.draft.sending')} disabled onClick={() => undefined}>
          {primary}
        </CardButton>
      </div>
    );
  } else if (state === 'failed') {
    buttons = (
      <div className={styles.buttons}>
        <CardButton
          tid="cardDraftSend"
          kind="primary"
          busy={busy === 'again'}
          disabled={busy !== null}
          onClick={() => run('again', () => invoke('card:askAgain', { cardId: card.id }))}
        >
          {t('cards.draft.button.try_again')}
        </CardButton>
      </div>
    );
  } else if (state === 'opened_in_app') {
    buttons = (
      <div className={styles.buttons}>
        <CardButton tid="cardDraftOpenGmail" kind="secondary" busy={busy === 'open'} disabled={busy !== null} onClick={openGmail}>
          {t('cards.draft.button.open_gmail')}
        </CardButton>
      </div>
    );
  } else if (waiting) {
    buttons = (
      <div className={styles.buttons}>
        <CardButton tid="cardDraftWaiting" kind="link" onClick={focusApproval}>
          {t('cards.draft.line.waiting_approval')}
        </CardButton>
      </div>
    );
  } else if (offline && state === 'pending') {
    buttons = (
      <div className={styles.buttons}>
        <CardButton
          tid="cardDraftSendWhenOnline"
          kind="primary"
          busy={busy === 'queue'}
          disabled={busy !== null}
          onClick={() =>
            run('queue', () =>
              invoke('card:answer', { ...tap, answer: { optionId: 'send_when_online' } }).then((r: Result<unknown>) => {
                if (r.ok) setOffline(false);
                return r;
              }),
            )
          }
        >
          {t('cards.draft.button.send_when_online')}
        </CardButton>
        <CardButton tid="cardDraftKeepDraft" kind="secondary" disabled={busy !== null} onClick={() => setOffline(false)}>
          {t('cards.draft.button.keep_draft')}
        </CardButton>
      </div>
    );
  } else {
    buttons = (
      <div className={styles.buttons}>
        {p.sendAllowed ? (
          <CardButton
            tid="cardDraftSend"
            kind="primary"
            busy={busy === 'send'}
            disabled={busy !== null}
            label={t('cards.draft.send_label', { primary, name })}
            onClick={send}
          >
            {primary}
          </CardButton>
        ) : (
          <CardButton tid="cardDraftOpenGmail" kind="primary" busy={busy === 'open'} disabled={busy !== null} onClick={openGmail}>
            {t('cards.draft.button.open_gmail')}
          </CardButton>
        )}
        <CardButton tid="cardDraftChange" kind="secondary" disabled={busy !== null} onClick={change}>
          {t('cards.draft.button.change')}
        </CardButton>
        <CardButton tid="cardDraftDiscard" kind="secondary" busy={busy === 'discard'} disabled={busy !== null} onClick={discard}>
          {t('cards.draft.button.discard')}
        </CardButton>
      </div>
    );
  }

  // The pending look (X-65) says where it goes while the card waits; after an Undo it also says nothing went out.
  // CR-0012 G-M8-04: with no send permission there is no Gmail draft, so the "saved as a draft there" line is never shown.
  const lines =
    state === 'failed'
      ? [t('cards.draft.line.failed')]
      : !p.sendAllowed
        ? []
        : offline && state === 'pending'
          ? [t('cards.draft.line.offline')]
          : [
              ...(p.undone && state === 'pending' && !held ? [t('cards.draft.line.undone')] : []),
              t('cards.draft.line.pending', { address: p.to?.address ?? '', app: words.app }),
            ];

  return (
    <CardFrame
      {...frame}
      muted={MUTED.has(state)}
      edge={state === 'failed' ? 'bad' : undefined}
      busy={busy !== null}
      onKeyDown={swallowCtrlEnter}
    >
      {head(rightLabel)}
      {rows}
      <hr className={styles.rule} />
      <Body text={p.body} signature={p.signature} />
      {lines.map((l) => (
        <div key={l} className={state === 'failed' ? styles.badLine : styles.line}>
          {l}
        </div>
      ))}
      {buttons}
      {state === 'pending' ? (
        footer
      ) : (
        <div className={styles.footRow}>
          <span className={styles.footer} />
          <CardTimeLabel {...time} />
        </div>
      )}
    </CardFrame>
  );
}
