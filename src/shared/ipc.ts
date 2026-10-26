// Spec: 08-1 §3.1 (bridge), §3.1.0 (typed contract: `Invokes`, `Events`), §3.2 (invoke channels), §3.3 (event channels);
// 08-0 §B.5 (no event shares a name with an invoke). The maps hold the channels built so far (M1: the shell's channels);
// each later milestone adds its rows from 08-1 §3.2/§3.3 with the same names and shapes.
import type { Result } from './errors';
import type { BridgeTestOp } from './waBridge';
import type { KitActionMessage } from './kit/catalog';
import type { PageRpcCall, PageRpcResult } from './kit/page';
import type {
  AiStatus,
  FaceRef,
  KeptItem,
  KeptKind,
  Mood,
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
  FixAction,
  JobRow,
  MemoryChip,
  MemoryFactView,
  MemoryFilter,
  MemoryKind,
  MemoryOrigin,
  ErrorKind,
  MessageRow,
  PasteCatch,
  KeyProviderId,
  ProviderId,
  PublicSettings,
  RoutineRow,
  SpendSummary,
  StopReport,
  View,
  WindowsSettingsPage,
  LiveState,
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
  | { ok: false; providerId: ProviderId; kind: string; resetAt?: number };

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
    // R1 (X-180): `side` marks a side question (04 §17.5; needs replyToId).
    req: {
      chatId: string;
      clientId: string;
      text: string;
      replyToId?: string;
      attachmentIds?: string[];
      secretOverride?: boolean;
      side?: boolean;
      /** X-180 pick 6: the words picked for "Ask about this" (04 §17.5); only with `side`. Folded into the AI text, not stored. */
      quote?: string;
    };
    // M8 T7 (04 §10.11): in a mirrored WhatsApp group the message is a Draft card in foo's chat, not a message here.
    res: { messageId: string; queued: boolean; mirrorDraft?: { fooChatId: string; draftCardId: string; messageId: string } };
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
  // M9 (CR-0013; 08-1 §3.2): live window, sign-in and take over, hand-back sites (X-124, X-129, X-135).
  'job:openWindow': { req: { jobId: string }; res: void };
  'job:takeOver': { req: { jobId: string }; res: void };
  'job:handBack': { req: { jobId: string }; res: void };
  'signin:done': { req: { jobId: string }; res: void };
  'signin:skip': { req: { jobId: string }; res: void };
  'memory:list': { req: { filter: MemoryFilter; q?: string }; res: MemoryFactView[] };
  // M6 (08-1 §3.2 memory rows; CR-0010 G-M6-01: main validates and forwards each to the engine as one `memory.cmd`)
  'memory:add': { req: { text: string }; res: MemoryFactView };
  'memory:edit': { req: { factId: string; text: string }; res: MemoryFactView };
  'memory:setPrivate': { req: { factId: string; private: boolean }; res: MemoryFactView };
  'memory:setKind': { req: { factId: string; kind: MemoryKind }; res: MemoryFactView };
  /** M6 T5: `chipId` = the ✕ on a memory chip (05-3 §5.17.1; G-M6-10 activity `forgot_facts`). */
  'memory:forget': { req: { factId: string; chipId?: string }; res: { undoToken: string } };
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
  // CR-0043 (08-1 §4.4.2 step 4)
  'settings:undo': { req: { changeId: string }; res: { settings: PublicSettings } };
  'ai:verify': { req: { providerId: ProviderId }; res: VerifyResult };
  /** M3 (08-1 §3.2): detection ladder; rows also stream on `ai:detectRow`. The J2 screen that shows them is the AI step (CR-0020). */
  'ai:detect': { req: Record<string, never>; res: DetectRow[] };
  'ai:choose': { req: { primary: ProviderId; backup?: ProviderId | null }; res: AiStatus };
  /** CR-0026 (06-1 §2.1, §2.3, §2.0): Welcome "Let's go", Card 2a name, Card 2b face, "Skip the rest". */
  'setup:welcome': { req: Record<string, never>; res: null };
  'setup:name': { req: { name: string }; res: null };
  'setup:face': { req: { face: string; colour?: string }; res: null };
  'setup:skipRest': { req: Record<string, never>; res: null };
  /** CR-0060 (06-1 §4.2 foo profile "Name and look"): the name, the face, "How I talk" (a setup choice id or the words). */
  'profile:setName': { req: { name: string }; res: null };
  'profile:setFace': { req: { face: string; colour?: string }; res: null };
  'profile:setVibe': { req: { optionId: string } | { words: string }; res: null };
  'notifications:status': { req: Record<string, never>; res: { windowsAllowed: boolean; focusAssist: boolean } };
  // M8 T3: 08-1 §3.2 WhatsApp link and Hide from foo
  'whatsapp:linkStart': { req: Record<string, never>; res: void };
  'whatsapp:linkCancel': { req: Record<string, never>; res: void };
  'whatsapp:unlink': { req: Record<string, never>; res: void };
  'chat:archive': { req: { chatId: string; on: boolean }; res: ChatRow };
  /** CR-0060 (06-3 §14 C-1 "Clear messages"): every message and card in the chat is removed; the chat stays. */
  'chat:clear': { req: { chatId: string; confirm: true }; res: void };
  // M8 T2 (08-1 §3.2): Google connections. `outlook` only while flags.outlook (X-41), so v1 accepts 'google' alone.
  'connection:list': { req: Record<string, never>; res: ConnectionRow[] };
  'connection:connect': {
    req: { app: 'google'; scopes?: ('gmail' | 'gcal' | 'contacts')[] };
    res: { connectionId: string; status: 'connecting' };
  };
  'connection:disconnect': { req: { connectionId: string; confirm: true }; res: void };
  /** Not in 08-1 §3.2 (gap, implementation-notes "M8 T2"): whether this build has the Google client file (08-3 §16.1.1
   * "Gmail isn't available in this build.") and the routines C-10 names (06-3 §14). */
  'connection:googleInfo': {
    req: Record<string, never>;
    res: { available: boolean; routines: { title: string; app: 'gmail' | 'gcal' | 'contacts' }[] };
  };
  // AI step (CR-0020 (c)): 06-2 §6.1 "Change" / "Add another AI" post the 06-1 §2.2 card in foo's chat; 06-1 §2.2 "I have a key"
  // posts the key's Secret box (05-2 §5.8) with the J2 lead line. `app:openExternal` is 08-1 §3.2's row; only `maker_page` is
  // built here (the other targets answer URL_NOT_ALLOWED until their milestones).
  'ai:openFinder': { req: Record<string, never>; res: { chatId: string; cardId: string } };
  'ai:askKey': { req: { providerId: KeyProviderId }; res: CardRow };
  'app:openExternal': {
    req: {
      target: 'google_signin' | 'x_intent' | 'google_account' | 'maker_page' | 'handback_site' | 'ai_page' | 'action_chip';
      url?: string;
      providerId?: ProviderId;
      cardId?: string;
      nonce?: string;
      /** R1 T7 (lead ok, 04-2 §21.7): target `action_chip` names the reply and the chip's place; main builds the URL. */
      messageId?: string;
      index?: number;
    };
    res: void;
  };
  // M4 T5 (08-1 §3.2 job rows; X-124: each sends exactly one MainToEngine message; G-M4-09 error:fix, CR-0008).
  'job:stopAll': { req: { confirm: true }; res: StopReport[] };
  'job:retry': { req: { jobId: string }; res: { newJobId: string } };
  'plan:go': { req: CardAnswerReq & { text?: string }; res: CardRow };
  'plan:change': { req: CardAnswerReq & { text?: string }; res: CardRow };
  'stuck:choose': { req: CardAnswerReq & { choice: 'other_way' | 'take_over' | 'stop' }; res: CardRow };
  'recovery:choose': { req: CardAnswerReq & { choice: 'resume' | 'stop' }; res: CardRow };
  'error:fix': { req: CardAnswerReq & { action: FixAction }; res: CardRow };
  // M5 (CR-0009; 08-1 §3.2): cards, drafts and the vault. Handlers: card:answer T5, card:approve|decline|askAgain|heldPick T4,
  // draft:* T6, secret:* and code:submit T2 (stubs answer VALIDATION 'not_implemented' until their ticket lands).
  'card:answer': { req: { cardId: string; nonce: string; answer: CardAnswer; resolvedBy: CardTapBy }; res: CardRow };
  'card:approve': { req: { cardId: string; nonce: string; scope: ApprovalScope; resolvedBy: CardTapBy }; res: { state: ApprovalState } };
  'card:decline': { req: { cardId: string; nonce: string; resolvedBy: CardTapBy }; res: CardRow };
  'card:askAgain': { req: { cardId: string }; res: { newCardId?: string } };
  'card:heldPick': { req: { cardId: string; nonce: string; optionId: string; resolvedBy: CardTapBy }; res: CardRow };
  // M5 T14 (CR-0009 G-M5-39): the CHECKING → FAILED card's [ It went through ] / [ It didn't ] (05-2 §5.5.4).
  'approval:report': {
    req: { cardId: string; nonce: string; outcome: 'went_through' | 'did_not'; resolvedBy: CardTapBy };
    res: CardRow;
  };
  // CR-0022 (X-180) 08-1 §3.2. kit:action sends one MainToEngine `kit_action`; kit:refresh asks the engine to rebuild a
  // LiveStamp surface's data; page:rpc is the sealed page's bridge call, checked and logged in main; keep:* hold kept items.
  'kit:action': { req: KitActionMessage; res: void };
  'kit:refresh': { req: { chatId: string; messageId?: string; cardId?: string; surfaceId: string }; res: void };
  'page:rpc': { req: { chatId: string; pageId: string; call: PageRpcCall }; res: PageRpcResult };
  'keep:save': {
    req: {
      chatId: string;
      messageId?: string;
      cardId?: string;
      kind: KeptKind;
      title: string;
      body: string;
      png?: ArrayBuffer | Uint8Array;
      /** R1 T7 (lead ok): the kept thing's box in the window (CSS px); main takes the PNG snapshot of it. */
      rect?: { x: number; y: number; width: number; height: number };
    };
    res: KeptItem;
  };
  'keep:list': { req: { chatId: string }; res: KeptItem[] };
  // page:open hands main one ```page block (by message or card and its index among the page blocks, or a kept page) and gets
  // the id it serves at foo-page://{pageId}; keep:open returns a kept item's body for the sealed box or the kit renderer
  // (never shell.openPath); keep:showInFolder shows its file.
  'page:open': {
    req: { chatId: string; messageId?: string; cardId?: string; index?: number; keptId?: string };
    res: { pageId: string } | { failed: 'too_large' | 'not_found' };
  };
  'keep:open': { req: { id: string }; res: { kind: KeptKind; body: string } };
  'keep:showInFolder': { req: { id: string }; res: void };
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
  // M5 T2 (04-2 §22.4 "Move to secret box" posts a Secret box card in this chat; CR-0009 gap G-M5-21): the card only, never
  // the value (the renderer keeps it in memory for the card's field until Save or Cancel).
  'secret:offer': { req: { chatId: string; slot: SecretOfferSlot }; res: CardRow };
}

