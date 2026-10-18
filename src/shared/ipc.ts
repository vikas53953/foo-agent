// Spec: 08-1 §3.1 (bridge), §3.1.0 (typed contract: `Invokes`, `Events`), §3.2 (invoke channels), §3.3 (event channels);
// 08-0 §B.5 (no event shares a name with an invoke). The maps hold the channels built so far (M1: the shell's channels);
// each later milestone adds its rows from 08-1 §3.2/§3.3 with the same names and shapes.
import type { Result } from './errors';
import type {
  AiStatus,
  ApprovalFields,
  ApprovalScope,
  ApprovalState,
  Bootstrap,
  CardAnswer,
  DraftFields,
  SecretIndexRow,
  SecretKind,
  ChatFilter,
  ChatOpenResult,
  ChatRow,
  CardRow,
  ConnectionRow,
  DetectRow,
  BadgeValue,
  HelperRow,
  JobDetails,
  JobRow,
  MemoryFactView,
  MemoryFilter,
  MessageRow,
  PasteCatch,
  ProviderId,
  PublicSettings,
  RoutineRow,
  SpendSummary,
  StopReport,
  View,
  WindowsSettingsPage,
} from './types';

export type ThemeName = 'light' | 'dark';

export interface PlatformInfo {
  os: 'win32' | 'linux' | 'darwin';
  /** Value at launch; the renderer follows matchMedia afterwards (02 F7, FE-31). */
  reducedMotion: boolean;
  animations: 'full' | 'basic' | 'off';
  /** Main's clock at preload time (epoch ms). The renderer keeps the offset so row times follow main's injected Clock. */
  now: number;
}

export type VerifyResult =
  | { ok: true; providerId: ProviderId; displayName: string; billing: 'plan' | 'key' | 'local'; model?: string; verifiedAt: number }
  | { ok: false; providerId: ProviderId; kind: string };

