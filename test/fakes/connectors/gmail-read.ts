// Spec: 08-3 §22.4 (fake connectors: in-memory Gmail messages, behind the same seams as the real calls), §16.1 (the Gmail
// calls foo makes: messages.list / messages.get(format=full) / history.list / getProfile / settings.sendAs.list), CR-0012
// (M8 ticket seams: `HttpFetch`). The reading half of the fake Gmail; M5 T6 owns the drafts fake `gmail.ts`.
// Everything here is made up: example.com addresses only, no real mail. `fakeGoogle` is the shared router the Calendar and
// People fakes plug into; `serveFakeGoogle` puts the same router on 127.0.0.1 for a real-app journey.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { HttpFetch } from '../../../src/engine/tools/connectors/types';

export interface FakeReply {
  status: number;
  body?: unknown;
}
/** One fake Google API: answers the requests it knows (by host + path), else null. */
export type FakeHandler = (req: { method: string; url: URL; body: unknown }) => FakeReply | null;

export interface FakeRequest {
  method: string;
  host: string;
  path: string;
  query: Record<string, string>;
  auth: string | undefined;
  at: number;
}

export interface FakeGoogle {
  fetch: HttpFetch;
  /** Every request, in order (host recorded for ART-15b-style checks). */
  requests: FakeRequest[];
  /** The next replies for paths starting with `prefix` (consumed in order, before the handlers run). */
  failNext(prefix: string, ...replies: FakeReply[]): void;
}

/** A fake `fetch` over the handlers; unknown paths answer 404. `now` stamps each request (fake clock). */
export function fakeGoogle(handlers: FakeHandler[], now: () => number = () => 0): FakeGoogle {
  const requests: FakeRequest[] = [];
  const queued: { prefix: string; reply: FakeReply }[] = [];
  const fetch: HttpFetch = async (raw, init) => {
    const url = new URL(raw);
    const method = init?.method ?? 'GET';
    requests.push({
      method,
      host: url.host,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      auth: init?.headers?.Authorization,
      at: now(),
    });
    const qi = queued.findIndex((q) => url.pathname.startsWith(q.prefix));
    let reply: FakeReply | null = null;
    if (qi >= 0) reply = queued.splice(qi, 1)[0]!.reply;
    const body = init?.body ? (JSON.parse(init.body) as unknown) : undefined;
    for (const h of handlers) reply ??= h({ method, url, body });
    const r = reply ?? { status: 404, body: { error: { code: 404, message: 'Not Found' } } };
    const text = r.body === undefined ? '' : JSON.stringify(r.body);
    return { status: r.status, json: async () => JSON.parse(text || 'null') as unknown, text: async () => text };
  };
  return {
    fetch,
    requests,
    failNext(prefix, ...replies) {
      for (const reply of replies) queued.push({ prefix, reply });
    },
  };
}

