// Spec: 08-5 §5 rule 3 (optimistic send: the row shows at once under its clientId and is re-keyed in place when main answers;
// no answer within 15 s → failed with the retry affordance; never removed on its own), 08-1 §3.1.0 (only message:send
// retries, once, with the same clientId; idempotent, AT-225), §3.2 message:send, files:stage (60 s), 04-2 §21.3 (the bubble
// appears at once; "Send is allowed; the message waits" for files still being copied, §21.4), 04 §3.3 (Clock while waiting,
// ✓ once written), §7 (Not sent → Try again re-runs the same send with the same text and attachments).
import type { Attachment, MessageRow, PasteCatch } from '../../shared/types';
import { invoke, IpcTimeoutError } from '../ipc/client';
import { clockNow } from '../store/apply';
import { update } from '../store/index';
import { confirmSent, failSend, insertOptimistic, localId } from '../store/messages';
import { noteSendError } from './ComposerNotices';
import { noteMirrorDraft } from '../messages/mirrorDrafts'; // M8 T7

// GAP: GAPS.md 2026-10-17 "files:stage has no chunking"
export const STAGE_TIMEOUT_MS = 60_000;

export interface Outgoing {
  chatId: string;
  clientId: string;
  text: string;
  replyToId?: string;
  /** Attachments shown in the bubble at once; `ready` resolves to their ids once each is copied. */
  attachments: Attachment[];
  ready: Promise<string[]>;
  secretOverride?: boolean;
}

export type SendOutcome = { ok: true; messageId: string } | { ok: false; paste?: PasteCatch };

const outgoing = new Map<string, Outgoing>();

/** A new clientId (UUIDv4, one per composed message). */
export function newClientId(): string {
  return globalThis.crypto.randomUUID();
}

function optimisticRow(o: Outgoing): MessageRow {
  const now = clockNow();
  return {
    id: o.clientId,
    chatId: o.chatId,
    seq: 0,
    authorKind: 'user',
    authorId: null,
    kind: 'text',
    markerKind: null,
    clientId: o.clientId,
    text: o.text,
    status: 'queued',
    badge: null,
    replyToId: o.replyToId ?? null,
    jobId: null,
    cardId: null,
    lang: null,
    voicePath: null,
    voiceMs: null,
    transcript: null,
    transcriptConf: null,
    attachments: o.attachments.length ? o.attachments : null,
    prompted: true,
    why: null,
    pinned: false,
    providerNote: null,
    suggestions: null,
    side: false,
    rev: 0,
    createdAt: now,
    editedAt: null,
    deletedAt: null,
    reactions: [],
  };
}

async function deliver(o: Outgoing): Promise<SendOutcome> {
  let attachmentIds: string[];
  try {
    attachmentIds = await o.ready;
  } catch {
    failSend(o.chatId, o.clientId);
    return { ok: false };
  }
  const req = {
    chatId: o.chatId,
    clientId: o.clientId,
    text: o.text,
    ...(o.replyToId ? { replyToId: o.replyToId } : {}),
    ...(attachmentIds.length ? { attachmentIds } : {}),
    ...(o.secretOverride ? { secretOverride: true } : {}),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await invoke('message:send', req);
      if (r.ok) {
        outgoing.delete(o.clientId);
        // M8 T7 (04 §10.11): a mirror's Send made a Draft card in foo's chat; the mirror keeps no bubble, only the marker.
        if (r.value.mirrorDraft) {
          dropOptimistic(o.chatId, o.clientId);
          noteMirrorDraft(o.chatId, { ...r.value.mirrorDraft, at: clockNow() });
          return { ok: true, messageId: r.value.messageId };
        }
        confirmSent(o.chatId, o.clientId, r.value.messageId, r.value.queued);
        return { ok: true, messageId: r.value.messageId };
      }
      noteSendError(localId(o.clientId), r.error.kind);
      failSend(o.chatId, o.clientId);
      return r.error.paste ? { ok: false, paste: r.error.paste } : { ok: false };
    } catch (e) {
      // 08-1 §3.1.0: a timeout retries once with the same clientId; main returns the same row if the first one landed.
      if (!(e instanceof IpcTimeoutError) || attempt === 1) {
        failSend(o.chatId, o.clientId);
        return { ok: false };
      }
    }
  }
  failSend(o.chatId, o.clientId);
  return { ok: false };
}

// M8 T7
function dropOptimistic(chatId: string, clientId: string): void {
  update((d) => {
    const c = d.messages.byChat[chatId];
    if (!c) return;
    const id = localId(clientId);
    delete c.byId[id];
    c.ids = c.ids.filter((x) => x !== id);
  });
}

/** Shows the bubble at once and sends it. */
export function sendOutgoing(o: Outgoing): Promise<SendOutcome> {
  outgoing.set(o.clientId, o);
  insertOptimistic(optimisticRow(o));
  return deliver(o);
}

/** 04 §7 "Try again" on a bubble main never stored: the same send again (same clientId, text and attachments). */
export function retryOutgoing(clientId: string): Promise<SendOutcome> | null {
  const o = outgoing.get(clientId);
  if (!o) return null;
  update((d) => {
    const m = d.messages.byChat[o.chatId]?.byId[localId(clientId)];
    if (m) m.status = 'queued';
  });
  return deliver(o);
}

/** files:stage for one file (60 s; 08-1 §3.1.0). Resolves to the attachment id. */
export async function stageFile(name: string, bytes: ArrayBuffer): Promise<{ ok: true; id: string } | { ok: false; kind: string }> {
  const r = await invoke('files:stage', { name, bytes }, STAGE_TIMEOUT_MS);
  return r.ok ? { ok: true, id: r.value.attachmentId } : { ok: false, kind: r.error.kind };
}
