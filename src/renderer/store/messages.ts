// Spec: 08-5 §5 `messages.ts { byChat: { ids; byId; oldestSeq; hasMore; lastSeq } }`, rules 2 (rev), 3 (optimistic send
// re-keys in place: a row the composer inserted under its clientId takes the stored id when main confirms it or when its
// `message:upsert` arrives), 4 (a `message:delta` gap → `message:get` resync, X-117), 5 (pagination: newest 50 from
// chat:open, then message:list before oldestSeq); 08-1 §3.2 message:react / message:pin, §3.3 message:delta / message:badge;
// 04 §6 (reply, edit, delete), §7 (Not sent → Try again), §8 (one reaction per person per bubble; picking another replaces
// it), §9.1 (keep a voice note), §10.5 / §13.1 / §13.2 / §15 (expanding is permanent for that message), §17 (👍/👎 state).
// The composer (builder B) calls insertOptimistic / confirmSent / failSend and reads `composer[chatId]` requests.
import { freeze, isDraft, original } from 'immer';
import type { BadgeValue, DraftRow, MessageRow, WaMessageRow } from '../../shared/types';
import { invoke } from '../ipc/client';
import { acceptRev } from './chats';
import { update, useStore, type RootState } from './index';

/**
 * A row as the list holds it: `pending` while the composer's optimistic copy waits for main. Its status is `queued` then,
 * so the bubble shows the Clock tick ("Waiting to send", 04 §3.3) until main answers.
 */
export type StoredMessage = MessageRow & { pending?: boolean };

export interface ChatMessages {
  ids: string[];
  byId: Record<string, StoredMessage>;
  oldestSeq: number | null;
  hasMore: boolean;
  lastSeq: number;
}

/** What the message list asks the composer to do (04 §6.1 Reply / Edit, §16.1 "puts … in the composer"). */
export type ComposerRequest =
  | { kind: 'reply'; messageId: string; at: number }
  | { kind: 'edit'; messageId: string; at: number }
  // `keep`: an AI page's draftMessage (CR-0022 (h)) never replaces words the user has typed.
  | { kind: 'prefill'; text: string; at: number; keep?: true }
  // R1 T6 (04 §17.5): Ask about this; `quote` is the selected words, or the whole message from the menu.
  | { kind: 'side'; messageId: string; quote: string; at: number };

export interface MessagesState {
  byChat: Record<string, ChatMessages>;
  /** Parts a user expanded ("Read more", "Show all {n} lines|rows", worked steps, voice transcript): `${messageId}:${part}`. */
  expanded: Record<string, true>;
  /** 04 §17.1: a 👍 / 👎 the user just gave, shown until `message:feedback` answers; the kept one is the row's (CR-0062). */
  feedback: Record<string, 'good' | 'bad' | null>;
  /** The newest request per chat for the composer; the composer clears it with takeComposerRequest. */
  composer: Record<string, ComposerRequest | undefined>;
  /** Last applied `message:delta` seq per streaming message. */
  deltaSeq: Record<string, number>;
  /** 04 §6.4 / §26: the row that carries the jump highlight now (a quote click). */
  highlightId: string | null;
  /** 04 §10.11: a mirrored WhatsApp group's rows from chat:open `waMessages` (read-only). */
  wa: Record<string, WaMessageRow[]>;
  /** 04 §13 C-26: the link waiting for "Open {domain}" (its text named another domain). */
  pendingLink: { url: string; shown: string; domain: string } | null;
  /** C-24 / C-25: the message ids the open delete confirm is about. */
  pendingDelete: string[];
  /** 04-2 §23.5 (builder B): chat:open `draft`, for the composer to restore once. */
  drafts: Record<string, DraftRow | null>;
}

export const initialMessages = (): MessagesState => ({
  byChat: {},
  expanded: {},
  feedback: {},
  composer: {},
  deltaSeq: {},
  highlightId: null,
  wa: {},
  pendingLink: null,
  pendingDelete: [],
  drafts: {},
});

const emptyChat = (): ChatMessages => ({ ids: [], byId: {}, oldestSeq: null, hasMore: false, lastSeq: 0 });

function sortIds(c: ChatMessages): void {
  // The seqs come from the store's base objects where they exist: reading every message through the draft made a child
  // draft of each of the chat's rows, and sorting the draft array trapped every read and write (PERF-04: 5,000 rows on
  // each page of history). A message's seq never changes; rows added in this update are read as they were assigned.
  const base = isDraft(c.byId) ? (original(c.byId) as ChatMessages['byId']) : c.byId;
  const seq = (id: string) => (base[id] ?? c.byId[id])?.seq ?? 0;
  c.ids = Array.from(c.ids).sort((a, b) => seq(a) - seq(b));
}