/** M5 T2: the 04-2 §22.4 suggested names, one Secret box each (G-M5-21); `password` and `key` have no vault kind yet. */
export const SECRET_OFFER_SLOTS = ['openai', 'google', 'card', 'otp', 'password', 'key'] as const;
export type SecretOfferSlot = (typeof SECRET_OFFER_SLOTS)[number];
/** M5 T2: why the vault can't save right now (05-2 §5.8.3 Disabled: Credential Manager; 09 §9.18: encryption). */
export const VAULT_OFF = ['keyring_unavailable', 'encryption_unavailable'] as const;
export type VaultOff = (typeof VAULT_OFF)[number];
export const isVaultOff = (s: string | undefined): s is VaultOff => (VAULT_OFF as readonly (string | undefined)[]).includes(s);

/** 08-1 §3.2: a card answer names the card, carries its nonce (a stale card is refused) and says how it was answered. */
export interface CardAnswerReq {
  cardId: string;
  nonce: string;
  resolvedBy: 'tap' | 'keyboard';
}

/** 08-1 §3.2: a card is answered from the card itself (toasts, typed words and reactions resolve inside main/engine). */
export type CardTapBy = CardAnswerReq['resolvedBy'];

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
  // M8 T3: 08-1 §3.3
  'whatsapp:qr': { png: string; expiresAt: number };
  // M6 (08-1 §3.3)
  'memory:changed': { factIds: string[]; chip?: MemoryChip };
  'data:exportProgress': { pct: number; phase: string; path?: string; error?: ErrorKind };
  // M9 (08-1 §3.3): to the `live` window only (08-0 §G.8); frames ≤ 5 fps while watched, always masked.
  'live:frame': { jobId: string; jpeg: ArrayBuffer; w: number; h: number; masked: true; nowLine: string };
  'live:state': { jobId: string; state: LiveState };
}

