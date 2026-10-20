// Spec: 08-1 §3.2 (app:getBootstrap, chat:list, chat:open, chat:pin, chat:markRead, message:list), §3.4 (derivations:
// lastLine, hasDraft, stepsDone, nowLine, slow), §4.3 (tables), §4.6 rule 7 (chats.pill derived by main); 03-shell-1
// §3.4.4 (chip membership), §3.4.5 (pill precedence), §3.4.6 (preview rules), §3.4.7 (folded), §3.4.8 (order facts);
// 08-5 §3.1–§3.2 (Bootstrap ≤ 200 KB, AiStatus, SpendSummary). Article 12: every pill, count and preview comes from the
// job, card and message rows, never from AI text.
import type { Db } from './db';
import {
  chatBase,
  cardRow,
  connectionRow,
  draftRow,
  helperRow,
  jobRow,
  memoryFactView,
  messageRow,
  parseJson,
  reactionBy,
  routineRow,
  stepProgressAt,
  stepRow,
  waMessageRow,
  type DbRow,
} from '../db/rows';
import { HIDDEN_FOR_AI, SEND_TEXT_LIMIT } from './composerQueries';
import { cardTitle } from '../../shared/cards';
import { t } from '../../shared/copy/t';
import { phraseCopyKey, resolvePhrase } from '../../shared/phrases';
import { checkSecret } from '../../shared/redactor';
import { writeRedacted } from './writeRedacted';
import { monthKey } from '../../shared/format';
import type { Settings } from '../../shared/settings';
import type {
  AiStatus,
  Bootstrap,
  CardType,
  ChatFilter,
  ChatOpenResult,
  ChatPill,
  ChatPreview,
  ChatRow,
  ConnectionRow,
  HelperRow,
  JobDetails,
  JobRow,
  JobState,
  MemoryFactView,
  MemoryFilter,
  MessageRow,
  PasteCatch,
  PreviewBody,
  ProviderId,
  PublicSettings,
  RoutineRow,
  SpendSummary,
  TickState,
  WaMessageRow,
} from '../../shared/types';

export const DAY = 86_400_000;
export const DONE_PILL_MS = DAY; // 03-shell-1 §3.4.5: "Done" fades after 24 h
export const DONE_CHIP_MS = 7 * DAY; // §3.4.4: "Done" chip, last 7 days
export const FAILED_PREVIEW_MS = DAY; // §3.4.6 rule 4
export const PREVIEW_MAX = 120; // 08-1 §3.4: lastLine ≤ 120 chars
export const BOOTSTRAP_MAX_BYTES = 200 * 1024;
export const FIRST_MESSAGES = 50; // 08-5 §5 rule 5
export const MAX_USER_PINS = 3; // §3.4.8 block 2

const ACTIVE_JOB: JobState[] = ['queued', 'working', 'needs_you', 'waiting'];
const RUNNING_JOB: JobState[] = ['queued', 'working', 'waiting'];

/** 08-0 §B.4 display names (product names, shown as written). */
export const AI_DISPLAY_NAME: Record<ProviderId, string> = {
  'claude-cli': 'Claude',
  'codex-cli': 'ChatGPT',
  'gemini-cli': 'Gemini',
  'openai-key': 'OpenAI key',
  'anthropic-key': 'Anthropic key',
  'google-key': 'Google key',
  ollama: 'AI on this PC',
  fake: 'Test AI',
};

export interface ListContext {
  now: number;
  agentName: string;
  /** The words for the draft prefix (08-1 §3.4 lastLine "Draft: …"); main passes t('chatlist.row.preview.draft'). */
  draftPrefix: string;
}

// ---------------------------------------------------------------- pure derivations (unit-tested)

/** A card that waits on the user (03-shell-1 §3.4.4 "PENDING/HELD approval or choice card", §3.4.6 rule 3). */
export function cardWaitsOnUser(type: CardType, state: string): boolean {
  switch (type) {
    case 'approval':
    case 'payment':
      return state === 'PENDING' || state === 'HELD';
    case 'draft':
      return state === 'pending';
    case 'choice':
    case 'tiles':
    case 'stuck':
      return state === 'asking';
    case 'signin':
      return state === 'waiting';
    default:
      return false;
  }
}

export interface PillInput {
  jobs: { state: JobState; finishedAt: number | null }[];
  cards: { type: CardType; state: string }[];
}

/** 03-shell-1 §3.4.5 pill precedence: Needs you › Paused › Working › Done (24 h). One pill at most. */
export function derivePill(input: PillInput, now: number): { pill: ChatPill | null; pillUntil: number | null } {
  const { jobs, cards } = input;
  if (jobs.some((j) => j.state === 'needs_you') || cards.some((c) => cardWaitsOnUser(c.type, c.state)))
    return { pill: 'needs_you', pillUntil: null };
  if (jobs.some((j) => j.state === 'waiting')) return { pill: 'paused', pillUntil: null };
  if (jobs.some((j) => j.state === 'queued' || j.state === 'working')) return { pill: 'working', pillUntil: null };
  const doneAt = Math.max(-Infinity, ...jobs.filter((j) => j.state === 'done' && j.finishedAt !== null).map((j) => j.finishedAt!));
  if (Number.isFinite(doneAt) && now - doneAt < DONE_PILL_MS) return { pill: 'done', pillUntil: doneAt + DONE_PILL_MS };
  return { pill: null, pillUntil: null };
}

