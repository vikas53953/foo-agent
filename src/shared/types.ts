// Spec: 08-0 §B (rows, enums, envelope types), §E.7 (FaceRef), §G.10 (View); 08-5 §2, §3.1, §3.2 (PublicSettings, Bootstrap,
// AiStatus, SpendSummary); 08-1 §3.4 (row derivations); 03-shell-1 §3.4.5–§3.4.8 (the chat-list derivations main adds).
// Types only, no runtime. Sources: 08-0 §A–§G, 08-5, 08-1 §3–§4. Shapes grow per milestone; M1 holds what the shell reads.
import type { Settings } from './settings';
import type { FeatureId } from './features';

export type { PlatformInfo, ThemeName } from './ipc';
export type { Settings } from './settings';

// ---- 08-0 §B.2 enums (the members M1 uses; closed lists copied exactly) ----
export type ProviderId = 'claude-cli' | 'codex-cli' | 'gemini-cli' | 'openai-key' | 'anthropic-key' | 'google-key' | 'ollama' | 'fake';
/** The key-billed providers (08-0 §E.8 vault `foo/ai_key/{providerId}`). */
export type KeyProviderId = 'openai-key' | 'anthropic-key' | 'google-key';
export type ApprovalState =
  'PENDING' | 'APPROVED' | 'RUNNING' | 'COMPLETED' | 'HELD' | 'CHECKING' | 'DECLINED' | 'EXPIRED' | 'SUPERSEDED' | 'WITHDRAWN' | 'FAILED';
export type SettingsPage =
  | 'account'
  | 'appearance'
  | 'notifications'
  | 'permissions'
  | 'money'
  | 'privacy'
  | 'routines-settings'
  | 'connections'
  | 'chat'
  | 'shortcuts'
  | 'about';
export type WindowsSettingsPage = 'notifications' | 'privacy-microphone' | 'startupapps' | 'signin' | 'storagesense' | 'dateandtime';
export type BadgeValue = 'seen' | 'working' | 'waiting' | 'done' | 'done_unverified' | 'failed' | 'stopped';
export type BannerType =
  'offline' | 'ai_not_answering' | 'ai_signed_out' | 'ai_cap' | 'plan_limit' | 'notifications_blocked' | 'update_ready';
export type TickState = 'waiting' | 'sent' | 'delivered' | 'read' | 'not_sent';
/** 08-0 §B.2 (D-3): the composer's own banners (04-2 §23.2). */
export type ComposerBannerType = 'mic_blocked' | 'no_mic' | 'mic_busy' | 'helper_paused';
/** 08-0 §B.2 (D-4): `composer-send` data-state, in the order of the 04-2 §21.2 checks. */
export type RoundButtonState = 'disabled' | 'save_edit' | 'send_voice' | 'recording' | 'send' | 'stop' | 'mic';
/** 08-0 §B.3 / 08-5 §3.4 (04-2 §22.4): a caught secret; the mask is always exactly "••••". */
export interface PasteCatch {
  start: number;
  end: number;
  kind: 'ai_key' | 'web_key' | 'card' | 'otp' | 'password' | 'token';
  mask: '••••';
}
export type Mood =
  | 'resting'
  | 'waking'
  | 'noticed'
  | 'listening'
  | 'thinking'
  | 'working'
  | 'stuck'
  | 'needs_you'
  | 'waiting'
  | 'happy'
  | 'celebrating'
  | 'thumbs_up'
  | 'heart'
  | 'speaking'
  | 'sorry'
  | 'stopped'
  | 'offline'
  | 'asleep';
/** The `{slug}` of every 06 `screen-{slug}` page the shell can open, plus 'ideas' (12-1 §12.24.3). */
export type ScreenId = 'memory' | 'routines' | 'activity' | 'spend' | 'ideas' | 'foo-profile' | 'helper-profile' | 'group-profile';
export type DialogId =
  | `c-${string}`
  | 'new-helper'
  | 'new-group'
  | 'privacy'
  | 'type-amount'
  | 'whats-new'
  | 'restart'
  | 'report'
  | 'shortcuts'
  | 'replace-key'
  | 'add-card'
  | 'add-upi'
  | 'dismissed-suggestions'
  | 'hold-to-talk'
  | 'licences'
  | 'helper-limit'
  | 'link-whatsapp'
  | 'unreadable-lines'
  | 'template-replace';
/** FE-06 (08-0 §B.2, D-8). */
export type View =
  | { kind: 'chat'; chatId: string }
  | { kind: 'settings'; page: SettingsPage; row?: string }
  | { kind: 'screen'; id: ScreenId; params?: Record<string, string> };
/** 08-0 §E.7: `living:{style}` | `glyph:{emoji}` | `letter:{grapheme}` | `file:{chatId}`. */
export type FaceRef = string;
export type CardType =
  | 'brief'
  | 'checklist'
  | 'choice'
  | 'tiles'
  | 'approval'
  | 'payment'
  | 'bill'
  | 'draft'
  | 'secret'
  | 'signin'
  | 'connect'
  | 'plan'
  | 'routine'
  | 'routine_offer'
  | 'stuck'
  | 'error'
  | 'spend_cap'
  | 'table'
  | 'file'
  | 'link_preview'
  | 'job_link'
  | 'place'
  | 'face_explainer'
  | 'catch_up'
  | 'setup'
  // CR-0022 (X-180): a kit surface the engine posts as its own card, and an AI page (05 §0.1).
  | 'kit'
  | 'ai_page';