export type InvokeChannel = keyof Invokes;
export type InvokeIn = { [C in InvokeChannel]: Invokes[C]['req'] };
export type InvokeOut = { [C in InvokeChannel]: Invokes[C]['res'] };
export type EventChannel = keyof Events;
export type EventPayload = Events;

/** 08-1 §3.3.1 (X-124, X-135): the one renderer → main event, sent with `window.foo.send` (CR-0021 §(c); M11 reads it). */
export interface RendererEvents {
  'face:raster': { faceRef: FaceRef; size: 16 | 20 | 24 | 32 | 48; mood: Mood; png: ArrayBuffer };
}
export type RendererEvent = keyof RendererEvents;
export const RENDERER_EVENTS = ['face:raster'] as const satisfies readonly RendererEvent[];

export interface FooBridge {
  invoke<C extends InvokeChannel>(channel: C, payload: InvokeIn[C]): Promise<Result<InvokeOut[C]>>;
  /** Returns the unsubscribe function. */
  on<E extends EventChannel>(event: E, cb: (payload: EventPayload[E]) => void): () => void;
  /** 08-1 §3.1: the one renderer → main event (§3.3.1). */
  send<E extends RendererEvent>(event: E, payload: RendererEvents[E]): void;
  platform: PlatformInfo;
}

