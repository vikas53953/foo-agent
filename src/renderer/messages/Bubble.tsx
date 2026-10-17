// Spec: 04 §2 (the user's bubble: right, `--bubble-me`, padding 8/12, max `--bubble-max`, min width meta + 24, `lang` by
// script), §12 (output bubble: left, `--bubble-foo`; plain vs rich (fixed min(680, column)), §12.4 group sender label with a
// 26px face and the 34px indent, §12.5 backup-AI mark), §1.2–§1.4 (rhythm and corners from runs.ts), §1.8 (accessible name;
// Enter / Shift+F10 / Menu opens the menu, Ctrl+Shift+R reply, Ctrl+Shift+E react, Ctrl+C copy; focus ring on the bubble),
// §1.9 (selection checkbox `bubble-select-check`; clicking a row toggles it), §4 (badge slot), §5 (no reacting to the user's
// own bubble), §6 (reply, edit, delete with C-24, reply quote), §7 (Not sent), §8 (reaction chips), §9 (hover toolbar, menu,
// picker), §10 (attachments, deleted state, Read more, emoji-only, WhatsApp formatting, the WhatsApp mirror bubble), §13
// (markdown), §14.4 (streaming: held-back markdown, no meta until done), §15, §17, §19.4, §19.6, §19.7 (cards sit as rows
// aligned like foo's bubbles).
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { t } from '../../shared/copy/t';
import { motion } from '../../shared/tokens';
import { TID } from '../../shared/testids';
import type { CardRow, ChatRow, HelperRow, JobRow, MessageRow, MessageWhy, WaMessageRow } from '../../shared/types';
import { titleOfCard } from '../cards/registry';
import { CardView, hasCardView } from '../cards/renderCard';
import { clockNow } from '../store/apply';
import { openDialog, update, useStore } from '../store/index';
import {
  keepVoice,
  react,
  requestComposer,
  retryMessage,
  selectExpanded,
  selectFeedback,
  expand,
  setFeedback,
  type StoredMessage,
} from '../store/messages';
import { Face } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Menu, type MenuAnchor } from '../ui/Menu';
import { cx } from '../ui/cx';
import { ActionRow, CutOffRow, FeedbackMark, WhyFooter, WorkedLine } from './AnswerExtras';
import { BubbleCtx, type BubbleInfo } from './bubbleContext';
import {
  BadgeSlotView,
  FileChip,
  ImageGrid,
  Meta,
  MetaSpacer,
  NotSentIcon,
  TimeSpacer,
  NotSentLine,
  Quote,
  ReactionChips,
  attachmentKind,
  useDebounced,
  useReadMore,
  type QuoteInfo,
} from './BubbleParts';
import { backupNames, badgeSlot, bubbleName, canEdit, slotTooltip, tickLabel, tickState } from './bubbleState';
import { Blocks, endsInParagraph, Inlines, SourcesRow } from './Markdown';
import { HandoffMarker, SystemLine } from './Markers';
import { allSources, inlineText, isRich, parseBlocks, parseWhatsApp, plainText, streamSafe } from './markdownParse';
import { menuEntries, type MenuAction, type MenuFacts } from './messageMenu';
import { ReactionPicker } from './ReactionPicker';
import { requestReveal } from './reveal';
import { retryOutgoing } from '../composer/send';
import { voiceTextState } from './voiceRules';
import { tailCorners, type RowLayout } from './runs';
import { emojiOnly, scriptLang } from './textRules';
import { copyText } from './linkActions';
import { VoicePlayer } from './VoicePlayer';
import styles from './Bubble.module.css';

export interface RowCtx {
  chat: ChatRow;
  isGroup: boolean;
  agentName: string;
  fooFace: string;
  timeZone: string;
  now: number;
  offline: boolean;
  aiDown: boolean;
  helpers: Record<string, HelperRow>;
  cards: Record<string, CardRow>;
  jobs: Record<string, JobRow>;
  byId: Record<string, StoredMessage>;
  latestUserId: string | null;
  selecting: boolean;
  highlightId: string | null;
  onJump: (messageId: string) => void;
}