/** 04-2 §21.7 (X-180): an action chip; `value` is the number, place, ISO date-time or https URL it acts on. */
export interface ActionChip {
  kind: 'call' | 'map' | 'calendar' | 'link';
  label: string;
  value: string;
}
/** CR-0022 pick 9: what a kept item holds. */
export type KeptKind = 'kit' | 'page';
/** A `kept_items` row (08-1 §4.3, migration 0004), shown in the chat's Files tab. A kept page reopens only in the sealed box. */
export interface KeptItem {
  id: string;
  chatId: string;
  messageId: string | null;
  cardId: string | null;
  kind: KeptKind;
  title: string;
  /** The PNG snapshot under {DATA}, when one was made. */
  pngPath: string | null;
  createdAt: number;
}
export type JobState = 'queued' | 'working' | 'needs_you' | 'waiting' | 'done' | 'done_unverified' | 'failed' | 'cancelled';
export type WaitingReason =
  | 'ai_offline'
  | 'ai_down'
  | 'ai_signed_out'
  | 'ai_limit'
  | 'spend_cap'
  | 'net_offline'
  | 'asleep'
  | 'app_quit'
  | 'windows_shutdown'
  | 'opens_at';
export type Route = 'api' | 'browser' | 'screen' | 'email' | 'handback';
/** 08-0 §B.2 StopReason (= jobs.stop_reason CHECK). */
export type StopReason =
  | 'user_word'
  | 'user_button'
  | 'stop_all'
  | 'window_closed'
  | 'stuck_stop'
  | 'choice_timeout'
  | 'signin_timeout'
  | 'approval_expired'
  | 'approval_declined'
  | 'helper_deleted'
  | 'chat_deleted'
  | 'wipe'
  | 'system';
/** 08-0 §B.2 ProofKind (08-2 §5.8 + read_source). */
export type ProofKind =
  'confirmation' | 'email' | 'sent_folder' | 'wa_delivered' | 'calendar_event' | 'emails_read' | 'read_source' | 'screenshot' | 'receipt';
/** 08-0 §G.2 `cards.resolved_by`. */
export type ResolvedBy = 'tap' | 'keyboard' | 'toast' | 'typed' | 'reaction' | 'auto' | 'system';
/** 08-4 §25.1 CardAnswer (08-0 §B.3). */
export type CardAnswer = { optionId: string } | { optionIds: string[] } | { text: string } | { skip: true };
/** 08-5 §3.7 FixAction: the one button of an error card. */
export type FixAction =
  | { kind: 'retry' }
  | { kind: 'sign_in_ai'; providerId: ProviderId }
  | { kind: 'remind_at'; at: number }
  | { kind: 'replace_key'; providerId: ProviderId }
  | { kind: 'use_backup' }
  | { kind: 'raise_cap'; which: 'ai' | 'purchase' }
  | { kind: 'try_other_way' }
  | { kind: 'take_over' }
  | { kind: 'stop' }
  | { kind: 'resume_job' }
  | { kind: 'start_normally' }
  | { kind: 'reconnect'; app: 'google' | 'outlook' }
  | { kind: 'link_whatsapp' }
  | { kind: 'allow_scope'; scopes: ('gmail' | 'gcal' | 'contacts')[] }
  | { kind: 'open_url'; url: string }
  | { kind: 'open_settings'; page: SettingsPage; row?: string }
  | { kind: 'open_chat'; chatId: string; cardId?: string }
  | { kind: 'repair_app' }
  | { kind: 'try_another_card' }
  | { kind: 'pay_with_upi' }
  | { kind: 'checked_try_again' }
  | { kind: 'dismiss' };
/** 08-0 §G.4 activity kinds (= activity.kind CHECK). */
export type ActivityKind = 'sent' | 'paid' | 'booked' | 'deleted' | 'connected' | 'stopped' | 'changed';
/** activity columns camelCased (08-0 §0, 08-1 §4.3.11). */
export interface ActivityRow {
  id: string;
  at: number;
  kind: ActivityKind;
  event: string;
  actor: string;
  chatId: string | null;
  chatTitle: string | null;
  jobId: string | null;
  approvalId: string | null;
  paymentId: string | null;
  routineId: string | null;
  summary: string;
  toLabel: string | null;
  fromLabel: string | null;
  amountPaise: number | null;
  approvedHow: 'card_once' | 'card_chat' | 'card_always' | 'rule' | 'hello' | 'typed_amount' | 'user' | 'none' | null;
  ruleText: string | null;
  proofKind: string | null;
  proofRef: string | null;
  outcome: 'done' | 'failed' | 'unknown';
  fields: Record<string, unknown> | null;
}

// ---- M4 card payloads (08-1 §4.5) ----
export interface ChecklistPayload {
  jobId: string;
  /** CR-0030 pick 3: the step index of each take-over; the checklist draws "You took over" before that step (06-3 §11.2). */
  tookOver?: number[];
}
export interface PlanPayload {
  title: string;
  steps: string[];
  minutes: number;
  costLine: string;
  big: boolean;
}
export interface StuckPayload {
  whatsWrong: string;
  spentLine: string;
  suggestion: string;
  allowOtherWay: boolean;
}
export interface ErrorPayload {
  variant: 'error' | 'recovery';
  kind: ErrorKind;
  whatHappened: string;
  whatIsSafe: string;
  button: { label: string; action: FixAction };
  secondary?: { label: string; action: FixAction };
  jobId?: string;
  atStep?: number;
  of?: number;
  paymentChecking?: boolean;
  doneLines?: string[];
  /** SM-A10: set when the job resumes; the fixed card shows it under "Fixed · {time}". */
  resumedLine?: string;
}
export interface SpendCapPayload {
  which: 'ai' | 'purchase';
  capPaise: number;
  spentPaise: number;
}
export interface JobLinkPayload {
  jobId: string;
}

