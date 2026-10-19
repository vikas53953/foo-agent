// Spec: 08-3 §22.8 (IPC test channels, test builds only), §22.2 (fake Clock, Net online toggle), §22.9 (seed sets),
// 11-fidelity §11.2.3 (theme forced through the test channel, clock pinned to X-10). This folder is left out of the
// packaged app (electron-builder.yml), and ChannelGuard refuses every test:* channel unless FOO_TEST=1 and the
// FOO_*_DIR overrides are set. M5 (CR-0009): `test:card.seed` writes one card of any type (and, for gated cards, its
// `approvals` row) into a chat through the real db.tx path, so tickets can seed cards before the engine makes them.
import { nativeTheme } from 'electron';
import { z } from 'zod';
import { TEST_EPOCH_MS, type FakeClock } from '../../shared/clock';
import { SEED_SETS, type ClockReply, type SeedReply, type SeedSet } from '../../shared/ipc';
import { approvalExpiresAt } from '../../shared/approvalMachine';
import { newNonce } from '../../shared/canon';
import { newId } from '../../shared/ids';
import { ApprovalFieldsSchema, ApprovalStateSchema } from '../../shared/schemas';
import { isCardState } from '../../shared/cards';
import type { ApprovalFields, CardType, JobState } from '../../shared/types';
import { fieldsHash } from '../../engine/gate/fieldsHash';
import { applyDbOps } from '../engine-supervisor/engineHost';
import type { DbOp } from '../../engine/protocol';
import { cardRow, type DbRow } from '../db/rows';
import { messageGet } from '../store/queries';
import type { Db } from '../store/db';
import { deps } from '../deps';
import { channels, emit, listContext, type AppContext } from '../ipc/IpcRouter';
import { aiStatus, chatRowById, chatRows, fooChatId, jobRows, publicSettings, recomputePill, spendSummary } from '../store/queries';
import { writeSeedMedia } from './seed/media';
import { writeSeedMemory } from './seed/writer';
import { seedPerf } from './seed/perf';
import { seedM4Cards } from './seed/m4Cards';
import { seedUxWorld, uxWorldSettings } from './seed/uxWorld';
import { bridgeTestSchema } from '../../shared/waBridge';
// M5
import { installGmailDrafts, memoryGmailDrafts } from '../drafts/gmailDrafts';

const JOB_STATES = [
  'queued',
  'working',
  'needs_you',
  'waiting',
  'done',
  'done_unverified',
  'failed',
  'cancelled',
] as const satisfies readonly JobState[];
const TERMINAL: readonly JobState[] = ['done', 'done_unverified', 'failed', 'cancelled'];

const clockArg = z
  .object({
    set: z.union([z.string().datetime({ offset: true }), z.number().finite()]).optional(),
    advance: z.number().finite().min(0).optional(),
  })
  .strict()
  .optional();