/** The same router served over HTTP on 127.0.0.1 (for a real-app run: `FOO_FAKE_GOOGLE={url}`). */
export async function serveFakeGoogle(handlers: FakeHandler[]): Promise<{ url: string; close(): Promise<void> }> {
  const g = fakeGoogle(handlers);
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const url = `http://googleapis.example${req.url ?? '/'}`;
      void g.fetch(url, { method: req.method ?? 'GET', ...(body ? { body } : {}) }).then(async (r) => {
        res.writeHead(r.status, { 'content-type': 'application/json' });
        res.end(await r.text());
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}

// ---- the fake Gmail mailbox ----

export interface FakeMessage {
  id: string;
  threadId?: string;
  from: string;
  to?: string;
  subject: string;
  /** Epoch ms. */
  internalDate: number;
  snippet: string;
  text?: string;
  html?: string;
  attachments?: { filename: string; mimeType: string; size: number }[];
  labels?: string[];
  /** The history id this message was added at (history.list). */
  historyId?: number;
}

export interface FakeGmailState {
  messages: FakeMessage[];
  historyId: number;
  /** history.list answers 404 for a startHistoryId below this (history too old). */
  oldestHistoryId: number;
  sendAs: { sendAsEmail: string; isDefault: boolean; signature: string }[];
  email: string;
  /** Page size history.list uses (to test paging). */
  historyPageSize: number;
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

/** Three made-up bills plus one newsletter, dated the week of the X-10 test epoch (Fri 16 Oct 2026). */
export function billMailbox(): FakeMessage[] {
  const at = (d: number, h = 9) => Date.UTC(2026, 9, d, h - 5, 30);
  return [
    {
      id: 'm_bill_power',
      from: 'Power Co <billing@power.example.com>',
      subject: 'Your electricity bill is ready',
      internalDate: at(15),
      snippet: 'Amount due ₹1,240 by 20 Oct',
      text: 'Hello, your electricity bill of ₹1,240 is due on 20 Oct 2026.',
      historyId: 101,
    },
    {
      id: 'm_bill_fibre',
      from: 'Fibre Net <accounts@fibre.example.com>',
      subject: 'Broadband bill for October',
      internalDate: at(14),
      snippet: 'Pay ₹799 before 22 Oct',
      html: '<p>Your <b>broadband</b> bill of ₹799 is due on 22 Oct 2026.</p>',
      attachments: [{ filename: 'invoice-oct.pdf', mimeType: 'application/pdf', size: 48213 }],
      historyId: 102,
    },
    {
      id: 'm_news',
      from: 'Shop <news@shop.example.com>',
      subject: 'Weekend sale',
      internalDate: at(13),
      snippet: 'Up to 40% off',
      text: 'Sale this weekend.',
      historyId: 103,
    },
  ];
}

export function gmailState(over: Partial<FakeGmailState> = {}): FakeGmailState {
  return {
    messages: billMailbox(),
    historyId: 103,
    oldestHistoryId: 1,
    sendAs: [{ sendAsEmail: 'tester@example.com', isDefault: true, signature: 'Sent from foo tester' }],
    email: 'tester@example.com',
    historyPageSize: 500,
    ...over,
  };
}

function fullMessage(m: FakeMessage) {
  const headers = [
    { name: 'From', value: m.from },
    { name: 'Subject', value: m.subject },
    { name: 'Date', value: new Date(m.internalDate).toUTCString() },
    ...(m.to ? [{ name: 'To', value: m.to }] : []),
  ];
  const parts: unknown[] = [];
  if (m.text !== undefined) parts.push({ mimeType: 'text/plain', filename: '', body: { size: m.text.length, data: b64(m.text) } });
  if (m.html !== undefined) parts.push({ mimeType: 'text/html', filename: '', body: { size: m.html.length, data: b64(m.html) } });
  for (const a of m.attachments ?? [])
    parts.push({ mimeType: a.mimeType, filename: a.filename, body: { size: a.size, attachmentId: `att_${a.filename}` } });
  return {
    id: m.id,
    threadId: m.threadId ?? m.id,
    labelIds: m.labels ?? ['INBOX'],
    snippet: m.snippet,
    internalDate: String(m.internalDate),
    payload: { mimeType: 'multipart/mixed', headers, parts },
  };
}

/** Matches the few Gmail search words the tests use: words in subject/snippet, from:, to:, in:sent, newer_than (ignored). */
function matches(m: FakeMessage, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const labels = m.labels ?? ['INBOX'];
  return words.every((w) => {
    if (w.startsWith('newer_than:') || w.startsWith('after:') || w.startsWith('-category:')) return true;
    if (w === 'in:sent') return labels.includes('SENT');
    if (w.startsWith('from:')) return m.from.toLowerCase().includes(w.slice(5).replace(/"/g, ''));
    if (w.startsWith('to:')) return (m.to ?? '').toLowerCase().includes(w.slice(3).replace(/"/g, ''));
    if (w.startsWith('subject:')) return m.subject.toLowerCase().includes(w.slice(8));
    return `${m.subject} ${m.snippet}`.toLowerCase().includes(w.replace(/"/g, ''));
  });
}

const GMAIL = '/gmail/v1/users/me/';

/** The fake Gmail read API over `state` (mutable: tests add messages and bump `historyId`). */
export function fakeGmailRead(state: FakeGmailState): FakeHandler {
  return ({ method, url }) => {
    if (method !== 'GET' || !url.pathname.startsWith(GMAIL)) return null;
    const rest = url.pathname.slice(GMAIL.length);
    const p = url.searchParams;
    if (rest === 'profile') return { status: 200, body: { emailAddress: state.email, historyId: String(state.historyId) } };
    if (rest === 'settings/sendAs') return { status: 200, body: { sendAs: state.sendAs } };
    if (rest === 'messages') {
      const max = Number(p.get('maxResults') ?? 100);
      const label = p.get('labelIds');
      const hits = state.messages
        .filter((m) => matches(m, p.get('q') ?? '') && (!label || (m.labels ?? ['INBOX']).includes(label)))
        .sort((a, b) => b.internalDate - a.internalDate)
        .slice(0, max);
      return { status: 200, body: hits.length ? { messages: hits.map((m) => ({ id: m.id, threadId: m.threadId ?? m.id })) } : {} };
    }
    if (rest.startsWith('messages/')) {
      const m = state.messages.find((x) => x.id === decodeURIComponent(rest.slice('messages/'.length)));
      return m ? { status: 200, body: fullMessage(m) } : { status: 404, body: { error: { code: 404 } } };
    }
    if (rest === 'history') {
      const start = Number(p.get('startHistoryId'));
      if (start < state.oldestHistoryId) return { status: 404, body: { error: { code: 404, message: 'history too old' } } };
      const added = state.messages
        .filter((m) => (m.historyId ?? 0) > start && (m.labels ?? ['INBOX']).includes(p.get('labelId') ?? 'INBOX'))
        .sort((a, b) => (a.historyId ?? 0) - (b.historyId ?? 0));
      const offset = Number(p.get('pageToken') ?? 0);
      const page = added.slice(offset, offset + state.historyPageSize);
      const next = offset + state.historyPageSize < added.length ? String(offset + state.historyPageSize) : undefined;
      return {
        status: 200,
        body: {
          historyId: String(state.historyId),
          ...(page.length
            ? {
                history: page.map((m) => ({
                  id: String(m.historyId),
                  messagesAdded: [{ message: { id: m.id, threadId: m.threadId ?? m.id } }],
                })),
              }
            : {}),
          ...(next ? { nextPageToken: next } : {}),
        },
      };
    }
    return null;
  };
}

// ---- the fake GoogleAccess (T2 implements the real one) ----

export interface FakeAccess {
  access: import('../../../src/engine/tools/connectors/types').GoogleAccess;
  refreshes: number;
  missing: string[];
  /** Make accessToken() reject with this kind (Google refused the refresh token). */
  refuse: 'CONN_EXPIRED' | 'CONN_REVOKED' | null;
}

export function fakeAccess(email: string | null = 'tester@example.com'): FakeAccess {
  const f: FakeAccess = {
    refreshes: 0,
    missing: [],
    refuse: null,
    access: {
      accessToken: async () => {
        if (f.refuse) throw Object.assign(new Error(f.refuse), { kind: f.refuse });
        return `tok_${f.refreshes}`;
      },
      refreshAfter401: async () => {
        f.refreshes += 1;
        if (f.refuse) throw Object.assign(new Error(f.refuse), { kind: f.refuse });
        return `tok_${f.refreshes}`;
      },
      scopeMissing: async (flag) => {
        f.missing.push(flag);
      },
      email: () => email,
    },
  };
  return f;
}

/** Settles a promise that waits on fake-clock timers: lets microtasks run, then moves the clock, until it settles. */
export async function drive<T>(p: Promise<T>, clock: { advance(ms: number): void }, stepMs = 50, maxMs = 30 * 60_000): Promise<T> {
  let done = false;
  let value: T | undefined;
  let error: unknown;
  let failed = false;
  p.then(
    (v) => {
      done = true;
      value = v;
    },
    (e: unknown) => {
      done = true;
      failed = true;
      error = e;
    },
  );
  for (let t = 0; t <= maxMs; t += stepMs) {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise((r) => setImmediate(r));
    if (done) break;
    clock.advance(stepMs);
  }
  if (!done) throw new Error('drive: never settled');
  if (failed) throw error;
  return value as T;
}