// ---- M5 (CR-0009): approvals, choice and tiles, drafts, secrets (08-0 §B.2–§B.3, 08-1 §4.5, 08-2 §9.3, §11, 08-4 §25.1) ----
/** 08-0 §B.2 ApprovalVerb (X-55); cancelling a booking is `delete`. */
export type ApprovalVerb = 'send' | 'book' | 'buy' | 'pay' | 'post' | 'delete' | 'share' | 'switch' | 'use_app' | 'calendar_write';
/** 08-0 §B.2 ApprovalDraftVerb (X-125): what the AI may request; `send` reaches the user only through a Draft card. */
export type ApprovalDraftVerb = 'book' | 'buy' | 'pay' | 'delete';
/** 08-0 §B.2 PermissionApp. */
export type PermissionApp = 'gmail' | 'calendar' | 'contacts' | 'whatsapp' | 'browser' | 'outlook';
/** 08-0 §B.2 ChoicePurpose (§G.1). */
export type ChoicePurpose = 'job' | 'setup' | 'memory_confirm' | 'app_use' | 'stop_which' | 'conflict' | 'file_in' | 'photo_notice';
/** 08-0 §B.2 SecretKind (= secrets_index.kind CHECK). */
export type SecretKind = 'ai_key' | 'login' | 'card' | 'conn_token' | 'wa_session' | 'web_key' | 'hub_key' | 'user_key'; // user_key: CR-0057
/** 08-0 §G.1 `secret.secretKind` (the card's sub-kind; otp and cvv are never saved). */
export type SecretCardKind = 'ai_key' | 'voice_key' | 'web_key' | 'login' | 'card' | 'otp' | 'cvv' | 'user_key'; // user_key: CR-0057
/** 08-1 §3.2 card:approve scope. */
export type ApprovalScope = 'once' | 'chat' | 'always';

/** 08-2 §9.3 ApprovalFields (canonical; hashed with fieldsHash; drives the card text, never free AI text). */
export interface ApprovalFields {
  verb: ApprovalVerb;
  channel?: 'email' | 'whatsapp' | 'web' | 'x';
  recipients?: { name: string; address: string; isNew: boolean; isGroup: boolean; groupSize?: number }[];
  payee?: string;
  siteDomain?: string;
  amountPaise?: number;
  lines?: { label: string; amountPaise: number }[];
  currency?: 'INR';
  when?: { start: number; end?: number; tz: string };
  partySize?: number;
  item?: string;
  personalShared?: ('name' | 'email' | 'phone' | 'address')[];
  cancelTerms?: { freeUntil?: number; feePaise?: number; refundable: boolean };
  /** send/post: subject + first 140 chars, redacted. */
  contentSummary?: string;
  irreversible: boolean;
  /** M5 T4 (G-M5-24, 08-5 §3.3): the app a `use_app` approval lets a helper use; its rule matches this app. */
  app?: PermissionApp;
}

/** 08-0 §B.3 ApprovalDraft (08-4 §25.1): created by the AI through `request_approval` (§28.1). */
export interface ApprovalDraft {
  verb: ApprovalDraftVerb;
  fields: ApprovalFields;
  /** `quote` ≤ 200 chars verbatim from that tool result; `ref` = snapshot element. */
  evidence: { field: keyof ApprovalFields; toolCallId: string; quote: string; ref?: string }[];
}

/** 08-0 §B.3 SecondLookResult (08-4 §28.4); stored in approvals.second_look. */
export interface SecondLookResult {
  at: number;
  deterministic: { ok: boolean; mismatches: string[] };
  ai?: { ok: boolean; note: string };
  turnId?: string;
  held?: { field: 'recipient' | 'amount' | 'date' | 'time' | 'item' | 'people' | 'place'; userSaid: string; actionHas: string };
}

/** 08-5 §3.3 Rule (settings.rules); `mail_organise` exists only here (its approvals row is verb use_app, fields.app gmail). */
export interface Rule {
  id: string;
  verb: 'use_app' | 'calendar_write' | 'mail_organise';
  match: { app?: PermissionApp; calendarId?: 'primary'; labelOrFolder?: string };
  text: string;
  helperId?: string;
  createdAt: number;
  source: 'card';
}