export interface Sender {
  name: string;
  face: string;
  kind: 'foo' | 'helper' | 'user';
  color: string | null;
}

export function senderOf(m: Pick<MessageRow, 'authorKind' | 'authorId'>, ctx: Pick<RowCtx, 'agentName' | 'fooFace' | 'helpers'>): Sender {
  if (m.authorKind === 'user') return { name: t('bubble.row.you'), face: '', kind: 'user', color: null };
  if (m.authorKind === 'helper') {
    const h = m.authorId ? ctx.helpers[m.authorId] : undefined;
    return { name: h?.name ?? '', face: h?.faceRef ?? '', kind: 'helper', color: h?.colorToken ?? null };
  }
  return { name: ctx.agentName, face: ctx.fooFace, kind: 'foo', color: null };
}

/** The plain text of a row: what Copy copies and what the accessible name reads (§1.9, 02-3 §F30.4). */
export function messagePlainText(m: MessageRow, cards: Record<string, CardRow>): string {
  if (m.deletedAt !== null) return t('bubble.deleted.text');
  if (m.kind === 'card') return (m.cardId && titleOfCard(cards[m.cardId])) || '';
  if (m.kind === 'voice') return m.transcript ?? '';
  if (m.kind === 'marker') return m.text;
  if (m.authorKind === 'user') return inlineText(parseWhatsApp(m.text));
  return plainText(parseBlocks(m.text));
}

export function messageAccessibleName(m: StoredMessage, ctx: RowCtx): string {
  if (m.kind === 'marker') return m.text;
  const sender = senderOf(m, ctx).name;
  const state: string[] = [];
  if (m.authorKind === 'user' && m.deletedAt === null) {
    state.push(tickLabel(tickState(m), ctx.agentName));
    const slot = badgeSlot(m, { offline: ctx.offline });
    if (slot) state.push(slotTooltip(slot, { agentName: ctx.agentName, slow: jobOf(m, ctx)?.slow, aiDown: ctx.aiDown }));
  }
  const name = bubbleName({ sender, at: m.createdAt, timeZone: ctx.timeZone, now: ctx.now, text: messagePlainText(m, ctx.cards), state });
  const backup = backupNames(m.providerNote);
  return backup ? `${name}${t('bubble.backup_mark.accessible_suffix', { backup: backup.backup })}` : name;
}

const jobOf = (m: MessageRow, ctx: Pick<RowCtx, 'jobs'>) => (m.jobId ? ctx.jobs[m.jobId] : undefined);

// ---------------------------------------------------------------- row commands (keys arrive at the list, §1.8)

export type RowCommand = 'menu' | 'reply' | 'react' | 'copy';
const commands = new Map<string, (c: RowCommand) => void>();
export function runRowCommand(messageId: string, c: RowCommand): boolean {
  const fn = commands.get(messageId);
  fn?.(c);
  return !!fn;
}

// ---------------------------------------------------------------- the row

