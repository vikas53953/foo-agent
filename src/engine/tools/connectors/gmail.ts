// Spec: 08-3 §16.1 Calls (users.messages.list(q, maxResults ≤ 50), users.messages.get(format=full), users.history.list,
// users.getProfile), §16.1.3 (the poller's calls), 08-2 §8.2 tool rows `gmail.search` / `gmail.read` (read class; body text,
// plain preferred, HTML→text, attachments metadata only, §16.1 Limits), 08-4 §27.1 (descriptions shown to the AI, exact).
// The ToolLayer redacts every result before it is stored or shown to the AI (08-2 §11.4, ART-08c). Drafts are M8 T6's.
// `GmailPoller` is §16.1.3 (every 5 min, history paging, 404 re-baseline, resume, 20 s login delay, each new id once to the
// hooks of engine/connectors/hooks.ts).
import { z } from 'zod';
import type { Clock, TimerId } from '../../../shared/clock';
import type { ConnectorHooks } from '../../connectors/hooks';
import type { ToolDef } from '../ToolLayer';
import { ConnError, GOOGLE_BASES, connOutcome, googleCall, qs, type GoogleCallDeps } from './limiter';

export interface MailHit {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  /** ISO time the message arrived (Gmail `internalDate`). */
  date: string;
  snippet: string;
}
export interface MailText extends Omit<MailHit, 'snippet'> {
  to: string;
  text: string;
  attachments: { name: string; mime: string; bytes: number }[];
}

interface Part {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: Part[];
}
interface RawMessage {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: Part;
}

export const SEARCH_MAX = 50;
export const SINCE_DAYS_MAX = 365;

function header(m: RawMessage, name: string): string {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function walk(p: Part | undefined, out: Part[] = []): Part[] {
  if (!p) return out;
  out.push(p);
  for (const c of p.parts ?? []) walk(c, out);
  return out;
}

const decode = (data: string) => Buffer.from(data, 'base64url').toString('utf8');

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** HTML → plain text: scripts and styles dropped, block ends become new lines, tags removed, common entities decoded. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#39|amp|lt|gt|quot|apos|nbsp);/g, (_, e: string) => ENTITIES[e] ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toHit(m: RawMessage): MailHit {
  return {
    id: m.id,
    threadId: m.threadId ?? m.id,
    from: header(m, 'From'),
    subject: header(m, 'Subject'),
    date: new Date(Number(m.internalDate ?? 0)).toISOString(),
    snippet: m.snippet ?? '',
  };
}

function toText(m: RawMessage): MailText {
  const parts = walk(m.payload);
  const body = (mime: string) => parts.find((p) => p.mimeType === mime && !p.filename && p.body?.data)?.body?.data;
  const plain = body('text/plain');
  const html = body('text/html');
  const hit = toHit(m);
  return {
    id: hit.id,
    threadId: hit.threadId,
    from: hit.from,
    subject: hit.subject,
    date: hit.date,
    to: header(m, 'To'),
    text: plain ? decode(plain).trim() : html ? htmlToText(decode(html)) : '',
    attachments: parts
      .filter((p) => p.filename && p.body?.attachmentId)
      .map((p) => ({ name: p.filename!, mime: p.mimeType ?? 'application/octet-stream', bytes: p.body?.size ?? 0 })),
  };
}

export interface GmailDeps extends GoogleCallDeps {
  base?: string;
}

export type Gmail = ReturnType<typeof createGmail>;

