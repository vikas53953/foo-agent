// Spec: 08-3 §16.1.4 (`gmail.draft` → users.drafts.create, storing the draft id and its message id; Change →
// users.drafts.update with the full edited message and the same thread; Discard → users.drafts.delete; Send →
// users.drafts.send(gmailDraftId), never messages.send), §16.1 Calls (5 requests/s; backoff on 429/5xx, never for
// drafts.send), Tokens (refresh on 401 once; 403 scope → the granted flag false + CONN_SCOPE_MISSING), Signature (the
// default send-as signature from users.settings.sendAs.list, `isDefault: true`), §16.6 (CONN_EXPIRED, SEND_FAILED), 08-2
// §11.4 (logs carry kinds only). CR-0012 G-M8-03 (the Gmail message id rides on the draft payload). M8 T6: the real
// `GmailDrafts` port M5 left for M8 (src/main/drafts/gmailDrafts.ts), over T2's GoogleAccess and T4's `googleCall`.
import type { Clock } from '../../shared/clock';
import { fail, ok, type Result } from '../../shared/errors';
import { htmlToText } from '../../engine/tools/connectors/gmail';
import {
  ConnError,
  GOOGLE_BASES,
  RateLimiter,
  googleCall,
  type ConnErrorKind,
  type GoogleCallDeps,
} from '../../engine/tools/connectors/limiter';
import type { GoogleAccess, HttpFetch } from '../../engine/tools/connectors/types';
import type { DraftMessage, GmailDrafts } from './gmailDrafts';

export interface GoogleDraftsDeps {
  http: HttpFetch;
  access: GoogleAccess;
  clock: Clock;
  /** The Gmail connection row id (the Sent-folder proof names it). */
  connectionId(): string;
  /** Defaults to the real Gmail host; FOO_TEST runs pass the fake Google's base. */
  base?: string;
  log?(evt: string, kind?: string): void;
}

/** A header value with no line breaks (no header injection) and RFC 2047 words for anything outside ASCII. */
function header(v: string): string {
  const flat = v.replace(/[\r\n]+/g, ' ').trim();
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(flat) ? flat : `=?UTF-8?B?${Buffer.from(flat, 'utf8').toString('base64')}?=`;
}

/** The address part only: `<`, `>`, quotes, commas and line breaks never reach the To header. */
const bareAddress = (a: string) => a.replace(/[\s<>",;]+/g, '');

/** Gmail's `raw`: an RFC 2822 text/plain message, base64url (08-3 §16.1.4 "the full edited message"). */
export function rawMessage(msg: DraftMessage): string {
  const lines = [
    `To: ${bareAddress(msg.to)}`,
    ...(msg.subject !== undefined ? [`Subject: ${header(msg.subject)}`] : []),
    ...(msg.inReplyTo ? [`In-Reply-To: ${header(msg.inReplyTo)}`, `References: ${header(msg.inReplyTo)}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ];
  const body = Buffer.from(msg.body.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64');
  return Buffer.from(`${lines.join('\r\n')}\r\n\r\n${body}`, 'utf8').toString('base64url');
}

/** Node's fetch as the connector seam (main's real Google calls). */
export const nodeFetch: HttpFetch = async (url, init) => {
  const res = await fetch(url, { method: init?.method ?? 'GET', ...(init?.headers ? { headers: init.headers } : {}), ...(init?.body ? { body: init.body } : {}) });
  return { status: res.status, json: () => res.json() as Promise<unknown>, text: () => res.text() };
};

const kindOf = (e: unknown): ConnErrorKind => (e instanceof ConnError ? e.kind : 'UNKNOWN');

export interface GoogleGmailDrafts extends GmailDrafts {
  /** The default send-as signature as plain text, or null when Gmail has none (08-3 §16.1 Signature). */
  signature(): Promise<string | null>;
}

export function googleGmailDrafts(d: GoogleDraftsDeps): GoogleGmailDrafts {
  const call: GoogleCallDeps = {
    http: d.http,
    access: d.access,
    clock: d.clock,
    limiter: new RateLimiter(d.clock),
    ...(d.log ? { log: d.log } : {}),
  };
  const base = `${d.base ?? GOOGLE_BASES.gmail}/gmail/v1/users/me`;
  const message = (msg: DraftMessage) => ({ raw: rawMessage(msg), ...(msg.threadId ? { threadId: msg.threadId } : {}) });
  const failed = <T>(evt: string, e: unknown): Result<T> => {
    const kind = kindOf(e);
    d.log?.(evt, kind);
    return fail(kind);
  };
  return {
    get connectionId() {
      return d.connectionId();
    },
    async create(msg) {
      try {
        const r = (await googleCall(call, { url: `${base}/drafts`, method: 'POST', body: { message: message(msg) }, flag: 'draft' })) as {
          id?: string;
          message?: { id?: string; threadId?: string };
        } | null;
        if (!r?.id) return fail('UNKNOWN');
        return ok({
          gmailDraftId: r.id,
          ...(r.message?.id ? { gmailMessageId: r.message.id } : {}),
          ...(r.message?.threadId ? { threadId: r.message.threadId } : {}),
        });
      } catch (e) {
        return failed('gmail.drafts.create', e);
      }
    },
    async update(id, msg) {
      try {
        await googleCall(call, {
          url: `${base}/drafts/${encodeURIComponent(id)}`,
          method: 'PUT',
          body: { id, message: message(msg) },
          flag: 'draft',
        });
        return ok(undefined);
      } catch (e) {
        return failed('gmail.drafts.update', e);
      }
    },
    async send(id) {
      try {
        // One try only, whatever the answer: a retried send could go out twice (08-3 §16.1 Calls).
        const r = (await googleCall(call, { url: `${base}/drafts/send`, method: 'POST', body: { id }, flag: 'send', noRetry: true })) as {
          id?: string;
        } | null;
        return r?.id ? ok({ messageId: r.id }) : fail('SEND_FAILED');
      } catch (e) {
        const kind = kindOf(e);
        d.log?.('gmail.drafts.send', kind);
        // §16.6: a connection problem keeps its kind (the card offers Reconnect); anything else is SEND_FAILED.
        return fail(kind === 'UNKNOWN' || kind === 'NOT_FOUND' ? 'SEND_FAILED' : kind);
      }
    },
    async delete(id) {
      try {
        await googleCall(call, { url: `${base}/drafts/${encodeURIComponent(id)}`, method: 'DELETE', flag: 'draft' });
        return ok(undefined);
      } catch (e) {
        return failed('gmail.drafts.delete', e);
      }
    },
    async signature() {
      try {
        const r = (await googleCall(call, { url: `${base}/settings/sendAs`, flag: 'read' })) as {
          sendAs?: { isDefault?: boolean; signature?: string }[];
        } | null;
        const sig = r?.sendAs?.find((s) => s.isDefault)?.signature ?? '';
        const text = htmlToText(sig).trim();
        return text || null;
      } catch (e) {
        d.log?.('gmail.sendAs', kindOf(e));
        return null;
      }
    },
  };
}
