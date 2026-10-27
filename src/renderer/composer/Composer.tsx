// Spec: 04-2 §20 (composer bar `composer`: the stack above the row — one banner, then one strip: paste catcher, pending-card
// strip or composer notice — and the row "+" · pill · round button; the pill `composer-field` is a contenteditable textbox,
// "Message {chat name}", grows to 6 lines, placeholder per §20.4), §21 (the "+" menu, the morphing button, Send: the bubble
// shows at once, the field, chips and strips clear, the draft is deleted, focus stays, "Sent." is announced; chips, link
// preview, reply and edit strips), §22 (voice, paste catcher on paste / Send / 800 ms after typing stops, paste rules, limits
// and drag-drop, notice, @ mention, keys), §23 (states, banners, pending strip, drafts, character limit, Narrator), 05-2 §5.9
// (the catcher dock is 04-2 §22.4's panel), 03-shell-2 §3.9.2 (F6 `composer` pane), 08-0 §G.10 (`live.lastKeystrokeAt`).
// Component `Pill` of §20.3 is the field region below (one component owns the field and its stacks).
// P1 T6 (CR-0021 picks 10, 11; 02 §F7.1 "Composer"): suggestion chips (§21.7) above the row; the round button's ✓ for
// --dur-confirm after delivery, the hold flood and the live level ring; "Add details…" while a job of this chat works; the
// field grows smoothly; a dropped file's chip flies in from the drop point; a caught secret shows the lock; Esc shrinks the
// voice bar back into the mic; offline dims the field.
// R1 T6 (X-180, CR-0022 picks 6, 7): the side-question strip (04 §17.5, sent with `side`), three paste bands (§22.5: inline,
// "Pasted text" chip, `pasted-{time}.txt` file chip over 10,000 characters; the catcher runs on the whole text first).
// R1 T7 (X-180, CR-0022, 04-2 §21.7): the latest reply's action chips beside the reply chips (AT-367).
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
// P1 T6
import { motion } from '../../shared/tokens';
import { Icon } from '../ui/Icon';
import { Presence } from '../ui/Presence';
import { createPortal } from 'react-dom';
import { COUNTER_FROM, ACCEPT, MAX_FILES, pasteBand, pastedFileName, TEXT_LIMIT } from '../../shared/attachmentRules';
import { t } from '../../shared/copy/t';
import { askedForCode, findSecrets, secretOnly, suggestedNameSlot, type CheckContext } from '../../shared/redactor';
// M5 T2
import { clearSecretPrefill, prefillSecret } from '../cards/secretPrefill';
import { TID } from '../../shared/testids';
import type { ChatRow, ComposerBannerType, HelperRow } from '../../shared/types';
import { announce } from '../a11y/announce';
import { registerFocusTarget } from '../a11y/focusTargets';
import { invoke } from '../ipc/client';
import { messagePlainText, senderOf } from '../messages/Bubble';
import { mediaUrl } from '../messages/bubbleContext';
import { canEdit } from '../messages/bubbleState';
import { requestRevealCard } from '../messages/reveal';
import { clockNow } from '../store/apply';
import { loadHelpersReducer, selectHelpers } from '../store/helpers';
import { setComposerHint, update, useStore } from '../store/index';
import { selectAi, selectFeatureOn, selectNow } from '../store/live';
import { editMessage, selectChatMessages, takeComposerRequest, type StoredMessage } from '../store/messages';
import { selectAgentName, selectTimeZone } from '../store/settings';
import { selectDialog } from '../store/ui';
import { AttachMenu } from './AttachMenu';
import { AttachmentChips, type ChipsHandle } from './AttachmentChips';
import { chipAttachment, chipKind, planFiles, type Chip } from './chips';
import { ComposerBanner } from './ComposerBanner';
import { ComposerNotice, NOTICE_MS, type Notice } from './ComposerNotice';
import { ComposerNoticeStack } from './ComposerNoticeStack';
import { composerKeyAction, isPrintable, WRAP } from './composerKeys';
import { cacheDraft, cachedDraft, cancelDraftSave, saveDraftLater, saveDraftNow, type DraftPayload, type DraftState } from './drafts';
import { DropOverlay, type DropLook } from './DropOverlay';
import { EditStrip } from './EditStrip';
import { caretOffset, caretX, domToSegments, segmentsToDom, selectionOffsets, setCaret, textBeforeCaret } from './fieldDom';
import {
  checkText,
  dropMasks,
  editSubmission,
  filterHelpers,
  hasMask,
  hasText,
  maskHits,
  MASK_CHAR,
  mentionQuery,
  parseDraft,
  serialise,
  splitAt,
  textLength,
  tidy,
  type MaskValue,
  type Segment,
} from './fieldModel';
import { MentionMenu, MENTION_LIST_ID, mentionRowId } from './MentionMenu';
import { MorphButton } from './MorphButton';
import { PasteCatcher } from './PasteCatcher';
import { PendingStrip } from './PendingStrip';
import { stripView, waitingCards } from './pending';
import { NARROW_PILL_PX, planChangePending, placeholderText } from './placeholder';
import { ReplyStrip, type ReplyQuote } from './ReplyStrip';
import { ASK_QUOTE_MAX } from '../messages/AskPill'; // R1 T6
import { roundButtonState, roundTooltip, talkKeyLabel, isTalkChord } from './roundState';
import { newClientId, sendOutgoing, stageFile } from './send';
import { SuggestionChips } from './SuggestionChips';
import { actionsFor, suggestionsFor } from './suggestions';
import { ActionChips } from './ActionChips';
import { useVoice } from './useVoice';
import { RecordCancel, VoiceRecorder, type RecordingView } from './VoiceRecorder';
import styles from './Composer.module.css';

/** §22.4: the typed check runs this long after typing stops. */
export const TYPED_CHECK_MS = 800;
/** 08-0 §G.10 `live.lastKeystrokeAt` is written at most this often. */
const KEYSTROKE_EVERY_MS = 1_000;

type Strip =
  | { kind: 'reply'; messageId: string }
  // R1 T6 (04 §17.5): the reply strip quoting the words a side question asks about.
  | { kind: 'side'; messageId: string; quote: string }
  | { kind: 'edit'; messageId: string; saved: Saved }
  | null;
interface Saved {
  segs: Segment[];
  chips: Chip[];
  reply: string | null;
}
interface MentionState {
  query: string;
  at: number;
  index: number;
  x: number;
  bottom: number;
}

let chipSeq = 0;
const chipKey = () => `chip-${++chipSeq}`;
const maskSeq = { n: 0 };
const newMaskId = () => `m${++maskSeq.n}`;

const trimBlankLines = (s: string) => s.replace(/^(?:[^\S\n]*\n)+/, '').replace(/(?:\n[^\S\n]*)+$/, '');
const secretPart = (m: MaskValue) => secretOnly(m.hit, m.value);

