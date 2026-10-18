// Spec: M4 pack §3 + CR-0008 G-M4-05 (fake read tools for the runner's tests until M8 connectors and M9 browser), 08-4 §27.1
// (tool descriptions shown to the AI), 08-2 §9.2 (action classes), §5.8 (a confirmation code must be in a recorded result).
// Everything here is made up: no real names, addresses or mail. M8 replaces gmail.* with test/fakes/connectors/*.
import type { ToolDef, ToolOutcome, ToolRegistry } from '../../../src/engine/tools/ToolLayer';

export interface FakeMail {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
}

/** A small made-up mailbox: two bills due this week and one newsletter. */
export const FAKE_MAILBOX: FakeMail[] = [
  {
    id: 'g1',
    from: 'billing@power.example',
    subject: 'Your electricity bill is ready',
    date: '2026-10-15',
    snippet: 'Amount due ₹1,240 by 20 Oct',
    body: 'Hello, your electricity bill of ₹1,240 is due on 20 Oct 2026.',
  },
  {
    id: 'g2',
    from: 'accounts@fibre.example',
    subject: 'Broadband bill for October',
    date: '2026-10-14',
    snippet: 'Pay ₹799 before 22 Oct',
    body: 'Your broadband bill of ₹799 is due on 22 Oct 2026.',
  },
  {
    id: 'g3',
    from: 'news@shop.example',
    subject: 'Weekend sale',
    date: '2026-10-13',
    snippet: 'Up to 40% off',
    body: 'Sale this weekend.',
  },
];

export interface FakeToolLog {
  tool: string;
  args: unknown;
  at: number;
}

export interface FakeToolOptions {
  /** Sites that refuse foo (fake.site → SITE_BLOCKED). */
  blockedSites?: string[];
  /** Make the next n calls of a tool fail with UNKNOWN. */
  failNext?: Record<string, number>;
}

/** The fake tool set and the log of every call (tool, args, clock time). */
export function fakeTools(o: FakeToolOptions = {}): { tools: ToolRegistry; calls: FakeToolLog[] } {
  const calls: FakeToolLog[] = [];
  const failNext = { ...(o.failNext ?? {}) };
  const wrap =
    (name: string, run: (args: Record<string, unknown>) => ToolOutcome) =>
    async (args: unknown, ctx: { now: number }): Promise<ToolOutcome> => {
      calls.push({ tool: name, args, at: ctx.now });
      if ((failNext[name] ?? 0) > 0) {
        failNext[name] = (failNext[name] ?? 0) - 1;
        return { kind: 'error', errorKind: 'UNKNOWN' };
      }
      return run((args ?? {}) as Record<string, unknown>);
    };
  const defs: ToolDef[] = [
    {
      name: 'gmail.search',
      actionClass: 'read',
      args: 'query: string, max?: number ≤ 50, sinceDays?: number ≤ 365',
      description:
        'Find emails. Returns ids, sender, subject, date and a snippet. Use Gmail search words like from:, subject:, newer_than:7d.',
      run: wrap('gmail.search', (a) => {
        const q = String(a.query ?? '').toLowerCase();
        const hits = FAKE_MAILBOX.filter((m) => !q.includes('bill') || /bill/i.test(m.subject));
        return { kind: 'ok', result: hits.map((m) => ({ id: m.id, from: m.from, subject: m.subject, date: m.date, snippet: m.snippet })) };
      }),
    },
    {
      name: 'gmail.read',
      actionClass: 'read',
      args: 'id: string',
      description: "Read one email's text and attachment names.",
      run: wrap('gmail.read', (a) => {
        const m = FAKE_MAILBOX.find((x) => x.id === a.id);
        return m ? { kind: 'ok', result: { ...m, attachments: [] } } : { kind: 'error', errorKind: 'NOT_FOUND' };
      }),
    },
    {
      name: 'fake.site',
      actionClass: 'read',
      args: 'site: string',
      description: 'Open a made-up test site and read it.',
      run: wrap('fake.site', (a) => {
        const site = String(a.site ?? '');
        if (o.blockedSites?.includes(site)) return { kind: 'error', errorKind: 'SITE_BLOCKED', result: { site } };
        return { kind: 'ok', result: { site, text: `Booking confirmed. Reference ABC123 at ${site}.` } };
      }),
    },
    {
      name: 'fake.needsUser',
      actionClass: 'read',
      args: "card: 'approval' | 'payment' | 'signin' | 'secret'",
      description: 'Test only: the step needs the user (stands in for M5/M9/M10 cards).',
      run: wrap('fake.needsUser', (a) => {
        const type = String(a.card ?? 'approval');
        const state = { approval: 'PENDING', payment: 'PENDING', signin: 'waiting', secret: 'asking' }[type] ?? 'PENDING';
        return { kind: 'needs_user', card: { type: type as 'approval', state, payload: { title: 'Test card' } } };
      }),
    },
    {
      name: 'fake.send',
      actionClass: 'send',
      args: 'to: string',
      description: 'Test only: an acting tool the M4 gate refuses.',
      run: wrap('fake.send', () => ({ kind: 'ok', result: { sent: true } })),
    },
  ];
  return { tools: Object.fromEntries(defs.map((d) => [d.name, d])), calls };
}
