// Spec: 08-2 §8.2 tool rows `gmail.search` ({ query; max ≤ 50; sinceDays ≤ 365 } → ids, from, subject, date, snippet) and
// `gmail.read` ({ messageId } → body text, plain preferred, HTML→text, attachments metadata), 08-4 §27.1 (the descriptions
// shown to the AI, exact), 08-3 §16.1 Calls (messages.list maxResults ≤ 50, messages.get format=full), 08-2 §11.4 + ART-08c
// (a code in Gmail text is redacted before the AI sees it: the ToolLayer stores and returns the redacted result).
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/shared/clock';
import { RateLimiter } from '../../src/engine/tools/connectors/limiter';
import { createGmail, gmailTools } from '../../src/engine/tools/connectors/gmail';
import { drive, fakeAccess, fakeGmailRead, fakeGoogle, gmailState, type FakeGmailState } from '../fakes/connectors/gmail-read';

function setup(state: FakeGmailState = gmailState()) {
  const clock = new FakeClock();
  const g = fakeGoogle([fakeGmailRead(state)], () => clock.now());
  const a = fakeAccess();
  const gmail = createGmail({ http: g.fetch, access: a.access, clock, limiter: new RateLimiter(clock) });
  const tools = Object.fromEntries(gmailTools(gmail).map((t) => [t.name, t]));
  const run = (name: string, args: unknown) =>
    drive(tools[name]!.run(args, { jobId: 'j_1', signal: new AbortController().signal, now: clock.now() }), clock);
  return { clock, g, a, gmail, tools, run, state };
}

describe('gmail.search', () => {
  it('returns id, from, subject, date and snippet for each hit, newest first', async () => {
    const { run } = setup();
    const out = await run('gmail.search', { query: 'bill' });
    expect(out).toEqual({
      kind: 'ok',
      result: [
        {
          id: 'm_bill_power',
          threadId: 'm_bill_power',
          from: 'Power Co <billing@power.example.com>',
          subject: 'Your electricity bill is ready',
          date: '2026-10-15T04:30:00.000Z',
          snippet: 'Amount due ₹1,240 by 20 Oct',
        },
        {
          id: 'm_bill_fibre',
          threadId: 'm_bill_fibre',
          from: 'Fibre Net <accounts@fibre.example.com>',
          subject: 'Broadband bill for October',
          date: '2026-10-14T04:30:00.000Z',
          snippet: 'Pay ₹799 before 22 Oct',
        },
      ],
    });
  });

  it('sends q with newer_than:{sinceDays}d and maxResults = max (default 50, the spec cap)', async () => {
    const { run, g } = setup();
    await run('gmail.search', { query: 'subject:bill', max: 10, sinceDays: 7 });
    await run('gmail.search', { query: 'bill' });
    const lists = g.requests.filter((r) => r.path === '/gmail/v1/users/me/messages');
    expect(lists.map((r) => r.query)).toEqual([
      { q: 'subject:bill newer_than:7d', maxResults: '10' },
      { q: 'bill', maxResults: '50' },
    ]);
    expect(g.requests.filter((r) => r.path.startsWith('/gmail/v1/users/me/messages/')).every((r) => r.query.format === 'full')).toBe(
      true,
    );
  });

  it('max over 50 or sinceDays over 365 → VALIDATION, nothing sent', async () => {
    const { run, g } = setup();
    expect(await run('gmail.search', { query: 'x', max: 51 })).toEqual({ kind: 'error', errorKind: 'VALIDATION' });
    expect(await run('gmail.search', { query: 'x', sinceDays: 366 })).toEqual({ kind: 'error', errorKind: 'VALIDATION' });
    expect(await run('gmail.search', {})).toEqual({ kind: 'error', errorKind: 'VALIDATION' });
    expect(g.requests).toHaveLength(0);
  });

  it('no hits → an empty list', async () => {
    const { run } = setup();
    expect(await run('gmail.search', { query: 'nothing-like-this' })).toEqual({ kind: 'ok', result: [] });
  });

  it('a connection error is the tool error (CONN_EXPIRED when Google refuses the token)', async () => {
    const { run, a } = setup();
    a.refuse = 'CONN_EXPIRED';
    expect(await run('gmail.search', { query: 'bill' })).toEqual({ kind: 'error', errorKind: 'CONN_EXPIRED' });
  });
});

describe('gmail.read', () => {
  it('plain text is preferred and attachments are metadata only', async () => {
    const { run } = setup();
    expect(await run('gmail.read', { messageId: 'm_bill_power' })).toEqual({
      kind: 'ok',
      result: {
        id: 'm_bill_power',
        threadId: 'm_bill_power',
        from: 'Power Co <billing@power.example.com>',
        to: '',
        subject: 'Your electricity bill is ready',
        date: '2026-10-15T04:30:00.000Z',
        text: 'Hello, your electricity bill of ₹1,240 is due on 20 Oct 2026.',
        attachments: [],
      },
    });
  });

  it('HTML only → text without tags; attachment names, types and sizes', async () => {
    const { run } = setup();
    const out = (await run('gmail.read', { messageId: 'm_bill_fibre' })) as { kind: 'ok'; result: Record<string, unknown> };
    expect(out.result.text).toBe('Your broadband bill of ₹799 is due on 22 Oct 2026.');
    expect(out.result.attachments).toEqual([{ name: 'invoice-oct.pdf', mime: 'application/pdf', bytes: 48213 }]);
  });

  it('an unknown id → NOT_FOUND', async () => {
    const { run } = setup();
    expect(await run('gmail.read', { messageId: 'nope' })).toEqual({ kind: 'error', errorKind: 'NOT_FOUND' });
  });
});

describe('08-4 §27.1 · what the AI is told', () => {
  it('names, args and descriptions are exactly the spec lines; both are read tools', () => {
    const { tools } = setup();
    expect(Object.values(tools).map((t) => [t.name, t.actionClass, t.args, t.description])).toEqual([
      [
        'gmail.search',
        'read',
        'query: string, max?: number ≤ 50, sinceDays?: number ≤ 365',
        'Find emails. Returns ids, sender, subject, date and a snippet. Use Gmail search words like from:, subject:, newer_than:7d.',
      ],
      ['gmail.read', 'read', 'messageId: string', "Read one email's text and attachment names."],
    ]);
  });
});