/** Markdown stripped, line breaks become spaces (03-shell-1 §3.4.6, last paragraph). */
export function plainLine(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const clip = (s: string) => (s.length > PREVIEW_MAX ? `${s.slice(0, PREVIEW_MAX - 1)}…` : s);

export interface LastMessage {
  authorKind: MessageRow['authorKind'];
  authorName: string | null;
  kind: MessageRow['kind'];
  text: string;
  status: MessageRow['status'];
  badge: string | null;
  voiceMs: number | null;
  attachments: { name: string; mime: string }[] | null;
  card: { type: CardType; title: string } | null;
}

/** Message body as the preview shows it (03-shell-1 §3.4.6 non-text rule). */
export function previewBody(m: LastMessage): PreviewBody {
  if (m.kind === 'voice') return { kind: 'voice', durationMs: m.voiceMs ?? 0 };
  if (m.kind === 'card' && m.card) return { kind: 'card', cardType: m.card.type, title: clip(m.card.title) };
  const att = m.attachments?.[0];
  if (att && !plainLine(m.text)) return att.mime.startsWith('image/') ? { kind: 'photo' } : { kind: 'file', name: att.name };
  return { kind: 'text', text: clip(plainLine(m.text)) };
}

/** 04 §3.3 ticks from the messages columns (status, badge). */
export function tickOf(m: Pick<LastMessage, 'status' | 'badge'>): TickState {
  if (m.status === 'failed') return 'not_sent';
  if (m.status === 'queued') return 'waiting';
  if (m.badge !== null) return 'read';
  return m.status === 'sent' ? 'sent' : 'delivered';
}

export interface PreviewInput {
  chatKind: ChatRow['kind'];
  jobs: { state: JobState; title: string; createdAt: number }[];
  /** Waiting cards, oldest first. */
  waitingCards: { type: CardType; title: string; question?: string; site?: string; jobTitle?: string }[];
  /** The chat's most recently finished job. */
  lastFinished: { state: JobState; finishedAt: number; failureLine: string } | null;
  last: LastMessage | null;
  /** wa_mirror: newest wa_messages row. */
  wa: { senderLabel: string; text: string } | null;
}

/** 03-shell-1 §3.4.6 rules 3a, 3, 4, 5, 6, 7 (rules 1 typing and 2 draft are applied by the renderer, which knows the open chat). */
export function derivePreview(p: PreviewInput, now: number): ChatPreview {
  if (p.chatKind === 'wa_mirror') {
    return p.wa ? { rule: 'sender', sender: p.wa.senderLabel, body: { kind: 'text', text: clip(plainLine(p.wa.text)) } } : { rule: 'none' };
  }
  const newest = (s: JobState) => p.jobs.filter((j) => j.state === s).sort((a, b) => b.createdAt - a.createdAt)[0];
  const working = newest('working');
  if (working) return { rule: 'working', jobTitle: working.title };
  const queued = newest('queued');
  if (queued) return { rule: 'queued', jobTitle: queued.title };
  const card = p.waitingCards[0];
  if (card) {
    if (card.type === 'choice' || card.type === 'tiles') return { rule: 'pick_one', question: card.question ?? card.title };
    if (card.type === 'signin') return { rule: 'sign_in', site: card.site ?? card.title };
    if (card.type === 'stuck') return { rule: 'stuck', jobTitle: card.jobTitle ?? card.title };
    return { rule: 'needs_ok', title: card.title };
  }
  const lf = p.lastFinished;
  if (lf && lf.state === 'failed' && now - lf.finishedAt < FAILED_PREVIEW_MS)
    return { rule: 'failed', text: clip(plainLine(lf.failureLine)) };
  const m = p.last;
  if (!m) return { rule: 'none' };
  const body = previewBody(m);
  if (m.authorKind === 'user') return { rule: 'mine', tick: tickOf(m), body };
  if (p.chatKind === 'group' && m.authorName) return { rule: 'sender', sender: m.authorName, body };
  return { rule: 'own', body };
}

export interface ChipFacts {
  pill: ChatPill | null;
  pillUntil: number | null;
  list: { running: boolean; latestDoneAt: number | null };
}

/** 03-shell-1 §3.4.4 chip membership. */
export function inFilter(row: ChipFacts, filter: ChatFilter, now: number): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'needs_you':
      return row.pill === 'needs_you';
    case 'working':
      return row.list.running;
    case 'done':
      return row.list.latestDoneAt !== null && now - row.list.latestDoneAt < DONE_CHIP_MS;
  }
}

/** Case- and accent-insensitive text key (§3.4.3). */
export function searchKey(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-IN');
}

// ---------------------------------------------------------------- reads

function firstGrapheme(s: string): string {
  const seg = new Intl.Segmenter('en-IN', { granularity: 'grapheme' });
  const first = seg.segment(s.trim()).containing(0)?.segment ?? '?';
  return first.toLocaleUpperCase('en-IN');
}

interface HelperInfo {
  id: string;
  name: string;
  color: string;
  face: string;
}

function helpersById(db: Db): Map<string, HelperInfo> {
  const rows = db.prepare('SELECT id, name, color_token, face_ref FROM helpers').all() as DbRow[];
  return new Map(
    rows.map((r) => [String(r.id), { id: String(r.id), name: String(r.name), color: String(r.color_token), face: String(r.face_ref) }]),
  );
}