/** 08-1 §3.2 rows built so far: channel → request and response. */
export interface Invokes {
  'app:getBootstrap': { req: Record<string, never>; res: Bootstrap };
  'app:quit': {
    req: { confirm: boolean; whenPaymentDone?: boolean };
    res: { quitting: boolean; runningJobs: number; paymentInFlight: { amountPaise: number } | null };
  };
  'app:openWindowsSettings': { req: { page: WindowsSettingsPage }; res: void };
  'chat:list': { req: { filter?: ChatFilter; q?: string }; res: ChatRow[] };
  'chat:open': { req: { chatId: string }; res: ChatOpenResult };
  'chat:markRead': { req: { chatId: string; upToSeq: number }; res: void };
  'chat:pin': { req: { chatId: string; on: boolean }; res: ChatRow };
  'chat:mute': { req: { chatId: string; until: number | 'forever' | null }; res: void };
  'message:list': { req: { chatId: string; beforeSeq?: number; limit: number }; res: MessageRow[] };
  'message:get': { req: { messageId: string }; res: MessageRow };
  'message:react': { req: { messageId: string; emoji: string; on: boolean }; res: void };
  'message:pin': { req: { messageId: string; on: boolean }; res: void };
  /** M2 builder B: idempotent on `(chatId, clientId)` (AT-225); `SECRET_SUSPECTED` carries the PasteCatch in `error.paste`. */
  'message:send': {
    req: { chatId: string; clientId: string; text: string; replyToId?: string; attachmentIds?: string[]; secretOverride?: boolean };
    res: { messageId: string; queued: boolean };
  };
  'composer:checkSecret': { req: { text: string }; res: PasteCatch | null };
  'composer:saveDraft': {
    req: { chatId: string; text: string; attachmentIds: string[]; replyToId?: string; linkPreviewRemoved: boolean };
    res: void;
  };
  'files:stage': { req: { name: string; bytes: ArrayBuffer }; res: { attachmentId: string } };
  'voice:submit': { req: { chatId: string; attachmentId: string; durationMs: number }; res: { messageId: string } };
  'helper:pause': { req: { helperId: string; on?: boolean }; res: HelperRow };
  // GAP: GAPS.md 2026-10-17 "message channels with no 08-1 entry"
  /** Not in 08-1 §3.2 (gap, implementation-notes "M2 (builder A)"): 04 §6.2 edit of the user's last message. Re-checked like
   * message:send (Art. 8): `SECRET_SUSPECTED` carries the PasteCatch in `error.paste`; over 10,000 is `VALIDATION`. */
  'message:edit': { req: { messageId: string; text: string }; res: MessageRow };
  /** Not in 08-1 §3.2 (gap): 04 §6.3 / §1.9 delete after C-24 / C-25 (soft delete; the row stays as the deleted state). */
  'message:delete': { req: { messageIds: string[]; confirm: true }; res: void };
  /** Not in 08-1 §3.2 (gap): 04 §7 "Try again" on a Not sent bubble (same text and attachments). */
  'message:retry': { req: { messageId: string }; res: MessageRow };
  /** Not in 08-1 §3.2 (gap): 04 §14.4 Stop on the reply that is coming in (composer Stop button or Esc). */
  'message:stopReply': { req: { chatId: string }; res: boolean };
  'files:open': { req: { path: string }; res: void };
  'files:showInFolder': { req: { path: string }; res: void };
  'job:details': { req: { jobId: string }; res: JobDetails };
  'routine:pause': { req: { routineId: string; confirm?: true }; res: RoutineRow };
  /** Not in 08-1 §3.2 (gap): 04 §10.6, §10.7, §13, §16.1 open a link in the default browser (http, https, mailto, tel). */
  'link:open': { req: { url: string }; res: void };
  /** Not in 08-1 §3.2 (gap): 04 §9.3 "+" opens the Windows emoji panel (Electron app.showEmojiPanel). */
  'app:showEmojiPanel': { req: Record<string, never>; res: void };
  'job:stop': { req: { jobId: string }; res: StopReport };
  'job:watch': { req: { jobId: string; on: boolean }; res: void };
  'memory:list': { req: { filter: MemoryFilter; q?: string }; res: MemoryFactView[] };
  'routine:list': { req: Record<string, never>; res: RoutineRow[] };
  /** Not in 08-1 §3.2 (gap, see implementation-notes "M1 integration"): the helpers' names and one-line jobs for the shell. */
  'helper:list': { req: Record<string, never>; res: HelperRow[] };
  'settings:get': { req: Record<string, never>; res: PublicSettings };
  'settings:set': { req: { path: string; value: unknown }; res: { settings: PublicSettings; changeId: string | null } };
  'ai:verify': { req: { providerId: ProviderId }; res: VerifyResult };
  /** M3 (08-1 §3.2): detection ladder; rows also stream on `ai:detectRow`. The J2 screen that shows them is M12. */
  'ai:detect': { req: Record<string, never>; res: DetectRow[] };
  'ai:choose': { req: { primary: ProviderId; backup?: ProviderId | null }; res: AiStatus };
  'notifications:status': { req: Record<string, never>; res: { windowsAllowed: boolean; focusAssist: boolean } };
  // M5 (CR-0009; 08-1 §3.2): cards, drafts and the vault. Handlers: card:answer T5, card:approve|decline|askAgain|heldPick T4,
  // draft:* T6, secret:* and code:submit T2 (stubs answer VALIDATION 'not_implemented' until their ticket lands).
  'card:answer': { req: { cardId: string; nonce: string; answer: CardAnswer; resolvedBy: CardTapBy }; res: CardRow };
  'card:approve': { req: { cardId: string; nonce: string; scope: ApprovalScope; resolvedBy: CardTapBy }; res: { state: ApprovalState } };
  'card:decline': { req: { cardId: string; nonce: string; resolvedBy: CardTapBy }; res: CardRow };
  'card:askAgain': { req: { cardId: string }; res: { newCardId?: string } };
  'card:heldPick': { req: { cardId: string; nonce: string; optionId: string; resolvedBy: CardTapBy }; res: CardRow };
  'draft:update': { req: { cardId: string; nonce: string; fields: DraftFields }; res: CardRow };
  'draft:send': { req: { cardId: string; nonce: string; resolvedBy: CardTapBy }; res: { approvalId: string; undoUntil: number } };
  'draft:undo': { req: { approvalId: string }; res: { undone: boolean } };
  'draft:discard': { req: { cardId: string; nonce: string; resolvedBy: CardTapBy }; res: CardRow };
  'draft:openInApp': { req: { cardId: string }; res: void };
  'secret:save': {
    req: { requestId?: string; kind: SecretKind; name: string; fields: Record<string, string> };
    res: { target: string; savedAt: number; label: string };
  };
  'secret:list': { req: Record<string, never>; res: SecretIndexRow[] };
  'secret:delete': { req: { target: string; confirm: true }; res: void };
  'code:submit': { req: { requestId: string; code: string }; res: void };
}

/** 08-1 §3.2: a card is answered from the card itself (toasts, typed words and reactions resolve inside main/engine). */
export type CardTapBy = 'tap' | 'keyboard';

/** 08-1 §3.3 rows built so far: event → payload. */
export interface Events {
  'chat:upsert': ChatRow;
  'chat:removed': { chatId: string };
  'chat:typing': { chatId: string; on: boolean; who: string };
  'message:upsert': MessageRow;
  'message:delta': { messageId: string; seq: number; append: string };
  'message:badge': { messageId: string; badge: BadgeValue | null };
  'card:upsert': CardRow;
  'job:upsert': JobRow;
  'ai:status': AiStatus;
  'ai:detectRow': DetectRow;
  'spend:update': SpendSummary;
  'connection:upsert': ConnectionRow;
  'settings:changed': PublicSettings;
  'net:state': { online: boolean };
  navigate: { view: View; act?: string };
}

