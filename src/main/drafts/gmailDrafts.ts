// Spec: 08-3 §16.5 (connector interface), §16.6 (`gmail.draft` / `updateDraft` / `deleteDraft` / `send`; CONN_EXPIRED,
// SEND_FAILED), 08-0 §G.7 (Change = drafts.update, Discard = drafts.delete, Send = drafts.send after the 5 s undo), 08-3
// §22.2 (FOO_TEST runs inject an in-memory fake with the same API). CR-0009 G-M5-12: the minimal drafts port the Draft card
// needs in M5; the real Gmail connector fills it in M8.
import { fail, ok, type Result } from '../../shared/errors';

export interface DraftMessage {
  to: string;
  subject?: string;
  body: string;
  // M8 T6 (08-3 §16.1.4 "the full edited message and the same thread headers")
  /** The Gmail thread a reply stays in, and the message it answers. */
  threadId?: string;
  inReplyTo?: string;
}

/** The four Gmail draft calls the Draft card makes (08-3 §16.6). */
export interface GmailDrafts {
  /** The connection the Sent-folder proof names (08-0 §B.3 Proof `sent_folder`). */
  readonly connectionId: string;
  /** M8 T6 (G-M8-03): Gmail also answers the draft's message id and thread. */
  create(msg: DraftMessage): Promise<Result<{ gmailDraftId: string; gmailMessageId?: string; threadId?: string }>>;
  update(gmailDraftId: string, msg: DraftMessage): Promise<Result<void>>;
  send(gmailDraftId: string): Promise<Result<{ messageId: string }>>;
  delete(gmailDraftId: string): Promise<Result<void>>;
}

let current: GmailDrafts | null = null;

/** Main installs the connector's drafts port once it exists (M8); FOO_TEST runs install the in-memory one. */
export function installGmailDrafts(port: GmailDrafts | null): void {
  current = port;
}

export function gmailDrafts(): GmailDrafts | null {
  return current;
}

export interface MemoryGmail extends GmailDrafts {
  drafts: Map<string, DraftMessage>;
  /** Sent message ids → the draft they came from, in order. */
  sent: { messageId: string; gmailDraftId: string; msg: DraftMessage }[];
  /** Every call, in order (`create`, `update:<id>`, `send:<id>`, `delete:<id>`). */
  calls: string[];
  /** The next call of this name fails with this error. */
  failNext(call: 'create' | 'update' | 'send' | 'delete', kind: 'CONN_EXPIRED' | 'SEND_FAILED'): void;
}

/**
 * An in-memory Gmail drafts store (08-3 §22.2). `adoptUnknown` is for FOO_TEST app runs, whose draft cards are seeded
 * straight into the db (test:card.seed) with an id this store never made: a call on such an id treats it as an empty draft.
 */
export function memoryGmailDrafts(opts: { adoptUnknown?: boolean } = {}): MemoryGmail {
  const drafts = new Map<string, DraftMessage>();
  const sent: MemoryGmail['sent'] = [];
  const calls: string[] = [];
  const failing = new Map<string, 'CONN_EXPIRED' | 'SEND_FAILED'>();
  let n = 0;
  const failed = (call: string) => {
    const kind = failing.get(call);
    failing.delete(call);
    return kind;
  };
  const known = (id: string): DraftMessage | undefined => {
    if (!drafts.has(id) && opts.adoptUnknown) drafts.set(id, { to: '', body: '' });
    return drafts.get(id);
  };
  return {
    connectionId: 'conn_gmail_fake',
    drafts,
    sent,
    calls,
    failNext: (call, kind) => void failing.set(call, kind),
    create(msg) {
      calls.push('create');
      const kind = failed('create');
      if (kind) return Promise.resolve(fail(kind));
      const gmailDraftId = `gd_${++n}`;
      drafts.set(gmailDraftId, { ...msg });
      return Promise.resolve(ok({ gmailDraftId }));
    },
    update(id, msg) {
      calls.push(`update:${id}`);
      const kind = failed('update');
      if (kind) return Promise.resolve(fail(kind));
      if (!known(id)) return Promise.resolve(fail('NOT_FOUND'));
      drafts.set(id, { ...msg });
      return Promise.resolve(ok(undefined));
    },
    send(id) {
      calls.push(`send:${id}`);
      const kind = failed('send');
      if (kind) return Promise.resolve(fail(kind));
      const msg = known(id);
      if (!msg) return Promise.resolve(fail('NOT_FOUND'));
      drafts.delete(id);
      const messageId = `gm_${++n}`;
      sent.push({ messageId, gmailDraftId: id, msg });
      return Promise.resolve(ok({ messageId }));
    },
    delete(id) {
      calls.push(`delete:${id}`);
      const kind = failed('delete');
      if (kind) return Promise.resolve(fail(kind));
      if (!known(id)) return Promise.resolve(fail('NOT_FOUND'));
      drafts.delete(id);
      return Promise.resolve(ok(undefined));
    },
  };
}