/** chat:open / bootstrap firstMessages: the newest page; `hasMore` when a full page came back. Optimistic rows stay. */
export function loadMessagesReducer(s: MessagesState, chatId: string, rows: MessageRow[], pageSize: number): void {
  const c = emptyChat();
  for (const m of rows) {
    c.byId[m.id] = m;
    c.ids.push(m.id);
  }
  const old = s.byChat[chatId];
  if (old)
    for (const id of old.ids) {
      const m = old.byId[id]!;
      if (m.pending && !rows.some((r) => r.clientId && r.clientId === m.clientId)) {
        c.byId[id] = m;
        c.ids.push(id);
      }
    }
  sortIds(c);
  c.oldestSeq = rows.length ? Math.min(...rows.map((m) => m.seq)) : null;
  c.lastSeq = rows.length ? Math.max(...rows.map((m) => m.seq)) : 0;
  c.hasMore = rows.length >= pageSize;
  s.byChat[chatId] = c;
}

/** message:list (older page): prepends, keeps what is loaded. */
export function prependMessagesReducer(s: MessagesState, chatId: string, rows: MessageRow[], pageSize: number): void {
  const c = (s.byChat[chatId] ??= emptyChat());
  for (const m of rows) {
    if (c.byId[m.id]) continue;
    c.byId[m.id] = m;
    c.ids.push(m.id);
  }
  sortIds(c);
  if (rows.length) c.oldestSeq = Math.min(c.oldestSeq ?? Infinity, ...rows.map((m) => m.seq));
  c.hasMore = rows.length >= pageSize;
}

/**
 * The chat after an older page, built from plain objects (no draft): the same result as `prependMessagesReducer`. A 5,000-row
 * chat made Immer copy, finalise and freeze the whole chat on every page through a draft (PERF-04).
 */
export function withOlderPage(c: ChatMessages | undefined, rows: MessageRow[], pageSize: number): ChatMessages {
  const base = c ?? emptyChat();
  const added = rows.filter((m, i) => !base.byId[m.id] && rows.findIndex((r) => r.id === m.id) === i);
  const byId = added.length ? { ...base.byId } : base.byId;
  for (const m of added) byId[m.id] = m;
  const seq = (id: string) => byId[id]?.seq ?? 0;
  const ids = added.length ? [...base.ids, ...added.map((m) => m.id)].sort((a, b) => seq(a) - seq(b)) : base.ids;
  const oldestSeq = rows.length ? Math.min(base.oldestSeq ?? Infinity, ...rows.map((m) => m.seq)) : base.oldestSeq;
  return { ...base, ids, byId, oldestSeq, hasMore: rows.length >= pageSize };
}

/** message:list (older page) into the store: `withOlderPage` set as a new state object, not through an Immer draft. */
export function prependMessages(chatId: string, rows: MessageRow[], pageSize: number): void {
  const messages = useStore.getState().messages;
  // Frozen as Immer would leave it (deep; the rows already in the store are frozen and skipped), so the next Immer update
  // does not freeze the whole chat itself.
  const byChat = freeze({ ...messages.byChat, [chatId]: freeze(withOlderPage(messages.byChat[chatId], rows, pageSize), true) });
  useStore.setState({ messages: freeze({ ...messages, byChat }) });
}

function rekey(c: ChatMessages, from: string, to: string): void {
  if (from === to || !c.byId[from]) return;
  const m = c.byId[from]!;
  delete c.byId[from];
  if (c.byId[to]) c.ids = c.ids.filter((id) => id !== from);
  else c.ids = c.ids.map((id) => (id === from ? to : id));
  c.byId[to] ??= { ...m, id: to };
}

/** The local id of a row the composer inserted before main stored it. */
export const localId = (clientId: string) => `local:${clientId}`;

export function upsertMessageReducer(s: MessagesState, row: MessageRow): void {
  const c = (s.byChat[row.chatId] ??= emptyChat());
  if (row.clientId && c.byId[localId(row.clientId)]) rekey(c, localId(row.clientId), row.id);
  const stored = c.byId[row.id];
  if (stored && !stored.pending && !acceptRev('message', row.id, stored, row)) return;
  c.byId[row.id] = row;
  if (!c.ids.includes(row.id)) {
    c.ids.push(row.id);
    if (row.seq < (c.byId[c.ids[c.ids.length - 2] ?? '']?.seq ?? -Infinity)) sortIds(c);
  }
  c.lastSeq = Math.max(c.lastSeq, row.seq);
  if (c.oldestSeq === null) c.oldestSeq = row.seq;
}