/** 08-0 §B.3 `secrets_index` columns camelCased; 08-5 §3.6 drops `target` from the renderer copy (secret:list). */
export interface SecretIndexRow {
  kind: SecretKind;
  name: string;
  label: string;
  domain: string | null;
  brand: string | null;
  last4: string | null;
  storage: 'credman' | 'blob';
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

/** 08-2 §11.3 VaultUseRequest. */
export interface VaultUseRequest {
  purpose: 'fill_login' | 'fill_card' | 'ai_call' | 'connector_refresh' | 'wa_session' | 'voice_call' | 'web_tool' | 'hub_call';
  name: string;
  jobId?: string;
  approvalId?: string;
}

/** 08-1 §4.5 choice / tiles payload (ChoicePayload, 08-0 §B.3). */
export interface ChoicePayload {
  purpose: ChoicePurpose;
  question: string;
  options: { id: 'o1' | 'o2' | 'o3' | 'o4'; label: string; detail?: string; bestFit?: boolean; photoRef?: string }[];
  multi?: boolean;
  stepper?: { index: number; total: number };
  aiReversible: boolean;
  reversible: boolean;
  livePrices: boolean;
  setupCard?: string;
}
/** 08-1 §4.5 approval payload. */
export interface ApprovalPayload {
  variant: 'standard' | 'deadline_reminder';
  approvalId: string;
  verb: ApprovalVerb;
  title: string;
  impact: string;
  fields: ApprovalFields;
  scopes: ApprovalScope[];
  hardLimit: boolean;
  expiresAt: number;
  // M5 T4
  /** What a HELD card shows (05-2 §5.5.4, 08-4 §28.3–§28.4); the second look (T8) writes it with the HELD move. */
  held?: { reason: 'mismatch' | 'cannot_check' | 'no_user_words'; userSaid?: string; actionHas?: string; verbing?: string };
  /** What a SUPERSEDED card names (05-2 §5.5.4: the term that changed; 08-4 §26.5 a steer); T8 writes it. */
  superseded?: 'price' | 'time' | 'recipient' | 'fee' | 'steer';
  /** M5 T7 (G-M5-29): the page element the engine submits once approved; kept here so an engine restart can still run it. */
  submitRef?: string;
  // M5 T14
  /** 05-2 §5.5.4 CHECKING → FAILED: main's 15 min no-proof move sets it, so the card says "I can't tell…" instead of the plain
   * FAILED line; `phone` only when a verified one exists (G-M5-32 (b): an unverified slot is left out with its words). */
  unknownResult?: { phone?: string; /** M9 T8 (G-M9-07): a booking its site's history page never confirmed. */ unconfirmed?: true };
}
/** 08-1 §4.5 draft payload. */
export interface DraftPayload {
  approvalId: string;
  channel: 'email' | 'whatsapp' | 'x';
  to?: { name: string; address: string; isNew: boolean };
  subject?: string;
  body: string;
  signature?: string;
  edited: boolean;
  sendAllowed: boolean;
  xRemaining?: number;
  undoUntil?: number;
  // M5 T6 (05-2 §5.7.2): the Gmail draft the card's Change / Send / Discard act on; the "Not sent. The draft is still here."
  // line after an Undo; the sent time and the Sent-folder proof message.
  gmailDraftId?: string;
  undone?: boolean;
  sentAt?: number;
  sentMessageId?: string;
  // M5 T14
  /** 05-2 §5.7.2 HELD (second look, Art. 10): what the Draft's held strip shows; main writes it with the HELD move. */
  held?: ApprovalPayload['held'];
  // M8 T6 (CR-0012 G-M8-03): the Gmail draft's message id and thread (Open in Gmail, replies), and T7's WhatsApp jid / group.
  gmailMessageId?: string;
  threadId?: string;
  waJid?: string;
  isGroup?: boolean;
  /** M8 T6: the full Approval card a Send opened for someone new or a switch (05-2 §5.7.2 "Waiting for your OK below ›"). */
  approvalCardId?: string;
  // M8 T7 (08-3 §16.4.2, §16.4 Send): the number check ("That number isn't on WhatsApp." → no Send; "I can't check that
  // number right now." → Send disabled until the bridge is open), the daily limit (Send disabled until that local midnight),
  // and the delivery ack (Proof: Delivered). An X draft has no approvals row: `approvalId` is ''.
  waCheck?: 'not_on' | 'cant_check';
  waLimitUntil?: number;
  delivered?: boolean;
}
/** 08-1 §4.5 secret payload (never a value). */
export interface SecretPayload {
  secretKind: SecretCardKind;
  name: string;
  why: string;
  fields: { key: string; label: string; masked: boolean }[];
  savedAt?: number;
  requestId?: string;
  sentTo?: string;
  paymentCardId?: string;
  // M5 T2: the vault target a Save wrote (Remove and Replace name it) and when Remove ran (05-2 §5.8.2 "Removed").
  target?: string;
  removedAt?: number;
  /** The vault `{name}` a Save writes (08-0 §E.8: providerId, host, web provider); a card's is its last 4. */
  vaultName?: string;
  /** The saved row's name after a Save ("Visa ••4242" for a card, X-116). */
  label?: string;
  /** Set when the card was posted while the vault could not save (05-2 §5.8.3 Disabled shows up front). */
  vaultOff?: 'keyring_unavailable' | 'encryption_unavailable';
  /** CR-0030 pick 4: a Login box posted by the save-login offer after a sign-in; its Save logs `saved_login` (05-2 §5.8.6). */
  afterSignIn?: boolean;
}
/** 08-5 §3.3 DraftFields (`draft:update`); `body` includes the signature text when the user kept it (X-84). */
export interface DraftFields {
  to?: string;
  subject?: string;
  body: string;
}

// ---- chats (08-1 §4.3.1) ----
export type ChatKind = 'foo' | 'helper' | 'group' | 'wa_mirror';
/** `chats.pill`, derived by main from job and card writes (08-1 §4.6 rule 7; 03-shell-1 §3.4.5 precedence). */
export type ChatPill = 'needs_you' | 'working' | 'done' | 'paused';
export type ChatFilter = 'all' | 'needs_you' | 'working' | 'done';

/** What the preview line says (03-shell-1 §3.4.6 rules 2–7; rule 1 "typing…" is live state in the renderer). */
export type PreviewBody =
  | { kind: 'text'; text: string }
  | { kind: 'voice'; durationMs: number }
  | { kind: 'photo' }
  | { kind: 'file'; name: string }
  | { kind: 'card'; cardType: CardType; title: string };

export type ChatPreview =
  | { rule: 'working'; jobTitle: string }
  | { rule: 'queued'; jobTitle: string }
  | { rule: 'needs_ok'; title: string }
  | { rule: 'pick_one'; question: string }
  | { rule: 'sign_in'; site: string }
  | { rule: 'stuck'; jobTitle: string }
  | { rule: 'failed'; text: string }
  | { rule: 'mine'; tick: TickState; body: PreviewBody }
  | { rule: 'sender'; sender: string; body: PreviewBody }
  | { rule: 'own'; body: PreviewBody }
  | { rule: 'none' };

/** Facts main derives for the list from jobs, cards, messages and drafts (03-shell-1 §3.4.4–§3.4.8; Article 12). */
export interface ChatListFacts {
  /** Preview rules 3a–7 (§3.4.6); rule 1 (typing) and rule 2 (draft) are applied by the renderer. */
  preview: ChatPreview;
  /** The unsent composer text, one line (§3.4.6 rule 2), or null. */
  draft: string | null;
  /** Epoch ms the chat was pinned (block 2 keeps pin order); null when not pinned. */
  pinnedAt: number | null;
  /** Block 1 order: soonest card expiry first, then longest waiting first; null when nothing needs the user. */
  needsYou: { expiresAt: number | null; since: number } | null;
  /** ≥ 1 job QUEUED, WORKING or WAITING ("Working" chip, §3.4.4). */
  running: boolean;
  /** ≥ 1 job QUEUED, WORKING, WAITING or NEEDS YOU, or a card waiting on the user (folded rule, §3.4.7). */
  active: boolean;
  /** Finish time of the chat's last finished job when it ended DONE, else null (folded rule). */
  lastEndedDoneAt: number | null;
  /** Newest DONE finish of any job ("Done" chip, last 7 days, newest first). */
  latestDoneAt: number | null;
  /** Name and last-message text, case- and accent-folded (§3.4.3 search). */
  searchText: string;
}

export interface ChatRow {
  id: string;
  kind: ChatKind;
  helperId: string | null;
  title: string;
  avatarRef: FaceRef | null;
  colorToken: string | null;
  waJid: string | null;
  pinned: boolean;
  archived: boolean;
  unreadCount: number;
  pill: ChatPill | null;
  pillUntil: number | null;
  lastMessageId: string | null;
  lastActivityAt: number;
  nextSeq: number;
  rev: number;
  createdAt: number;
  deletedAt: number | null;
  private: boolean;
  helperMessagesSinceUser: number;
  loopPaused: boolean;
  // 08-0 §B.1 derived
  lastLine: string;
  lastTime: number;
  hasDraft: boolean;
  face: FaceRef;
  memberIds?: string[];
  helper?: { id: string; color: string };
  // 03-shell-1 §3.4.6–§3.4.8 derived (main computes them from jobs, cards and messages; Article 12)
  list: ChatListFacts;
}

// ---- messages (08-1 §4.3.2; textForAi dropped) ----
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  /** Under {DATA}\\data\\inbox\\ (relative to {DATA}, forward slashes) or absolute inside {DATA}. */
  path: string;
  /** 08-5 §2 `Attachment.kind`; rows written before it carry none, so readers derive it from `mime` (attachmentKind). */
  kind?: 'image' | 'pdf' | 'doc' | 'other';
}

