// Spec: 08-1 §3 (IPC contract: sender check + zod validation, `Result<T>` replies), §3.1 (platform info), §3.2 (the
// invoke rows M1 builds), §3.3 (events are patches; every *Row carries its rev), 08-0 §B.5; 08-3 §22.8 (test:* refused
// outside test runs, through ChannelGuard). M2 builder A: message:get/react/pin, files:open/showInFolder, job:details,
// routine:pause and the gap channels message:edit/delete/retry, link:open, app:showEmojiPanel (implementation-notes). M2
// builder B: message:send (idempotent, AT-225; R1 secret re-check, 08-2 §11.4), composer:checkSecret, composer:saveDraft,
// files:stage, voice:submit (04-2 §22.1), helper:pause (04-2 §23.2 "Turn on"). M5 (CR-0009): the card, draft, secret and
// code channels; each ticket's handler file fills its own rows (cards/answerIpc T5, approvals/approvalIpc T4, drafts/draftIpc
// T6, vault/secretIpc T2), and this file only registers them. M6 (CR-0010): the memory:* invokes, each validated here and
// forwarded to the engine as one `memory.cmd` (G-M6-01); memory:openFolder, files:pickFolder and the memory-only `data:export`
// (G-M6-11) run in main.
import { app, BrowserWindow, dialog, ipcMain, net, shell, systemPreferences, type IpcMainEvent } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MemoryCmdPayload } from '../../engine/protocol';
import { KitActionMessageSchema } from '../../shared/kit/catalog';
import { PageIdSchema, PageRpcCallSchema } from '../../shared/kit/page';
import { runMemoryExport } from '../memory/export';
import { reportPreview, reportSave, UNSIGNED_BUILD } from '../about/report';
import { removeForgottenFiles } from '../memory/forgetFiles';
import { z } from 'zod';
import { t } from '../../shared/copy/t';
import { fail, ok, type Result } from '../../shared/errors';
import type { EventChannel, EventPayload, InvokeChannel, InvokeIn, InvokeOut, PlatformInfo, VerifyResult } from '../../shared/ipc';
import { SECRET_OFFER_SLOTS } from '../../shared/ipc'; // M5 T2
import { PROVIDER_IDS, WRITABLE_PATHS, type Settings } from '../../shared/settings';
import type { FixAction, MessageRow, WindowsSettingsPage } from '../../shared/types';
import { deps } from '../deps';
import type { NetMonitor } from '../net/netMonitor';
import { applySetting, undoSetting } from '../settings/applySetting';
import type { SettingsStore } from '../settings/Settings';
import type { Db } from '../store/db';
import {
  aiStatus,
  bootstrap,
  chatOpen,
  chatRowById,
  answerAfter,
  FEEDBACK_CHIPS,
  feedbackMessage,
  fooChatId,
  clearChat,
  deleteMessages,
  editMessage,
  helperList,
  jobDetails,
  jobRows,
  listChats,
  markRead,
  memoryList,
  messageGet,
  messageList,
  pauseRoutine,
  pinChat,
  pinMessage,
  reactMessage,
  retryMessage,
  publicSettings,
  recomputePill,
  routineList,
  spendSummary,
  stopJob,
  type ListContext,
  type MessageWriteResult,
} from '../store/queries';
import { newId } from '../../shared/ids';
import { askedForCode, checkSecret } from '../../shared/redactor';
import { Inbox } from '../data/inbox';
import { draftAttachments, pauseHelper, saveDraft, sendMessage, submitVoice } from '../store/composerQueries';
import { helperRow } from '../db/rows';
import type { DbRow } from '../db/rows';
import { ChannelGuard } from './guard';
import { registerLiveIpc, routeLive } from '../jobs/liveIpc';
import type { EngineBridge } from '../engine-supervisor/EngineBridge';
import { FIX_ACTION_KINDS, JOB_CHANNELS, jobIpc } from '../jobs/jobIpc';
import type { AiStatus, DetectRow } from '../../shared/types';
import { insideDir } from '../windows/protocol';
import { registerSigninIpc } from '../jobs/signinIpc';
import { kitReaction, registerKitIpc } from '../kit/kitIpc';
import { isTrustedUrl } from '../windows/protocol';
import { registerConnectionIpc } from '../connections/connectionIpc';
import { logEvent } from '../log/techLog';
import { answerIpc, cardReaction } from '../cards/answerIpc';
import { approvalIpc } from '../approvals/approvalIpc';
import { draftFromMirror, draftIpc } from '../drafts/draftIpc';
import { secretIpc } from '../vault/secretIpc';
import { pageIpc } from '../page/pageIpc'; // R1 T5
import { keepIpc } from '../keep/keepIpc'; // R1 T7
import { finderChosen, finderWanted, type FinderWrite } from '../setup/aiFinder';
import { ensureSetupCard, faceChosen, nameAnswered, skipRest, welcomeStart } from '../setup/firstRun'; // CR-0026
import { aiFinderIpc, emitFinderWrite } from '../setup/aiFinderIpc';
import { setFooFace, setFooName, setFooVibe } from '../setup/fooProfile';
import { shippedFeatures } from '../features'; // CR-0054

const trusted = (e: IpcMainEvent) => !!e.senderFrame && isTrustedUrl(e.senderFrame.url);

function reducedMotion(): boolean {
  try {
    return systemPreferences.getAnimationSettings().prefersReducedMotion;
  } catch {
    return false;
  }
}

let guard: ChannelGuard | null = null;

/** Every invoke channel registers through this guard: sender-checked, and test:* refused unless FOO_TEST runs. */
export function channels(): ChannelGuard {
  guard ??= new ChannelGuard(ipcMain, (url) => isTrustedUrl(url));
  return guard;
}

/** Sends an event (08-1 §3.3) to foo's windows. */
export function emit<E extends EventChannel>(event: E, payload: EventPayload[E]): void {
  if (routeLive(event, payload)) return; // live:* go to their job's live window only (M9 T5, 08-0 §G.8)
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(event, payload);
}

export interface AppContext {
  db: Db;
  settings: SettingsStore;
  net: NetMonitor;
  /** The network probe: Electron's net.isOnline() in production, the injected Net in test runs. */
  probe: () => boolean;
  /** {DATA} (08-0 §E.6): files:open / showInFolder and the app://media host only reach files under it. */
  dataDir: string;
  /** M3: main's half of the engine port (08-1 §2.4); absent only in unit tests that build main alone. */
  engine?: EngineBridge;
  // M8 T3: FOO_TEST control line to the running wa-bridge (the fake phone and its clock); false when no bridge runs.
  bridgeTest?(msg: unknown): boolean;
}