// ---------------------------------------------------------------- the composer's seam (builder B)

/** The composer shows its message at once (04 §1.6 "the user sends: always jumps to the end"); seq sorts it last. */
export function insertOptimisticReducer(s: MessagesState, row: MessageRow): void {
  if (!row.clientId) throw new Error('insertOptimistic needs the clientId');
  const c = (s.byChat[row.chatId] ??= emptyChat());
  const id = localId(row.clientId);
  c.byId[id] = { ...row, id, seq: Math.max(row.seq, c.lastSeq + 1), pending: true, status: 'queued' };
  if (!c.ids.includes(id)) c.ids.push(id);
}

/** message:send answered `{ messageId }`: the local row takes the stored id (its upsert may already have done this). */
export function confirmSentReducer(s: MessagesState, chatId: string, clientId: string, messageId: string, queued: boolean): void {
  const c = s.byChat[chatId];
  if (!c) return;
  rekey(c, localId(clientId), messageId);
  const m = c.byId[messageId];
  if (m?.pending) {
    m.pending = false;
    m.status = queued ? 'queued' : 'sent';
  }
}

/** message:send failed before main stored anything: the bubble shows Not sent (04 §7). */
export function failSendReducer(s: MessagesState, chatId: string, clientId: string): void {
  const m = s.byChat[chatId]?.byId[localId(clientId)];
  if (m) m.status = 'failed';
}

export function insertOptimistic(row: MessageRow): void {
  update((d) => insertOptimisticReducer(d.messages, row));
}
export function confirmSent(chatId: string, clientId: string, messageId: string, queued: boolean): void {
  update((d) => confirmSentReducer(d.messages, chatId, clientId, messageId, queued));
}
export function failSend(chatId: string, clientId: string): void {
  update((d) => failSendReducer(d.messages, chatId, clientId));
}

export function requestComposer(chatId: string, req: ComposerRequest): void {
  update((d) => {
    d.messages.composer[chatId] = req;
  });
}
/** The composer takes the request once (and clears it). */
export function takeComposerRequest(chatId: string): ComposerRequest | undefined {
  const req = useStore.getState().messages.composer[chatId];
  if (req)
    update((d) => {
      delete d.messages.composer[chatId];
    });
  return req;
}

// ---------------------------------------------------------------- events (08-1 §3.3)

function findMessage(s: MessagesState, messageId: string): StoredMessage | undefined {
  for (const c of Object.values(s.byChat)) if (c.byId[messageId]) return c.byId[messageId];
  return undefined;
}

/** message:delta: appends in order; returns false on a gap (the caller resyncs with message:get). */
export function applyDeltaReducer(s: MessagesState, d: { messageId: string; seq: number; append: string }): boolean {
  const m = findMessage(s, d.messageId);
  const last = s.deltaSeq[d.messageId] ?? 0;
  if (!m || d.seq !== last + 1) return d.seq <= last;
  m.text += d.append;
  m.status = 'streaming';
  s.deltaSeq[d.messageId] = d.seq;
  return true;
}

export function setBadgeReducer(s: MessagesState, d: { messageId: string; badge: BadgeValue | null }): void {
  const m = findMessage(s, d.messageId);
  if (m) m.badge = d.badge;
}

/** `message:get` after a delta gap (08-5 §5 rule 4). */
export async function resyncMessage(messageId: string): Promise<void> {
  const r = await invoke('message:get', { messageId });
  if (r.ok)
    update((d) => {
      delete d.messages.deltaSeq[messageId];
      const c = d.messages.byChat[r.value.chatId];
      if (c?.byId[messageId] && !c.byId[messageId]!.pending) c.byId[messageId] = r.value;
      else upsertMessageReducer(d.messages, r.value);
    });
}

// ---------------------------------------------------------------- actions on bubbles

/** 04 §8: one reaction per person; the same emoji again removes it, another one replaces it. */
export function reactionChange(current: string | undefined, emoji: string): { remove?: string; add?: string } {
  if (current === emoji) return { remove: emoji };
  return current ? { remove: current, add: emoji } : { add: emoji };
}

