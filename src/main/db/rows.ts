// Spec: 08-0 §0 (a DB row maps to its *Row by camelCasing every column; INTEGER flags → boolean; JSON TEXT → parsed),
// §B.1 (derived fields and drops), 08-1 §3.4 (derivations), 08-5 §2. This file is the only DB row ↔ *Row converter.
import type {
  ActionChip,
  Attachment,
  CardRow,
  ConnectionRow,
  DraftRow,
  HelperRow,
  JobRow,
  MemoryFactView,
  MessageRow,
  RoutineRow,
  StepRow,
  WaMessageRow,
} from '../../shared/types';
import { kitPickOf } from '../../shared/kit/pick';

export type DbRow = Record<string, unknown>;

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const flag = (v: unknown): boolean => Number(v) !== 0 && v !== null && v !== undefined;

export function parseJson<T>(v: unknown, fallback: T): T {
  if (typeof v !== 'string' || v === '') return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

/** The chats columns of ChatRow (08-1 §4.3.1). `pinned` holds the pin moment in epoch ms (0 = not pinned). */
export function chatBase(r: DbRow) {
  const pinnedAt = Number(r.pinned ?? 0);
  return {
    id: String(r.id),
    kind: r.kind as 'foo' | 'helper' | 'group' | 'wa_mirror',
    helperId: str(r.helper_id),
    title: String(r.title),
    avatarRef: str(r.avatar_ref),
    colorToken: str(r.color_token),
    waJid: str(r.wa_jid),
    pinned: pinnedAt !== 0,
    pinnedAt: pinnedAt !== 0 ? pinnedAt : null,
    archived: flag(r.archived),
    unreadCount: Number(r.unread_count ?? 0),
    pill: (str(r.pill) as 'needs_you' | 'working' | 'done' | 'paused' | null) ?? null,
    pillUntil: num(r.pill_until),
    lastMessageId: str(r.last_message_id),
    lastActivityAt: Number(r.last_activity_at),
    nextSeq: Number(r.next_seq),
    rev: Number(r.rev),
    createdAt: Number(r.created_at),
    deletedAt: num(r.deleted_at),
    private: flag(r.private),
    helperMessagesSinceUser: Number(r.helper_messages_since_user ?? 0),
    loopPaused: flag(r.loop_paused),
  };
}

export function messageRow(r: DbRow, reactions: MessageRow['reactions'] = []): MessageRow {
  return {
    id: String(r.id),
    chatId: String(r.chat_id),
    seq: Number(r.seq),
    authorKind: r.author_kind as MessageRow['authorKind'],
    authorId: str(r.author_id),
    kind: r.kind as MessageRow['kind'],
    markerKind: (str(r.marker_kind) as MessageRow['markerKind']) ?? null,
    clientId: str(r.client_id),
    text: String(r.text ?? ''),
    status: r.status as MessageRow['status'],
    badge: (str(r.badge) as MessageRow['badge']) ?? null,
    replyToId: str(r.reply_to_id),
    jobId: str(r.job_id),
    cardId: str(r.card_id),
    lang: str(r.lang),
    voicePath: str(r.voice_path),
    voiceMs: num(r.voice_ms),
    transcript: str(r.transcript),
    transcriptConf: num(r.transcript_conf),
    attachments: parseJson<Attachment[] | null>(r.attachments, null),
    prompted: flag(r.prompted),
    why: parseJson<Record<string, unknown> | null>(r.why, null),
    pinned: flag(r.pinned),
    providerNote: str(r.provider_note),
    suggestions: parseJson<string[] | null>(r.suggestions, null),
    side: flag(r.side),
    understood: parseJson<string[] | null>(r.understood, null),
    actions: parseJson<ActionChip[] | null>(r.actions, null),
    earlierText: str(r.earlier_text),
    kitPick: r.author_kind === 'user' ? kitPickOf(str(r.text_for_ai)) : null,
    rev: Number(r.rev),
    createdAt: Number(r.created_at),
    editedAt: num(r.edited_at),
    deletedAt: num(r.deleted_at),
    reactions,
  };
}

/** 08-5 §2: DB word `user` → wire word `me`; `foo` stays; else the helper id. */
export function reactionBy(by: string): 'me' | string {
  return by === 'user' ? 'me' : by;
}

export function cardRow(r: DbRow): CardRow {
  return {
    id: String(r.id),
    chatId: String(r.chat_id),
    messageId: String(r.message_id),
    jobId: str(r.job_id),
    type: r.type as CardRow['type'],
    state: String(r.state),
    payload: parseJson<Record<string, unknown>>(r.payload, {}),
    answer: parseJson<unknown>(r.answer, null),
    nonce: String(r.nonce),
    expiresAt: num(r.expires_at),
    resolvedBy: (str(r.resolved_by) as CardRow['resolvedBy']) ?? null,
    resolvedAt: num(r.resolved_at),
    supersedesId: str(r.supersedes_id),
    rev: Number(r.rev),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    deletedAt: num(r.deleted_at),
  };
}

export const SLOW_MS = 60_000;

/** The last moment a step started running or finished; null when no step has started (G-M4-07, CR-0008). */
export function stepProgressAt(steps: DbRow[]): number | null {
  let at: number | null = null;
  for (const s of steps) {
    const t = Math.max(s.state === 'running' ? (num(s.started_at) ?? -Infinity) : -Infinity, num(s.finished_at) ?? -Infinity);
    if (t !== -Infinity && (at === null || t > at)) at = t;
  }
  return at;
}

/**
 * JobRow drops aiSessionId and adds stepsDone, nowLine, slow and retrying (08-0 §B.1, 08-1 §3.4, CR-0024 F10). `slow` =
 * WORKING and no step finished for 60 s (08-2 §5.6): measured from the running step's start or the last finished step, else
 * the job's start; `last_progress_at` is not used because tool progress moves it without a step finishing (G-M4-07).
 */
export function jobRow(r: DbRow, derived: { stepsDone: number; nowLine: string; progressAt?: number | null }, now: number): JobRow {
  const state = r.state as JobRow['state'];
  const lastProgressAt = num(r.last_progress_at);
  const slowFrom = derived.progressAt ?? num(r.started_at);
  return {
    id: String(r.id),
    chatId: String(r.chat_id),
    originChatId: String(r.origin_chat_id),
    ownerKind: r.owner_kind as JobRow['ownerKind'],
    ownerId: str(r.owner_id),
    title: String(r.title),
    origin: r.origin as JobRow['origin'],
    originRef: str(r.origin_ref),
    userMessageId: str(r.user_message_id),
    intent: r.intent as JobRow['intent'],
    doVerbs: parseJson<string[]>(r.do_verbs, []),
    state,
    waitingReason: (str(r.waiting_reason) as JobRow['waitingReason']) ?? null,
    wakeAt: num(r.wake_at),
    needsYouCardId: str(r.needs_you_card_id),
    planVersion: Number(r.plan_version ?? 0),
    currentStepIdx: num(r.current_step_idx),
    stepCount: Number(r.step_count ?? 0),
    route: (str(r.route) as JobRow['route']) ?? null,
    siteDomain: str(r.site_domain),
    usesBrowser: flag(r.uses_browser),
    estMinutes: num(r.est_minutes),
    estTokens: num(r.est_tokens),
    estCostPaise: num(r.est_cost_paise),
    spentTokensIn: Number(r.spent_tokens_in ?? 0),
    spentTokensOut: Number(r.spent_tokens_out ?? 0),
    spentCostPaise: Number(r.spent_cost_paise ?? 0),
    costUnknown: flag(r.cost_unknown),
    providerId: str(r.provider_id),
    failStreak: Number(r.fail_streak ?? 0),
    stuckCount: Number(r.stuck_count ?? 0),
    proof: parseJson<unknown>(r.proof, null),
    resultMessageId: str(r.result_message_id),
    stopReason: str(r.stop_reason),
    rev: Number(r.rev),
    createdAt: Number(r.created_at),
    startedAt: num(r.started_at),
    lastProgressAt,
    finishedAt: num(r.finished_at),
    stepsDone: derived.stepsDone,
    nowLine: derived.nowLine,
    slow: state === 'working' && slowFrom !== null && now - slowFrom >= SLOW_MS,
    // CR-0024 F10: fail_streak counts failed calls in a row and goes back to 0 on the next good call or step (08-2 §5.4).
    retrying: state === 'working' && Number(r.fail_streak ?? 0) > 0,
  };
}

export function draftRow(r: DbRow): DraftRow {
  return {
    id: String(r.id),
    chatId: String(r.chat_id),
    text: String(r.text ?? ''),
    attachments: parseJson<Attachment[]>(r.attachments, []),
    replyToId: str(r.reply_to_id),
    linkPreviewRemoved: flag(r.link_preview_removed),
    updatedAt: Number(r.updated_at),
  };
}

/** ConnectionRow drops vaultName and accountHash (08-5 §2). */
export function connectionRow(r: DbRow): ConnectionRow {
  return {
    id: String(r.id),
    app: r.app as ConnectionRow['app'],
    accountLabel: String(r.account_label),
    granted: parseJson<ConnectionRow['granted']>(r.granted, {
      read: false,
      draft: false,
      send: false,
      calendarWrite: false,
      contactsRead: false,
    }),
    status: r.status as ConnectionRow['status'],
    connectedAt: Number(r.connected_at),
    lastOkAt: num(r.last_ok_at),
    lastErrorKind: str(r.last_error_kind),
    historyId: str(r.history_id),
    rev: Number(r.rev),
  };
}

export function helperRow(r: DbRow): HelperRow {
  return {
    id: String(r.id),
    name: String(r.name),
    jobText: String(r.job_text),
    goodResult: str(r.good_result),
    faceRef: String(r.face_ref),
    colorToken: String(r.color_token),
    allowedApps: parseJson<Record<string, boolean>>(r.allowed_apps, {}),
    chatId: String(r.chat_id),
    paused: flag(r.paused),
    template: str(r.template),
    rev: Number(r.rev),
    createdAt: Number(r.created_at),
    deletedAt: num(r.deleted_at),
  };
}

export function routineRow(r: DbRow): RoutineRow {
  return {
    id: String(r.id),
    ownerChatId: String(r.owner_chat_id),
    ownerHelperId: str(r.owner_helper_id),
    title: String(r.title),
    builtin: (str(r.builtin) as RoutineRow['builtin']) ?? null,
    whatText: String(r.what_text),
    tz: String(r.tz),
    state: r.state as RoutineRow['state'],
    createdFrom: r.created_from as RoutineRow['createdFrom'],
    nextRunAt: num(r.next_run_at),
    lastRunAt: num(r.last_run_at),
    lastFiredAt: num(r.last_fired_at),
    rev: Number(r.rev),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

/** 08-5 §3.6: the memory_index row without `hash`, plus the labels the Memory page and the right shell show. */
export function memoryFactView(r: DbRow, labels: { fileLabel: string; originLabel: string; onlyInChatTitle?: string }): MemoryFactView {
  return {
    id: String(r.id),
    file: String(r.file),
    lineNo: Number(r.line_no),
    scope: r.scope as MemoryFactView['scope'],
    chatId: str(r.chat_id),
    text: String(r.text),
    provenance: r.provenance as MemoryFactView['provenance'],
    origin: String(r.origin),
    originKind: r.origin_kind as MemoryFactView['originKind'],
    reason: str(r.reason),
    category: str(r.category) as MemoryFactView['category'],
    kind: (r.kind ?? 'fact') as MemoryFactView['kind'],
    sensitive: flag(r.sensitive),
    private: flag(r.private),
    learnedAt: Number(r.learned_at),
    lastUsedAt: num(r.last_used_at),
    useCount: Number(r.use_count ?? 0),
    ...labels,
  };
}

/** 08-1 §4.3.4 steps row. */
export function stepRow(r: DbRow): StepRow {
  return {
    id: String(r.id),
    jobId: String(r.job_id),
    idx: Number(r.idx),
    phraseKey: String(r.phrase_key),
    slots: parseJson<Record<string, unknown>>(r.slots, {}),
    state: r.state as StepRow['state'],
    attempts: Number(r.attempts),
    route: (str(r.route) as StepRow['route']) ?? null,
    rev: Number(r.rev),
    startedAt: num(r.started_at),
    finishedAt: num(r.finished_at),
  };
}

/** wa_messages row (08-1 §4.3, 08-0 §0 camelCase). */
export function waMessageRow(r: DbRow): WaMessageRow {
  return {
    id: String(r.id),
    chatJid: String(r.chat_jid),
    fromMe: flag(r.from_me),
    senderLabel: str(r.sender_label),
    text: String(r.text ?? ''),
    at: Number(r.at),
    starred: flag(r.starred),
    mentionsMe: flag(r.mentions_me),
  };
}