const seedArg = z.object({ set: z.enum(SEED_SETS) }).strict();
const onlineArg = z.object({ online: z.boolean() }).strict();
const themeArg = z.object({ theme: z.enum(['light', 'dark', 'system']) }).strict();
const jobStateArg = z.object({ jobId: z.string().min(1), state: z.enum(JOB_STATES) }).strict();
// M8 T3
const waArg = bridgeTestSchema;
const CARD_TYPES = [
  'brief',
  'checklist',
  'choice',
  'tiles',
  'approval',
  'payment',
  'bill',
  'draft',
  'secret',
  'signin',
  'connect',
  'plan',
  'routine',
  'routine_offer',
  'stuck',
  'error',
  'spend_cap',
  'table',
  'file',
  'link_preview',
  'job_link',
  'place',
  'face_explainer',
  'catch_up',
  'setup',
] as const satisfies readonly CardType[];
// M5 (CR-0009)
/** `test:card.seed`: `approval` adds the card's approvals row (approval, payment and draft cards; 08-0 §G.7). */
export const cardSeedArg = z
  .object({
    chatId: z.string().min(1).optional(),
    type: z.enum(CARD_TYPES),
    state: z.string().min(1),
    payload: z.record(z.string(), z.unknown()),
    jobId: z.string().min(1).optional(),
    expiresAt: z.number().optional(),
    // M5 T15: a folded card as the user left it (e.g. an approve answer on a FAILED card).
    answer: z.record(z.string(), z.unknown()).optional(),
    approval: z
      .object({
        fields: ApprovalFieldsSchema,
        hardLimit: z.boolean().optional(),
        state: ApprovalStateSchema.optional(),
        expiresAt: z.number().optional(),
        // M5 T14: a CHECKING row's write-ahead time (08-2 §10.4), so main's 15 min no-proof move can run on it.
        submittedAt: z.number().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type CardSeedArg = z.infer<typeof cardSeedArg>;
export interface CardSeedReply {
  chatId: string;
  cardId: string;
  messageId: string;
  nonce: string;
  jobId?: string;
  approvalId?: string;
}

/**
 * Writes the card (and its message, and a needs_you job when an approval row needs one) through db.tx, then the approvals
 * row; an approval card's `cards.state` mirrors the approval state (08-1 §4.5.1). Throws on a state the type lacks.
 */
export function seedCard(db: Db, arg: CardSeedArg, now: number): CardSeedReply {
  const chatId = arg.chatId ?? fooChatId(db);
  if (!chatId) throw new Error('no chat to seed the card into');
  const mirrored = arg.type === 'approval' || arg.type === 'payment';
  const state = mirrored && arg.approval?.state ? arg.approval.state : arg.state;
  if (!isCardState(arg.type, state)) throw new Error(`${state} is not a ${arg.type} card state`);
  const cardId = newId('k', now);
  const messageId = newId('m', now);
  const nonce = newNonce();
  let jobId = arg.jobId;
  let approvalId: string | undefined;
  const ops: DbOp[] = [];
  if (arg.approval && !jobId) {
    jobId = newId('j', now);
    ops.push({
      op: 'insert',
      table: 'jobs',
      row: {
        id: jobId,
        chat_id: chatId,
        origin_chat_id: chatId,
        owner_kind: 'foo',
        title: String(arg.payload.title ?? arg.type),
        origin: 'user',
        intent: 'do',
        state: 'needs_you',
        created_at: now,
      },
    });
  }
  if (arg.approval) approvalId = newId('ap', now);
  const payload = approvalId ? { ...arg.payload, approvalId } : arg.payload;
  ops.push(
    {
      op: 'insert',
      table: 'messages',
      row: {
        id: messageId,
        chat_id: chatId,
        author_kind: 'foo',
        kind: 'card',
        card_id: cardId,
        status: 'complete',
        job_id: jobId ?? null,
        created_at: now,
      },
    },
    {
      op: 'insert',
      table: 'cards',
      row: {
        id: cardId,
        chat_id: chatId,
        message_id: messageId,
        job_id: jobId ?? null,
        type: arg.type,
        state,
        payload,
        nonce,
        expires_at: arg.approval ? (arg.approval.expiresAt ?? approvalExpiresAt(arg.approval.fields.verb, now)) : (arg.expiresAt ?? null),
        ...(arg.answer ? { answer: arg.answer, resolved_by: 'tap', resolved_at: now } : {}),
        created_at: now,
      },
    },
  );
  db.transaction(() => {
    const r = applyDbOps(db, ops, { now });
    if (!r.result.ok) throw new Error(`card seed refused: ${r.result.error.kind}`);
    if (arg.approval && approvalId) {
      const fields = arg.approval.fields as ApprovalFields;
      db.prepare(
        `INSERT INTO approvals (id, card_id, job_id, chat_id, verb, hard_limit, fields, fields_hash, state, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        approvalId,
        cardId,
        jobId,
        chatId,
        fields.verb,
        arg.approval.hardLimit ? 1 : 0,
        JSON.stringify(fields),
        fieldsHash(fields),
        arg.approval.state ?? 'PENDING',
        arg.approval.expiresAt ?? approvalExpiresAt(fields.verb, now),
        now,
      );
      // M5 T14
      if (arg.approval.submittedAt !== undefined)
        db.prepare('UPDATE approvals SET submitted_at = ? WHERE id = ?').run(arg.approval.submittedAt, approvalId);
    }
  })();
  return { chatId, cardId, messageId, nonce, ...(jobId ? { jobId } : {}), ...(approvalId ? { approvalId } : {}) };
}

/** Seed registry (08-3 §22.9). Rows are generated into the open foo.db through the real schema; open windows get them as patches. */
export function seeds(ctx: AppContext, clock: FakeClock): Record<SeedSet, () => SeedReply> {
  const demo =
    (set: SeedSet, o: { ch8Live?: boolean } = {}) =>
    (): SeedReply => {
      const r = seedUxWorld(ctx.db, clock.now(), o);
      writeSeedMedia(ctx.dataDir, r.media);
      ctx.settings.update((s) => uxWorldSettings(s, r.refs, clock.now()));
      writeSeedMemory(ctx.db, ctx.dataDir, ctx.settings.get().locale.timeZone);
      return { set, loaded: true, chats: r.chats, messages: r.messages, refs: r.refs };
    };
  return {
    demo: demo('demo'),
    'ux-world': demo('ux-world'),
    'ux-world-ch8-live': demo('ux-world-ch8-live', { ch8Live: true }),
    perf: () => {
      const r = seedPerf(ctx.db, clock.now());
      writeSeedMedia(ctx.dataDir, r.media);
      ctx.settings.update((s) => uxWorldSettings(s, r.refs, clock.now()));
      writeSeedMemory(ctx.db, ctx.dataDir, ctx.settings.get().locale.timeZone);
      return { set: 'perf', loaded: true, chats: r.chats, messages: r.messages, refs: r.refs };
    },
    'm4-cards': () => {
      const r = seedM4Cards(ctx.db, clock.now());
      writeSeedMedia(ctx.dataDir, r.media);
      ctx.settings.update((s) => uxWorldSettings(s, r.refs, clock.now()));
      writeSeedMemory(ctx.db, ctx.dataDir, ctx.settings.get().locale.timeZone);
      return { set: 'm4-cards', loaded: true, chats: r.chats, messages: r.messages, refs: r.refs };
    },
  };
}

/** After a seed: the open windows get the new world as ordinary patches (no reload, so the test's page stays usable). */
function republish(ctx: AppContext, oldChatIds: string[]): void {
  const s = ctx.settings.get();
  const lc = listContext(s);
  const rows = chatRows(ctx.db, lc);
  const live = new Set(rows.map((r) => r.id));
  for (const id of oldChatIds) if (!live.has(id)) emit('chat:removed', { chatId: id });
  for (const r of rows) emit('chat:upsert', r);
  emit('settings:changed', publicSettings(s));
  emit('ai:status', aiStatus(s, ctx.net.offline));
  emit('spend:update', spendSummary(ctx.db, s, lc.now));
  const open = s.window.lastChatId ?? fooChatId(ctx.db);
  if (open) emit('navigate', { view: { kind: 'chat', chatId: open } });
}

export function registerTestHooks(ctx: AppContext, clock: FakeClock): string[] {
  const guard = channels();
  const reply = (): ClockReply => ({ now: clock.now(), iso: new Date(clock.now()).toISOString() });
  const registry = seeds(ctx, clock);
  // M5 T6 (08-3 §22.2, G-M5-12): the in-memory Gmail drafts behind the Draft card until the M8 connector.
  installGmailDrafts(memoryGmailDrafts({ adoptUnknown: true }));

  guard.handle('test:clock', (raw: unknown) => {
    const arg = clockArg.parse(raw);
    if (arg?.set !== undefined) clock.set(typeof arg.set === 'string' ? Date.parse(arg.set) : arg.set);
    if (arg?.advance !== undefined) clock.advance(arg.advance);
    ctx.engine?.send('test.clock', { now: clock.now() });
    ctx.bridgeTest?.({ kind: 'test.clock', now: clock.now() });
    return reply();
  });
  guard.handle('test:seed', (raw: unknown) => {
    const set = seedArg.parse(raw).set;
    const oldChatIds = (ctx.db.prepare('SELECT id FROM chats').pluck().all() as string[]).slice();
    const out = registry[set]();
    republish(ctx, oldChatIds);
    return out;
  });
  guard.handle('test:setOnline', (raw: unknown) => {
    deps.net.online = onlineArg.parse(raw).online;
    ctx.net.report(deps.net.online);
    return { online: deps.net.online };
  });
  guard.handle('test:jobState', (raw: unknown) => {
    const { jobId, state } = jobStateArg.parse(raw);
    const now = clock.now();
    const row = ctx.db.prepare('SELECT chat_id FROM jobs WHERE id = ?').get(jobId) as { chat_id: string } | undefined;
    if (!row) throw new Error('no such job');
    ctx.db
      .prepare('UPDATE jobs SET state = ?, last_progress_at = ?, finished_at = ?, rev = rev + 1 WHERE id = ?')
      .run(state, now, TERMINAL.includes(state) ? now : null, jobId);
    recomputePill(ctx.db, row.chat_id, now);
    const [job] = jobRows(ctx.db, 'id = ?', [jobId], now);
    if (job) emit('job:upsert', job);
    const chat = chatRowById(ctx.db, listContext(ctx.settings.get()), row.chat_id);
    if (chat) emit('chat:upsert', chat);
    return { chatId: row.chat_id };
  });
  // M8 T3: the fake phone behind the FOO_TEST wa-bridge (scan, a group message, logout).
  guard.handle('test:wa', (raw: unknown) => ({ delivered: ctx.bridgeTest?.({ kind: 'test.wa', op: waArg.parse(raw) }) ?? false }));
  guard.handle('test:card.seed', (raw: unknown) => {
    const now = clock.now();
    const out = seedCard(ctx.db, cardSeedArg.parse(raw), now);
    const msg = messageGet(ctx.db, out.messageId);
    if (msg) emit('message:upsert', msg);
    const card = ctx.db.prepare('SELECT * FROM cards WHERE id = ?').get(out.cardId) as DbRow | undefined;
    if (card) emit('card:upsert', cardRow(card));
    if (out.jobId) {
      recomputePill(ctx.db, out.chatId, now);
      const [job] = jobRows(ctx.db, 'id = ?', [out.jobId], now);
      if (job) emit('job:upsert', job);
    }
    const chat = chatRowById(ctx.db, listContext(ctx.settings.get()), out.chatId);
    if (chat) emit('chat:upsert', chat);
    return out;
  });
  // M6 T7 (CR-0010 G-M6-09): the nightly tidy, now (M7 schedules it at 03:00).
  guard.handle('test:memoryTidy', async () => {
    if (!ctx.engine) throw new Error('no engine');
    return ctx.engine.request('test.memoryTidy', {}, 30_000);
  });
  guard.handle('test:theme', (raw: unknown) => {
    const { theme } = themeArg.parse(raw);
    nativeTheme.themeSource = theme === 'system' ? ctx.settings.get().appearance.theme : theme;
    return { themeSource: nativeTheme.themeSource };
  });
  guard.handle('test:reset', () => {
    clock.reset(TEST_EPOCH_MS);
    ctx.engine?.send('test.reset', {});
    ctx.engine?.send('test.clock', { now: clock.now() });
    ctx.bridgeTest?.({ kind: 'test.clock', now: clock.now() });
    deps.net.online = true;
    ctx.net.report(true);
    nativeTheme.themeSource = ctx.settings.get().appearance.theme;
    return reply();
  });
  return guard.registered;
}
