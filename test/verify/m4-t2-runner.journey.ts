// Spec: 08-2 §5 (the job runner: intake decides `job` → a job row, badge 👀 → 🛠, checklist after 1.5 s, the AI's result
// posted once, ✅ only from the runner), 05-1 §5.2 (one checklist message), 10-1 AT-019 / AT-115, 10-2 ART-16 / ART-17.
// foo-verify journey for M4 T2: a 2-step job driven by the fake AI in the real app, light and dark. The checklist card's
// look is T5's; here it is checked as one card row in the thread. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m4-t2-runner.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import type { FakeLine } from '../e2e/fakeAi';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const ASK = 'Find my bills due this week';
const RESULT = 'Two bills are due this week: electricity ₹1,240 and broadband ₹799.';
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
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
  // Held on the fake clock, so the journey can look at 🛠 and the checklist before the job ends.
  { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: 5_000 },
  { match: { purpose: 'step' }, reply: act({ kind: 'done', result: RESULT, unverified: true }), delayMs: 5_000 },
];

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: SCRIPT });
  await openWorld(app, page);
  // Home has no live job: in foo's chat the seeded "Goa stay" (NEEDS YOU) would take the message as a steer (08-2 §5.2).
  await openChat(page, 'Home');
  await setTheme(page, 'light');
  await rest(page);
  await settle(page);

  const log = page.getByTestId(TID.threadLog);
  // A helper chat's replies are helper bubbles.
  const REPLY = `${byTid(TID.bubbleFoo)}, ${byTid(TID.bubbleHelper)}`;
  const mine = log.locator(byTid(TID.bubbleMe), { hasText: ASK }).last();
  // The badge sits next to the bubble (Bubble.tsx `.hold`), not inside it: the innermost block holding both.
  const badge = log
    .locator(`div:has(${byTid(TID.bubbleBadge)})`, { has: page.locator(byTid(TID.bubbleMe), { hasText: ASK }) })
    .last()
    .getByTestId(TID.bubbleBadge);
  // Until T5 draws it, a checklist renders as the card placeholder (Bubble.tsx data-card-type); after, as TID.cardChecklist.
  const checklists = log.locator(`[data-card-type="checklist"], ${byTid(TID.cardChecklist)}`);
  const cardsBefore = await checklists.count();
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(ASK);
  await page.keyboard.press('Enter');
  await mine.waitFor();

  const waitBadge = async (state: string) => {
    try {
      await badge.and(page.locator(`[data-state="${state}"]`)).waitFor({ timeout: 8_000 });
    } catch {
      await v.shot(`badge-not-${state}`);
      const seen = (v.fakeTurns() as { purpose: string; matchedLine: number | null }[]).map((t) => `${t.purpose}:${t.matchedLine}`);
      const is = await badge.getAttribute('data-state', { timeout: 500 }).catch(() => 'missing');
      throw new Error(`my bubble's badge should be ${state}, is ${is} (fake AI turns ${seen.join()})`);
    }
  };
  // The fake clock moves in small steps so each held AI turn starts its own delay after the one before ends.
  const advance = async (ms: number) => {
    for (let at = 0; at < ms; at += 500) {
      await page.evaluate(() => window.__fooTest!.clock.advance(500));
      await page.waitForTimeout(30);
    }
  };

  await waitBadge('working');
  v.note('intake decided job → the runner started it: my bubble shows 🛠 (badge data-state="working")');
  await advance(2_000);
  await settle(page);
  await waitBadge('working');
  v.note('2 s into the job (past the 1.5 s checklist) the badge is still 🛠');
  await v.shot('job-working');

  await advance(10_000);
  await log.locator(REPLY, { hasText: RESULT }).first().waitFor({ timeout: 10_000 });
  await waitBadge('done_unverified');
  v.note(`the AI's result is posted once as a foo bubble: "${RESULT}"`);
  v.note('my bubble ends ✅ with badge data-state="done_unverified" (no proof given, AT-115)');

  const results = await log.locator(REPLY, { hasText: RESULT }).count();
  if (results !== 1) throw new Error(`result bubble count ${results}, expected 1`);
  const turns = v.fakeTurns() as { purpose: string }[];
  const purposes = turns.map((t) => t.purpose).filter((p) => p !== 'verify');
  if (purposes.join() !== 'intake,step,step') throw new Error(`fake AI turns ${purposes.join()}`);
  v.note('the fake AI was asked exactly intake, step, step (verify turns aside)');
  const cardsAfter = await checklists.count();
  if (cardsAfter !== cardsBefore + 1) throw new Error(`checklist cards ${cardsBefore} → ${cardsAfter}, expected one more`);
  v.note(`exactly one new checklist card in the thread (${cardsBefore} → ${cardsAfter}); its drawing lands with T5`);

  await rest(page);
  await settle(page);
  await v.shot('job-done');
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('job-done');
}