/** 08-0 §G.17 `messages.why` (the "Why am I getting this?" source of an unprompted message). */
export interface MessageWhy {
  source: 'routine_asked' | 'routine_suggested' | 'suggestion' | 'habit_offer' | 'housekeeping' | 'cap_warning';
  routineId?: string;
  suggestionKey?: string;
  vars: Record<string, string>;
}
export interface MessageRow {
  id: string;
  chatId: string;
  seq: number;
  authorKind: 'user' | 'foo' | 'helper' | 'system';
  authorId: string | null;
  kind: 'text' | 'voice' | 'card' | 'marker';
  markerKind: 'start_of_chat' | 'handoff' | 'memory_chip' | 'helper_notice' | 'system_line' | null;
  clientId: string | null;
  text: string;
  status: 'queued' | 'sent' | 'streaming' | 'complete' | 'failed';
  badge: BadgeValue | null;
  replyToId: string | null;
  jobId: string | null;
  cardId: string | null;
  lang: string | null;
  voicePath: string | null;
  voiceMs: number | null;
  transcript: string | null;
  transcriptConf: number | null;
  attachments: Attachment[] | null;
  prompted: boolean;
  why: Record<string, unknown> | null;
  pinned: boolean;
  providerNote: string | null;
  /** CR-0021 pick 10: ≤ 3 follow-up suggestions the AI gave with this reply (composer chips); null when none. */
  suggestions: string[] | null;
  /** CR-0022 pick 6: a side question ("Ask about this") or foo's answer to one; `replyToId` says what it is about. */
  side: boolean;
  /** 04 §6.5 "foo read:": what the engine understood from this user message (redacted text only); null when none. */
  understood: string[] | null;
  /** 04-2 §21.7: ≤ 3 action chips on a foo reply (never after an approval or payment card); null when none. */
  actions: ActionChip[] | null;
  /**
   * R1 T3 (05-1 §5.3.5 parity): the ListPick or TimePick answer this user message gave, derived by main from its AI text
   * (shared/kit/pick.ts `kitPickOf`); null otherwise. A pick with an answer in the chat stays answered.
   */
  kitPick: { surfaceId: string; componentId: string; choice: string } | null;
  rev: number;
  createdAt: number;
  editedAt: number | null;
  deletedAt: number | null;
  reactions: { emoji: string; by: 'me' | string }[];
}