export function listContext(settings: Settings): ListContext {
  return { now: deps.clock.now(), agentName: settings.identity.agentName, draftPrefix: t('chatlist.row.preview.draft') };
}

export const electronProbe = () => net.isOnline();

const empty = z.object({}).strict();
const chatId = z.string().min(1).max(80);
const messageId = z.string().min(1).max(80);
const cardId = z.string().min(1).max(80);
/** 08-2 §9.3: the card nonce is 32 lower-case hex. */
const nonce = z.string().regex(/^[0-9a-f]{32}$/);
const tapBy = z.enum(['tap', 'keyboard']);
/** M5 08-1 §3.2 `CardAnswer` (the value a Choice card is answered with). */
const cardAnswerValue = z.union([
  z.object({ optionId: z.string().min(1).max(40) }).strict(),
  z.object({ optionIds: z.array(z.string().min(1).max(40)).min(1).max(4) }).strict(),
  z.object({ text: z.string().min(1).max(4_000) }).strict(),
  z.object({ skip: z.literal(true) }).strict(),
]);
/** 04 §9: one emoji grapheme (a ZWJ or flag sequence is several code points). */
const emoji = z
  .string()
  .min(1)
  .max(32)
  .regex(/^\p{Extended_Pictographic}|^\p{Regional_Indicator}|^[0-9#*]\uFE0F?\u20E3/u);
// GAP: GAPS.md 2026-10-17 "message channels with no 08-1 entry"
/** link:open (gap): the schemes 04 §10.7 / §16.1 open; anything else is URL_NOT_ALLOWED. */
const LINK_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];
const SETTINGS_PAGE: Record<WindowsSettingsPage, string> = {
  notifications: 'ms-settings:notifications',
  'privacy-microphone': 'ms-settings:privacy-microphone',
  startupapps: 'ms-settings:startupapps',
  signin: 'ms-settings:signinoptions',
  storagesense: 'ms-settings:storagesense',
  dateandtime: 'ms-settings:dateandtime',
};

const cardAnswer = z.object({
  cardId: z.string().min(1).max(80),
  nonce: z.string().min(1).max(80),
  resolvedBy: z.enum(['tap', 'keyboard']),
});

/** One zod schema per invoke channel (08-1 §3.1.1: a payload that fails zod is IPC_REJECTED). */
export const SCHEMAS: { [C in InvokeChannel]: z.ZodType<InvokeIn[C]> } = {
  'app:getBootstrap': empty as z.ZodType<Record<string, never>>,
  'app:quit': z.object({ confirm: z.boolean(), whenPaymentDone: z.boolean().optional() }).strict(),
  'app:openWindowsSettings': z
    .object({ page: z.enum(['notifications', 'privacy-microphone', 'startupapps', 'signin', 'storagesense', 'dateandtime']) })
    .strict(),
  'chat:list': z.object({ filter: z.enum(['all', 'needs_you', 'working', 'done']).optional(), q: z.string().max(200).optional() }).strict(),
  'chat:open': z.object({ chatId }).strict(),
  'chat:markRead': z.object({ chatId, upToSeq: z.number().int().min(0) }).strict(),
  'chat:pin': z.object({ chatId, on: z.boolean() }).strict(),
  'chat:mute': z.object({ chatId, until: z.union([z.number().int(), z.literal('forever'), z.null()]) }).strict(),
  'message:list': z.object({ chatId, beforeSeq: z.number().int().optional(), limit: z.number().int().min(1).max(200) }).strict(),
  'message:get': z.object({ messageId }).strict(),
  'message:react': z.object({ messageId, emoji, on: z.boolean() }).strict(),
  // CR-0062: 👍 / 👎 with the §17.2 chips and the optional words (1–3 lines; 500 is the field's own cap).
  'message:feedback': z
    .object({
      messageId,
      vote: z.enum(['good', 'bad']).nullable(),
      chips: z.array(z.enum(FEEDBACK_CHIPS)).max(5).optional(),
      note: z.string().max(500).optional(),
    })
    .strict(),
  'message:pin': z.object({ messageId, on: z.boolean() }).strict(),
  'message:send': z
    .object({
      chatId,
      clientId: z.string().min(1).max(80),
      text: z.string().max(40_000),
      replyToId: messageId.optional(),
      attachmentIds: z.array(z.string().min(1).max(80)).max(6).optional(),
      secretOverride: z.boolean().optional(),
      side: z.boolean().optional(),
      quote: z.string().min(1).max(2000).optional(),
    })
    .strict()
    .refine((m) => !m.side || m.replyToId !== undefined, { message: 'a side question replies to a message' })
    .refine((m) => m.quote === undefined || m.side === true, { message: 'a quote belongs to a side question' }),
  'composer:checkSecret': z.object({ text: z.string().max(200_000) }).strict(),
  'composer:saveDraft': z
    .object({
      chatId,
      text: z.string().max(40_000),
      attachmentIds: z.array(z.string().min(1).max(80)).max(6),
      replyToId: messageId.optional(),
      linkPreviewRemoved: z.boolean(),
    })
    .strict(),
  'files:stage': z
    .object({
      name: z.string().min(1).max(255),
      bytes: z.custom<ArrayBuffer>((v) => v instanceof ArrayBuffer || ArrayBuffer.isView(v)),
    })
    .strict(),
  'voice:submit': z
    .object({ chatId, attachmentId: z.string().min(1).max(80), durationMs: z.number().int().min(0).max(3_600_000) })
    .strict(),
  'helper:pause': z.object({ helperId: z.string().min(1).max(80), on: z.boolean().optional() }).strict(),
  'message:edit': z.object({ messageId, text: z.string().min(1).max(40_000) }).strict(),
  'message:delete': z.object({ messageIds: z.array(messageId).min(1).max(500), confirm: z.literal(true) }).strict(),
  'message:retry': z.object({ messageId }).strict(),
  'message:stopReply': z.object({ chatId: z.string().min(1).max(80) }).strict(),
  'files:open': z.object({ path: z.string().min(1).max(1024) }).strict(),
  'files:showInFolder': z.object({ path: z.string().min(1).max(1024) }).strict(),
  'job:details': z.object({ jobId: z.string().min(1).max(80) }).strict(),
  'routine:pause': z.object({ routineId: z.string().min(1).max(80), confirm: z.literal(true).optional() }).strict(),
  'link:open': z.object({ url: z.string().min(1).max(2048) }).strict(),
  'app:showEmojiPanel': empty as z.ZodType<Record<string, never>>,
  'app:reportPreview': empty as z.ZodType<Record<string, never>>,
  'app:reportSave': z.object({ previewId: z.string().min(1).max(80), note: z.string().max(500).optional() }).strict(),
  'job:stop': z.object({ jobId: z.string().min(1).max(80) }).strict(),
  'job:watch': z.object({ jobId: z.string().min(1).max(80), on: z.boolean() }).strict(),
  // M9 (CR-0013, 08-1 §3.2). Handlers below are stubs until T6 (sign-in, take over) and T8 (hand-back sites); T5's live ones are real.
  'job:openWindow': z.object({ jobId: z.string().min(1).max(80) }).strict(),
  'job:takeOver': z.object({ jobId: z.string().min(1).max(80) }).strict(),
  'job:handBack': z.object({ jobId: z.string().min(1).max(80) }).strict(),
  'signin:done': z.object({ jobId: z.string().min(1).max(80) }).strict(),
  'signin:skip': z.object({ jobId: z.string().min(1).max(80) }).strict(),
  'memory:list': z
    .object({
      filter: z
        .object({
          chip: z.enum(['all', 'said', 'guessed', 'gmail', 'whatsapp', 'chat']),
          helperId: z.string().max(80).optional(),
          last7: z.boolean().optional(),
        })
        .strict(),
      q: z.string().max(200).optional(),
    })
    .strict(),
  'memory:add': z.object({ text: z.string().trim().min(1).max(120) }).strict(),
  'memory:edit': z.object({ factId: z.string().min(1).max(80), text: z.string().trim().min(1).max(120) }).strict(),
  'memory:setPrivate': z.object({ factId: z.string().min(1).max(80), private: z.boolean() }).strict(),
  'memory:setKind': z.object({ factId: z.string().min(1).max(80), kind: z.enum(['person', 'preference', 'place', 'fact']) }).strict(),
  'memory:forget': z.object({ factId: z.string().min(1).max(80), chipId: z.string().min(1).max(80).optional() }).strict(),
  'memory:undo': z.object({ undoToken: z.string().min(1).max(80) }).strict(),
  'memory:forgetBySource': z
    .object({ source: z.enum(['chat', 'gmail', 'gcal', 'whatsapp', 'manual', 'setup', 'job']), confirm: z.literal(true) })
    .strict(),
  // CONFIRM_MISMATCH (not IPC_REJECTED) for a wrong word: the dialog keeps its button disabled, this is the backstop.
  'memory:forgetAll': z.object({ typed: z.string().max(40) }).strict() as unknown as z.ZodType<{ typed: 'FORGET' }>,
  'memory:openFolder': empty as z.ZodType<Record<string, never>>,
  'data:export': z.object({ folder: z.string().min(1).max(1024), scope: z.enum(['all', 'memory']).optional() }).strict(),
  'files:pickFolder': z.object({ purpose: z.enum(['output', 'grant', 'export', 'avatar']) }).strict(),
  'routine:list': empty as z.ZodType<Record<string, never>>,
  'helper:list': empty as z.ZodType<Record<string, never>>,
  'settings:get': empty as z.ZodType<Record<string, never>>,
  'settings:set': z.object({ path: z.enum(WRITABLE_PATHS), value: z.unknown() }).strict() as z.ZodType<{ path: string; value: unknown }>,
  'settings:undo': z.object({ changeId: z.string().min(1).max(80) }).strict(),
  'ai:verify': z.object({ providerId: z.enum(PROVIDER_IDS) }).strict(),
  'ai:detect': empty as z.ZodType<Record<string, never>>,
  'ai:choose': z.object({ primary: z.enum(PROVIDER_IDS), backup: z.enum(PROVIDER_IDS).nullable().optional() }).strict() as z.ZodType<{
    primary: (typeof PROVIDER_IDS)[number];
    backup?: (typeof PROVIDER_IDS)[number] | null;
  }>,
  'setup:welcome': empty as z.ZodType<Record<string, never>>,
  'setup:name': z.object({ name: z.string().max(200) }).strict(),
  'setup:face': z.object({ face: z.string().max(40), colour: z.string().max(40).optional() }).strict(),
  'setup:skipRest': empty as z.ZodType<Record<string, never>>,
  'profile:setName': z.object({ name: z.string().max(200) }).strict(),
  'profile:setFace': z.object({ face: z.string().max(40), colour: z.string().max(40).optional() }).strict(),
  'profile:setVibe': z.union([
    z.object({ optionId: z.string().max(10) }).strict(),
    z.object({ words: z.string().max(400) }).strict(),
  ]) as z.ZodType<{ optionId: string } | { words: string }>,
  'notifications:status': empty as z.ZodType<Record<string, never>>,
  // M8 T3 (handlers in src/main/whatsapp/waMain.ts)
  'whatsapp:linkStart': empty as z.ZodType<Record<string, never>>,
  'whatsapp:linkCancel': empty as z.ZodType<Record<string, never>>,
  'whatsapp:unlink': empty as z.ZodType<Record<string, never>>,
  'chat:archive': z.object({ chatId, on: z.boolean() }).strict(),
  'chat:clear': z.object({ chatId, confirm: z.literal(true) }).strict(),
  // M8 T2 (08-1 §3.2)
  'connection:list': empty as z.ZodType<Record<string, never>>,
  'connection:connect': z
    .object({
      app: z.literal('google'),
      scopes: z
        .array(z.enum(['gmail', 'gcal', 'contacts']))
        .min(1)
        .max(3)
        .optional(),
    })
    .strict(),
  'connection:disconnect': z.object({ connectionId: z.string().min(1).max(80), confirm: z.literal(true) }).strict(),
  'connection:googleInfo': empty as z.ZodType<Record<string, never>>,
  // AI step (CR-0020 (c)): the J2 card and the key's Secret box; `app:openExternal` per 08-1 §3.2 (only maker_page is built).
  'ai:openFinder': empty as z.ZodType<Record<string, never>>,
  'ai:askKey': z.object({ providerId: z.enum(['openai-key', 'anthropic-key', 'google-key']) }).strict(),
  'app:openExternal': z
    .object({
      target: z.enum(['google_signin', 'x_intent', 'google_account', 'maker_page', 'handback_site', 'ai_page', 'action_chip']),
      url: z.string().max(2048).optional(),
      providerId: z.enum(PROVIDER_IDS).optional(),
      cardId: z.string().max(80).optional(),
      nonce: z.string().max(80).optional(),
      // R1 T7 (lead ok): target action_chip names the reply and the chip's place (04-2 §21.7).
      messageId: messageId.optional(),
      index: z.number().int().min(0).max(2).optional(),
    })
    .strict(),
  // M4 T5 (08-1 §3.2; G-M4-09 error:fix). Main re-checks every card answer against the stored card (src/main/jobs/jobIpc.ts).
  'job:stopAll': z.object({ confirm: z.literal(true) }).strict(),
  'job:retry': z.object({ jobId: z.string().min(1).max(80) }).strict(),
  'plan:go': cardAnswer.extend({ text: z.string().max(10_000).optional() }).strict(),
  'plan:change': cardAnswer.extend({ text: z.string().max(10_000).optional() }).strict(),
  'stuck:choose': cardAnswer.extend({ choice: z.enum(['other_way', 'take_over', 'stop']) }).strict(),
  'recovery:choose': cardAnswer.extend({ choice: z.enum(['resume', 'stop']) }).strict(),
  'error:fix': cardAnswer
    .extend({ action: z.object({ kind: z.enum(FIX_ACTION_KINDS) }).catchall(z.unknown()) as unknown as z.ZodType<FixAction> })
    .strict(),
  // M5 (08-1 §3.2). `secret:save` names are refined per kind by its handler (G-M5-16); values never leave main.
  'card:answer': z.object({ cardId, nonce, answer: cardAnswerValue, resolvedBy: tapBy }).strict(),
  'card:approve': z.object({ cardId, nonce, scope: z.enum(['once', 'chat', 'always']), resolvedBy: tapBy }).strict(),
  'card:decline': z.object({ cardId, nonce, resolvedBy: tapBy }).strict(),
  'card:askAgain': z.object({ cardId }).strict(),
  'card:heldPick': z.object({ cardId, nonce, optionId: z.string().min(1).max(40), resolvedBy: tapBy }).strict(),
  // M5 T14 (G-M5-39)
  'approval:report': z.object({ cardId, nonce, outcome: z.enum(['went_through', 'did_not']), resolvedBy: tapBy }).strict(),
  'draft:update': z
    .object({
      cardId,
      nonce,
      fields: z
        .object({ to: z.string().max(320).optional(), subject: z.string().max(998).optional(), body: z.string().max(40_000) })
        .strict(),
    })
    .strict(),
  'draft:send': z.object({ cardId, nonce, resolvedBy: tapBy }).strict(),
  'draft:undo': z.object({ approvalId: z.string().min(1).max(80) }).strict(),
  'draft:discard': z.object({ cardId, nonce, resolvedBy: tapBy }).strict(),
  'draft:openInApp': z.object({ cardId }).strict(),
  'secret:save': z
    .object({
      requestId: z.string().min(1).max(80).optional(),
      kind: z.enum(['ai_key', 'login', 'card', 'conn_token', 'wa_session', 'web_key', 'hub_key', 'user_key']),
      name: z.string().min(1).max(253),
      fields: z.record(z.string().min(1).max(40), z.string().max(20_000)),
    })
    .strict(),
  'secret:list': empty as z.ZodType<Record<string, never>>,
  'secret:delete': z.object({ target: z.string().min(1).max(300), confirm: z.literal(true) }).strict(),
  'code:submit': z.object({ requestId: z.string().min(1).max(80), code: z.string().min(1).max(64) }).strict(),
  // M5 T2 (G-M5-21)
  'secret:offer': z.object({ chatId, slot: z.enum(SECRET_OFFER_SLOTS) }).strict(),
  // CR-0022 (X-180): the kit and page channels; handlers arrive with R1 T2 (kit:action), T5 (page:rpc) and T7 (kit:refresh,
  // keep:*). A kept body is A2UI JSON or a .foopage blob, ≤ the 512 KB page cap plus its JSON wrapping.
  'kit:action': KitActionMessageSchema,
  'kit:refresh': z
    .object({ chatId, messageId: messageId.optional(), cardId: cardId.optional(), surfaceId: z.string().min(1).max(64) })
    .strict(),
  'page:rpc': z.object({ chatId, pageId: PageIdSchema, call: PageRpcCallSchema }).strict(),
  'keep:save': z
    .object({
      chatId,
      messageId: messageId.optional(),
      cardId: cardId.optional(),
      kind: z.enum(['kit', 'page']),
      title: z.string().min(1).max(80),
      body: z.string().min(1).max(600_000),
      png: z.union([z.instanceof(ArrayBuffer), z.instanceof(Uint8Array)]).optional(),
      // R1 T7 (lead ok): the snapshot's box (CSS px).
      rect: z
        .object({
          x: z.number().int().min(0).max(10_000),
          y: z.number().int().min(0).max(10_000),
          width: z.number().int().min(0).max(10_000),
          height: z.number().int().min(0).max(10_000),
        })
        .strict()
        .optional(),
    })
    .strict(),
  'keep:list': z.object({ chatId }).strict(),
  'page:open': z
    .object({
      chatId,
      messageId: messageId.optional(),
      cardId: cardId.optional(),
      index: z.number().int().min(0).max(20).optional(),
      keptId: z.string().min(1).max(80).optional(),
    })
    .strict()
    .refine((m) => [m.messageId, m.cardId, m.keptId].filter((x) => x !== undefined).length === 1, { message: 'one source' }),
  'keep:open': z.object({ id: z.string().min(1).max(80) }).strict(),
  'keep:showInFolder': z.object({ id: z.string().min(1).max(80) }).strict(),
};

export type Handler<C extends InvokeChannel> = (req: InvokeIn[C]) => Result<InvokeOut[C]> | Promise<Result<InvokeOut[C]>>;
/** One ticket's rows: channel → handler (M5 handler files return these; registerIpc registers them). */
export type IpcHandlers<C extends InvokeChannel> = { [K in C]: Handler<K> };

function handleAll<C extends InvokeChannel>(rows: IpcHandlers<C>): void {
  for (const channel of Object.keys(rows) as C[]) handle(channel, rows[channel] as Handler<C>);
}

/** Registers one channel: zod-validated, sender-checked, always answering with a Result. */
export function handle<C extends InvokeChannel>(channel: C, fn: Handler<C>): void {
  channels().handle(channel, async (raw: unknown) => {
    const parsed = SCHEMAS[channel].safeParse(raw ?? {});
    if (!parsed.success) {
      logEvent({ lvl: 'warn', mod: 'ipc', evt: 'IPC_REJECTED', kind: channel });
      return fail('IPC_REJECTED');
    }
    try {
      return await fn(parsed.data);
    } catch (e) {
      // The error object can carry message text or a payload; only its name reaches the log (R7).
      logEvent({ lvl: 'error', mod: 'ipc', evt: 'IPC_FAILED', kind: `${channel} ${e instanceof Error ? e.name : typeof e}` });
      return fail('UNKNOWN');
    }
  });
}

export function registerIpc(ctx: AppContext): void {
  const { db, settings } = ctx;
  const now = () => deps.clock.now();
  const emitChat = (id: string) => {
    const row = chatRowById(db, listContext(settings.get()), id);
    if (row) emit('chat:upsert', row);
  };
  const emitSettings = () => emit('settings:changed', publicSettings(settings.get()));

  ipcMain.on('app:platform', (e) => {
    if (!trusted(e)) {
      e.returnValue = null;
      return;
    }
    const info: PlatformInfo = {
      os: process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux',
      reducedMotion: reducedMotion(),
      animations: settings.get().appearance.animations,
      now: now(),
    };
    e.returnValue = info;
  });

  ctx.net.onChange((online) => {
    ctx.engine?.send('net', { online });
    emit('net:state', { online });
    emit('ai:status', aiStatus(settings.get(), ctx.net.offline, ctx.engine?.aiStatus ?? null));
  });

  handle('app:getBootstrap', () => {
    // CR-0026: a first run opens on the card for `setup.step` (welcome, AI finder, name, face, vibe; FOO_TEST runs only when
    // they ask for a first run).
    if (process.env.FOO_TEST !== '1' || process.env.FOO_TEST_FIRST_RUN === '1')
      emitFinderWrite(ctx, ensureSetupCard(db, settings, now(), ctx.dataDir));
    const s = settings.get();
    const b = bootstrap(db, { ...listContext(s), settings: s, offline: ctx.net.offline, engineAi: ctx.engine?.aiStatus ?? null });
    return ok({ ...b, features: shippedFeatures(), appVersion: app.getVersion(), testerBuild: UNSIGNED_BUILD });
  });
  handle('app:quit', ({ confirm }) => {
    const runningJobs = db
      .prepare("SELECT COUNT(*) FROM jobs WHERE state IN ('queued','working','needs_you','waiting')")
      .pluck()
      .get() as number;
    const quitting = runningJobs === 0 || confirm;
    if (quitting) setImmediate(() => app.quit());
    return ok({ quitting, runningJobs, paymentInFlight: null });
  });
  handle('app:openWindowsSettings', async ({ page }) => {
    await shell.openExternal(SETTINGS_PAGE[page]);
    return ok(undefined);
  });
  handle('chat:list', ({ filter, q }) => ok(listChats(db, listContext(settings.get()), filter ?? 'all', q ?? '')));
  handle('chat:open', ({ chatId: id }) => {
    const r = chatOpen(db, id, now());
    return r ? ok(r) : fail('NOT_FOUND');
  });
  handle('chat:markRead', ({ chatId: id, upToSeq }) => {
    if (markRead(db, id, upToSeq)) emitChat(id);
    return ok(undefined);
  });
  handle('chat:pin', ({ chatId: id, on }) => {
    const r = pinChat(db, id, on, now());
    if (!r.ok) return fail(r.reason === 'not_found' ? 'NOT_FOUND' : 'VALIDATION', r.reason);
    const row = chatRowById(db, listContext(settings.get()), id)!;
    emit('chat:upsert', row);
    return ok(row);
  });
  handle('chat:mute', ({ chatId: id, until }) => {
    settings.update((s) => {
      const muted = { ...s.notifications.mutedChats };
      if (until === null) delete muted[id];
      else muted[id] = until;
      return { ...s, notifications: { ...s.notifications, mutedChats: muted } };
    });
    emitSettings();
    return ok(undefined);
  });
  handle('message:list', ({ chatId: id, beforeSeq, limit }) => ok(messageList(db, id, limit, beforeSeq)));
  handle('message:get', ({ messageId: id }) => {
    const row = messageGet(db, id);
    return row ? ok(row) : fail('NOT_FOUND');
  });
  const written = (r: MessageWriteResult): Result<MessageRow> => {
    if (!r.ok) return fail(r.reason === 'not_found' ? 'NOT_FOUND' : 'VALIDATION');
    emit('message:upsert', r.row);
    return ok(r.row);
  };
  const asVoid = (r: Result<MessageRow>): Result<void> => (r.ok ? ok(undefined) : r);
  handle('message:feedback', ({ messageId: id, vote, chips, note }) => asVoid(written(feedbackMessage(db, id, vote, chips, note))));
  handle('message:react', ({ messageId: id, emoji: e, on }) => {
    const r = asVoid(written(reactMessage(db, id, e, on, now())));
    // M5 (T5): a reaction on a card's bubble may answer a Choice card or get the G16 line (08-4 §26.6 rule 4, 08-2 §5.2.2).
    if (r.ok && on) cardReaction(ctx, id, e);
    // R1 T3: a keycap reaction on a foo message picks a row of its ListPick, like a tap (05-1 §5.3.4, AT-349).
    if (r.ok && on) kitReaction(ctx, id, e, now());
    return r;
  });
  handle('message:pin', ({ messageId: id, on }) => asVoid(written(pinMessage(db, id, on))));
  handle('message:edit', ({ messageId: id, text }) => {
    // Art. 8 / R1: the edit is re-checked like message:send (askedForCode from the chat's recent messages).
    const chatOf = messageGet(db, id)?.chatId;
    const asked = chatOf ? askedForCode(messageList(db, chatOf, 20), now()) : false;
    const e = editMessage(db, id, text, now(), { askedForCode: asked });
    if (!e.ok && e.reason === 'secret') return { ok: false, error: { kind: 'SECRET_SUSPECTED', paste: e.paste } };
    if (!e.ok && e.reason === 'too_long') return fail('VALIDATION', 'too_long');
    const r = written(e);
    if (r.ok) {
      emitChat(r.value.chatId);
      // CR-0060 (04 §6.2 Edit): the answer under the edited message is written again in place from the new words.
      const answer = answerAfter(db, id);
      if (answer && ctx.engine?.live) ctx.engine.send('reply.rewrite', { messageId: answer });
    }
    return r;
  });
  handle('chat:clear', ({ chatId: id }) => {
    // A reply still being written would land in the emptied chat, so the chat's lane stops first (as message:stopReply).
    if (ctx.engine?.live) ctx.engine.send('reply.stop', { chatId: id });
    const rows = clearChat(db, id, now(), { keepSetup: id === fooChatId(db) && !settings.get().setup.complete });
    if (!rows) return fail('NOT_FOUND');
    for (const row of rows) emit('message:upsert', row);
    emitChat(id);
    return ok(undefined);
  });
  handle('message:delete', ({ messageIds }) => {
    const r = deleteMessages(db, messageIds, now());
    for (const row of r.rows) emit('message:upsert', row);
    for (const id of r.chatIds) emitChat(id);
    return ok(undefined);
  });
  handle('message:retry', ({ messageId: id }) => {
    // 04 §19.4: "Try again" on a cut-off foo reply runs its turn again (the engine knows which message it answered).
    const target = messageGet(db, id);
    if (target && target.authorKind !== 'user' && target.status === 'failed') {
      ctx.engine?.send('reply.retry', { messageId: id });
      return ok(target);
    }
    // CR-0059 row 1 (04 §17.1 "Write this answer again"): a finished text answer is written again in place.
    // Only an answer of foo's or a helper's; the engine answers as a plain reply, so it never repeats an action.
    if (
      target &&
      (target.authorKind === 'foo' || target.authorKind === 'helper') &&
      target.kind === 'text' &&
      target.status === 'complete' &&
      !target.deletedAt
    ) {
      if (!ctx.engine?.live) return { ok: false, error: { kind: 'AI_SERVICE_DOWN' } };
      ctx.engine.send('reply.rewrite', { messageId: id });
      return ok(target);
    }
    const r = written(retryMessage(db, id));
    if (r.ok && target) ctx.engine?.send('user.message', { messageId: id, chatId: target.chatId });
    return r;
  });

  handle('message:stopReply', ({ chatId }) => {
    if (!ctx.engine?.live) return ok(false);
    ctx.engine.send('reply.stop', { chatId });
    return ok(true);
  });

  // ---------------------------------------------------------------- the composer (M2 builder B)
  const inbox = new Inbox(ctx.dataDir);
  /**
   * 04 §3.3 / 04-2 §23.1: saved, but foo cannot hand it on (offline, AI down, signed out, at its limit, spend cap, or the
   * chat's helper is paused).
   */
  const waiting = (chatId?: string) => {
    if (chatId) {
      const paused = db.prepare('SELECT h.paused FROM chats c JOIN helpers h ON h.id = c.helper_id WHERE c.id = ?').get(chatId) as
        DbRow | undefined;
      if (paused?.paused === 1) return true;
    }
    const ai = aiStatus(settings.get(), ctx.net.offline, ctx.engine?.aiStatus ?? null);
    if (ai.state === 'offline' || ai.state === 'down' || ai.state === 'signed_out' || ai.state === 'limit') return true;
    const spend = spendSummary(db, settings.get(), now());
    return spend.aiBilling === 'key' && spend.aiSpentPaise !== null && spend.aiSpentPaise >= spend.aiCapPaise;
  };
  const recent = (id: string) => messageList(db, id, 20);
  handle('message:send', (req) => {
    // M8 T7 (04 §10.11, AT-269): a mirrored WhatsApp group's Send makes a group Draft card in foo's chat; nothing is stored
    // in the mirror and nothing is sent.
    const mirrored = draftFromMirror(ctx, req);
    if (mirrored)
      return mirrored.then((r) =>
        !r || !r.ok ? (r ?? fail('VALIDATION')) : ok({ messageId: r.value.messageId, queued: false, mirrorDraft: r.value }),
      );
    const fromDraft = draftAttachments(db, req.chatId);
    const r = sendMessage(db, req, {
      now: now(),
      newId: () => newId('m', now()),
      waiting: waiting(req.chatId),
      attachment: (id) => inbox.get(id) ?? fromDraft.find((a) => a.id === id),
      askedForCode: askedForCode(recent(req.chatId), now()),
    });
    if (!r.ok) {
      if (r.reason === 'secret') return { ok: false, error: { kind: 'SECRET_SUSPECTED', ...(r.paste ? { paste: r.paste } : {}) } };
      return fail(r.reason === 'not_found' || r.reason === 'attachment_missing' ? 'NOT_FOUND' : 'VALIDATION', r.reason);
    }
    let queued = r.queued;
    if (r.created) {
      // 08-1 §2.4 `user.message`: after main stored it, the engine's chat lane takes it (08-2 §5.2). While the engine is
      // starting or restarting it waits to send (04 §3.3) and goes when the engine drains its queue.
      // R1 T6 (04 §17.5): a side question goes to the engine as `side.question`, answered without touching a running job.
      const taken = ctx.engine?.send(req.side ? 'side.question' : 'user.message', { messageId: r.messageId, chatId: req.chatId }) ?? false;
      // EngineSupervisor.wanted(): a FOO_TEST run without the fake AI never has an engine, and its sends stay as M2 left them.
      if (!taken && !r.queued && (process.env.FOO_TEST !== '1' || !!process.env.FOO_FAKE_AI)) {
        queued = true;
        db.prepare(`UPDATE messages SET status = 'queued' WHERE id = ? AND status = 'sent'`).run(r.messageId);
        emit('message:upsert', messageGet(db, r.messageId) ?? r.row);
      } else emit('message:upsert', r.row);
      emitChat(req.chatId);
    }
    return ok({ messageId: r.messageId, queued });
  });
  handle('composer:checkSecret', ({ text }) => ok(checkSecret(text)));
  handle('composer:saveDraft', (req) => {
    const r = saveDraft(db, req, {
      now: now(),
      newId: () => newId('dr', now()),
      attachment: (id) => inbox.get(id) ?? draftAttachments(db, req.chatId).find((a) => a.id === id),
    });
    if (!r) return fail('NOT_FOUND');
    if (r.changed) emitChat(req.chatId);
    return ok(undefined);
  });
  handle('files:stage', ({ name, bytes }) => {
    const view = bytes as unknown as ArrayBufferView;
    const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const id = newId('att', now());
    const r = inbox.stage(id, name, data);
    if (!r.ok) return fail(r.reason === 'too_big' ? 'FILE_TOO_BIG' : 'FILE_TYPE');
    return ok({ attachmentId: id });
  });
  handle('voice:submit', ({ chatId: id, attachmentId, durationMs }) => {
    if (durationMs < 500) return fail('VOICE_TOO_SHORT');
    // Review S4: only a recording the recorder staged (name, WebM/Ogg header, voice mime) becomes a voice note.
    if (!inbox.isRecording(attachmentId)) return fail(inbox.get(attachmentId) ? 'VALIDATION' : 'NOT_FOUND', 'not_a_recording');
    const messageId = newId('m', now());
    const voicePath = inbox.moveToVoice(attachmentId, messageId);
    if (!voicePath) return fail('NOT_FOUND');
    const r = submitVoice(db, { chatId: id, messageId, voicePath, durationMs }, { now: now(), waiting: waiting(id) });
    if (!r.ok) return fail(r.reason === 'too_short' ? 'VOICE_TOO_SHORT' : 'NOT_FOUND');
    emit('message:upsert', r.row);
    emitChat(id);
    return ok({ messageId });
  });
  handle('helper:pause', ({ helperId, on }) => {
    if (!pauseHelper(db, helperId, on ?? true)) return fail('NOT_FOUND');
    return ok(helperRow(db.prepare('SELECT * FROM helpers WHERE id = ?').get(helperId) as DbRow));
  });
  handle('files:open', async ({ path }) => {
    const file = insideDir(ctx.dataDir, path);
    if (!file) return fail('PATH_NOT_ALLOWED');
    const err = await shell.openPath(file);
    return err ? fail('NOT_FOUND', err) : ok(undefined);
  });
  // The memory zip lands in a folder the person picked (06-2 §7.4 "Show in folder"), so the last export path is allowed too.
  let lastExportPath: string | undefined;
  handle('files:showInFolder', ({ path }) => {
    const file = path === lastExportPath ? path : insideDir(ctx.dataDir, path);
    if (!file) return fail('PATH_NOT_ALLOWED');
    shell.showItemInFolder(file);
    return ok(undefined);
  });
  handle('job:details', ({ jobId }) => {
    const d = jobDetails(db, jobId, now());
    return d ? ok(d) : fail('JOB_GONE');
  });
  handle('routine:pause', ({ routineId }) => {
    const row = pauseRoutine(db, routineId, now());
    return row ? ok(row) : fail('NOT_FOUND');
  });
  handle('link:open', async ({ url }) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return fail('URL_NOT_ALLOWED');
    }
    if (!LINK_SCHEMES.includes(parsed.protocol)) return fail('URL_NOT_ALLOWED');
    await shell.openExternal(parsed.toString());
    return ok(undefined);
  });
  // CR-0061 (06-3 §18.2): the report is saved on this PC only, in `{OUT}\reports\` (08-0 §E.6: FOO_OUT_DIR in test runs,
  // which open nothing).
  handle('app:reportPreview', () =>
    ok(reportPreview({ dataDir: ctx.dataDir, version: app.getVersion(), now: now(), timeZone: settings.get().locale.timeZone })),
  );
  handle('app:reportSave', ({ previewId, note }) => {
    const test = process.env.FOO_TEST === '1';
    const folder = join(process.env.FOO_OUT_DIR ?? join(app.getPath('documents'), 'foo'), 'reports');
    const r = reportSave(previewId, note, folder, now(), settings.get().locale.timeZone);
    if (!r.ok) return fail(r.error);
    if (!test) shell.showItemInFolder(r.zipPath);
    return ok({ zipPath: r.zipPath });
  });
  handle('app:showEmojiPanel', () => {
    if (app.isEmojiPanelSupported()) app.showEmojiPanel();
    return ok(undefined);
  });
  // M4 T5: the job and job-card channels check and forward one MainToEngine message each (X-124).
  const jobs = jobIpc({
    db,
    engine: ctx.engine,
    now,
    newJobId: () => newId('j', now()),
    stopWithoutEngine: (jobId) => {
      // No engine connected: the job row is cancelled here and the chat pill re-derived (M1); nothing was done for the user.
      const r = stopJob(db, jobId, now());
      if (!r) return fail('JOB_GONE');
      const [row] = jobRows(db, 'id = ?', [jobId], now());
      if (row) emit('job:upsert', row);
      recomputePill(db, r.chatId, now());
      emitChat(r.chatId);
      return ok({ jobId, done: [], nothingDone: true });
    },
  });
  for (const c of JOB_CHANNELS) handle(c, jobs[c] as Handler<typeof c>);
  registerLiveIpc(ctx, handle); // job:openWindow, job:watch (M9 T5, 09 §9.27.2)
  registerSigninIpc(ctx, handle);
  registerKitIpc(ctx, handle); // kit:action (R1 T2), kit:refresh (R1 T7), 04 §13.5
  handle('memory:list', ({ filter, q }) => ok(memoryList(db, filter, q, now())));
  // M6 (CR-0010 G-M6-01): the engine owns files, the classify turn and the sensitive rule; main forwards one message each.
  const memoryCmd = <T>(cmd: MemoryCmdPayload): Promise<Result<T>> =>
    ctx.engine?.live ? ctx.engine.request<T, 'memory.cmd'>('memory.cmd', cmd, 30_000) : Promise.resolve(fail<T>('UNKNOWN', 'no engine'));
  handle('memory:add', ({ text }) => memoryCmd({ cmd: 'add', text }));
  handle('memory:edit', ({ factId, text }) => memoryCmd({ cmd: 'edit', factId, text }));
  handle('memory:setPrivate', (req) => memoryCmd({ cmd: 'setPrivate', factId: req.factId, private: req.private }));
  handle('memory:setKind', ({ factId, kind }) => memoryCmd({ cmd: 'setKind', factId, kind }));
  handle('memory:forget', ({ factId, chipId }) => memoryCmd({ cmd: 'forget', factId, ...(chipId ? { chipId } : {}) }));
  handle('memory:undo', ({ undoToken }) => memoryCmd({ cmd: 'undo', undoToken }));
  handle('memory:forgetBySource', ({ source }) => memoryCmd({ cmd: 'forgetBySource', source, confirm: true }));
  handle('memory:forgetAll', async ({ typed }) => {
    if (typed !== 'FORGET') return fail('CONFIRM_MISMATCH');
    const r = await memoryCmd<{ count: number }>({ cmd: 'forgetAll', typed: 'FORGET' });
    // 08-3 §12.6: the files the engine emptied are deleted (M6 T3).
    if (r.ok) removeForgottenFiles(ctx.dataDir);
    return r;
  });
  handle('memory:openFolder', async () => {
    const folder = join(ctx.dataDir, 'memory');
    mkdirSync(folder, { recursive: true });
    await shell.openPath(folder);
    return ok(undefined);
  });
  handle('files:pickFolder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return ok(r.canceled || !r.filePaths[0] ? {} : { path: r.filePaths[0] });
  });
  handle('data:export', ({ folder, scope }) => {
    // The full export (J21) is a later milestone; M6 builds the memory-only zip (06-2 §7.4, G-M6-11).
    if (scope !== 'memory') return fail('VALIDATION');
    const exportId = `exp_${now()}`;
    void runMemoryExport({
      dataDir: ctx.dataDir,
      folder,
      exportId,
      now: now(),
      timeZone: settings.get().locale.timeZone,
      db,
      progress: (p) => {
        if (p.path) lastExportPath = p.path;
        emit('data:exportProgress', p);
      },
    });
    return ok({ exportId });
  });
  handle('routine:list', () => ok(routineList(db)));
  handle('helper:list', () => ok(helperList(db)));
  handle('settings:get', () => ok(publicSettings(settings.get())));
  handle('settings:set', ({ path, value }) => {
    // 08-1 §4.4.2 steps 1–3 (CR-0043: one apply for this channel, foo's chat op and undo).
    const r = applySetting({ db, settings, dataDir: ctx.dataDir, now }, path, value, 'user');
    if (!r.ok) return r;
    emitSettings();
    return ok({ settings: publicSettings(settings.get()), changeId: r.value.changeId });
  });
  // CR-0043 (08-1 §4.4.2 step 4): the chat line's [ Undo ]; the line moves to "Changed back: …" or too_late.
  handle('settings:undo', ({ changeId }) => {
    const r = undoSetting({ db, settings, dataDir: ctx.dataDir, now }, changeId);
    const ids = r.ok
      ? r.value.messageIds
      : (db.prepare("SELECT id FROM messages WHERE json_extract(why, '$.settingLine.changeId') = ?").pluck().all(changeId) as string[]);
    for (const id of ids) {
      const row = messageGet(db, id);
      if (row) emit('message:upsert', row);
    }
    if (!r.ok) return r;
    emitSettings();
    return ok({ settings: publicSettings(settings.get()) });
  });
  handle('ai:verify', async ({ providerId }) => {
    // "Try again" re-tests the network now, then the engine sends `Reply with the word ready` (08-2 §6.6).
    ctx.net.report(ctx.probe());
    const r = ctx.engine?.live
      ? await ctx.engine.request<VerifyResult>('ai.cmd', { cmd: 'verify', providerId }, 150_000) // CR-0025: probe 3 × 20 s + 60 s
      : ok<VerifyResult>({ ok: false, providerId, kind: ctx.net.rawOnline ? 'UNKNOWN' : 'NET_OFFLINE' });
    emit('ai:status', aiStatus(settings.get(), ctx.net.offline, ctx.engine?.aiStatus ?? null));
    emit('spend:update', spendSummary(db, settings.get(), now()));
    return r;
  });
  handle('ai:detect', async () => (ctx.engine?.live ? ctx.engine.request<DetectRow[]>('ai.cmd', { cmd: 'detect' }, 60_000) : ok([])));
  handle('ai:choose', async ({ primary, backup }) => {
    if (!ctx.engine?.live) return fail('AI_NOT_VERIFIED');
    const before = settings.get();
    const r = await ctx.engine.request<AiStatus>('ai.cmd', { cmd: 'choose', providerId: primary, backup: backup ?? null });
    if (r.ok) {
      // 06-1 §2.2 step 5: open finder cards collapse to "✓ Using {AI} (your AI)"; a first run moves to step 2 (CR-0020). A
      // backup change from Settings (same primary, setup done) leaves an open finder card alone.
      if (before.ai.primary !== primary || finderWanted(before)) {
        emitFinderWrite(ctx, finderChosen(db, settings, primary, now(), ctx.dataDir));
        // CR-0026: a first run goes on to Card 2a.
        if (!before.setup.complete) emitFinderWrite(ctx, ensureSetupCard(db, settings, now(), ctx.dataDir));
      }
      emitSettings();
    }
    return r;
  });
  // CR-0026: first run (06-1 §2.1, §2.3, §2.0 "Skip the rest"); the writes are in setup/firstRun.ts.
  const setupDone = (w: FinderWrite | null) => {
    emitFinderWrite(ctx, w);
    emitSettings();
    return ok(null);
  };
  handle('setup:welcome', () => setupDone(welcomeStart(db, settings, now(), ctx.dataDir)));
  handle('setup:name', ({ name }) => {
    const r = nameAnswered(db, settings, name, now(), ctx.dataDir);
    return r.ok ? setupDone(r.write) : fail(r.error === 'stale' ? 'CARD_STALE' : 'VALIDATION', r.error);
  });
  handle('setup:face', ({ face, colour }) => {
    const w = faceChosen(db, settings, face, now(), ctx.dataDir, colour);
    return w ? setupDone(w) : fail('VALIDATION');
  });
  handle('setup:skipRest', () => setupDone(skipRest(db, settings, now(), ctx.dataDir)));
  // CR-0060: foo profile "Name and look" (06-1 §4.2).
  handle('profile:setName', ({ name }) => {
    const r = setFooName(db, settings, name);
    return r.ok ? setupDone(r.write) : fail('VALIDATION', r.error);
  });
  handle('profile:setFace', ({ face, colour }) => {
    const w = setFooFace(db, face, colour);
    return w ? setupDone(w) : fail('VALIDATION');
  });
  handle('profile:setVibe', (choice) => (setFooVibe(settings, choice) ? setupDone(null) : fail('VALIDATION')));
  handle('notifications:status', () => ok({ windowsAllowed: true, focusAssist: false }));
  // M8
  registerConnectionIpc(ctx);

  // M5 (CR-0009): the card, draft, secret and code channels.
  handleAll(answerIpc(ctx));
  handleAll(aiFinderIpc(ctx));
  handleAll(approvalIpc(ctx));
  handleAll(draftIpc(ctx));
  handleAll(secretIpc(ctx));
  // R1 T5 (CR-0022, 04 §13.6): the sealed AI page's open and bridge calls.
  handleAll(pageIpc(ctx));
  // R1 T7 (CR-0022 pick 9): Keep for kit surfaces and AI pages.
  handleAll(keepIpc(ctx));
}