export type InvokeChannel = keyof Invokes;
export type InvokeIn = { [C in InvokeChannel]: Invokes[C]['req'] };
export type InvokeOut = { [C in InvokeChannel]: Invokes[C]['res'] };
export type EventChannel = keyof Events;
export type EventPayload = Events;

export interface FooBridge {
  invoke<C extends InvokeChannel>(channel: C, payload: InvokeIn[C]): Promise<Result<InvokeOut[C]>>;
  /** Returns the unsubscribe function. */
  on<E extends EventChannel>(event: E, cb: (payload: EventPayload[E]) => void): () => void;
  platform: PlatformInfo;
}

/** The channel lists, for the preload's allow-list and the contract test (08-3 §22.0). */
export const INVOKE_CHANNELS = [
  'app:getBootstrap',
  'app:quit',
  'app:openWindowsSettings',
  'chat:list',
  'chat:open',
  'chat:markRead',
  'chat:pin',
  'chat:mute',
  'message:list',
  'message:get',
  'message:react',
  'message:pin',
  'message:send',
  'composer:checkSecret',
  'composer:saveDraft',
  'files:stage',
  'voice:submit',
  'helper:pause',
  'message:edit',
  'message:delete',
  'message:retry',
  'message:stopReply',
  'files:open',
  'files:showInFolder',
  'job:details',
  'routine:pause',
  'link:open',
  'app:showEmojiPanel',
  'job:stop',
  'job:watch',
  'memory:list',
  'routine:list',
  'helper:list',
  'settings:get',
  'settings:set',
  'ai:verify',
  'ai:detect',
  'ai:choose',
  'notifications:status',
  'card:answer',
  'card:approve',
  'card:decline',
  'card:askAgain',
  'card:heldPick',
  'draft:update',
  'draft:send',
  'draft:undo',
  'draft:discard',
  'draft:openInApp',
  'secret:save',
  'secret:list',
  'secret:delete',
  'code:submit',
] as const satisfies readonly InvokeChannel[];

export const EVENT_CHANNELS = [
  'chat:upsert',
  'chat:removed',
  'chat:typing',
  'message:upsert',
  'message:delta',
  'message:badge',
  'card:upsert',
  'job:upsert',
  'ai:status',
  'ai:detectRow',
  'spend:update',
  'connection:upsert',
  'settings:changed',
  'net:state',
  'navigate',
] as const satisfies readonly EventChannel[];

/**
 * 08-3 §22.9 seed sets (`ux-world` is the generator name of `demo`; both load the walkthrough world). `ux-world-ch8-live`
 * (CR-0007): the same world at 8:05 AM, foo's chat ending at the cake line, so a test sends chapter 8's "thanks!" and
 * question live and the frame matches the walkthrough's UX-08-02.
 */
export const SEED_SETS = ['demo', 'perf', 'ux-world', 'ux-world-ch8-live'] as const;
export type SeedSet = (typeof SEED_SETS)[number];

export interface ClockReply {
  now: number;
  iso: string;
}
export interface SeedReply {
  set: SeedSet;
  loaded: boolean;
  /** Counts written (chats, messages), or why nothing was loaded. */
  chats?: number;
  messages?: number;
  /** Ids of the seeded rows tests drive (foo, trips, money, goaJob, moneyJob, …). */
  refs?: Record<string, string>;
  note?: string;
}

/** 08-3 §22.7–§22.8: test-only bridge, exposed by the test preload in FOO_TEST runs, absent from production builds. */
export interface FooTestBridge {
  clock: {
    now(): Promise<ClockReply>;
    /** ISO string or epoch ms. */
    set(at: string | number): Promise<ClockReply>;
    advance(ms: number): Promise<ClockReply>;
  };
  seed(set: SeedSet): Promise<SeedReply>;
  setOnline(online: boolean): Promise<{ online: boolean }>;
  /** Forces the theme ('system' returns to the settings value). */
  theme(theme: ThemeName | 'system'): Promise<{ themeSource: string }>;
  reset(): Promise<ClockReply>;
  /** Moves a job to a state the way the job runner would (writes the row, re-derives the chat pill, sends the patches). */
  jobState(jobId: string, state: JobRow['state']): Promise<{ chatId: string }>;
  /** M5 (CR-0009): writes one card (and its approvals row when `approval` is given); see main/test/testHooks.ts. */
  cardSeed(arg: CardSeedRequest): Promise<CardSeedResult>;
}

/** `test:card.seed` request (FOO_TEST only). */
export interface CardSeedRequest {
  chatId?: string;
  type: CardRow['type'];
  state: string;
  payload: Record<string, unknown>;
  jobId?: string;
  expiresAt?: number;
  approval?: { fields: ApprovalFields; hardLimit?: boolean; state?: ApprovalState; expiresAt?: number };
}
export interface CardSeedResult {
  chatId: string;
  cardId: string;
  messageId: string;
  nonce: string;
  jobId?: string;
  approvalId?: string;
}

declare global {
  interface Window {
    foo: FooBridge;
    /** Test runs only (08-3 §22.7). */
    __fooTest?: FooTestBridge;
  }
}