function lastMessages(db: Db, chatIds: string[] | null): Map<string, DbRow> {
  const where = chatIds ? `AND c.id IN (${chatIds.map(() => '?').join(',')})` : '';
  const rows = db
    .prepare(
      `SELECT m.*, k.type AS card_type, k.payload AS card_payload
         FROM chats c JOIN messages m ON m.id = c.last_message_id LEFT JOIN cards k ON k.id = m.card_id
        WHERE c.deleted_at IS NULL AND m.deleted_at IS NULL ${where}`,
    )
    .all(...(chatIds ?? [])) as DbRow[];
  return new Map(rows.map((r) => [String(r.chat_id), r]));
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/** Builds ChatRows with every derived field. `ids` limits the read to some chats (patches after a change). */
export function chatRows(db: Db, ctx: ListContext, ids: string[] | null = null): ChatRow[] {
  const idFilter = ids ? `AND id IN (${ids.map(() => '?').join(',')})` : '';
  const chats = db
    // M8 T3: a read by id also returns an archived row (a mirror hidden with C-8, for chat:archive's reply); lists never do.
    .prepare(`SELECT * FROM chats WHERE deleted_at IS NULL ${ids ? '' : 'AND archived = 0'} ${idFilter} ORDER BY last_activity_at DESC`)
    .all(...(ids ?? [])) as DbRow[];
  if (!chats.length) return [];
  const chatIds = chats.map((c) => String(c.id));
  const inIds = `(${chatIds.map(() => '?').join(',')})`;
  const helpers = helpersById(db);
  const last = lastMessages(db, ids ? chatIds : null);
  const drafts = new Map(
    (db.prepare(`SELECT chat_id, text FROM drafts WHERE chat_id IN ${inIds}`).all(...chatIds) as DbRow[]).map((r) => [
      String(r.chat_id),
      String(r.text),
    ]),
  );
  const activeJobs = groupBy(
    db
      .prepare(
        `SELECT id, chat_id, state, title, created_at, finished_at, needs_you_card_id, last_progress_at FROM jobs
          WHERE state IN ('queued','working','needs_you','waiting') AND chat_id IN ${inIds}`,
      )
      .all(...chatIds) as DbRow[],
    (r) => String(r.chat_id),
  );
  const lastFinished = new Map(
    (
      db
        .prepare(
          `SELECT j.chat_id, j.state, MAX(j.finished_at) AS fin, j.title, j.result_message_id, m.text AS result_text
             FROM jobs j LEFT JOIN messages m ON m.id = j.result_message_id
            WHERE j.finished_at IS NOT NULL AND j.chat_id IN ${inIds} GROUP BY j.chat_id`,
        )
        .all(...chatIds) as DbRow[]
    ).map((r) => [String(r.chat_id), r]),
  );
  const latestDone = new Map(
    (
      db
        .prepare(
          `SELECT chat_id, MAX(finished_at) AS fin FROM jobs WHERE state = 'done' AND finished_at IS NOT NULL AND chat_id IN ${inIds} GROUP BY chat_id`,
        )
        .all(...chatIds) as DbRow[]
    ).map((r) => [String(r.chat_id), Number(r.fin)]),
  );
  const openCards = groupBy(
    (
      db
        .prepare(
          `SELECT k.id, k.chat_id, k.type, k.state, k.payload, k.expires_at, k.created_at, j.title AS job_title FROM cards k
             LEFT JOIN jobs j ON j.id = k.job_id
            WHERE k.deleted_at IS NULL AND k.state IN ('PENDING','HELD','pending','asking','waiting') AND k.chat_id IN ${inIds}
            ORDER BY k.created_at`,
        )
        .all(...chatIds) as DbRow[]
    ).filter((r) => cardWaitsOnUser(r.type as CardType, String(r.state))),
    (r) => String(r.chat_id),
  );
  const members = groupBy(
    db
      .prepare(`SELECT chat_id, member_id FROM group_members WHERE chat_id IN ${inIds} ORDER BY role DESC, added_at`)
      .all(...chatIds) as DbRow[],
    (r) => String(r.chat_id),
  );
  const waJids = chats.filter((c) => c.kind === 'wa_mirror').map((c) => String(c.wa_jid));
  const wa = new Map<string, DbRow>();
  for (const jid of waJids) {
    const r = db.prepare('SELECT sender_label, from_me, text FROM wa_messages WHERE chat_jid = ? ORDER BY at DESC LIMIT 1').get(jid) as
      DbRow | undefined;
    if (r) wa.set(jid, r);
  }

  return chats.map((c) => {
    const base = chatBase(c);
    const { pinnedAt, ...rest } = base;
    const helper = base.helperId ? helpers.get(base.helperId) : undefined;
    const jobs = activeJobs.get(base.id) ?? [];
    const cards = openCards.get(base.id) ?? [];
    const lm = last.get(base.id);
    const lf = lastFinished.get(base.id);
    const draft = drafts.get(base.id);
    const lastMsg: LastMessage | null = lm
      ? {
          authorKind: lm.author_kind as LastMessage['authorKind'],
          authorName:
            lm.author_kind === 'foo'
              ? ctx.agentName
              : lm.author_kind === 'helper'
                ? (helpers.get(String(lm.author_id))?.name ?? null)
                : null,
          kind: lm.kind as LastMessage['kind'],
          text: String(lm.text ?? ''),
          status: lm.status as LastMessage['status'],
          badge: lm.badge === null || lm.badge === undefined ? null : String(lm.badge),
          voiceMs: lm.voice_ms === null || lm.voice_ms === undefined ? null : Number(lm.voice_ms),
          attachments: parseJson<{ name: string; mime: string }[] | null>(lm.attachments, null),
          card: lm.card_type ? { type: lm.card_type as CardType, title: cardTitle(parseJson(lm.card_payload, {})) } : null,
        }
      : null;
    const waRow = base.waJid ? wa.get(base.waJid) : undefined;
    const preview = derivePreview(
      {
        chatKind: base.kind,
        jobs: jobs.map((j) => ({ state: j.state as JobState, title: String(j.title), createdAt: Number(j.created_at) })),
        waitingCards: cards.map((k) => {
          const payload = parseJson<Record<string, unknown>>(k.payload, {});
          return {
            type: k.type as CardType,
            title: cardTitle(payload),
            question: payload.question === undefined ? undefined : String(payload.question),
            site: payload.site === undefined ? undefined : String(payload.site),
            jobTitle: k.job_title === null || k.job_title === undefined ? undefined : String(k.job_title),
          };
        }),
        lastFinished: lf
          ? { state: lf.state as JobState, finishedAt: Number(lf.fin), failureLine: String(lf.result_text ?? lf.title) }
          : null,
        last: lastMsg,
        wa: waRow
          ? { senderLabel: Number(waRow.from_me) ? 'You' : String(waRow.sender_label ?? ''), text: String(waRow.text ?? '') }
          : null,
      },
      ctx.now,
    );
    const needsYouJobs = jobs.filter((j) => j.state === 'needs_you');
    const isNeedsYou = needsYouJobs.length > 0 || cards.length > 0;
    const expiries = cards.map((k) => k.expires_at).filter((v): v is number => typeof v === 'number');
    const sinces = [...cards.map((k) => Number(k.created_at)), ...needsYouJobs.map((j) => Number(j.last_progress_at ?? j.created_at))];
    const pill = base.pill === 'done' && (base.pillUntil === null || base.pillUntil <= ctx.now) ? null : base.pill;
    const lastText = lastMsg ? plainLine(lastMsg.text) : '';
    const row: ChatRow = {
      ...rest,
      pill,
      lastLine: clip(draft ? `${ctx.draftPrefix} ${plainLine(draft.trimStart().split('\n')[0] ?? '')}` : lastText),
      lastTime: base.lastActivityAt,
      hasDraft: draft !== undefined,
      face: base.avatarRef ?? helper?.face ?? (base.kind === 'foo' ? 'living:default' : `letter:${firstGrapheme(base.title)}`),
      list: {
        preview,
        draft: draft === undefined ? null : clip(plainLine(draft)),
        pinnedAt,
        needsYou: isNeedsYou ? { expiresAt: expiries.length ? Math.min(...expiries) : null, since: Math.min(...sinces) } : null,
        running: jobs.some((j) => RUNNING_JOB.includes(j.state as JobState)),
        active: jobs.some((j) => ACTIVE_JOB.includes(j.state as JobState)) || cards.length > 0,
        lastEndedDoneAt: lf && lf.state === 'done' ? Number(lf.fin) : null,
        latestDoneAt: latestDone.get(base.id) ?? null,
        searchText: searchKey(`${base.title} ${lastText}`),
      },
    };
    if (helper) row.helper = { id: helper.id, color: helper.color };
    const mem = members.get(base.id);
    if (base.kind === 'group' && mem) row.memberIds = mem.map((m) => String(m.member_id));
    return row;
  });
}

export function chatRowById(db: Db, ctx: ListContext, chatId: string): ChatRow | null {
  return chatRows(db, ctx, [chatId])[0] ?? null;
}

/** chat:list: filter by chip and query (03-shell-1 §3.4.3–§3.4.4); newest activity first ("Done": newest finish first). */
export function listChats(db: Db, ctx: ListContext, filter: ChatFilter = 'all', q = ''): ChatRow[] {
  const key = searchKey(q.trim());
  const rows = chatRows(db, ctx).filter((r) => inFilter(r, filter, ctx.now) && (!key || r.list.searchText.includes(key)));
  if (filter === 'done') rows.sort((a, b) => (b.list.latestDoneAt ?? 0) - (a.list.latestDoneAt ?? 0));
  return rows;
}

function reactionsFor(db: Db, ids: string[]): Map<string, MessageRow['reactions']> {
  if (!ids.length) return new Map();
  const rows = db
    .prepare(`SELECT message_id, by, emoji FROM reactions WHERE message_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at`)
    .all(...ids) as DbRow[];
  const out = new Map<string, MessageRow['reactions']>();
  for (const r of rows) {
    const list = out.get(String(r.message_id)) ?? [];
    list.push({ emoji: String(r.emoji), by: reactionBy(String(r.by)) });
    out.set(String(r.message_id), list);
  }
  return out;
}

/**
 * A deleted message keeps its row (04 §10.4 "This message was deleted." in the thread) but nothing of what it said:
 * text, attachments, voice and transcript are blanked before the row leaves main (M2 builder A pick; 08-1 §4.3 soft delete).
 */
function visibleRow(r: DbRow, reactions: MessageRow['reactions']): MessageRow {
  const m = messageRow(r, reactions);
  if (m.deletedAt === null) return m;
  return {
    ...m,
    text: '',
    attachments: null,
    voicePath: null,
    transcript: null,
    transcriptConf: null,
    reactions: [],
    providerNote: null,
    suggestions: null,
  };
}

/** message:list: newest `limit` (≤ 200) messages before `beforeSeq`, oldest first. Deleted rows come back blanked. */
export function messageList(db: Db, chatId: string, limit: number, beforeSeq?: number): MessageRow[] {
  const rows = db
    .prepare(`SELECT * FROM messages WHERE chat_id = ? ${beforeSeq !== undefined ? 'AND seq < ?' : ''} ORDER BY seq DESC LIMIT ?`)
    .all(...(beforeSeq !== undefined ? [chatId, beforeSeq, Math.min(limit, 200)] : [chatId, Math.min(limit, 200)])) as DbRow[];
  rows.reverse();
  const reactions = reactionsFor(
    db,
    rows.map((r) => String(r.id)),
  );
  return rows.map((r) => visibleRow(r, reactions.get(String(r.id)) ?? []));
}

/** message:get (X-124): one row, as message:list would return it. */
export function messageGet(db: Db, messageId: string): MessageRow | null {
  const r = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as DbRow | undefined;
  if (!r) return null;
  return visibleRow(r, reactionsFor(db, [messageId]).get(messageId) ?? []);
}

export type MessageWriteResult = { ok: true; row: MessageRow } | { ok: false; reason: 'not_found' | 'not_allowed' };

function touched(db: Db, messageId: string): MessageWriteResult {
  const row = messageGet(db, messageId);
  return row ? { ok: true, row } : { ok: false, reason: 'not_found' };
}

/**
 * message:react (04 §9): the user's reaction. One reaction per person per bubble (§8 "choosing another replaces it");
 * `on: false` removes it. The user cannot react to their own bubble (§8.1).
 */
export function reactMessage(db: Db, messageId: string, emoji: string, on: boolean, now: number): MessageWriteResult {
  const r = db.prepare('SELECT author_kind, deleted_at FROM messages WHERE id = ?').get(messageId) as DbRow | undefined;
  if (!r) return { ok: false, reason: 'not_found' };
  if (r.author_kind === 'user' || r.deleted_at !== null) return { ok: false, reason: 'not_allowed' };
  db.transaction(() => {
    db.prepare("DELETE FROM reactions WHERE message_id = ? AND by = 'user'").run(messageId);
    if (on) db.prepare("INSERT INTO reactions (message_id, by, emoji, created_at) VALUES (?, 'user', ?, ?)").run(messageId, emoji, now);
    db.prepare('UPDATE messages SET rev = rev + 1 WHERE id = ?').run(messageId);
  })();
  return touched(db, messageId);
}

/** message:pin (08-1 §3.2): "Keep this voice note"; only voice messages. */
export function pinMessage(db: Db, messageId: string, on: boolean): MessageWriteResult {
  const r = db.prepare('SELECT kind FROM messages WHERE id = ? AND deleted_at IS NULL').get(messageId) as DbRow | undefined;
  if (!r) return { ok: false, reason: 'not_found' };
  if (r.kind !== 'voice') return { ok: false, reason: 'not_allowed' };
  db.prepare('UPDATE messages SET pinned = ?, rev = rev + 1 WHERE id = ?').run(on ? 1 : 0, messageId);
  return touched(db, messageId);
}

/** 04 §6.2: the edit window. */
export const EDIT_WINDOW_MS = 15 * 60_000;

/** message:edit refusals beyond MessageWriteResult: over the 10,000 limit, or a secret main's R1 re-check found. */
export type EditResult = MessageWriteResult | { ok: false; reason: 'too_long' } | { ok: false; reason: 'secret'; paste: PasteCatch };

/**
 * message:edit (gap channel, 04 §6.2): the user's latest text message, within 15 minutes. Art. 8 / 08-2 §11.4 R1: an
 * edit is re-checked like message:send (04-2 §22.4 "on every Send, over the whole text"): a secret is refused with the
 * PasteCatch (the composer masks it; "Send anyway" arrives with the spans already "•••• (hidden)", and the AI then reads
 * the hidden note, as on Send); over the 10,000 limit (04-2 §23.6) is refused.
 */
export function editMessage(db: Db, messageId: string, text: string, now: number, opts: { askedForCode?: boolean } = {}): EditResult {
  const r = db.prepare('SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL').get(messageId) as DbRow | undefined;
  if (!r) return { ok: false, reason: 'not_found' };
  const latest = db
    .prepare("SELECT id FROM messages WHERE chat_id = ? AND author_kind = 'user' AND deleted_at IS NULL ORDER BY seq DESC LIMIT 1")
    .pluck()
    .get(r.chat_id) as string | undefined;
  if (r.author_kind !== 'user' || r.kind !== 'text' || r.status === 'failed' || latest !== messageId)
    return { ok: false, reason: 'not_allowed' };
  if (now - Number(r.created_at) > EDIT_WINDOW_MS || !text.trim()) return { ok: false, reason: 'not_allowed' };
  if ([...text].length > SEND_TEXT_LIMIT) return { ok: false, reason: 'too_long' };
  const paste = checkSecret(text, { askedForCode: opts.askedForCode });
  if (paste) return { ok: false, reason: 'secret', paste };
  const hidden = t('composer.paste.hidden_in_bubble');
  const forAi = text.includes(hidden) ? text.split(hidden).join(HIDDEN_FOR_AI) : null;
  db.prepare('UPDATE messages SET text = ?, text_for_ai = ?, edited_at = ?, rev = rev + 1 WHERE id = ?').run(
    writeRedacted(text),
    forAi === null ? null : writeRedacted(forAi),
    now,
    messageId,
  );
  return touched(db, messageId);
}

/** message:delete (gap channel, 04 §6.3, §1.9): soft delete on this PC; returns the chats touched. */
export function deleteMessages(db: Db, ids: string[], now: number): { chatIds: string[]; rows: MessageRow[] } {
  const chatIds = new Set<string>();
  const done: string[] = [];
  db.transaction(() => {
    for (const id of ids) {
      const r = db.prepare("SELECT chat_id FROM messages WHERE id = ? AND deleted_at IS NULL AND kind != 'marker'").get(id) as
        DbRow | undefined;
      if (!r) continue;
      db.prepare('UPDATE messages SET deleted_at = ?, rev = rev + 1 WHERE id = ?').run(now, id);
      chatIds.add(String(r.chat_id));
      done.push(id);
    }
  })();
  return { chatIds: [...chatIds], rows: done.map((id) => messageGet(db, id)).filter((m): m is MessageRow => !!m) };
}

// GAP: GAPS.md 2026-10-17 "Try again on foo's answer before the engine"
/**
 * message:retry (gap channel, 04 §7 "Try again" on Not sent): the failed user message goes back to `queued`. Sending
 * it is message:send's pipeline (builder B / M3); a foo answer has no engine to write it again before M3.
 */
export function retryMessage(db: Db, messageId: string): MessageWriteResult {
  const r = db.prepare('SELECT author_kind, status FROM messages WHERE id = ? AND deleted_at IS NULL').get(messageId) as DbRow | undefined;
  if (!r) return { ok: false, reason: 'not_found' };
  if (r.author_kind !== 'user' || r.status !== 'failed') return { ok: false, reason: 'not_allowed' };
  db.prepare("UPDATE messages SET status = 'queued', rev = rev + 1 WHERE id = ?").run(messageId);
  return touched(db, messageId);
}

/** job:details (08-1 §3.2) for M2: the job and its steps; frames, proof and costs arrive with M8/M10. */
export function jobDetails(db: Db, jobId: string, now: number): JobDetails | null {
  const [job] = jobRows(db, 'id = ?', [jobId], now);
  if (!job) return null;
  const steps = (db.prepare('SELECT * FROM steps WHERE job_id = ? ORDER BY idx').all(jobId) as DbRow[]).map(stepRow);
  return { job, steps, frames: [], costs: [] };
}

/** routine:pause (08-1 §3.2) from the "Why am I getting this?" Stop (04 §19). */
export function pauseRoutine(db: Db, routineId: string, now: number): RoutineRow | null {
  const r = db.prepare("SELECT state FROM routines WHERE id = ? AND state != 'deleted'").get(routineId) as DbRow | undefined;
  if (!r) return null;
  if (r.state === 'on') db.prepare("UPDATE routines SET state = 'paused', updated_at = ?, rev = rev + 1 WHERE id = ?").run(now, routineId);
  return routineRow(db.prepare('SELECT * FROM routines WHERE id = ?').get(routineId) as DbRow);
}

/** chat:open `waMessages` (04 §10.11, 08-3 §16.4.3): newest 200 of the mirrored group, oldest first. */
export function waMessages(db: Db, jid: string): WaMessageRow[] {
  const rows = db.prepare('SELECT * FROM wa_messages WHERE chat_jid = ? ORDER BY at DESC LIMIT 200').all(jid) as DbRow[];
  return rows.reverse().map(waMessageRow);
}

/** The running step's line (08-4 §26.1): its phrase with slots, or the generic line for a key outside the catalogue. */
function runningLine(phraseKey: string, slots: Record<string, unknown>): string {
  const p = resolvePhrase(phraseKey, slots);
  return t(phraseCopyKey(p.key, 'running') ?? phraseCopyKey('generic_working', 'running')!, p.slots);
}

export function jobRows(db: Db, where: string, args: unknown[], now: number): JobRow[] {
  const rows = db.prepare(`SELECT * FROM jobs WHERE ${where}`).all(...args) as DbRow[];
  if (!rows.length) return [];
  const ids = rows.map((r) => String(r.id));
  const steps = groupBy(
    db
      .prepare(
        `SELECT job_id, idx, state, phrase_key, slots, started_at, finished_at FROM steps WHERE job_id IN (${ids.map(() => '?').join(',')}) ORDER BY idx`,
      )
      .all(...ids) as DbRow[],
    (r) => String(r.job_id),
  );
  return rows.map((r) => {
    const s = steps.get(String(r.id)) ?? [];
    const running = s.find((x) => x.state === 'running');
    const slots = running ? parseJson<Record<string, unknown>>(running.slots, {}) : {};
    return jobRow(
      r,
      {
        stepsDone: s.filter((x) => x.state === 'done').length,
        nowLine: running ? runningLine(String(running.phrase_key), slots) : '',
        progressAt: stepProgressAt(s),
      },
      now,
    );
  });
}

/** chat:open: newest 50 messages, their cards, the chat's jobs (newest 50) and the draft. */
export function chatOpen(db: Db, chatId: string, now: number): ChatOpenResult | null {
  const exists = db.prepare('SELECT kind, wa_jid FROM chats WHERE id = ? AND deleted_at IS NULL').get(chatId) as DbRow | undefined;
  if (!exists) return null;
  const messages = messageList(db, chatId, FIRST_MESSAGES);
  const cardIds = messages.map((m) => m.cardId).filter((v): v is string => !!v);
  const cards = cardIds.length
    ? (db.prepare(`SELECT * FROM cards WHERE id IN (${cardIds.map(() => '?').join(',')})`).all(...cardIds) as DbRow[]).map(cardRow)
    : [];
  const jobs = jobRows(db, 'chat_id = ? ORDER BY created_at DESC LIMIT 50', [chatId], now);
  const d = db.prepare('SELECT * FROM drafts WHERE chat_id = ?').get(chatId) as DbRow | undefined;
  const open: ChatOpenResult = { messages, cards, jobs, draft: d ? draftRow(d) : null };
  if (exists.kind === 'wa_mirror' && exists.wa_jid) open.waMessages = waMessages(db, String(exists.wa_jid));
  return open;
}

export function connections(db: Db): ConnectionRow[] {
  return (db.prepare("SELECT * FROM connections WHERE status != 'disconnected' ORDER BY connected_at").all() as DbRow[]).map(connectionRow);
}

/** The id of foo's chat: kind='foo' AND private=0 (08-1 §4.3.1). */
export function fooChatId(db: Db): string | null {
  const r = db
    .prepare("SELECT id FROM chats WHERE kind = 'foo' AND private = 0 AND deleted_at IS NULL ORDER BY created_at LIMIT 1")
    .get() as DbRow | undefined;
  return r ? String(r.id) : null;
}

// ---------------------------------------------------------------- writes (every UPDATE bumps rev, 08-0 §B.1)

/** 03-shell-1 §3.4.10: foo's chat always exists. Creates it on a fresh database; returns its id. */
export function ensureFooChat(db: Db, now: number, agentName: string, id: string): string {
  const existing = fooChatId(db);
  if (existing) return existing;
  db.prepare("INSERT INTO chats (id, kind, title, pinned, last_activity_at, created_at) VALUES (?, 'foo', ?, 0, ?, ?)").run(
    id,
    agentName,
    now,
    now,
  );
  return id;
}

/**
 * Re-derives chats.pill from the chat's jobs and cards (08-1 §4.6 rule 7). Returns true when the pill changed. The chat's
 * rev moves on every call, pill changed or not: the ChatRow's list facts (preview "Working on…" / "Waiting to start…",
 * folded, active) are derived from the same jobs and cards, and a chat:upsert with an unchanged rev is dropped by the
 * renderer's rev rule (08-5 §5 rule 2).
 */
export function recomputePill(db: Db, chatId: string, now: number): boolean {
  const jobs = (db.prepare('SELECT state, finished_at FROM jobs WHERE chat_id = ?').all(chatId) as DbRow[]).map((r) => ({
    state: r.state as JobState,
    finishedAt: r.finished_at === null ? null : Number(r.finished_at),
  }));
  const cards = (db.prepare('SELECT type, state FROM cards WHERE chat_id = ? AND deleted_at IS NULL').all(chatId) as DbRow[]).map((r) => ({
    type: r.type as CardType,
    state: String(r.state),
  }));
  const next = derivePill({ jobs, cards }, now);
  const cur = db.prepare('SELECT pill, pill_until FROM chats WHERE id = ?').get(chatId) as DbRow | undefined;
  if (!cur) return false;
  db.prepare('UPDATE chats SET pill = ?, pill_until = ?, rev = rev + 1 WHERE id = ?').run(next.pill, next.pillUntil, chatId);
  return cur.pill !== next.pill || (cur.pill_until ?? null) !== next.pillUntil;
}

export type PinResult = { ok: true } | { ok: false; reason: 'not_found' | 'not_allowed' | 'limit' };

/** chat:pin (03-shell-1 §3.4.8 block 2, §3.4.9): foo's chat is always pinned; up to 3 user pins; mirrors and the private chat are never pinned. */
export function pinChat(db: Db, chatId: string, on: boolean, now: number): PinResult {
  const c = db.prepare('SELECT kind, private, pinned FROM chats WHERE id = ? AND deleted_at IS NULL').get(chatId) as DbRow | undefined;
  if (!c) return { ok: false, reason: 'not_found' };
  if ((c.kind === 'foo' && !Number(c.private)) || c.kind === 'wa_mirror' || Number(c.private)) return { ok: false, reason: 'not_allowed' };
  if (on === Number(c.pinned) > 0) return { ok: true };
  if (on) {
    const count = db
      .prepare("SELECT COUNT(*) FROM chats WHERE pinned > 0 AND kind != 'foo' AND deleted_at IS NULL")
      .pluck()
      .get() as number;
    if (count >= MAX_USER_PINS) return { ok: false, reason: 'limit' };
  }
  db.prepare('UPDATE chats SET pinned = ?, rev = rev + 1 WHERE id = ?').run(on ? now : 0, chatId);
  return { ok: true };
}

/** chat:markRead: unread = messages after `upToSeq` that are not the user's. */
export function markRead(db: Db, chatId: string, upToSeq: number): boolean {
  const unread = db
    .prepare("SELECT COUNT(*) FROM messages WHERE chat_id = ? AND seq > ? AND author_kind != 'user' AND deleted_at IS NULL")
    .pluck()
    .get(chatId, upToSeq) as number;
  const cur = db.prepare('SELECT unread_count FROM chats WHERE id = ?').pluck().get(chatId) as number | undefined;
  if (cur === undefined || cur === unread) return false;
  db.prepare('UPDATE chats SET unread_count = ?, rev = rev + 1 WHERE id = ?').run(unread, chatId);
  return true;
}

// ---------------------------------------------------------------- settings, AI, spend, bootstrap

export function publicSettings(s: Settings): PublicSettings {
  const { flags: _flags, window, ...rest } = s;
  const { bounds: _bounds, ...win } = window;
  void _flags;
  void _bounds;
  return { ...rest, window: win, locked: ['permissions.actions.post'] };
}

/** AiStatus from settings and the confirmed network state (08-5 §3.1). From M3 the engine's own status (limit, down, signed
 * out, backup in use; 08-2 §6.7) wins while it is about the same primary; a confirmed offline network always shows offline. */
export function aiStatus(s: Settings, offline: boolean, engine: AiStatus | null = null): AiStatus {
  if (engine && engine.primary === s.ai.primary) return offline ? { ...engine, state: 'offline' } : engine;
  const primary = s.ai.primary;
  const provider = primary ? s.ai.providers[primary] : undefined;
  const status: AiStatus = {
    primary,
    backup: s.ai.backup,
    displayName: primary ? AI_DISPLAY_NAME[primary] : '',
    billing: provider?.kind ?? 'plan',
    state: offline ? 'offline' : !primary ? 'unverified' : provider?.lastVerifyOk === false ? 'down' : 'ok',
    usingBackup: false,
  };
  if (provider?.lastVerifiedAt !== undefined) status.lastVerifiedAt = provider.lastVerifiedAt;
  return status;
}

/** SpendSummary for the month of `now` in the user's zone (08-5 §3.2; purchases = submitted + checking + succeeded). */
export function spendSummary(db: Db, s: Settings, now: number): SpendSummary {
  const tz = s.locale.timeZone;
  const month = monthKey(now, tz);
  const since = now - 32 * DAY;
  const primary = s.ai.primary;
  const billing = primary ? (s.ai.providers[primary]?.kind ?? 'plan') : 'plan';
  const turns = (
    db
      .prepare(
        `SELECT t.chat_id, t.started_at, t.cost_paise, c.title, c.private FROM ai_turns t LEFT JOIN chats c ON c.id = t.chat_id
          WHERE t.billing = 'key' AND t.started_at >= ?`,
      )
      .all(since) as DbRow[]
  ).filter((r) => monthKey(Number(r.started_at), tz) === month);
  const byChat = new Map<string | null, { title: string; paise: number }>();
  for (const r of turns) {
    const id = r.chat_id && !Number(r.private) ? String(r.chat_id) : null;
    const e = byChat.get(id) ?? { title: id ? String(r.title ?? '') : '', paise: 0 };
    e.paise += Number(r.cost_paise ?? 0);
    byChat.set(id, e);
  }
  const pays = (
    db
      .prepare(
        `SELECT p.id, p.payee, p.amount_paise, p.created_at, c.title AS chat_title FROM payments p
           JOIN jobs j ON j.id = p.job_id JOIN chats c ON c.id = j.chat_id
          WHERE p.state IN ('submitted','checking','succeeded') AND p.created_at >= ? ORDER BY p.created_at DESC`,
      )
      .all(since) as DbRow[]
  ).filter((r) => monthKey(Number(r.created_at), tz) === month);
  return {
    month,
    aiSpentPaise: billing === 'key' ? turns.reduce((a, r) => a + Number(r.cost_paise ?? 0), 0) : null,
    aiCapPaise: s.money.aiCapPaise,
    aiBilling: billing,
    purchasesPaise: pays.reduce((a, r) => a + Number(r.amount_paise), 0),
    purchaseCapPaise: s.money.purchaseCapPaise,
    purchaseCount: pays.length,
    byChat: [...byChat.entries()].map(([chatId, e]) => ({ chatId, title: e.title, paise: e.paise })),
    byRoutine: [],
    purchases: pays.map((r) => ({
      paymentId: String(r.id),
      activityId: '',
      payee: String(r.payee),
      at: Number(r.created_at),
      chatTitle: String(r.chat_title),
      amountPaise: Number(r.amount_paise),
    })),
    earliestMonth: month,
  };
}

export interface BootstrapContext extends ListContext {
  settings: Settings;
  offline: boolean;
  engineAi?: AiStatus | null;
}

/** app:getBootstrap (08-1 §3.2): soft-deleted rows excluded; open chat = lastChatId if it still exists, else foo's chat. */
export function bootstrap(db: Db, ctx: BootstrapContext): Bootstrap {
  const chats = chatRows(db, ctx);
  const last = ctx.settings.window.lastChatId;
  const openChatId = last && chats.some((c) => c.id === last) ? last : (fooChatId(db) ?? chats[0]?.id);
  const out: Bootstrap = {
    settings: publicSettings(ctx.settings),
    chats,
    firstMessages: openChatId ? messageList(db, openChatId, FIRST_MESSAGES) : [],
    setup: { complete: ctx.settings.setup.complete, step: ctx.settings.setup.step, answers: {} },
    ai: aiStatus(ctx.settings, ctx.offline, ctx.engineAi ?? null),
    spend: spendSummary(db, ctx.settings, ctx.now),
    connections: connections(db),
    safeMode: false,
  };
  if (openChatId) out.openChatId = openChatId;
  return out;
}

// ---------------------------------------------------------------- right shell reads (03-shell-2 §3.7.3; 08-1 §3.2)

/** helper:list (gap: no 08-1 read channel; the shell needs names and one-line jobs, 03-shell-2 §3.6.2.1 row 13). */
export function helperList(db: Db): HelperRow[] {
  return (db.prepare('SELECT * FROM helpers WHERE deleted_at IS NULL ORDER BY created_at').all() as DbRow[]).map(helperRow);
}

/** routine:list: every routine that is not deleted, soonest next run first (J14). */
export function routineList(db: Db): RoutineRow[] {
  return (
    db.prepare("SELECT * FROM routines WHERE state != 'deleted' ORDER BY next_run_at IS NULL, next_run_at, created_at").all() as DbRow[]
  ).map(routineRow);
}

/** memory:list (08-1 §3.2, 08-5 §3.6): facts from the index, newest first, filtered by the 06-2 §7.3 chips and `q`. */
export function memoryList(db: Db, filter: MemoryFilter, q: string | undefined, now: number): MemoryFactView[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filter.chip === 'said' || filter.chip === 'guessed') {
    where.push('m.provenance = ?');
    args.push(filter.chip);
  } else if (filter.chip === 'gmail' || filter.chip === 'whatsapp' || filter.chip === 'chat') {
    where.push('m.origin_kind = ?');
    args.push(filter.chip);
  }
  if (filter.helperId) {
    where.push('m.file = ?');
    args.push(`helpers/${filter.helperId}/notes.md`);
  }
  if (filter.last7) {
    where.push('m.learned_at >= ?');
    args.push(now - 7 * DAY);
  }
  if (q && q.trim()) {
    where.push('m.text LIKE ?');
    args.push(`%${q.trim()}%`);
  }
  const rows = db
    .prepare(
      `SELECT m.*, h.name AS helper_name, c.title AS chat_title FROM memory_index m
         LEFT JOIN helpers h ON m.file = 'helpers/' || h.id || '/notes.md'
         LEFT JOIN chats c ON c.id = m.chat_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY m.learned_at DESC`,
    )
    .all(...args) as DbRow[];
  return rows.map((r) =>
    memoryFactView(r, {
      fileLabel: r.helper_name ? `${String(r.helper_name)} notes` : String(r.file).replace(/^memory\//, ''),
      // The 08-3 §12.2 origin label lives in the Markdown line; the index keeps only the origin kind until J17's indexer.
      originLabel: String(r.origin_kind),
      ...(r.scope === 'chat' && r.chat_title ? { onlyInChatTitle: String(r.chat_title) } : {}),
    }),
  );
}

const LIVE_STATES: JobState[] = ['queued', 'working', 'needs_you', 'waiting'];

/**
 * job:stop (J18) for M1, before the engine exists: a live job becomes CANCELLED with stop_reason 'user_button'. Returns the
 * chat id, or null when the job is gone or already finished (JOB_GONE).
 */
export function stopJob(db: Db, jobId: string, now: number): { chatId: string } | null {
  const r = db.prepare('SELECT chat_id, state FROM jobs WHERE id = ?').get(jobId) as DbRow | undefined;
  if (!r || !LIVE_STATES.includes(r.state as JobState)) return null;
  db.prepare("UPDATE jobs SET state = 'cancelled', stop_reason = 'user_button', finished_at = ?, rev = rev + 1 WHERE id = ?").run(
    now,
    jobId,
  );
  return { chatId: String(r.chat_id) };
}