// ---- cards (08-1 §4.3.3) ----
export interface CardRow {
  id: string;
  chatId: string;
  messageId: string;
  jobId: string | null;
  type: CardType;
  state: string;
  payload: Record<string, unknown>;
  answer: unknown;
  nonce: string;
  expiresAt: number | null;
  resolvedBy: 'tap' | 'keyboard' | 'toast' | 'typed' | 'reaction' | 'auto' | 'system' | null;
  resolvedAt: number | null;
  supersedesId: string | null;
  rev: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

// ---- jobs (08-1 §4.3.4; aiSessionId dropped, doVerbs parsed; stepsDone, nowLine, slow, retrying derived) ----
export interface JobRow {
  id: string;
  chatId: string;
  originChatId: string;
  ownerKind: 'foo' | 'helper';
  ownerId: string | null;
  title: string;
  origin: 'user' | 'routine' | 'handoff' | 'brief' | 'setup' | 'retry' | 'system';
  originRef: string | null;
  userMessageId: string | null;
  intent: 'read_only' | 'do';
  doVerbs: string[];
  state: JobState;
  waitingReason: WaitingReason | null;
  wakeAt: number | null;
  needsYouCardId: string | null;
  planVersion: number;
  currentStepIdx: number | null;
  stepCount: number;
  route: Route | null;
  siteDomain: string | null;
  usesBrowser: boolean;
  estMinutes: number | null;
  estTokens: number | null;
  estCostPaise: number | null;
  spentTokensIn: number;
  spentTokensOut: number;
  spentCostPaise: number;
  costUnknown: boolean;
  providerId: string | null;
  failStreak: number;
  stuckCount: number;
  proof: unknown;
  resultMessageId: string | null;
  stopReason: string | null;
  rev: number;
  createdAt: number;
  startedAt: number | null;
  lastProgressAt: number | null;
  finishedAt: number | null;
  stepsDone: number;
  nowLine: string;
  slow: boolean;
  /** CR-0024 F10 (05 §5.2.2): WORKING after a failed tool call, until the next good one ("Slow here, trying another way"). */
  retrying: boolean;
  /** CR-0028 (X-186): QUEUED with its Plan card still pending, i.e. waiting for the user's Go (derived by main). */
  awaitingGo?: boolean;
}

// ---- helpers (08-1 §4.3.8 camelCased; allowedApps parsed) ----
export interface HelperRow {
  id: string;
  name: string;
  jobText: string;
  goodResult: string | null;
  faceRef: FaceRef;
  colorToken: string;
  allowedApps: Record<string, boolean>;
  chatId: string;
  paused: boolean;
  template: string | null;
  rev: number;
  createdAt: number;
  deletedAt: number | null;
}

// ---- routines (08-1 §4.3.7, the columns the shell reads; task_spec, schedule and condition stay in main until J14) ----
export interface RoutineRow {
  id: string;
  ownerChatId: string;
  ownerHelperId: string | null;
  title: string;
  builtin: 'morning_brief' | 'memory_tidy' | 'pnr_watch' | 'recharge_due' | 'bill_watch' | null;
  whatText: string;
  tz: string;
  state: 'on' | 'paused' | 'paused_away' | 'paused_cap' | 'deleted';
  createdFrom: 'asked' | 'habit' | 'suggested' | 'builtin' | 'idea';
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastFiredAt: number | null;
  rev: number;
  createdAt: number;
  updatedAt: number;
}

// ---- memory (08-0 §B.2 X-06/X-112; 08-5 §3.6: memory_index camelCased without hash, plus labels) ----
export type MemoryScope = 'global' | 'chat' | 'helper';
export type MemoryKind = 'person' | 'preference' | 'place' | 'fact';
export type MemoryProvenance = 'said' | 'guessed';
/** = MemorySource; labels chat, Gmail, Calendar, WhatsApp, you typed it, setup, a task (08-3 §12.2). */
export type MemoryOrigin = 'chat' | 'gmail' | 'gcal' | 'whatsapp' | 'manual' | 'setup' | 'job';
export type MemoryCategory =
  'food' | 'travel' | 'health' | 'money' | 'people' | 'places' | 'work' | 'style' | 'home' | 'family' | 'religion' | 'politics' | 'other';
export interface MemoryFactView {
  id: string;
  file: string;
  lineNo: number;
  scope: MemoryScope;
  chatId: string | null;
  text: string;
  provenance: MemoryProvenance;
  origin: string;
  originKind: MemoryOrigin;
  reason: string | null;
  category: MemoryCategory | null;
  kind: MemoryKind;
  sensitive: boolean;
  private: boolean;
  learnedAt: number;
  lastUsedAt: number | null;
  useCount: number;
  fileLabel: string;
  originLabel: string;
  onlyInChatTitle?: string;
}
export interface MemoryFilter {
  chip: 'all' | 'said' | 'guessed' | 'gmail' | 'whatsapp' | 'chat';
  helperId?: string;
  last7?: boolean;
}
/** 08-5 §3.6; 05-3 §5.17.1 rows. `text` is the full fact (the renderer ellipsises at 48). */
export interface MemoryChip {
  messageId: string;
  factIds: string[];
  kind: 'saved' | 'guessed' | 'updated' | 'used' | 'not_saving';
  text: string;
  was?: string;
  undoToken?: string;
  undoUntil?: number;
}

/** 08-5 §3 StopReport (`done` holds ActivityRow rows; the activity log arrives with J21, so M1 sends none). */
export interface StopReport {
  jobId: string;
  done: unknown[];
  nothingDone: boolean;
}

export interface DraftRow {
  id: string;
  chatId: string;
  text: string;
  attachments: Attachment[];
  replyToId: string | null;
  linkPreviewRemoved: boolean;
  updatedAt: number;
}

// ---- connections (08-1 §4.3.9; vaultName and accountHash dropped) ----
export interface ConnectionRow {
  id: string;
  app: 'gmail' | 'gcal' | 'contacts' | 'whatsapp' | 'outlook' | 'hub';
  accountLabel: string;
  granted: { read: boolean; draft: boolean; send: boolean; calendarWrite: boolean; contactsRead: boolean };
  status: 'connecting' | 'connected' | 'needs_signin' | 'unlinked' | 'error' | 'disconnected';
  connectedAt: number;
  lastOkAt: number | null;
  lastErrorKind: string | null;
  historyId: string | null;
  rev: number;
}

// ---- 08-5 §3.1 / §3.2 ----
export type SettingsPath = string;
export type PublicSettings = Omit<Settings, 'flags' | 'window'> & {
  window: Omit<Settings['window'], 'bounds'>;
  locked: SettingsPath[];
};
export interface SetupState {
  complete: boolean;
  step: 0 | 1 | 2 | 3 | 4 | 5;
  interviewCard?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
  answers: Partial<Record<0 | 1 | 2 | 3 | 4 | 5, unknown>>;
}
export interface AiStatus {
  primary: ProviderId | null;
  backup: ProviderId | null;
  /** 08-0 §B.4 display name. */
  displayName: string;
  billing: 'plan' | 'key' | 'local';
  state: 'ok' | 'offline' | 'down' | 'signed_out' | 'limit' | 'key_invalid' | 'unverified';
  resetAt?: number;
  lastVerifiedAt?: number;
  usingBackup: boolean;
  planUsedPct?: number | null;
}
/** 08-5 §3 DetectRow (= 06-1 §2.2 row states). */
export interface DetectRow {
  providerId: ProviderId;
  found: boolean;
  version?: string;
  signedIn?: boolean;
  path?: string;
  state:
    | 'looking'
    | 'testing'
    | 'works'
    | 'not_found'
    | 'not_signed_in'
    | 'signin_unfinished'
    | 'key_failed'
    | 'plan_limit'
    | 'slow'
    | 'needs_update' // CR-0025: the maker's service refuses this CLI version
    | 'offline'
    | 'needs_helper'
    | 'waiting_helper';
  failKind?: ErrorKind;
}
export interface SpendSummary {
  month: string;
  aiSpentPaise: number | null;
  aiCapPaise: number;
  aiBilling: 'plan' | 'key' | 'local';
  planUsedPct?: number;
  purchasesPaise: number;
  purchaseCapPaise: number;
  purchaseCount: number;
  byChat: { chatId: string | null; title: string; paise: number }[];
  byRoutine: { routineId: string; title: string; paise: number }[];
  purchases: { paymentId: string; activityId: string; payee: string; at: number; chatTitle: string; amountPaise: number }[];
  earliestMonth: string;
}
export interface Bootstrap {
  settings: PublicSettings;
  chats: ChatRow[];
  openChatId?: string;
  firstMessages: MessageRow[];
  setup: SetupState;
  ai: AiStatus;
  spend: SpendSummary;
  connections: ConnectionRow[];
  safeMode: boolean;
  /** CR-0054: the features this build switched on, in menu order; absent = every feature. */
  features?: FeatureId[];
}

/** 08-1 §3.2 `chat:open` reply. */
export interface ChatOpenResult {
  messages: MessageRow[];
  cards: CardRow[];
  jobs: JobRow[];
  draft: DraftRow | null;
  /** Only for `kind='wa_mirror'` chats: newest 200 (08-1 §3.2, 08-3 §16.4.3). */
  waMessages?: WaMessageRow[];
}

/** wa_messages columns camelCased (08-0 §0, 08-1 §4.3). */
export interface WaMessageRow {
  id: string;
  chatJid: string;
  fromMe: boolean;
  senderLabel: string | null;
  text: string;
  at: number;
  starred: boolean;
  mentionsMe: boolean;
}

/** 08-3 §21 error kinds. Grows with the milestones; M1 holds the kinds the shell and its channels can return. */
export type ErrorKind =
  | 'IPC_REJECTED'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'DB_OPEN_FAILED'
  | 'NET_OFFLINE'
  | 'SETTING_LOCKED'
  | 'JOB_GONE'
  | 'LIVE_UNAVAILABLE'
  | 'PATH_NOT_ALLOWED'
  | 'URL_NOT_ALLOWED'
  // M2 builder B (08-1 §3.2 message:send, files:stage, voice:submit)
  | 'SECRET_SUSPECTED'
  | 'FILE_TOO_BIG'
  | 'FILE_TYPE'
  | 'VOICE_TOO_SHORT'
  // M3 (08-2 §6.7, 08-3 §21.2–§21.4): your-AI adapters and the reply protocol
  | 'AI_SERVICE_DOWN'
  | 'AI_SIGNED_OUT'
  | 'AI_KEY_INVALID'
  | 'AI_LIMIT'
  | 'AI_NO_VISION'
  | 'AI_CLI_INCOMPATIBLE'
  | 'AI_NOT_VERIFIED'
  | 'AI_TIMEOUT'
  | 'AI_PROTOCOL_VIOLATION'
  | 'PROTOCOL_INVALID'
  | 'PROTOCOL_STRAY_TEXT'
  | 'PROTOCOL_SAY_LEAK'
  | 'PROMPT_PLACEHOLDER_EMPTY'
  | 'PROMPT_TRIMMED'
  | 'FAKE_AI_NO_MATCH'
  | 'REDACTION_LATE_HIT'
  | 'DB_NOT_WRITABLE'
  | 'DB_STALE_REV'
  | 'DB_CONSTRAINT'
  // M4 (08-3 §21.2, §21.3, §21.4): the job runner's kinds
  | 'DB_BAD_TRANSITION'
  | 'SPEND_CAP'
  | 'STUCK'
  | 'CRASH_RECOVERY'
  | 'SAFE_MODE'
  | 'SITE_BLOCKED'
  | 'DB_REBUILT'
  | 'PROOF_INVALID'
  | 'PROTOCOL_FIX_ACTION'
  | 'IDEMPOTENT_REPEAT'
  | 'CARD_STALE'
  // M8 T3: 08-3 §21.2 WhatsApp kinds
  | 'WA_LINK_FAILED'
  | 'WA_UNLINKED'
  // M8 (08-3 §21.2, §21.3): connections
  | 'OAUTH_DENIED'
  | 'OAUTH_TIMEOUT'
  | 'CONN_EXPIRED'
  | 'CONN_REVOKED'
  | 'CONN_RATE_LIMITED'
  | 'CONN_SCOPE_MISSING'
  // M5 (CR-0009; 08-3 §21.2–§21.4): cards, the approval gate and the vault
  | 'CARD_EXPIRED'
  | 'SCOPE_NOT_ALLOWED'
  | 'TOO_LATE'
  | 'HELPER_NOT_ALLOWED'
  | 'APPROVAL_EVIDENCE'
  | 'APPROVAL_BAD_TRANSITION'
  | 'RULE_NOT_ALLOWED'
  | 'SECRET_IN_TYPE'
  | 'USE_SUBMIT'
  | 'VAULT_WRITE_FAILED'
  | 'VAULT_PURPOSE_DENIED'
  | 'VAULT_MISSING'
  | 'SECRET_EXISTS'
  | 'REQUEST_GONE'
  // M5 T6 (08-1 §3.2 draft:send, 08-3 §16.6 gmail drafts; M8 adds the rest of the connector kinds)
  | 'SEND_FAILED'
  // M6 (08-1 §3.2 memory rows, 08-3 §21.3, §19.4): memory
  | 'MEMORY_PARSE'
  | 'CONFIRM_MISMATCH'
  | 'PRIVATE_BLOCKED'
  | 'EXPORT_SECRET_FOUND'
  | 'DISK_FULL'
  // M8 (08-3 §16.1, §21.2, §21.3): the rest of the Google connector kinds
  | 'CONN_REVOKED'
  | 'CONN_RATE_LIMITED'
  // M9 (08-3 §21.2 user-facing; 08-2 §8, §11 internal; 08-4 §27.3 cloud, never a card; 08-1 §3.2 renderer)
  | 'SITE_CHANGED'
  | 'SITE_TIMEOUT'
  | 'SITE_CAPTCHA'
  | 'SITE_HANDBACK'
  | 'BROWSER_MISSING'
  | 'SEARCH_BUSY'
  | 'ROUTE_ORDER'
  | 'CLOUD_AUTH'
  | 'CLOUD_QUOTA'
  | 'CLOUD_DOWN'
  | 'CLOUD_SECRET_BLOCKED'
  | 'USE_EDGE'
  | 'UNKNOWN';

// ---- card payloads (08-5 §4.1) the M2 cards draw ----
/**
 * 08-5 §4.1 SetupCardPayload (X-119). The AI step (CR-0020 (b) pick 3) adds the answered finder's choice: `using` is the
 * provider picked with [ Use … ], kept so the collapsed line "✓ Using {AI} (your AI)" survives a restart.
 */
export interface SetupCardPayload {
  setupCard: 'welcome' | 'ai_finder' | 'name' | 'face' | 'apps';
  using?: ProviderId;
  /** CR-0026: an answered name card keeps the name, a face card the FaceRef, for the collapsed line. */
  answer?: string;
}
export interface TablePayload {
  title: string;
  columns: { key: string; label: string; align: 'left' | 'right'; unit?: 'inr' | 'text' | 'date' | 'time' }[];
  rows: Record<string, string | number | null>[];
  sourceLine?: string;
  bestRowIndex?: number;
}
export interface FilePayload {
  fileId: string;
  name: string;
  mime: string;
  bytes: number;
  path: string;
  madeBy: 'foo' | string;
  kind: 'made' | 'received' | 'downloaded';
}
export interface LinkPreviewPayload {
  url: string;
  domain: string;
  title: string;
  description?: string;
  imageRef?: string;
  fetchedAt: number;
}
export interface PlacePayload {
  name: string;
  address: string;
  phone?: string;
  hoursLine?: string;
  mapsUrl: string;
  rating?: string;
}

// ---- steps (08-1 §4.3.4) and job:details (08-1 §3.2) ----
export interface StepRow {
  id: string;
  jobId: string;
  idx: number;
  phraseKey: string;
  slots: Record<string, unknown>;
  state: 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'waiting_user';
  attempts: number;
  route: Route | null;
  rev: number;
  startedAt: number | null;
  finishedAt: number | null;
}
/** 08-1 §3.2 `job:details` reply. M2 fills job and steps; frames, proof and costs arrive with their milestones. */
export interface JobDetails {
  job: JobRow;
  steps: StepRow[];
  frames: { stepId: string; path: string; at: number }[];
  proof?: unknown;
  costs: unknown[];
}

// ---- connectors (CR-0012, M8): 08-5 §3.3, §4.1 ----
/** 08-0 §B.2 `ConnectorApp` (connections.app also allows 'hub'; X has no row). */
export type ConnectorApp = 'gmail' | 'gcal' | 'contacts' | 'whatsapp' | 'x' | 'outlook';
/** 08-5 §3.3. `id` is the People API resourceName, or `'wa:{jid}'`; phones in E.164 where Google gives canonicalForm. */
export interface ContactHit {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  source: 'google' | 'whatsapp';
}
/** 08-5 §4.1 `connect` card payload; Card E is `{ variant: 'whatsapp', setupCard: 'E' }` (X-139). */
export interface ConnectPayload {
  variant: 'google' | 'whatsapp' | 'outlook' | 'one_app' | 'allow_send' | 'contacts_only';
  app: ConnectorApp;
  why?: string;
  scopes?: ('gmail' | 'gcal' | 'contacts')[];
  setupCard?: 'D' | 'E';
  /** CR-0040/0044: a card from intake, for this user message (Not now runs it without the app). */
  intakeConnect?: { messageId: string };
}

// ---- M9 (CR-0013): live view and sign-in ----
/** 08-4 §27.3: providers that take the user's own key (`WebProviderSchema`). */
export type WebProvider = 'exa' | 'tavily' | 'firecrawl' | 'browseruse';
/** G-M9-10: the six sign-in lanes of 05-3 §5.10.2 (`SignInReasonSchema`). */
export type SignInReason = 'sign_in' | 'captcha' | 'passkey' | 'bank_3ds' | 'known_puzzle' | 'saved_login_failed';
export type SignInMode = 'sign_in_here' | 'take_over';
/** 08-1 §3.3 `live:state` values (the engine's view). */
export type LiveState = 'running' | 'paused_signin' | 'taken_over' | 'unavailable';
/** 08-0 §G.8 / 06-3 §11.2 live window `data-state` (X-121); G-M9-08 maps `LiveState` onto it in the renderer. */
export type LiveWindowState = 'starting' | 'live' | 'needs_you' | 'in_control' | 'paused' | 'done' | 'cant_show';