function toggleSelect(id: string): void {
  update((s) => {
    const next = new Set(s.ui.selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    s.ui.selection = next;
  });
}

function askDelete(ids: string[]): void {
  update((s) => {
    s.messages.pendingDelete = ids;
  });
  openDialog('c-24');
}

function SenderLabel({ sender, tid }: { sender: Sender; tid: 'bubbleSender' | 'cardSender' }) {
  const style = sender.color ? ({ ['--sender' as string]: `var(${sender.color})` } as CSSProperties) : undefined;
  return (
    <div className={styles.sender} data-testid={TID[tid]} aria-hidden="true">
      <Face face={sender.face} name={sender.name} kind={sender.kind === 'user' ? 'foo' : sender.kind} color={sender.color} size="inline" />
      <span className={styles.senderName} style={style}>
        {sender.name}
      </span>
    </div>
  );
}

function asWhy(v: Record<string, unknown> | null): MessageWhy | null {
  if (!v || typeof v.source !== 'string') return null;
  return { ...(v as unknown as MessageWhy), vars: (v.vars as Record<string, string>) ?? {} };
}

export const MessageView = memo(function MessageView({
  m,
  layout,
  ctx,
  found,
}: {
  m: StoredMessage;
  layout: RowLayout;
  ctx: RowCtx;
  found?: ReactNode;
}) {
  if (m.kind === 'marker') {
    if (m.markerKind === 'handoff') return <HandoffMarker m={m} helper={m.authorId ? ctx.helpers[m.authorId] : undefined} />;
    return <SystemLine m={m} />;
  }
  return <BubbleRow m={m} layout={layout} ctx={ctx} found={found} />;
});

function BubbleRow({ m, layout, ctx, found }: { m: StoredMessage; layout: RowLayout; ctx: RowCtx; found?: ReactNode }) {
  const isCard = m.kind === 'card';
  const side: 'me' | 'them' = m.authorKind === 'user' ? 'me' : 'them';
  const deleted = m.deletedAt !== null;
  const sender = senderOf(m, ctx);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [picker, setPicker] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), motion['dur-confirm']);
    return () => clearTimeout(id);
  }, [copied]);

  const card = isCard && m.cardId ? ctx.cards[m.cardId] : undefined;
  const job = jobOf(m, ctx);
  const text = useMemo(() => messagePlainText(m, ctx.cards), [m, ctx.cards]);
  const blocks = useMemo(
    () => (side === 'them' && m.kind === 'text' && !deleted ? parseBlocks(m.status === 'streaming' ? streamSafe(m.text) : m.text) : null),
    [side, m.kind, m.text, m.status, deleted],
  );
  const hasTable = !!blocks?.some((b) => b.t === 'table');
  const canTryAgain = layout.latestAnswer && (!job || (job.intent === 'read_only' && job.doVerbs.length === 0));
  const approvedFromIt = Object.values(ctx.cards).some(
    (c) => c.jobId !== null && c.jobId === m.jobId && (c.type === 'approval' || c.type === 'payment') && c.state === 'approved',
  );
  const editable =
    side === 'me' && !m.pending && canEdit(m, { isLatestUserMessage: ctx.latestUserId === m.id, now: ctx.now, approvedFromIt });

  const facts: MenuFacts = {
    side: isCard ? 'card' : side,
    deleted,
    hasText: !!text,
    canEdit: editable,
    canTryAgain,
    voiceKept: m.kind === 'voice' && !deleted ? m.pinned : undefined,
    noReact: card?.type === 'approval' || card?.type === 'payment',
    hasTable,
    copied,
  };

  const run = (a: MenuAction) => {
    switch (a) {
      case 'reply':
        return requestComposer(m.chatId, { kind: 'reply', messageId: m.id, at: clockNow() });
      case 'react':
        return setPicker(true);
      case 'copy':
        return void copyText(text).then((ok) => ok && setCopied(true));
      case 'copyTable': {
        const table = blocks?.find((b) => b.t === 'table');
        return table?.t === 'table' ? void copyText(table.plain.map((r) => r.join('\t')).join('\n')) : undefined;
      }
      case 'edit':
        return requestComposer(m.chatId, { kind: 'edit', messageId: m.id, at: clockNow() });
      case 'tryAgain':
        return void (m.pending && m.clientId ? retryOutgoing(m.clientId) : retryMessage(m.id));
      case 'good':
        return setFeedback(m.id, 'good');
      case 'bad':
        return setFeedback(m.id, 'bad');
      case 'select':
        return toggleSelect(m.id);
      case 'delete':
        return askDelete([m.id]);
      case 'keep':
        return void keepVoice(m.chatId, m.id, true);
      case 'unkeep':
        return void keepVoice(m.chatId, m.id, false);
    }
  };
  const runRef = useRef(run);
  const factsRef = useRef(facts);
  useEffect(() => {
    runRef.current = run;
    factsRef.current = facts;
  });

  useEffect(() => {
    commands.set(m.id, (c) => {
      const el = bubbleRef.current;
      if (!el) return;
      if (c === 'menu') setMenu({ el, align: side === 'me' ? 'end' : 'start' });
      else if (c === 'reply' && !factsRef.current.deleted) runRef.current('reply');
      else if (c === 'react' && side === 'them' && !isCard && !factsRef.current.deleted) setPicker(true);
      else if (c === 'copy' && !factsRef.current.deleted) runRef.current('copy');
    });
    return () => {
      commands.delete(m.id);
    };
  }, [m.id, side, isCard]);

  const onContextMenu = (e: MouseEvent) => {
    if (ctx.selecting) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const info: BubbleInfo = {
    messageId: m.id,
    chatId: m.chatId,
    side: side === 'me' ? 'me' : 'foo',
    agentName: ctx.agentName,
    isGroup: ctx.isGroup,
  };
  const selected = useStore((s) => s.ui.selection.has(m.id));
  const offlineQueued = ctx.offline;
  const slot = badgeSlot(m, { offline: offlineQueued });
  const shownSlot = useDebounced(slot ? JSON.stringify(slot) : '');
  const parsedSlot = shownSlot ? (JSON.parse(shownSlot) as Exclude<typeof slot, null>) : null;
  const notSent = side === 'me' && m.status === 'failed' && !deleted;
  const why = side === 'them' && !m.prompted ? asWhy(m.why) : null;
  const indent = ctx.isGroup && side === 'them';

  let body: ReactNode;
  if (isCard) body = <CardBody m={m} card={card} ctx={ctx} />;
  else body = <BubbleBody m={m} side={side} deleted={deleted} blocks={blocks} job={job} layout={layout} ctx={ctx} found={found} />;

  return (
    <BubbleCtx.Provider value={info}>
      <div
        className={styles.row}
        data-gap={layout.gap}
        data-side={side}
        data-indent={indent || undefined}
        data-selecting={ctx.selecting || undefined}
        data-highlight={ctx.highlightId === m.id || undefined}
        onClick={ctx.selecting ? () => toggleSelect(m.id) : undefined}
      >
        {ctx.selecting && (
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={t('bubble.menu.select')}
            className={styles.check}
            data-testid={TID.bubbleSelectCheck}
            onClick={(e) => {
              e.stopPropagation();
              toggleSelect(m.id);
            }}
          >
            {selected && <Icon name="Checkmark" size={16} />}
          </button>
        )}
        {layout.senderLabel && <SenderLabel sender={sender} tid={isCard ? 'cardSender' : 'bubbleSender'} />}
        <div className={styles.line}>
          {notSent && <NotSentIcon />}
          <div className={styles.hold} ref={bubbleRef} onContextMenu={onContextMenu}>
            {body}
            {parsedSlot && !isCard && (
              <BadgeSlotView
                slot={parsedSlot}
                tooltip={slotTooltip(parsedSlot, {
                  agentName: ctx.agentName,
                  slow: job?.slow,
                  aiDown: ctx.aiDown && m.status === 'queued',
                })}
                onActivate={
                  parsedSlot.kind === 'badge' && (parsedSlot.value === 'failed' || parsedSlot.value === 'waiting') && m.jobId
                    ? () => requestReveal(m.chatId, m.jobId!)
                    : undefined
                }
              />
            )}
            {side === 'them' && !isCard && !deleted && m.reactions.length > 0 && (
              <ReactionChips reactions={m.reactions} onToggle={(e) => void react(m.chatId, m.id, e)} />
            )}
            {!ctx.selecting && !isCard && (
              <div className={styles.toolbar} data-side={side}>
                {side === 'them' && !deleted && (
                  <IconButton
                    icon="Emoji"
                    iconSize={16}
                    className={styles.toolButton}
                    label={t('bubble.toolbar.react')}
                    tooltip={t('bubble.toolbar.react')}
                    aria-keyshortcuts="Control+Shift+E"
                    data-testid={TID.bubbleToolbarReact}
                    onClick={() => setPicker(true)}
                  />
                )}
                <IconButton
                  icon="MoreHorizontal"
                  iconSize={16}
                  className={styles.toolButton}
                  label={t('bubble.toolbar.more')}
                  tooltip={t('bubble.toolbar.more')}
                  aria-haspopup="menu"
                  data-testid={TID.bubbleToolbarMore}
                  onClick={(e) => setMenu({ el: e.currentTarget, align: side === 'me' ? 'end' : 'start' })}
                />
              </div>
            )}
          </div>
        </div>
        {notSent && <NotSentLine onRetry={() => void (m.pending && m.clientId ? retryOutgoing(m.clientId) : retryMessage(m.id))} />}
        {layout.latestAnswer && !deleted && m.kind === 'text' && (
          <ActionRow messageId={m.id} text={text} canTryAgain={canTryAgain} onTryAgain={() => void retryMessage(m.id)} />
        )}
        {why && <WhyFooter why={why} timeZone={ctx.timeZone} now={ctx.now} />}
      </div>
      {menu && <Menu entries={menuEntries(facts, run)} anchor={menu} label={t('bubble.toolbar.more')} onClose={() => setMenu(null)} />}
      {picker && (
        <ReactionPicker
          anchorRef={bubbleRef}
          onClose={() => setPicker(false)}
          onPick={(e) => {
            setPicker(false);
            void react(m.chatId, m.id, e);
          }}
        />
      )}
    </BubbleCtx.Provider>
  );
}