/** True when `next` is `prev` with text inserted at one place: nothing of `prev` was removed or replaced. */
function onlyAdded(prev: string, next: string): boolean {
  if (next.length < prev.length) return false;
  let head = 0;
  while (head < prev.length && prev[head] === next[head]) head++;
  return prev.slice(head) === next.slice(next.length - (prev.length - head));
}

export function Composer({ chat }: { chat: ChatRow }) {
  const chatId = chat.id;
  const agentName = useStore(selectAgentName);
  const timeZone = useStore(selectTimeZone); // R1 T6: `pasted-{time}.txt`
  const ai = useStore(selectAi);
  const banner = useStore((s) => s.ui.banner);
  const helpersById = useStore(selectHelpers);
  const slice = useStore(selectChatMessages(chatId));
  const cardsById = useStore((s) => s.cards.byId);
  const now = useStore(selectNow);
  const typing = useStore((s) => s.live.typingChatId === chatId);
  const dialogOpen = useStore(selectDialog) !== null;
  const draftRow = useStore((s) => s.messages.drafts[chatId]);
  const request = useStore((s) => s.messages.composer[chatId]);

  const notSetUp = ai !== null && ai.primary === null;
  // 06-1 §2.0 (CR-0020): in setup mode the locked composer reads the long line.
  const setupMode = useStore((s) => s.settings.value?.setup.complete === false);
  const talkKey = useMemo(() => talkKeyLabel(typeof navigator === 'undefined' ? [] : navigator.languages), []);
  const chatName = chat.kind === 'foo' && chat.private ? t('chat_header.private.title') : chat.title;
  const helpers = useMemo(() => Object.values(helpersById).filter((h) => h.deletedAt === null), [helpersById]);
  const pausedHelper = chat.kind === 'helper' && chat.helperId ? helpersById[chat.helperId] : undefined;
  // M5 T2: 05-2 §5.8.6 "Groups: never" for a Secret box, so the paste catcher there has no Move.
  const inGroup = chat.kind === 'group';

  const field = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<ChipsHandle>(null);
  const placeholderId = useId();

  const [segs, setSegsState] = useState<Segment[]>([]);
  const segsRef = useRef<Segment[]>([]);
  const [chips, setChipsState] = useState<Chip[]>([]);
  const chipsRefState = useRef<Chip[]>([]);
  const [strip, setStrip] = useState<Strip>(null);
  const [catchOpen, setCatchOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [micProblem, setMicProblem] = useState<ComposerBannerType | null>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drag, setDrag] = useState<{ look: DropLook; host: HTMLElement } | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [pendingInView, setPendingInView] = useState(true);
  const [linkPreviewRemoved, setLinkPreviewRemoved] = useState(false);
  const touched = useRef(false);
  // P1 T6 (CR-0021 pick 11): the round button shows ✓ for --dur-confirm once main has the message.
  const [confirmed, setConfirmed] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const confirmSent = useCallback(() => {
    clearTimeout(confirmTimer.current);
    setConfirmed(true);
    confirmTimer.current = setTimeout(() => setConfirmed(false), motion['dur-confirm']);
  }, []);
  useEffect(() => () => clearTimeout(confirmTimer.current), []);
  // M5 T2: the caught values behind the masks still in the field, in memory only, for "Move to secret box" (04-2 §22.4);
  // a value goes as soon as its mask leaves the field (setSegs), on Send and on a chat switch.
  const maskValues = useRef(new Map<string, MaskValue>());
  const typedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastKeystroke = useRef(0);
  const mentionDismissedAt = useRef<number | null>(null);

  const setSegs = useCallback((next: Segment[]) => {
    segsRef.current = next;
    setSegsState(next);
    if (maskValues.current.size) {
      const live = new Set(next.flatMap((x) => (x.kind === 'mask' ? [x.id] : [])));
      for (const id of maskValues.current.keys()) if (!live.has(id)) maskValues.current.delete(id);
    }
  }, []);
  const setChips = useCallback((fn: (c: Chip[]) => Chip[]) => {
    const next = fn(chipsRefState.current);
    chipsRefState.current = next;
    setChipsState(next);
  }, []);

  const look = useMemo(
    () => ({
      maskClass: styles.mask ?? '',
      mentionClass: styles.mention ?? '',
      mentionColor: (id: string) => helpersById[id]?.colorToken ?? null,
    }),
    [helpersById],
  );

  /** Writes segments to the field and puts the caret at `caret` (default: the end). */
  const writeField = useCallback(
    (next: Segment[], caret?: number) => {
      const el = field.current;
      if (el) {
        segmentsToDom(el, next, look);
        if (el.ownerDocument.activeElement === el) setCaret(el, caret ?? checkText(next).length);
      }
      setSegs(next);
    },
    [look, setSegs],
  );

  // ---------------------------------------------------------------- the paste catcher's context (§22.4 P16)
  const checkCtx = useCallback((): CheckContext => {
    const rows = slice
      ? slice.ids
          .slice(-20)
          .map((id) => slice.byId[id]!)
          .filter(Boolean)
      : [];
    return { askedForCode: askedForCode(rows, clockNow()) };
  }, [slice]);

  const pastedMasked = (list: readonly Chip[]) => list.some((c) => heldText(c) && (c.text ?? '').includes(MASK_CHAR));

  /** Masks every caught span in the field (and in "Pasted text" chips); true when anything is caught or still masked. */
  const runCheck = useCallback((): boolean => {
    const ctx = checkCtx();
    let caught = hasMask(segsRef.current) || pastedMasked(chipsRefState.current);
    const hits = findSecrets(checkText(segsRef.current), ctx);
    if (hits.length) {
      const masked = maskHits(segsRef.current, hits, newMaskId);
      for (const [id, v] of masked.masks) maskValues.current.set(id, v);
      writeField(masked.segs);
      caught = true;
    }
    const chipHits = chipsRefState.current.some((c) => heldText(c) && findSecrets(c.text ?? '', {}).length);
    if (chipHits) {
      setChips((list) => list.map((c) => (heldText(c) ? { ...c, text: maskText(c.text ?? '') } : c)));
      caught = true;
    }
    return caught;
  }, [checkCtx, setChips, writeField]);

  // ---------------------------------------------------------------- drafts (§23.5)
  const draftPayload = useCallback((): DraftPayload | null => {
    if (strip?.kind === 'edit') return null;
    if (hasMask(segsRef.current) || pastedMasked(chipsRefState.current)) return null;
    // A secret typed since the last check is not written either (the 800 ms check has not masked it yet).
    if (findSecrets(checkText(segsRef.current), {}).length) return null;
    return {
      chatId,
      text: serialise(segsRef.current, 'draft').trim() === '' ? '' : serialise(segsRef.current, 'draft'),
      attachmentIds: chipsRefState.current.flatMap((c) =>
        c.state === 'ready' && c.attachmentId && c.kind !== 'pasted' ? [c.attachmentId] : [],
      ),
      ...(strip?.kind === 'reply' ? { replyToId: strip.messageId } : {}),
      linkPreviewRemoved,
    };
  }, [chatId, strip, linkPreviewRemoved]);

  const latestPayload = useRef(draftPayload);
  const latestCache = useRef<() => DraftState>(() => ({
    segs: segsRef.current,
    attachments: [] as ReturnType<typeof chipAttachment>[],
    replyToId: null as string | null,
    linkPreviewRemoved: false,
  }));
  useLayoutEffect(() => {
    latestPayload.current = draftPayload;
    latestCache.current = () => ({
      segs: strip?.kind === 'edit' ? strip.saved.segs : segsRef.current,
      attachments: (strip?.kind === 'edit' ? strip.saved.chips : chipsRefState.current).flatMap((c) =>
        c.state === 'ready' && c.attachmentId && c.kind !== 'pasted' ? [{ ...chipAttachment(c), path: c.url ?? '' }] : [],
      ),
      replyToId: strip?.kind === 'reply' ? strip.messageId : strip?.kind === 'edit' ? strip.saved.reply : null,
      linkPreviewRemoved,
      ...(strip?.kind === 'side' ? { side: { messageId: strip.messageId, quote: strip.quote } } : {}),
    });
  });

  useEffect(() => {
    if (!touched.current) return;
    saveDraftLater(chatId, () => latestPayload.current());
  }, [segs, chips, strip, draftPayload, chatId]);

  // M5 T2: a chat switch forgets every caught value (04-2 §22.4 "the real value is not kept anywhere").
  useEffect(() => {
    const values = maskValues.current;
    return () => {
      values.clear();
      clearSecretPrefill();
    };
  }, [chatId]);

  // Chat switch (unmount) and window close save at once.
  useEffect(() => {
    const flush = () => {
      if (!touched.current) return;
      const p = latestPayload.current();
      if (p) saveDraftNow(p);
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
      const c = latestCache.current();
      cacheDraft(chatId, hasText(c.segs) || c.attachments.length || c.replyToId || c.side ? c : null);
    };
  }, [chatId]);

  // These two effects copy an external source (chat:open's draft, a message-list request) into the composer once; that is
  // their point, so the set-state-in-effect rule is off for them.
  /* eslint-disable react-hooks/set-state-in-effect */
  // Restore: the session cache first, else chat:open's draft (caret at the end).
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current) return;
    const cached = cachedDraft(chatId);
    const fromRow = draftRow
      ? {
          segs: parseDraft(draftRow.text, (id) => helpersById[id]?.name),
          attachments: draftRow.attachments.map((a) => ({ ...a, path: a.kind === 'image' ? (mediaUrl(a.path) ?? '') : a.path })),
          replyToId: draftRow.replyToId,
          linkPreviewRemoved: draftRow.linkPreviewRemoved,
        }
      : null;
    const d = cached ?? fromRow;
    if (!d && draftRow === undefined) return; // chat:open has not answered yet
    restored.current = true;
    if (!d || touched.current) return;
    writeField(d.segs);
    setChips(() =>
      d.attachments.map((a) => ({
        key: chipKey(),
        kind: a.kind === 'image' ? 'image' : 'file',
        name: a.name,
        bytes: a.bytes,
        url: a.kind === 'image' ? a.path : undefined,
        state: 'ready',
        attachmentId: a.id,
        staged: Promise.resolve(a.id),
      })),
    );
    if (cached?.side) setStrip({ kind: 'side', ...cached.side });
    else if (d.replyToId) setStrip({ kind: 'reply', messageId: d.replyToId });
    setLinkPreviewRemoved(d.linkPreviewRemoved);
  }, [chatId, draftRow, helpersById, setChips, writeField]);

  // ---------------------------------------------------------------- voice (§22.1)
  // CR-0054: no mic while this build leaves voice off, no files while it leaves photos and papers off, no Secret box while it
  // leaves sign-in off.
  const voiceOn = useStore(selectFeatureOn('voice'));
  const photosOn = useStore(selectFeatureOn('photos'));
  const signinOn = useStore(selectFeatureOn('signin'));
  const voice = useVoice({ chatId, enabled: !notSetUp && voiceOn, onBanner: setMicProblem });
  const recording = voice.rec?.mode ?? null;
  // P1 T6 (02 §F7.1): the bar shrinks back into the mic after it ends, so it keeps its last look while it leaves.
  const [lastRec, setLastRec] = useState<RecordingView | null>(null);
  if (voice.rec && voice.rec !== lastRec) setLastRec(voice.rec);

  // ---------------------------------------------------------------- derived state
  const empty = checkText(segs) === '';
  const length = textLength(segs);
  const tooLong = length > TEXT_LIMIT;
  const hasContent = hasText(segs) || chips.length > 0;
  const replying =
    typing || (slice?.ids.slice(-3).some((id) => slice.byId[id]?.status === 'streaming' && slice.byId[id]?.authorKind !== 'user') ?? false);
  const roundFacts = { notSetUp, editing: strip?.kind === 'edit', recording, hasContent, replying, catchOpen, tooLong, noVoice: !voiceOn };
  const round = roundButtonState(roundFacts);
  const tooltip = roundTooltip(round, roundFacts, talkKey);
  const counter = length >= COUNTER_FROM ? { n: tooLong ? length - TEXT_LIMIT : TEXT_LIMIT - length, over: tooLong } : null;
  const composerBanner: ComposerBannerType | null = micProblem ?? (pausedHelper?.paused ? 'helper_paused' : null);
  // P1 T6 (CR-0021 pick 11): a job of this chat is WORKING → "Add details…".
  const working = useStore((s) => (s.jobs.byChat[chatId] ?? []).some((id) => s.jobs.byId[id]?.state === 'working'));
  // P1 T6 (04-2 §21.7): starters in an empty chat, else the latest reply's own follow-ups; nothing before the chat loads.
  const suggestView = useMemo(
    () =>
      slice
        ? suggestionsFor({
            kind: chat.kind,
            private: chat.private,
            messages: slice.ids.flatMap((id) => (slice.byId[id] ? [slice.byId[id]] : [])),
            cards: cardsById,
            recording: recording !== null,
            disabled: notSetUp,
            typed: !empty || chips.length > 0,
          })
        : null,
    [slice, chat.kind, chat.private, cardsById, recording, notSetUp, empty, chips.length],
  );
  // R1 T7 (04-2 §21.7): the same reply's action chips, beside the follow-ups.
  const actionView = useMemo(
    () =>
      slice
        ? actionsFor({
            kind: chat.kind,
            private: chat.private,
            messages: slice.ids.flatMap((id) => (slice.byId[id] ? [slice.byId[id]] : [])),
            cards: cardsById,
            recording: recording !== null,
            disabled: notSetUp,
            typed: !empty || chips.length > 0,
          })
        : null,
    [slice, chat.kind, chat.private, cardsById, recording, notSetUp, empty, chips.length],
  );

  // M5 (T5): a Choice card's "Something else…" hint, while the box is still empty (05-1 §5.3.2).
  const hint = useStore((s) => (s.ui.composerHint?.chatId === chatId ? s.ui.composerHint.text : null));
  useEffect(() => {
    if (hint && !empty) setComposerHint(null);
  }, [hint, empty]);
  const placeholder =
    hint && empty && !chips.length
      ? hint
      : placeholderText({
          notSetUp,
          setupMode,
          banner,
          aiName: ai?.displayName ?? '',
          hasAttachments: chips.length > 0,
          hasText: !empty,
          // CR-0054: with voice off there is nothing to hold, so the line is the short "Message {name}".
          narrow: narrow || !voiceOn,
          kind: chat.kind,
          private: chat.private,
          title: chatName,
          agentName,
          talkKey,
          planChange: slice ? planChangePending(slice.ids, slice.byId, cardsById) : false,
          working,
        });

  // Pill width → the short placeholder under 360 px (§20.4).
  useEffect(() => {
    const el = pill.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setNarrow((e?.contentRect.width ?? NARROW_PILL_PX) < NARROW_PILL_PX));
    ro.observe(el);
    return () => ro.disconnect();
  }, [recording]);

  // P1 T6 (02 §F7.1): the field grows and shrinks smoothly. Its height is set to what the text needs (max-height still caps
  // it at 6 lines) and CSS animates between the two; at Basic and Off the change is instant.
  // When a key only adds text (everything that was there is still there, in order) at the same width, the field can only
  // grow, so its scroll height is read as it stands: the layout that read forces is the one the next paint needs anyway.
  // Setting `height: auto` first (to let it shrink) costs a second layout of the window on every key (PERF-02), so that
  // happens only when text went away or was replaced, the width changed, recording started or stopped, or on first measure.
  const measured = useRef<{ text: string; width: number; recording: typeof recording } | null>(null);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const before = el.style.height;
    const last = measured.current;
    const text = checkText(segs);
    const width = el.clientWidth;
    const grewOnly = before !== '' && last !== null && last.recording === recording && last.width === width && onlyAdded(last.text, text);
    measured.current = { text, width, recording };
    if (grewOnly && el.scrollHeight <= parseFloat(before)) return;
    if (!grewOnly) el.style.height = 'auto';
    const next = `${el.scrollHeight}px`;
    el.style.height = before;
    if (before === next) return;
    if (before) void el.offsetHeight; // the transition starts from the old height
    el.style.height = next;
  }, [segs, recording]);

  // The notice goes after 8 s (§22.7).
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const showNotice = useCallback((text: string, tone: Notice['tone'] = 'bad') => setNotice({ text, tone, at: Date.now() }), []);

  // ---------------------------------------------------------------- focus
  const focusField = useCallback(
    (atEnd = true) => {
      const el = field.current;
      if (!el || notSetUp) return false;
      el.focus();
      if (atEnd) setCaret(el, checkText(segsRef.current).length);
      return true;
    },
    [notSetUp],
  );
  useEffect(() => registerFocusTarget('composer', () => focusField()), [focusField]);

  // P1 T6 (04-2 §21.7): a chip fills the field with its words and focuses it; it never sends.
  const pickSuggestion = useCallback(
    (text: string) => {
      touched.current = true;
      writeField(tidy([{ kind: 'text', text }]));
      focusField();
    },
    [focusField, writeField],
  );

  // Shift+Esc anywhere focuses the field; a printable key typed in the message list moves to the field (§22.9); {talkKey}.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (focusField()) e.preventDefault();
        return;
      }
      // §22.1 "Esc cancels" wherever focus is, and with {talkKey}'s Ctrl still held: the field's own key map only sees a
      // plain Esc while it has focus, and a hold that ends after Esc would otherwise send the note.
      if (e.key === 'Escape' && recording) {
        e.preventDefault();
        e.stopPropagation();
        voice.cancel();
        return;
      }
      if (isTalkChord(e, talkKey) && !e.repeat && !dialogOpen) {
        if (round === 'mic' || recording) voice.talkDown();
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      if (isPrintable(e) && active?.closest(`[data-testid="${TID.threadLog}"]`) && !e.defaultPrevented) focusField();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Control') voice.talkUp();
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [focusField, talkKey, dialogOpen, round, recording, voice]);

  // ---------------------------------------------------------------- reply / edit (§21.6, §6.2)
  const startEdit = useCallback(
    (m: StoredMessage) => {
      const saved: Saved = {
        segs: segsRef.current,
        chips: chipsRefState.current,
        reply: strip?.kind === 'reply' ? strip.messageId : strip?.kind === 'edit' ? strip.saved.reply : null,
      };
      setStrip({ kind: 'edit', messageId: m.id, saved: strip?.kind === 'edit' ? strip.saved : saved });
      setChips(() => []);
      setCatchOpen(false);
      writeField(tidy([{ kind: 'text', text: m.text }]));
      requestAnimationFrame(() => focusField());
    },
    [focusField, setChips, strip, writeField],
  );

  const closeStrip = useCallback(() => {
    if (strip?.kind === 'edit') {
      writeField(strip.saved.segs);
      setChips(() => strip.saved.chips);
      setStrip(strip.saved.reply ? { kind: 'reply', messageId: strip.saved.reply } : null);
    } else setStrip(null);
    touched.current = true;
    focusField();
  }, [focusField, setChips, strip, writeField]);

  const lastEditable = useCallback((): StoredMessage | null => {
    if (!slice) return null;
    let latestUser: StoredMessage | null = null;
    for (let i = slice.ids.length - 1; i >= 0; i--) {
      const m = slice.byId[slice.ids[i]!];
      if (m?.authorKind === 'user' && m.kind !== 'marker') {
        latestUser = m;
        break;
      }
    }
    if (!latestUser || latestUser.pending) return null;
    const ok = canEdit(latestUser, { isLatestUserMessage: true, now: clockNow(), approvedFromIt: false });
    return ok ? latestUser : null;
  }, [slice]);

  // Requests from the message list (Reply, Edit, "puts … in the composer").
  useEffect(() => {
    if (!request) return;
    const req = takeComposerRequest(chatId);
    if (!req || notSetUp) return;
    touched.current = true;
    if (req.kind === 'reply' || req.kind === 'side') {
      if (strip?.kind === 'edit') closeStrip();
      setStrip(
        req.kind === 'side' ? { kind: 'side', messageId: req.messageId, quote: req.quote } : { kind: 'reply', messageId: req.messageId },
      );
      focusField();
    } else if (req.kind === 'edit') {
      const m = slice?.byId[req.messageId];
      if (m) startEdit(m);
    } else {
      if (req.keep && (hasText(segsRef.current) || hasMask(segsRef.current))) return;
      writeField(tidy([{ kind: 'text', text: req.text }]));
      focusField();
    }
  }, [request, chatId, notSetUp, strip, slice, closeStrip, focusField, startEdit, writeField]);

  /* eslint-enable react-hooks/set-state-in-effect */

  const quote = useMemo((): ReplyQuote | null => {
    if (strip?.kind !== 'reply' && strip?.kind !== 'side') return null;
    const q = slice?.byId[strip.messageId];
    if (!q) return null;
    const s = senderOf(q, { agentName, fooFace: '', helpers: helpersById });
    const color = q.authorKind === 'user' ? 'var(--accent)' : s.color ? `var(${s.color})` : 'var(--fg-1)';
    const image = q.attachments?.find((a) => a.kind === 'image');
    return {
      sender: s.name,
      color,
      helper: q.authorKind === 'helper',
      text: strip.kind === 'side' ? strip.quote : messagePlainText(q, cardsById),
      deleted: q.deletedAt !== null,
      thumb: image ? mediaUrl(image.path) : null,
    };
  }, [strip, slice, agentName, helpersById, cardsById]);

  // ---------------------------------------------------------------- attachments (§21.4, §22.5, §22.6)
  const noticeFor = useCallback(
    (slot: string, name: string) => {
      switch (slot) {
        case 'too_many_files':
          return t('composer.notice.too_many_files');
        case 'programs':
          return t('composer.notice.programs', { agentName });
        case 'zipped':
          return t('composer.notice.zipped');
        case 'too_big':
          return t('composer.notice.too_big', { name });
        default:
          return t('composer.notice.unreadable', { name });
      }
    },
    [agentName],
  );

  const addFiles = useCallback(
    (files: readonly File[], from?: { x: number; y: number }, enter: 'fly' | 'fold' = 'fly') => {
      if (notSetUp || strip?.kind === 'edit' || !files.length || !photosOn) return;
      touched.current = true;
      const plan = planFiles(files, chipsRefState.current.length);
      if (plan.notice) showNotice(noticeFor(plan.notice.slot, plan.notice.name));
      const added: Chip[] = plan.add.map((f) => {
        const key = chipKey();
        const kind = chipKind(f.name);
        const staged = f
          .arrayBuffer()
          .then((b) => stageFile(f.name, b))
          .then((r) => {
            if (!r.ok) throw new Error(r.kind);
            setChips((list) => list.map((c) => (c.key === key ? { ...c, state: 'ready', attachmentId: r.id } : c)));
            return r.id;
          });
        staged.catch((e: unknown) => {
          const problem = e instanceof Error && e.message === 'FILE_TOO_BIG' ? 'too_big' : 'unreadable';
          setChips((list) => list.map((c) => (c.key === key ? { ...c, state: 'failed', problem } : c)));
        });
        return {
          key,
          kind,
          name: f.name,
          bytes: f.size,
          url: kind === 'image' ? URL.createObjectURL(f) : undefined,
          state: 'preparing',
          staged,
          enter,
          ...(from ? { from } : {}),
        };
      });
      setChips((list) => [...list, ...added]);
      focusField();
    },
    [focusField, noticeFor, notSetUp, photosOn, setChips, showNotice, strip],
  );

  const removeChip = useCallback(
    (key: string) => {
      touched.current = true;
      setChips((list) => {
        const c = list.find((x) => x.key === key);
        if (c?.url?.startsWith('blob:')) URL.revokeObjectURL(c.url);
        return list.filter((x) => x.key !== key);
      });
    },
    [setChips],
  );

  // ---------------------------------------------------------------- the paste catcher (§22.4)
  const moveToSecretBox = useCallback(() => {
    // The span is removed from the field and a Secret box card (C7) is posted in this chat with the value in its masked
    // field (M5 T2, G-M5-21), titled from the pattern; groups never get one (the catcher offers no Move there).
    const first = segsRef.current.find((x): x is Extract<Segment, { kind: 'mask' }> => x.kind === 'mask');
    const moved = first ? maskValues.current.get(first.id) : undefined;
    maskValues.current.clear();
    if (moved && !inGroup)
      void invoke('secret:offer', { chatId, slot: suggestedNameSlot(moved.hit) })
        .then((r) => {
          if (r.ok) prefillSecret(r.value.id, secretPart(moved));
        })
        .catch(() => undefined);
    writeField(dropMasks(segsRef.current));
    setChips((list) => list.map((c) => (heldText(c) ? { ...c, text: (c.text ?? '').split(MASK_CHAR).join('') } : c)));
    setCatchOpen(false);
    touched.current = true;
    focusField();
  }, [chatId, focusField, inGroup, setChips, writeField]);

  const dismissCatch = useCallback(() => {
    setCatchOpen(false);
    focusField(false);
  }, [focusField]);

  // ---------------------------------------------------------------- send (§21.3)
  const send = useCallback(
    async (override = false) => {
      if (notSetUp || (catchOpen && !override)) return;
      if (strip?.kind === 'edit') {
        // Art. 8: an edit passes the same limit and paste catcher as a Send; main re-checks it (message:edit).
        const plan = editSubmission(segsRef.current, {
          limit: TEXT_LIMIT,
          override,
          check: runCheck,
          hidden: t('composer.paste.hidden_in_bubble'),
          trim: trimBlankLines,
        });
        if (plan.kind === 'catch') setCatchOpen(true);
        if (plan.kind !== 'save') return;
        const id = strip.messageId;
        const saved = strip.saved;
        if (await editMessage(id, plan.text)) {
          setCatchOpen(false);
          announce(t('bubble.edit.saved'));
          writeField(saved.segs);
          setChips(() => saved.chips);
          setStrip(saved.reply ? { kind: 'reply', messageId: saved.reply } : null);
        }
        return;
      }
      const list = chipsRefState.current;
      if (textLength(segsRef.current) > TEXT_LIMIT) return;
      if (!hasText(segsRef.current) && !list.length) return;
      const failed = list.find((c) => c.state === 'failed');
      if (failed) {
        showNotice(noticeFor(failed.problem ?? 'unreadable', failed.name));
        return;
      }
      if (!override && runCheck()) {
        setCatchOpen(true);
        return;
      }
      const hidden = t('composer.paste.hidden_in_bubble');
      const text = trimBlankLines(serialise(segsRef.current, 'send', hidden));
      const ready = Promise.all(
        list.map((c) => {
          if (!heldText(c)) return c.staged ?? Promise.reject(new Error('not staged'));
          const body = (c.text ?? '').split(MASK_CHAR).join(hidden);
          return stageFile(c.name, new TextEncoder().encode(body).buffer).then((r) => {
            if (!r.ok) throw new Error(r.kind);
            return r.id;
          });
        }),
      );
      ready.catch(() => undefined);
      const replyToId = strip?.kind === 'reply' || strip?.kind === 'side' ? strip.messageId : undefined;
      const outgoing = {
        chatId,
        clientId: newClientId(),
        text,
        ...(replyToId ? { replyToId } : {}),
        ...(strip?.kind === 'side' ? { side: true, ...(strip.quote.trim() ? { quote: strip.quote.slice(0, ASK_QUOTE_MAX) } : {}) } : {}),
        attachments: list.map((c) => ({ ...chipAttachment(c), path: c.url ?? '' })),
        ready,
        ...(override ? { secretOverride: true } : {}),
      };
      // The field, chips, preview and reply strip clear; the draft is deleted (main deletes it with the send); focus stays.
      cancelDraftSave(chatId);
      cacheDraft(chatId, null);
      maskValues.current.clear();
      writeField([]);
      setChips(() => []);
      setStrip(null);
      setCatchOpen(false);
      setMention(null);
      setLinkPreviewRemoved(false);
      touched.current = false;
      focusField();
      announce(t('composer.announce.sent'));
      if ((await sendOutgoing(outgoing)).ok) confirmSent();
    },
    [notSetUp, catchOpen, strip, chatId, runCheck, noticeFor, showNotice, writeField, setChips, focusField, confirmSent],
  );

  const activateRound = useCallback(() => {
    if (round === 'send' || round === 'save_edit') void send();
    else if (round === 'send_voice') voice.finish();
    // §14.4: Stop on the reply that is coming in.
    else if (round === 'stop') void invoke('message:stopReply', { chatId }).catch(() => undefined);
  }, [round, send, voice, chatId]);

  // ---------------------------------------------------------------- field events
  const readField = useCallback(() => {
    const el = field.current;
    if (!el) return;
    const next = domToSegments(el);
    // An emptied field keeps a stray <br>; clear it so the placeholder shows.
    if (checkText(next) === '' && el.childNodes.length) el.replaceChildren();
    setSegs(next);
  }, [setSegs]);

  const updateMention = useCallback(() => {
    const el = field.current;
    if (!el || (chat.kind !== 'foo' && chat.kind !== 'group')) return setMention(null);
    const q = mentionQuery(textBeforeCaret(el));
    if (!q || mentionDismissedAt.current === q.at) {
      if (!q) mentionDismissedAt.current = null;
      return setMention(null);
    }
    const r = el.getBoundingClientRect();
    setMention((m) => ({ query: q.query, at: q.at, index: m && m.at === q.at ? m.index : 0, x: caretX(el), bottom: r.top }));
  }, [chat.kind]);

  const matches = useMemo(() => (mention ? filterHelpers(helpers, mention.query) : []), [mention, helpers]);
  // GAP: GAPS.md 2026-10-17 "role textbox cannot carry aria-expanded"
  /** The mention listbox is on screen (04-2 §22.8): the field takes the combobox role and owns it. */
  const listOpen = !!mention && matches.length > 0;

  const pickMention = useCallback(
    (h: HelperRow) => {
      const el = field.current;
      if (!el || !mention) return;
      const caret = caretOffset(el);
      const [a, rest] = splitAt(segsRef.current, mention.at);
      const [, b] = splitAt(rest, caret - mention.at);
      const head: Segment[] = [...a, { kind: 'mention', helperId: h.id, name: h.name }, { kind: 'text', text: ' ' }];
      writeField(tidy([...head, ...b]), checkText(tidy(head)).length);
      setMention(null);
      touched.current = true;
    },
    [mention, writeField],
  );

  const onInput = useCallback(() => {
    touched.current = true;
    readField();
    setNotice(null);
    updateMention();
    const t0 = Date.now();
    if (t0 - lastKeystroke.current >= KEYSTROKE_EVERY_MS) {
      lastKeystroke.current = t0;
      update((s) => {
        s.live.lastKeystrokeAt = clockNow();
      });
    }
    clearTimeout(typedTimer.current);
    typedTimer.current = setTimeout(() => {
      if (runCheck()) setCatchOpen(true);
    }, TYPED_CHECK_MS);
  }, [readField, updateMention, runCheck]);
  useEffect(() => () => clearTimeout(typedTimer.current), []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (notSetUp) return;
      touched.current = true;
      const files = Array.from(e.clipboardData.files);
      if (files.length) {
        addFiles(files);
        return;
      }
      const text = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
      if (!text) return;
      setNotice(null);
      const band = pasteBand(text);
      if (band === 'file') {
        // R1 T6 (§22.5, pick 7): over 10,000 characters the paste is saved as `pasted-{time}.txt` and shows as a file chip
        // counted under §22.6. The catcher looks at the whole text first: with a catch, the chip holds the masked text and
        // the file is written only on Send, so a secret never reaches disk.
        if (strip?.kind === 'edit') return;
        const name = pastedFileName(clockNow(), timeZone);
        if (!findSecrets(text, {}).length) {
          addFiles([new File([text], name, { type: 'text/plain' })], undefined, 'fold');
          announce(t('composer.paste.saved_file'));
          return;
        }
        if (chipsRefState.current.length >= MAX_FILES) {
          showNotice(noticeFor('too_many_files', name));
          return;
        }
        setChips((list) => [
          ...list,
          {
            key: chipKey(),
            kind: 'file',
            name,
            bytes: new TextEncoder().encode(text).byteLength,
            text: maskText(text),
            state: 'ready',
            enter: 'fold',
          },
        ]);
        announce(t('composer.paste.saved_file'));
        setCatchOpen(true);
        return;
      }
      if (band === 'chip') {
        if (strip?.kind === 'edit') return;
        const caught = findSecrets(text, {}).length > 0;
        setChips((list) => [
          ...list,
          {
            key: chipKey(),
            kind: 'pasted',
            name: `${t('composer.chip.pasted_name')}.txt`,
            bytes: text.length,
            text: caught ? maskText(text) : text,
            state: 'ready',
            enter: 'fold',
          },
        ]);
        if (caught) setCatchOpen(true);
        return;
      }
      const el = field.current;
      if (!el) return;
      // The check runs before the text goes in (§22.4); P16 only when the paste is the whole message.
      const ctx = checkText(segsRef.current) === '' ? checkCtx() : {};
      const hits = findSecrets(text, ctx);
      if (!hits.length) {
        document.execCommand('insertText', false, text);
        return;
      }
      const sel = selectionOffsets(el) ?? { start: checkText(segsRef.current).length, end: checkText(segsRef.current).length };
      const [a, rest] = splitAt(segsRef.current, sel.start);
      const [, b] = splitAt(rest, sel.end - sel.start);
      const masked = maskHits([{ kind: 'text', text }], hits, newMaskId);
      for (const [id, v] of masked.masks) maskValues.current.set(id, v);
      const head = tidy([...a, ...masked.segs]);
      writeField(tidy([...head, ...b]), checkText(head).length);
      setCatchOpen(true);
    },
    [addFiles, checkCtx, noticeFor, notSetUp, setChips, showNotice, strip, timeZone, writeField],
  );

  const wrap = useCallback(
    (marker: string) => {
      const el = field.current;
      const sel = el && selectionOffsets(el);
      if (!el || !sel || sel.start === sel.end) return;
      const [a, rest] = splitAt(segsRef.current, sel.start);
      const [mid, b] = splitAt(rest, sel.end - sel.start);
      const head = tidy([...a, { kind: 'text', text: marker }, ...mid, { kind: 'text', text: marker }]);
      writeField(tidy([...head, ...b]), checkText(head).length);
      touched.current = true;
    },
    [writeField],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const el = field.current;
      const caret = el ? caretOffset(el) : 0;
      const firstBreak = checkText(segsRef.current).indexOf('\n');
      const action = composerKeyAction(e.nativeEvent, {
        fieldEmpty: checkText(segsRef.current) === '',
        canEditLast: firstBreak < 0 || caret <= firstBreak,
        menuOpen,
        mentionOpen: !!mention,
        mentionHasMatch: matches.length > 0,
        catchOpen,
        recording,
        strip: strip?.kind ?? null,
        streaming: replying,
        chips: chipsRefState.current.length,
        // Read only for Ctrl+I, so the other keys pay nothing for it (PERF-02).
        hasSelection: e.ctrlKey && e.key.toLowerCase() === 'i' && !(window.getSelection()?.isCollapsed ?? true),
      });
      if (!action) return;
      switch (action) {
        case 'send':
          e.preventDefault();
          if (recording === 'locked') voice.finish();
          else void send();
          return;
        case 'newline':
          return; // the browser inserts the line break
        case 'edit_last': {
          const m = lastEditable();
          if (!m) return;
          e.preventDefault();
          startEdit(m);
          return;
        }
        case 'close_menu':
          setMenuOpen(false);
          break;
        case 'dismiss_catch':
          dismissCatch();
          break;
        case 'cancel_recording':
          voice.cancel();
          break;
        case 'cancel_strip':
          closeStrip();
          break;
        case 'stop_reply':
          void invoke('message:stopReply', { chatId }).catch(() => undefined);
          break;
        case 'focus_last_chip':
          chipsRef.current?.focusLast();
          break;
        case 'pick_files':
          picker.current?.click();
          break;
        case 'wrap_bold':
        case 'wrap_italic':
        case 'wrap_strike':
          wrap(WRAP[action]);
          break;
        case 'mention_prev':
          setMention((m) => m && { ...m, index: (m.index - 1 + matches.length) % Math.max(1, matches.length) });
          break;
        case 'mention_next':
          setMention((m) => m && { ...m, index: (m.index + 1) % Math.max(1, matches.length) });
          break;
        case 'mention_pick': {
          const h = matches[mention?.index ?? 0];
          if (h) pickMention(h);
          break;
        }
        case 'mention_close':
          mentionDismissedAt.current = mention?.at ?? null;
          setMention(null);
          if (e.key === ' ') return; // the space is typed
          break;
        case 'block':
          break;
      }
      e.preventDefault();
      e.stopPropagation();
    },
    [
      menuOpen,
      mention,
      matches,
      catchOpen,
      recording,
      strip,
      replying,
      voice,
      send,
      lastEditable,
      startEdit,
      dismissCatch,
      closeStrip,
      wrap,
      pickMention,
    ],
  );

  // ---------------------------------------------------------------- drag-drop (§22.6)
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const blocked = () => dialogOpen || !!voice.rec;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e) || blocked()) return;
      depth++;
      const host = bar.current?.closest('main');
      if (host) setDrag({ look: notSetUp ? { kind: 'disabled' } : { kind: 'ok' }, host });
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e) || blocked()) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = notSetUp ? 'none' : 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDrag(null);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDrag(null);
      if (blocked() || notSetUp) return;
      addFiles(Array.from(e.dataTransfer?.files ?? []), { x: e.clientX, y: e.clientY });
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [addFiles, dialogOpen, notSetUp, voice.rec]);

  // ---------------------------------------------------------------- pending-card strip (§23.4)
  const waiting = useMemo(
    () =>
      waitingCards(
        Object.values(cardsById).filter((c) => c.chatId === chatId),
        now,
      ),
    [cardsById, chatId, now],
  );
  const strip23 = stripView(waiting, now);
  const oldestMessageId = strip23?.card.messageId ?? null;
  useEffect(() => {
    if (!oldestMessageId) return;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const log = document.querySelector<HTMLElement>(`[data-testid="${TID.threadLog}"]`);
        const row = log?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(oldestMessageId)}"]`);
        if (!log || !row) return setPendingInView(false);
        const a = row.getBoundingClientRect();
        const b = log.getBoundingClientRect();
        const seen = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        setPendingInView(a.height > 0 && seen / a.height >= 0.5);
      });
    };
    check();
    document.addEventListener('scroll', check, true);
    window.addEventListener('resize', check);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('scroll', check, true);
      window.removeEventListener('resize', check);
    };
  }, [oldestMessageId, slice?.ids.length]);

  // ---------------------------------------------------------------- banner actions (§23.2)
  const bannerAction = useCallback(() => {
    if (composerBanner === 'mic_blocked') void invoke('app:openWindowsSettings', { page: 'privacy-microphone' }).catch(() => undefined);
    else if (composerBanner === 'no_mic' || composerBanner === 'mic_busy') voice.micKey();
    else if (composerBanner === 'helper_paused' && pausedHelper)
      void invoke('helper:pause', { helperId: pausedHelper.id, on: false })
        .then((r) => {
          if (r.ok) update((s) => loadHelpersReducer(s.helpers, [r.value]));
        })
        .catch((e: unknown) => console.warn('helper:pause', e));
  }, [composerBanner, pausedHelper, voice]);

  // ---------------------------------------------------------------- render
  const disabled = notSetUp;
  const showPending = !!strip23 && !pendingInView && !catchOpen;

  return (
    <div ref={bar} className={styles.bar} data-testid={TID.composer} data-state={round}>
      <div className={styles.column}>
        <ComposerNoticeStack chatId={chatId} />
        {(composerBanner || catchOpen || showPending || notice || counter) && (
          <div className={styles.stack}>
            {composerBanner && (
              <ComposerBanner
                type={composerBanner}
                helper={pausedHelper?.name ?? ''}
                onAction={bannerAction}
                onDismiss={() => setMicProblem(null)}
              />
            )}
            {catchOpen ? (
              <PasteCatcher onMove={inGroup ? undefined : moveToSecretBox} onSendAnyway={() => void send(true)} onDismiss={dismissCatch} />
            ) : showPending && strip23 ? (
              <PendingStrip view={strip23} onShow={() => requestRevealCard(chatId, strip23.card.id)} />
            ) : (
              <ComposerNotice notice={notice} counter={counter} />
            )}
          </div>
        )}
        <div className={styles.chipRow}>
          <SuggestionChips view={suggestView} onPick={pickSuggestion} />
          <ActionChips chatId={chatId} view={actionView} />
        </div>
        <div className={styles.row}>
          <span className={styles.slot}>
            {voice.rec ? (
              <RecordCancel onCancel={voice.cancel} />
            ) : (
              <AttachMenu
                open={menuOpen}
                disabled={disabled}
                onOpen={setMenuOpen}
                {...(photosOn ? { onFiles: () => picker.current?.click() } : {})}
                {...(signinOn
                  ? { onSecret: inGroup ? undefined : () => void invoke('secret:offer', { chatId, slot: 'key' }).catch(() => undefined) }
                  : { hideSecret: true })}
                onEmoji={() => {
                  focusField();
                  void invoke('app:showEmojiPanel', {}).catch(() => undefined);
                }}
              />
            )}
          </span>
          {/* P1 T6: when recording ends the bar leaves over the pill (absolute while [data-exit]), shrinking into the mic. */}
          <Presence show={!!voice.rec}>
            <VoiceRecorder rec={voice.rec ?? lastRec!} />
          </Presence>
          {!voice.rec && (
            <div
              ref={pill}
              className={styles.pill}
              data-disabled={disabled || undefined}
              data-stacked={!!(strip || chips.length) || undefined}
              data-offline={banner === 'offline' || undefined}
            >
              {strip?.kind === 'edit' && <EditStrip onClose={closeStrip} />}
              {strip?.kind === 'reply' && quote && <ReplyStrip quote={quote} onClose={closeStrip} />}
              {strip?.kind === 'side' && quote && <ReplyStrip quote={quote} side onClose={closeStrip} />}
              {chips.length > 0 && <AttachmentChips ref={chipsRef} chips={chips} onRemove={removeChip} onExit={() => focusField()} />}
              <div className={styles.fieldWrap} data-locked={hasMask(segs) || undefined}>
                {/* P1 T6 (02 §F7.1): a caught secret blurs and a lock slides in. */}
                {hasMask(segs) && (
                  <span className={styles.lock} aria-hidden>
                    <Icon name="LockClosed" size={16} />
                  </span>
                )}
                {empty && (
                  <span className={styles.placeholder} id={placeholderId} aria-hidden>
                    {placeholder}
                  </span>
                )}
                <div
                  ref={field}
                  className={styles.field}
                  contentEditable={!disabled}
                  suppressContentEditableWarning
                  spellCheck
                  // 04-2 §22.8 asks for aria-expanded="true" while the mention list is open, which ARIA 1.2 does not allow
                  // on role="textbox" (axe aria-allowed-attr). While the listbox shows, the field is therefore an editable
                  // combobox (the ARIA 1.2 pattern for a field that owns a popup list); at rest it is the §21.1 textbox.
                  role={listOpen ? 'combobox' : 'textbox'}
                  aria-multiline={listOpen ? undefined : 'true'}
                  aria-label={t('composer.field.accessible_name', { name: chatName })}
                  aria-description={placeholder}
                  aria-disabled={disabled || undefined}
                  aria-expanded={listOpen || undefined}
                  aria-haspopup={listOpen ? 'listbox' : undefined}
                  aria-autocomplete={listOpen ? 'list' : undefined}
                  aria-controls={listOpen ? MENTION_LIST_ID : undefined}
                  aria-activedescendant={listOpen && mention ? mentionRowId(mention.index) : undefined}
                  tabIndex={disabled ? -1 : 0}
                  data-testid={TID.composerField}
                  onInput={onInput}
                  onPaste={onPaste}
                  onKeyDown={onKeyDown}
                  onKeyUp={updateMention}
                  onClick={updateMention}
                  onBlur={() => setMention(null)}
                />
              </div>
            </div>
          )}
          <span className={styles.slot}>
            <MorphButton
              state={round}
              disabledIcon={recording ? 'Mic' : hasContent ? 'Send' : 'Mic'}
              tooltip={tooltip}
              tooShort={voice.tooShort}
              confirmed={confirmed}
              level={voice.rec?.levels.at(-1) ?? 0}
              onActivate={activateRound}
              onMicDown={voice.micDown}
              onMicKey={voice.micKey}
            />
          </span>
        </div>
      </div>
      <input
        ref={picker}
        type="file"
        multiple
        accept={ACCEPT}
        className={styles.srOnly}
        tabIndex={-1}
        aria-hidden
        // Hidden from assistive tech, but every input carries a name (ART-26a hand audit): the menu item it serves.
        aria-label={t('composer.attach_menu.files')}
        onChange={(e) => {
          addFiles(Array.from(e.currentTarget.files ?? []));
          e.currentTarget.value = '';
        }}
      />
      {mention && (
        <MentionMenu
          helpers={helpers}
          matches={matches}
          query={mention.query}
          index={Math.min(mention.index, Math.max(0, matches.length - 1))}
          x={mention.x}
          bottom={mention.bottom}
          onPick={pickMention}
          onHover={(i) => setMention((m) => m && { ...m, index: i })}
          onMakeHelper={() => setMention(null)}
        />
      )}
      {drag && createPortal(<DropOverlay look={drag.look} agentName={agentName} />, drag.host)}
    </div>
  );
}

/** R1 T6: a chip whose words live in the composer until Send ("Pasted text", or a `pasted-{time}.txt` with a catch). */
function heldText(c: Chip): boolean {
  return c.text !== undefined;
}

/** A "Pasted text" chip's text with every caught span replaced by the mask character (§22.5 + §22.4). */
function maskText(text: string): string {
  const hits = findSecrets(text, {});
  let out = text;
  for (const h of [...hits].sort((a, b) => b.start - a.start)) out = out.slice(0, h.start) + MASK_CHAR + out.slice(h.end);
  return out;
}
