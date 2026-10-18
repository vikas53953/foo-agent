// Spec: AT-020 (J5: "find bills due this week" reads Gmail and the result carries a proof to the emails read), 08-2 §8.2
// (gmail.search / gmail.read through the job runner), §5.8 (finish re-checks an `emails_read` proof against this job's
// recorded tool results → ✅ done, not done_unverified), 08-3 §16.1 (the Gmail calls), §22.3 / §22.4 (FOO_TEST: a fake Google
// on 127.0.0.1 stands in for every Google host; never a real account). foo-verify journey for M8 T4, light and dark.
// The Proof chip's drawing is M4 T5's; here the proof is checked by the badge (done) and the job's recorded calls. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m8-t4-reading.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import type { FakeLine } from '../e2e/fakeAi';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';
import { fakeGmailRead, gmailState, serveFakeGoogle } from '../fakes/connectors/gmail-read';

const ASK = 'Find bills due this week';
const RESULT = 'Two bills are due this week: electricity ₹1,240 by Tue 20 Oct and broadband ₹799 by Thu 22 Oct.';
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const tool = (name: string, args: Record<string, unknown>) => act({ kind: 'tool', call: { tool: name, args }, why: 'next' });
const HOLD = 2_000;
const SCRIPT: FakeLine[] = [
  { match: { purpose: 'verify' }, reply: 'ready', once: false },
  {
    match: { purpose: 'intake', promptIncludes: ASK },
    reply: act({
      kind: 'job',
      title: 'Bills',
      plan: [
        { phraseKey: 'read_email', slots: {}, route: 'api' },
        { phraseKey: 'look_for', slots: { what: 'bills due this week' }, route: 'api' },
      ],
      estimate: { minutes: 1 },
      routeHint: ['api'],
      needsApps: [],
    }),
  },
  { match: { purpose: 'step' }, reply: tool('gmail.search', { query: 'bill', sinceDays: 7 }), delayMs: HOLD },
  { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: HOLD },
  { match: { purpose: 'step' }, reply: tool('gmail.read', { messageId: 'm_bill_fibre' }), delayMs: HOLD },
  { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 1 }), delayMs: HOLD },
  {
    match: { purpose: 'step' },
    reply: act({ kind: 'done', result: RESULT, proof: { kind: 'emails_read', count: 2, messageIds: ['m_bill_power', 'm_bill_fibre'] } }),
    delayMs: HOLD,
  },
];

export default async function journey(v: Verify): Promise<void> {
  const google = await serveFakeGoogle([fakeGmailRead(gmailState())]);
  try {
    const { app, page } = await v.launch({ fakeAi: SCRIPT, env: { FOO_FAKE_GOOGLE: google.url } });
    await openWorld(app, page);
    await openChat(page, 'foo');
    await setTheme(page, 'light');
    await rest(page);
    await settle(page);

    const log = page.getByTestId(TID.threadLog);
    const mine = log.locator(byTid(TID.bubbleMe), { hasText: ASK }).last();
    const badge = log
      .locator(`div:has(${byTid(TID.bubbleBadge)})`, { has: page.locator(byTid(TID.bubbleMe), { hasText: ASK }) })
      .last()
      .getByTestId(TID.bubbleBadge);
    await page.getByTestId(TID.composerField).focus();
    await page.keyboard.type(ASK);
    await page.keyboard.press('Enter');
    await mine.waitFor();

    const advance = async (ms: number) => {
      for (let at = 0; at < ms; at += 500) {
        await page.evaluate(() => window.__fooTest!.clock.advance(500));
        await page.waitForTimeout(40);
      }
    };
    await advance(5_000);
    await settle(page);
    await v.shot('job-working');

    await advance(15_000);
    try {
      await log.locator(byTid(TID.bubbleFoo), { hasText: RESULT }).first().waitFor({ timeout: 15_000 });
      await badge.and(page.locator('[data-state="done"]')).waitFor({ timeout: 8_000 });
    } catch {
      await v.shot('not-done');
      const is = await badge.getAttribute('data-state', { timeout: 500 }).catch(() => 'missing');
      const seen = (v.fakeTurns() as { purpose: string; matchedLine: number | null }[]).map((t) => `${t.purpose}:${t.matchedLine}`);
      throw new Error(`expected the result and a ✅ done badge; badge is ${is}; fake AI turns ${seen.join()}`);
    }
    v.note(`the result is posted as a foo bubble: "${RESULT}"`);
    v.note('my bubble ends ✅ with data-state="done": the emails_read proof was re-checked against the recorded Gmail results (AT-020)');

    const paths = google.requests.map((r) => `${r.method} ${r.path}`);
    const expected = [
      'GET /gmail/v1/users/me/messages',
      'GET /gmail/v1/users/me/messages/m_bill_power',
      'GET /gmail/v1/users/me/messages/m_bill_fibre',
      'GET /gmail/v1/users/me/messages/m_bill_fibre',
    ];
    if (paths.join() !== expected.join()) throw new Error(`fake Google saw ${paths.join(' | ')}`);
    const list = google.requests[0]!.query;
    if (list.q !== 'bill newer_than:7d' || list.maxResults !== '50') throw new Error(`messages.list query ${JSON.stringify(list)}`);
    v.note(`the real Gmail connector made exactly these calls to the fake Google: ${paths.join(' · ')} (q="${list.q}")`);

    const steps = (v.fakeTurns() as { purpose: string; prompt: string }[]).filter((t) => t.purpose === 'step');
    if (!steps.some((t) => t.prompt.includes('Your electricity bill is ready')))
      throw new Error('no step prompt carried the gmail.search result from the fake Google');
    if (!steps.some((t) => t.prompt.includes('Your broadband bill of ₹799 is due on 22 Oct 2026.')))
      throw new Error('no step prompt carried the gmail.read text (HTML → text)');
    v.note('the AI saw the search hits and the HTML email as plain text in its step prompts (observations from the connector)');

    await rest(page);
    await settle(page);
    await v.shot('job-done');
    await setTheme(page, 'dark');
    await settle(page);
    await v.shot('job-done');
  } finally {
    await google.close();
  }
}