// ---------------------------------------------------------------- bodies

function cornerAttrs(layout: RowLayout | null, side: 'me' | 'them') {
  const [tl, tr, br, bl] = tailCorners(layout?.pos ?? 'single', side);
  return { 'data-tl': tl || undefined, 'data-tr': tr || undefined, 'data-br': br || undefined, 'data-bl': bl || undefined };
}

function CardBody({ m, card, ctx }: { m: MessageRow; card: CardRow | undefined; ctx: RowCtx }) {
  const time = { at: m.createdAt, timeZone: ctx.timeZone, now: ctx.now };
  const view = card ? <CardView card={card} time={time} /> : null;
  if (view && card && hasCardView(card.type)) return view;
  // Card types of later milestones keep the M1 placeholder: the card's title in the frame (05 builds them).
  return (
    <div className={styles.cardPlaceholder} data-card-type={card?.type}>
      {titleOfCard(card) ?? ''}
    </div>
  );
}

function quoteOf(m: MessageRow, ctx: RowCtx): QuoteInfo | null {
  if (!m.replyToId) return null;
  const q = ctx.byId[m.replyToId];
  if (!q) return null;
  const s = senderOf(q, ctx);
  return {
    sender: s.name,
    color: q.authorKind === 'user' ? 'me' : q.authorKind === 'helper' && s.color ? s.color : 'foo',
    text: messagePlainText(q, ctx.cards),
    deleted: q.deletedAt !== null,
  };
}