export async function react(chatId: string, messageId: string, emoji: string): Promise<void> {
  const m = useStore.getState().messages.byChat[chatId]?.byId[messageId];
  if (!m) return;
  const mine = m.reactions.find((r) => r.by === 'me')?.emoji;
  const change = reactionChange(mine, emoji);
  const before = m.reactions;
  update((d) => {
    const x = d.messages.byChat[chatId]?.byId[messageId];
    if (!x) return;
    x.reactions = x.reactions.filter((r) => r.by !== 'me');
    if (change.add) x.reactions.push({ emoji: change.add, by: 'me' });
  });
  try {
    if (change.remove) {
      const r = await invoke('message:react', { messageId, emoji: change.remove, on: false });
      if (!r.ok) throw new Error(r.error.kind);
    }
    if (change.add) {
      const r = await invoke('message:react', { messageId, emoji: change.add, on: true });
      if (!r.ok) throw new Error(r.error.kind);
    }
  } catch {
    update((d) => {
      const x = d.messages.byChat[chatId]?.byId[messageId];
      if (x) x.reactions = before;
    });
  }
}

/** 04 §6.3 / §1.9 after C-24 / C-25: the rows become the deleted state (main sends the upserts). */
export async function deleteMessages(messageIds: string[]): Promise<boolean> {
  if (!messageIds.length) return true;
  const r = await invoke('message:delete', { messageIds, confirm: true });
  return r.ok;
}

/** 04 §6.2 save of an edit (the composer's edit strip calls this). */
export async function editMessage(messageId: string, text: string): Promise<boolean> {
  const r = await invoke('message:edit', { messageId, text });
  if (r.ok) update((d) => upsertMessageReducer(d.messages, r.value));
  return r.ok;
}

/** 04 §7 "Try again" on a Not sent bubble; 04 §19.4 "Try again" on a cut-off reply. */
export async function retryMessage(messageId: string): Promise<boolean> {
  const r = await invoke('message:retry', { messageId });
  if (r.ok) update((d) => upsertMessageReducer(d.messages, r.value));
  return r.ok;
}

/** 04 §9.1 "Keep this voice note" / "Don't keep". */
export async function keepVoice(chatId: string, messageId: string, on: boolean): Promise<void> {
  const r = await invoke('message:pin', { messageId, on });
  if (r.ok)
    update((d) => {
      const m = d.messages.byChat[chatId]?.byId[messageId];
      if (m) m.pinned = on;
    });
}

export function expand(messageId: string, part: string): void {
  update((d) => {
    d.messages.expanded[`${messageId}:${part}`] = true;
  });
}
export function toggleExpand(messageId: string, part: string): void {
  update((d) => {
    const k = `${messageId}:${part}`;
    if (d.messages.expanded[k]) delete d.messages.expanded[k];
    else d.messages.expanded[k] = true;
  });
}

export type FeedbackChip = 'wrong' | 'not_asked' | 'too_long' | 'too_short' | 'other';

/** CR-0062: 👍 / 👎 (with the §17.2 chips and words) kept on this PC through `message:feedback`; null clears it. */
/** The latest `setFeedback` call per message: an older reply must not clear a newer pending vote (👍 then 👎 quickly). */
const feedbackCalls = new Map<string, number>();

export function setFeedback(messageId: string, value: 'good' | 'bad' | null, extra: { chips?: FeedbackChip[]; note?: string } = {}): void {
  const call = (feedbackCalls.get(messageId) ?? 0) + 1;
  feedbackCalls.set(messageId, call);
  update((d) => {
    d.messages.feedback[messageId] = value;
  });
  const settle = () => {
    if (feedbackCalls.get(messageId) !== call) return;
    feedbackCalls.delete(messageId);
    update((d) => {
      delete d.messages.feedback[messageId];
    });
  };
  void invoke('message:feedback', { messageId, vote: value, ...extra }).then(settle, settle);
}

export function setHighlight(messageId: string | null): void {
  update((d) => {
    d.messages.highlightId = messageId;
  });
}

const NO_IDS: string[] = [];
export const selectMessageIds = (chatId: string) => (s: RootState) => s.messages.byChat[chatId]?.ids ?? NO_IDS;
export const selectMessage = (chatId: string, id: string) => (s: RootState) => s.messages.byChat[chatId]?.byId[id];
export const selectChatMessages = (chatId: string) => (s: RootState) => s.messages.byChat[chatId];
export const selectExpanded = (messageId: string, part: string) => (s: RootState) => !!s.messages.expanded[`${messageId}:${part}`];
/**
 * The 👍/👎 shown on an answer: a vote still in flight, else the stored one the bubble already holds (`MessageRow.feedback`,
 * CR-0062). The stored value comes in from the caller, so this stays one lookup on every store update (PERF-02: it runs
 * for every answer on screen at each key).
 */
export const selectFeedback = (messageId: string, stored: 'good' | 'bad' | null | undefined) => (s: RootState) =>
  messageId in s.messages.feedback ? s.messages.feedback[messageId] : (stored ?? null);