export function createGmail(d: GmailDeps) {
  const base = `${d.base ?? GOOGLE_BASES.gmail}/gmail/v1/users/me`;
  const get = (path: string) => googleCall(d, { url: `${base}${path}`, flag: 'read' });
  const message = async (id: string) => (await get(`/messages/${encodeURIComponent(id)}${qs({ format: 'full' })}`)) as RawMessage;
  const list = async (params: { q: string; maxResults: number; labelIds?: string }) => {
    const r = (await get(`/messages${qs(params)}`)) as { messages?: { id: string }[] } | null;
    return (r?.messages ?? []).map((m) => m.id);
  };
  return {
    list,
    async search(o: { query: string; max?: number; sinceDays?: number }): Promise<MailHit[]> {
      const q = o.sinceDays ? `${o.query} newer_than:${o.sinceDays}d` : o.query;
      const ids = await list({ q, maxResults: Math.min(o.max ?? SEARCH_MAX, SEARCH_MAX) });
      const out: MailHit[] = [];
      for (const id of ids) out.push(toHit(await message(id)));
      return out;
    },
    async hit(id: string): Promise<MailHit> {
      return toHit(await message(id));
    },
    async read(id: string): Promise<MailText> {
      return toText(await message(id));
    },
    async profile(): Promise<{ email: string; historyId: string }> {
      const r = (await get('/profile')) as { emailAddress?: string; historyId?: string } | null;
      return { email: r?.emailAddress ?? '', historyId: String(r?.historyId ?? '') };
    },
    /** One page of users.history.list (messageAdded, INBOX, ≤ 500): new message ids in order, the newest historyId, the next page. */
    async history(startHistoryId: string, pageToken?: string): Promise<{ ids: string[]; historyId: string; next?: string }> {
      const r = (await get(
        `/history${qs({ startHistoryId, historyTypes: 'messageAdded', labelId: 'INBOX', maxResults: 500, pageToken })}`,
      )) as { history?: { messagesAdded?: { message?: { id?: string } }[] }[]; historyId?: string; nextPageToken?: string } | null;
      const ids = (r?.history ?? []).flatMap((h) => (h.messagesAdded ?? []).map((a) => a.message?.id ?? '')).filter(Boolean);
      return { ids, historyId: String(r?.historyId ?? startHistoryId), ...(r?.nextPageToken ? { next: r.nextPageToken } : {}) };
    },
  };
}

const searchArgs = z
  .object({
    query: z.string().min(1),
    max: z.number().int().min(1).max(SEARCH_MAX).optional(),
    sinceDays: z.number().int().min(1).max(SINCE_DAYS_MAX).optional(),
  })
  .strict();
const readArgs = z.object({ messageId: z.string().min(1) }).strict();

/** 08-2 §8.2 + 08-4 §27.1: the two Gmail read tools. */
export function gmailTools(gmail: Gmail): ToolDef[] {
  return [
    {
      name: 'gmail.search',
      actionClass: 'read',
      args: `query: string, max?: number ≤ ${SEARCH_MAX}, sinceDays?: number ≤ ${SINCE_DAYS_MAX}`,
      description:
        'Find emails. Returns ids, sender, subject, date and a snippet. Use Gmail search words like from:, subject:, newer_than:7d.',
      run: (args) =>
        connOutcome(
          (a) => searchArgs.safeParse(a),
          args,
          async (a) => ({ kind: 'ok', result: await gmail.search(a) }),
        ),
    },
    {
      name: 'gmail.read',
      actionClass: 'read',
      args: 'messageId: string',
      description: "Read one email's text and attachment names.",
      run: (args) =>
        connOutcome(
          (a) => readArgs.safeParse(a),
          args,
          async (a) => ({ kind: 'ok', result: await gmail.read(a.messageId) }),
        ),
    },
  ];
}

export const POLL_EVERY_MS = 5 * 60_000;
/** 09 §9.7: at login foo's background work waits 20 s. */
export const LOGIN_DELAY_MS = 20_000;
export const REBASELINE_MAX = 50;

export interface GmailPollerDeps {
  gmail: Gmail;
  clock: Clock;
  hooks: ConnectorHooks;
  /** `connections.history_id` of the gmail row. */
  store: { load(): Promise<string | null>; save(historyId: string): Promise<void> };
  online(): boolean;
  log?(evt: string, kind?: string): void;
}