function BubbleBody({
  m,
  side,
  deleted,
  blocks,
  job,
  layout,
  ctx,
  found,
}: {
  m: StoredMessage;
  side: 'me' | 'them';
  deleted: boolean;
  blocks: ReturnType<typeof parseBlocks> | null;
  job: JobRow | undefined;
  layout: RowLayout;
  ctx: RowCtx;
  found?: ReactNode;
}) {
  const corners = { ...cornerAttrs(layout, side), 'data-pos': layout.pos ?? 'single' };
  const tid: keyof typeof TID = side === 'me' ? 'bubbleMe' : m.authorKind === 'helper' ? 'bubbleHelper' : 'bubbleFoo';
  const tick = side === 'me' && !deleted ? { state: tickState(m), agentName: ctx.agentName } : undefined;
  const meta = (place: 'float' | 'row' | 'below' | 'media' = 'float', lead?: ReactNode) => (
    <Meta
      at={m.createdAt}
      timeZone={ctx.timeZone}
      now={ctx.now}
      tick={tick}
      edited={m.editedAt !== null && !deleted}
      lead={lead}
      place={place}
    />
  );
  const expanded = useStore(selectExpanded(m.id, 'more'));
  const [readRef, readClamp] = useReadMore(expanded);

  if (deleted)
    return (
      <div className={cx(styles.bubble, styles.deleted)} data-testid={TID[tid]} data-state="deleted" {...corners}>
        <span className={styles.deletedText}>
          <Icon name="Delete" size={16} />
          {t('bubble.deleted.text')}
        </span>
        <MetaSpacer wide={false} />
        <Meta at={m.createdAt} timeZone={ctx.timeZone} now={ctx.now} />
      </div>
    );

  if (m.kind === 'voice')
    return (
      <div className={cx(styles.bubble, side === 'me' ? styles.me : styles.them)} data-testid={TID[tid]} data-kind="voice" {...corners}>
        <VoicePlayer
          messageId={m.id}
          path={m.voicePath}
          ms={m.voiceMs ?? 0}
          transcript={side === 'me' ? m.transcript : m.transcript || m.text}
          transcriptState={voiceTextState(m, side, ctx.now)}
          side={side === 'me' ? 'me' : 'foo'}
        />
        {meta()}
      </div>
    );

  // ---- the user's side (§2, §10)
  if (side === 'me') {
    const images = (m.attachments ?? []).filter((a) => attachmentKind(a) === 'image');
    const files = (m.attachments ?? []).filter((a) => attachmentKind(a) !== 'image');
    const big = !images.length && !files.length && !m.replyToId && !found ? emojiOnly(m.text) : null;
    const lang = (m.lang === 'hi' || m.lang === 'pa' ? m.lang : undefined) ?? scriptLang(m.text);
    if (big)
      return (
        <div className={styles.emojiOnly} data-testid={TID[tid]} data-size={big} data-copy="user">
          <span className={big === 'xl' ? styles.emojiXl : styles.emojiL}>{m.text.trim()}</span>
          {meta('below')}
        </div>
      );
    const quote = quoteOf(m, ctx);
    const onlyImages = images.length > 0 && !m.text.trim() && !files.length && !quote;
    const clamp = readClamp && !expanded && !found;
    return (
      <div className={cx(styles.bubble, styles.me, onlyImages && styles.mediaOnly)} data-testid={TID[tid]} lang={lang} {...corners}>
        {quote && <Quote q={quote} onJump={() => ctx.onJump(m.replyToId!)} />}
        {images.length > 0 && <ImageGrid images={images}>{onlyImages && meta('media')}</ImageGrid>}
        {files.map((a, i) => (
          <FileChip key={a.id} a={a} index={i} onSide="me" />
        ))}
        {m.text.trim() && (
          <>
            <div ref={readRef} className={cx(styles.text, clamp && styles.clamp15)} data-copy="user" data-side="me">
              {found ?? <Inlines nodes={parseWhatsApp(m.text)} />}
              {!clamp && <MetaSpacer wide={m.editedAt !== null} />}
            </div>
            {clamp && (
              <button type="button" className={styles.readMore} data-testid={TID.bubbleReadMore} onClick={() => expand(m.id, 'more')}>
                {t('bubble.read_more.label')}
              </button>
            )}
          </>
        )}
        {!onlyImages && meta()}
      </div>
    );
  }

  // ---- foo's and helpers' side (§12, §13)
  const bl = blocks ?? [];
  const rich = isRich(m.text, bl);
  const sources = allSources(bl);
  const lang = scriptLang(m.text);
  const streaming = m.status === 'streaming';
  const backup = backupNames(m.providerNote);
  const checklist = job ? Object.values(ctx.cards).some((c) => c.jobId === job.id && c.type === 'checklist') : true;
  const worked = !!job && job.stepCount >= 1 && !checklist && job.startedAt !== null && job.finishedAt !== null && m.status === 'complete';
  // §3.1 / §11 meta row: the trailing spacer sits on the last text line (inside the last paragraph).
  const spacer = !streaming && !backup ? <AnswerSpacer messageId={m.id} at={m.createdAt} timeZone={ctx.timeZone} /> : null;
  const lead = (
    <>
      <FeedbackMark messageId={m.id} />
      {backup && (
        <span className={styles.backup} data-testid={TID.bubbleBackupMark}>
          <Icon name="ArrowSync" size={16} />
          {t('bubble.backup_mark.text', backup)}
        </span>
      )}
    </>
  );
  return (
    <div
      className={cx(styles.bubble, styles.them, rich && styles.rich)}
      data-testid={TID[tid]}
      data-rich={rich || undefined}
      data-state={m.status}
      lang={lang}
      {...corners}
    >
      <div className={styles.text} data-copy="ai" data-side="foo">
        {found ? (
          <p className={styles.found}>
            {found}
            {spacer}
          </p>
        ) : (
          <Blocks blocks={bl} tail={spacer} />
        )}
        {!found && !endsInParagraph(bl) && spacer}
      </div>
      {sources.length >= 2 && <SourcesRow sources={sources} />}
      {worked && job && <WorkedLine messageId={m.id} jobId={job.id} ms={job.finishedAt! - job.startedAt!} />}
      {m.status === 'failed' && <CutOffRow onRetry={() => void retryMessage(m.id)} />}
      {!streaming && meta(backup ? 'row' : 'float', lead)}
    </div>
  );
}

