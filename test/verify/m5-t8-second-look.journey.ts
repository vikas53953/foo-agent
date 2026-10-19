// Spec: 08-2 §9.6 (the second look after APPROVED and before acting; a mismatch → HELD), 08-4 §28.4 (F10 values "4 people"),
// §28.6 (`cards.approval.held.mismatch` "Before I do this, one check: you asked for {userSaid}, this is {actionHas}. Which
// one?"), 05-2 §5.5 (Held strip and the two options), X-125 (second look → live terms → RUNNING), AT-123.
// foo-verify journey for M5 T8, real app on the fake AI (no browser tools until M9, so the mismatch is the people count the
// user typed against the AI's booking; the money mismatch is covered by AT-123 / AT-124 in the integration lane):
// "Book a table for 4…" → the AI asks for 6 → Approve → HELD with the exact copy and two options → pick "6 people" → RUNNING.
// Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m5-t8-second-look.journey.ts
import type { Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { VERIFY_OK, type FakeLine } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const BOOK = 'Book a table for 4 at Toit on Saturday';
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const HELD_COPY = 'Before I do this, one check: you asked for 4 people, this is 6 people. Which one?';

const SCRIPT: FakeLine[] = [
  VERIFY_OK,
  {
    match: { purpose: 'intake', promptIncludes: BOOK },
    reply: act({
      kind: 'job',
      title: 'Table at Toit',
      plan: [{ phraseKey: 'look_for', slots: { what: 'table at toit' }, route: 'api' }],
      routeHint: ['api'],
      needsApps: [],
    }),
  },
  // The AI's booking says 6 people; the user typed 4. The second look's rule check catches it without an AI turn.
  {
    match: { purpose: 'step', promptIncludes: 'Look for table at toit' },
    reply: act({
      kind: 'request_approval',
      draft: {
        verb: 'book',
        fields: { verb: 'book', irreversible: false, payee: 'Toit', partySize: 6, cancelTerms: { refundable: true } },
        evidence: [],
      },
      submitRef: 'e1',
    }),
  },
];

/** Polls `check`, moving the fake clock 500 ms a round so the runner's timers go on. */
async function until(check: () => Promise<boolean>, what: string, v: Verify, page: Page): Promise<void> {
  for (let i = 0; i < 75; i++) {
    if (await check()) return;
    await page.evaluate(() => window.__fooTest!.clock.advance(500));
    await new Promise((r) => setTimeout(r, 200));
  }
  await v.shot(`timeout-${what.replace(/\W+/g, '-')}`);
  const turns = v.fakeTurns() as { purpose: string; matchedLine: number | null }[];
  throw new Error(`timed out waiting for ${what} (fake AI turns ${turns.map((t) => `${t.purpose}:${t.matchedLine}`).join()})`);
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: SCRIPT });
  await settleSeededJobs(page, await openWorld(app, page));
  await openChat(page, 'Home');
  await setTheme(page, 'light');
  await rest(page);
  await settle(page);
  const log = page.getByTestId(TID.threadLog);
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(BOOK);
  await page.keyboard.press('Enter');
  await log.locator(byTid(TID.bubbleMe), { hasText: BOOK }).last().waitFor();

  // 1. The AI's booking card (PENDING).
  const card = log.locator(byTid(TID.cardApproval)).last();
  await until(async () => (await card.getAttribute('data-card-state')) === 'PENDING', 'the Approval card', v, page);
  await card.scrollIntoViewIfNeeded();
  v.note(`"${BOOK}" → Approval card PENDING: "${(await card.innerText()).split('\n').slice(0, 2).join(' · ')}"`);
  await rest(page);
  await settle(page);
  await v.shot('pending');

  // 2. Approve → the second look holds it.
  await card.getByTestId(TID.cardApprovalApprove).click();
  await until(async () => (await card.getAttribute('data-card-state')) === 'HELD', 'HELD', v, page);
  const text = await card.innerText();
  if (!text.includes(HELD_COPY)) throw new Error(`HELD copy missing; card reads "${text}"`);
  const options = (await card.getByTestId(TID.cardApprovalHeldOption).allInnerTexts()).map((s) => s.trim());
  if (JSON.stringify(options) !== JSON.stringify(['4 people', '6 people'])) throw new Error(`options ${JSON.stringify(options)}`);
  v.note(`Approve → card state HELD; strip reads "${HELD_COPY}"; options ${JSON.stringify(options)}`);
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await rest(page);
    await settle(page);
    await v.shot(`held-${theme}`);
  }
  await setTheme(page, 'light');

  // 3. Pick what the card has ("6 people") → APPROVED → RUNNING (no second AI check).
  // Every state the card passes through, recorded in the page as it changes (RUNNING lasts one write).
  await card.evaluate((el) => {
    const w = window as unknown as { __states: string[] };
    w.__states = [];
    new MutationObserver(() => w.__states.push(el.getAttribute('data-card-state') ?? '')).observe(el, {
      attributes: true,
      attributeFilter: ['data-card-state'],
    });
  });
  await card.getByTestId(TID.cardApprovalHeldOption).nth(1).click();
  const seen = () => page.evaluate(() => (window as unknown as { __states: string[] }).__states);
  await until(async () => (await seen()).some((s) => s !== 'HELD' && s !== 'APPROVED' && s !== 'RUNNING'), 'the card to settle', v, page);
  const states = await seen();
  if (!states.includes('RUNNING')) throw new Error(`no RUNNING in ${JSON.stringify(states)}`);
  const looks = (v.fakeTurns() as { purpose: string }[]).filter((t) => t.purpose === 'second_look').length;
  v.note(`Pick "6 people" → card states ${JSON.stringify(states)}; second_look AI turns: ${looks}`);
  v.note('FAILED after RUNNING is expected here: the real app has no browser.submit until M9, so the one submit errors.');
  await rest(page);
  await settle(page);
  await v.shot('after-pick');
}
