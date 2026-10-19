// Spec: CR-0009 G-M5-12 (a minimal fake Gmail behind the 08-3 §16.5 connector interface: drafts.create | update | send |
// delete), 08-3 §22.2 (fakes have the real API). The store itself lives in src/main/drafts/gmailDrafts.ts so FOO_TEST app
// runs can install it too; M8 extends this file with search, read and pollHistory. Made-up addresses only (example.com).
// M8 T6: 08-3 §16.1.4 (users.drafts.create / update / delete / send, settings.sendAs.list) as an HTTP handler on the shared
// fake Google router of gmail-read.ts, so the real GmailDrafts port in main is driven over the same seam (`HttpFetch`).
// A sent draft also lands in the mailbox with the SENT label, as Gmail's Sent folder does.
import type { FakeGmailState, FakeHandler } from './gmail-read';

export { memoryGmailDrafts as fakeGmail, type MemoryGmail as FakeGmail } from '../../../src/main/drafts/gmailDrafts';

// M8 T6
export interface FakeDraftsState {
  drafts: Map<string, { raw: string; threadId?: string }>;
  /** Sent messages in order (the draft they came from and its raw text). */
  sent: { messageId: string; draftId: string; raw: string }[];
  /** Every drafts call, in order (`create`, `update:<id>`, `send:<id>`, `delete:<id>`). */
  calls: string[];
  n: number;
}

export const draftsState = (): FakeDraftsState => ({ drafts: new Map(), sent: [], calls: [], n: 0 });

/** The headers and text of an RFC 2822 message as Gmail's `raw` (base64url) carries it. */
export function parseRaw(raw: string): { to: string; subject: string; body: string; headers: Record<string, string> } {
  const text = Buffer.from(raw, 'base64url').toString('utf8');
  const [head = '', ...rest] = text.split('\r\n\r\n');
  const headers: Record<string, string> = {};
  for (const line of head.split('\r\n')) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
  }
  const word = (v: string) => v.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b: string) => Buffer.from(b, 'base64').toString('utf8'));
  const encoded = rest.join('\r\n\r\n');
  const body = headers['content-transfer-encoding'] === 'base64' ? Buffer.from(encoded, 'base64').toString('utf8') : encoded;
  return { to: word(headers.to ?? ''), subject: word(headers.subject ?? ''), body, headers };
}

const DRAFTS = '/gmail/v1/users/me/drafts';

/** The fake Gmail drafts API over `drafts` (and `mail`, whose Sent folder a send fills). */
export function fakeGmailDrafts(drafts: FakeDraftsState, mail?: FakeGmailState): FakeHandler {
  return ({ method, url, body }) => {
    if (!url.pathname.startsWith(DRAFTS)) return null;
    const rest = url.pathname.slice(DRAFTS.length);
    const b = (body ?? {}) as { id?: string; message?: { raw?: string; threadId?: string } };
    if (method === 'POST' && rest === '') {
      drafts.calls.push('create');
      if (!b.message?.raw) return { status: 400, body: { error: { code: 400 } } };
      const id = `r_${++drafts.n}`;
      drafts.drafts.set(id, { raw: b.message.raw, ...(b.message.threadId ? { threadId: b.message.threadId } : {}) });
      return { status: 200, body: { id, message: { id: `dm_${drafts.n}`, threadId: b.message.threadId ?? `t_${drafts.n}` } } };
    }
    if (method === 'POST' && rest === '/send') {
      const id = b.id ?? '';
      drafts.calls.push(`send:${id}`);
      const d = drafts.drafts.get(id);
      if (!d) return { status: 404, body: { error: { code: 404 } } };
      drafts.drafts.delete(id);
      const messageId = `sm_${++drafts.n}`;
      drafts.sent.push({ messageId, draftId: id, raw: d.raw });
      if (mail) {
        const m = parseRaw(d.raw);
        mail.messages.push({
          id: messageId,
          from: mail.email,
          to: m.to,
          subject: m.subject,
          internalDate: 0,
          snippet: m.body.slice(0, 100),
          text: m.body,
          labels: ['SENT'],
        });
      }
      return { status: 200, body: { id: messageId, threadId: d.threadId ?? messageId, labelIds: ['SENT'] } };
    }
    const id = decodeURIComponent(rest.slice(1));
    if (method === 'PUT') {
      drafts.calls.push(`update:${id}`);
      if (!drafts.drafts.has(id)) return { status: 404, body: { error: { code: 404 } } };
      if (!b.message?.raw) return { status: 400, body: { error: { code: 400 } } };
      drafts.drafts.set(id, { raw: b.message.raw, ...(b.message.threadId ? { threadId: b.message.threadId } : {}) });
      return { status: 200, body: { id, message: { id: `dm_${id}` } } };
    }
    if (method === 'DELETE') {
      drafts.calls.push(`delete:${id}`);
      return drafts.drafts.delete(id) ? { status: 204 } : { status: 404, body: { error: { code: 404 } } };
    }
    return null;
  };
}