/** 08-3 §16.1.3: finds new inbox mail and gives each message id to the hooks once. */
export class GmailPoller {
  private timer: TimerId | null = null;
  private running = false;
  private suspended = false;
  private busy: Promise<void> | null = null;
  /** Ids emitted since the last saved historyId, so a poll retried after a failed save never emits twice. */
  private emitted = new Set<string>();

  constructor(private d: GmailPollerDeps) {}

  /** On connect: the newest historyId becomes the starting point; nothing older is emitted. */
  async baseline(): Promise<void> {
    const { historyId } = await this.d.gmail.profile();
    if (historyId) await this.d.store.save(historyId);
  }

  start(o: { atLogin: boolean }): void {
    this.running = true;
    this.schedule(o.atLogin ? LOGIN_DELAY_MS : 0);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) this.d.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  suspend(): void {
    this.suspended = true;
  }

  /** powerMonitor 'resume': one poll at once, then the 5-minute rhythm again. */
  resume(): void {
    this.suspended = false;
    if (this.running) this.schedule(0);
  }

  private schedule(ms: number): void {
    if (this.timer !== null) this.d.clock.clearTimeout(this.timer);
    this.timer = this.d.clock.setTimeout(() => {
      this.timer = null;
      if (!this.running) return;
      const run = this.suspended || !this.d.online() ? Promise.resolve() : this.pollOnce();
      void run.finally(() => {
        if (this.running && this.timer === null) this.schedule(POLL_EVERY_MS);
      });
    }, ms);
  }

  /** One poll. Never throws: a failed poll keeps the saved historyId for the next one. */
  pollOnce(): Promise<void> {
    this.busy ??= this.poll()
      .catch((e: unknown) => this.d.log?.('gmail.poll', e instanceof ConnError ? e.kind : 'UNKNOWN'))
      .finally(() => (this.busy = null));
    return this.busy;
  }

  private async poll(): Promise<void> {
    const start = await this.d.store.load();
    if (!start) return this.baseline();
    const ids: string[] = [];
    let newest: string;
    try {
      let page: string | undefined;
      do {
        const r = await this.d.gmail.history(start, page);
        ids.push(...r.ids);
        newest = r.historyId;
        page = r.next;
      } while (page);
    } catch (e) {
      if (e instanceof ConnError && e.kind === 'NOT_FOUND') return this.rebaseline();
      throw e;
    }
    await this.emitNew([...new Set(ids)], false);
    await this.d.store.save(newest);
    this.emitted.clear();
  }

  /** History too old: start again from the newest historyId and catch up on the last day, skipping handled ids. */
  private async rebaseline(): Promise<void> {
    this.d.log?.('gmail.poll', 'rebaseline');
    const { historyId } = await this.d.gmail.profile();
    const ids = await this.d.gmail.list({ q: 'newer_than:1d', labelIds: 'INBOX', maxResults: REBASELINE_MAX });
    await this.emitNew(ids.reverse(), true);
    if (historyId) await this.d.store.save(historyId);
    // Kept until the next regular poll saves: mail arriving between profile() and list() comes back in that history.
  }

  private async emitNew(ids: string[], checkHooks: boolean): Promise<void> {
    for (const id of ids) {
      if (this.emitted.has(id)) continue;
      if (checkHooks && (await this.d.hooks.seen(id))) continue;
      let m: Awaited<ReturnType<Gmail['hit']>>;
      try {
        m = await this.d.gmail.hit(id);
      } catch (e) {
        // Deleted between history and fetch: skip it, or the saved historyId never moves past it.
        if (e instanceof ConnError && e.kind === 'NOT_FOUND') continue;
        throw e;
      }
      this.emitted.add(id);
      await this.d.hooks.emitEmail({ messageId: m.id, threadId: m.threadId, from: m.from, subject: m.subject, date: m.date });
    }
  }
}
