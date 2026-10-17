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
  JobRow,
  MessageRow,
  ProviderId,
  PublicSettings,
  SpendSummary,
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
  'settings:get': { req: Record<string, never>; res: PublicSettings };
  'settings:set': { req: { path: string; value: unknown }; res: { settings: PublicSettings; changeId: string | null } };
  'ai:verify': { req: { providerId: ProviderId }; res: VerifyResult };
  'notifications:status': { req: Record<string, never>; res: { windowsAllowed: boolean; focusAssist: boolean } };
}

/** 08-1 §3.3 rows built so far: event → payload. */
export interface Events {
  'chat:upsert': ChatRow;
  'chat:removed': { chatId: string };
  'chat:typing': { chatId: string; on: boolean; who: string };
  'message:upsert': MessageRow;
  'card:upsert': CardRow;
  'job:upsert': JobRow;
  'ai:status': AiStatus;
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
  'settings:get',
  'settings:set',
  'ai:verify',
  'notifications:status',
] as const satisfies readonly InvokeChannel[];

export const EVENT_CHANNELS = [
  'chat:upsert',
  'chat:removed',
  'chat:typing',
  'message:upsert',
  'card:upsert',
  'job:upsert',
  'ai:status',
  'spend:update',
  'connection:upsert',
  'settings:changed',
  'net:state',
  'navigate',
] as const satisfies readonly EventChannel[];

/** 08-3 §22.9 seed sets (`ux-world` is the generator name of `demo`; both load the walkthrough world). */
export const SEED_SETS = ['demo', 'perf', 'ux-world'] as const;
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