/** The channel lists, for the preload's allow-list and the contract test (08-3 §22.0). */
export const INVOKE_CHANNELS = [
  'app:getBootstrap',
  'app:quit',
  'app:openWindowsSettings',
  'chat:list',
  'chat:clear',
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
  'job:openWindow',
  'job:takeOver',
  'job:handBack',
  'signin:done',
  'signin:skip',
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
  'settings:undo',
  'ai:verify',
  'ai:detect',
  'ai:choose',
  'setup:welcome',
  'setup:name',
  'setup:face',
  'setup:skipRest',
  'profile:setName',
  'profile:setFace',
  'profile:setVibe',
  'notifications:status',
  // M8 T3
  'whatsapp:linkStart',
  'whatsapp:linkCancel',
  'whatsapp:unlink',
  'chat:archive',
  // M8
  'connection:list',
  'connection:connect',
  'connection:disconnect',
  'connection:googleInfo',
  'ai:openFinder',
  'ai:askKey',
  'app:openExternal',
  'job:stopAll',
  'job:retry',
  'plan:go',
  'plan:change',
  'stuck:choose',
  'recovery:choose',
  'error:fix',
  // M5 (CR-0009)
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
  // M5 T2
  'secret:offer',
  // M5 T14
  'approval:report',
  // CR-0022 (X-180)
  'kit:action',
  'kit:refresh',
  'page:rpc',
  'keep:save',
  'keep:list',
  'page:open',
  'keep:open',
  'keep:showInFolder',
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
  // M8 T3
  'whatsapp:qr',
  'navigate',
  'memory:changed',
  'data:exportProgress',
  'live:frame',
  'live:state',
] as const satisfies readonly EventChannel[];

/**
 * 08-3 §22.9 seed sets (`ux-world` is the generator name of `demo`; both load the walkthrough world). `ux-world-ch8-live`
 * (CR-0007): the same world at 8:05 AM, foo's chat ending at the cake line, so a test sends chapter 8's "thanks!" and
 * question live and the frame matches the walkthrough's UX-08-02. `m4-cards` (M4 T5): the ux-world plus one of each M4 job
 * card in two helper chats (Errands, Home help), with no engine. `ux-world-m8-connect` (M8 T2): the ux-world plus a Google
 * Connect card in foo's chat and no connections.
 */
export const SEED_SETS = ['demo', 'perf', 'ux-world', 'ux-world-ch8-live', 'm4-cards', 'ux-world-m8-connect', 'm9-signin'] as const;
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
  /** M8 T3: plays the fake phone of the FOO_TEST wa-bridge (scan, a group message, logout). */
  wa(op: BridgeTestOp): Promise<{ delivered: boolean }>;
  /** M5 (CR-0009): writes one card (and its approvals row when `approval` is given); see main/test/testHooks.ts. */
  cardSeed(arg: CardSeedRequest): Promise<CardSeedResult>;
  /** M6 T7 (CR-0010 G-M6-09): runs the nightly memory tidy now (engine `test.memoryTidy`); the engine's TidyReport result. */
  memoryTidy(): Promise<unknown>;
}

/** `test:card.seed` request (FOO_TEST only). */
export interface CardSeedRequest {
  chatId?: string;
  type: CardRow['type'];
  state: string;
  payload: Record<string, unknown>;
  jobId?: string;
  expiresAt?: number;
  answer?: Record<string, unknown>;
  approval?: { fields: ApprovalFields; hardLimit?: boolean; state?: ApprovalState; expiresAt?: number; submittedAt?: number };
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