/** The time-only meta's spacer; it widens while the meta carries the 👍/👎 mark (§17.1). */
function AnswerSpacer({ messageId, at, timeZone }: { messageId: string; at: number; timeZone: string }) {
  const mark = useStore(selectFeedback(messageId));
  return <TimeSpacer at={at} timeZone={timeZone} mark={!!mark} />;
}

// ---------------------------------------------------------------- the WhatsApp mirror bubble (§10.11)

const H_COLORS = [
  '--h-terracotta',
  '--h-green',
  '--h-violet',
  '--h-raspberry',
  '--h-steel',
  '--h-teal',
  '--h-brown',
  '--h-slate',
  '--h-purple',
  '--h-ochre',
];

/** X-138: index = hash(jid) mod 10 into the ten helper colours in F2 order. The row keeps only the sender's label, so it is hashed. */
export function waColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return H_COLORS[h % H_COLORS.length]!;
}

export function WaBubble({ w, gap, ctx }: { w: WaMessageRow; gap: RowLayout['gap']; ctx: Pick<RowCtx, 'timeZone' | 'now'> }) {
  const side = w.fromMe ? 'me' : 'them';
  const color = waColor(w.senderLabel ?? '');
  return (
    <div className={styles.row} data-gap={gap} data-side={side}>
      {!w.fromMe && (
        <div className={styles.waSender} data-testid={TID.bubbleSender}>
          <span className={styles.senderName} style={{ ['--sender' as string]: `var(${color})` } as CSSProperties} data-copy="external">
            {w.senderLabel}
          </span>
        </div>
      )}
      <div className={styles.line}>
        <div className={styles.hold}>
          <div
            className={cx(styles.bubble, w.fromMe ? styles.me : styles.them)}
            data-br={w.fromMe || undefined}
            data-bl={!w.fromMe || undefined}
            data-testid={TID.bubbleWa}
            data-message-id={w.id}
            data-from-me={w.fromMe ? 'true' : 'false'}
            lang={scriptLang(w.text)}
          >
            <div className={styles.text} data-copy="external" data-side={side === 'me' ? 'me' : 'foo'}>
              <Inlines nodes={parseWhatsApp(w.text)} />
              <MetaSpacer wide={false} />
            </div>
            <Meta at={w.at} timeZone={ctx.timeZone} now={ctx.now} />
          </div>
        </div>
      </div>
    </div>
  );
}
