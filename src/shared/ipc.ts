// Spec: 08-1 §3.1 (bridge), §3.1.0 (typed contract: `Invokes`, `Events`), §3.2 (invoke channels), §3.3 (event channels);
// 08-0 §B.5 (no event shares a name with an invoke). The maps hold the channels built so far (M1: the shell's channels);
// each later milestone adds its rows from 08-1 §3.2/§3.3 with the same names and shapes.
import type { Result } from './errors';
import type {
  AiStatus,
  Bootstrap,
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
  MemoryChip,
  MemoryFactView,
  MemoryFilter,
  MemoryKind,
  MemoryOrigin,
  ErrorKind,
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
  // M6 (08-1 §3.2 memory rows; CR-0010 G-M6-01: main validates and forwards each to the engine as one `memory.cmd`)
  'memory:add': { req: { text: string }; res: MemoryFactView };
  'memory:edit': { req: { factId: string; text: string }; res: MemoryFactView };
  'memory:setPrivate': { req: { factId: string; private: boolean }; res: MemoryFactView };
  'memory:setKind': { req: { factId: string; kind: MemoryKind }; res: MemoryFactView };
  'memory:forget': { req: { factId: string }; res: { undoToken: string } };
  'memory:undo': { req: { undoToken: string }; res: MemoryFactView };
  'memory:forgetBySource': { req: { source: MemoryOrigin; confirm: true }; res: { count: number } };
  'memory:forgetAll': { req: { typed: 'FORGET' }; res: { count: number } };
  'memory:openFolder': { req: Record<string, never>; res: void };
  /** 08-1 §3.2 `data:export`; CR-0010 G-M6-11 adds `scope` ('memory' = 06-2 §7.4 "Export what I know", 08-3 §19.4.1). */
  'data:export': { req: { folder: string; scope?: 'all' | 'memory' }; res: { exportId: string } };
  'files:pickFolder': { req: { purpose: 'output' | 'grant' | 'export' | 'avatar' }; res: { path?: string } };
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
}

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
  // M6 (08-1 §3.3)
  'memory:changed': { factIds: string[]; chip?: MemoryChip };
  'data:exportProgress': { pct: number; phase: string; path?: string; error?: ErrorKind };
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
  'memory:add',
  'memory:edit',
  'memory:setPrivate',
  'memory:setKind',
  'memory:forget',
  'memory:undo',
  'memory:forgetBySource',
  'memory:forgetAll',
  'memory:openFolder',
  'data:export',
  'files:pickFolder',
  'routine:list',
  'helper:list',
  'settings:get',
  'settings:set',
  'ai:verify',
  'ai:detect',
  'ai:choose',
  'notifications:status',
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
  'memory:changed',
  'data:exportProgress',
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
}

declare global {
  interface Window {
    foo: FooBridge;
    /** Test runs only (08-3 §22.7). */
    __fooTest?: FooTestBridge;
  }
}
