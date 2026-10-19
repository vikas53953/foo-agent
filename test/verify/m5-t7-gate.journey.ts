// Spec: 08-2 §9.4 (the gate: a read-only job only offers, Art. 3), §5.3.1 (no do-verb → intent read_only), 08-4 §28.1 (a
// verified request_approval opens a PENDING Approval card and the job waits), 05-1 §5.3 Choice ("Want me to book one?"),
// 05-2 §5.5 Approval card, AT-110 (Not now → "Okay, I won’t. Nothing else to do here."), CR-0009 G-M5-29 / G-M5-30.
// foo-verify journey for M5 T7, real app on the fake AI (no tools until M8 / M9, so both requests carry no quotes):
// a read-only flight ask → a Choice offer and 0 approval cards; "Book a table…" → an Approval card; Not now → the line.
// Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m5-t7-gate.journey.ts
import type { Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { VERIFY_OK, type FakeLine } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const LOOK = 'Find flights to Pune on Friday';
const BOOK = 'Book a table for 4 at Toit on Saturday';
const FOUND = 'Two flights on Friday: 7:05 AM for ₹4,120 and 6:40 PM for ₹3,890.';
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const intakeLine = (ask: string, title: string): FakeLine => ({
  match: { purpose: 'intake', promptIncludes: ask },
  reply: act({
    kind: 'job',
    title,
    plan: [{ phraseKey: 'look_for', slots: { what: title.toLowerCase() }, route: 'api' }],
    routeHint: ['api'],
    needsApps: [],
  }),
});
const request = (fields: Record<string, unknown>) =>
  act({
    kind: 'request_approval',
    draft: { verb: 'book', fields: { verb: 'book', irreversible: false, ...fields }, evidence: [] },
    submitRef: 'e1',
  });

const SCRIPT: FakeLine[] = [
  VERIFY_OK,
  intakeLine(LOOK, 'Flights to Pune'),
  intakeLine(BOOK, 'Table at Toit'),
  // The AI asks to book in a job that was only asked to look: the gate offers instead (Art. 3).
  { match: { purpose: 'step', promptIncludes: 'Look for flights to pune' }, reply: request({ item: 'Flight to Pune' }) },
  { match: { purpose: 'step', promptIncludes: 'Look for flights to pune' }, reply: act({ kind: 'done', result: FOUND, unverified: true }) },
  {
    match: { purpose: 'step', promptIncludes: 'Look for table at toit' },
    reply: request({ payee: 'Toit', partySize: 4, cancelTerms: { refundable: true } }),
  },
];

/** Polls `check`, moving the fake clock 500 ms a round so held turns and the runner's timers go on. */
async function until(check: () => Promise<boolean>, what: string, v: Verify, page: Page): Promise<void> {
  for (let i = 0; i < 75; i++) {
    if (await check()) return;
    await page.evaluate(() => window.__fooTest!.clock.advance(500));
    await new Promise((r) => setTimeout(r, 200));
  }
  await v.shot(`timeout-${what.replace(/\W+/g, '-')}`);
  const turns = v.fakeTurns() as { purpose: string; matchedLine: number | null; prompt: string }[];
  const seen = turns.map((t) => `${t.purpose}:${t.matchedLine}`);
  const job = turns.find((t) => t.purpose === 'step' && t.matchedLine === null)?.prompt ?? '';
  throw new Error(
    `timed out waiting for ${what} (fake AI turns ${seen.join()}; unmatched step saw "${job.slice(job.indexOf('The job:'), job.indexOf('The job:') + 120)}")`,
  );
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: SCRIPT });
  await settleSeededJobs(page, await openWorld(app, page));
  await openChat(page, 'Home');
  await setTheme(page, 'light');
  await rest(page);
  await settle(page);
  const log = page.getByTestId(TID.threadLog);
  const say = async (text: string) => {
    await page.getByTestId(TID.composerField).focus();
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await log.locator(byTid(TID.bubbleMe), { hasText: text }).last().waitFor();
  };
  const approvals = () => log.locator(byTid(TID.cardApproval)).count();
  const approvalsBefore = await approvals();

  // 1. Read-only: options and an offer, never a booking card.
  await say(LOOK);
  const offer: Locator = log.locator(byTid(TID.cardChoice), { hasText: 'Want me to book one?' }).last();
  await until(() => offer.isVisible(), 'the offer Choice', v, page);
  const rows = (await offer.getByTestId(TID.cardChoiceOption).allInnerTexts()).map((s) => s.replace(/\n/g, ' '));
  v.note(`"${LOOK}" → Choice "Want me to book one?" with options ${JSON.stringify(rows)}`);
  if ((await approvals()) !== approvalsBefore) throw new Error('a read-only ask opened an Approval card');
  v.note(`Approval cards in the thread: ${approvalsBefore} → ${await approvals()} (the AI's book request became an offer)`);
  await rest(page);
  await settle(page);
  await v.shot('read-only-offer');
  await offer.getByTestId(TID.cardChoiceOption).nth(1).click();
  const found = log.locator(`${byTid(TID.bubbleFoo)}, ${byTid(TID.bubbleHelper)}`, { hasText: FOUND });
  await until(() => found.last().isVisible(), 'the flight result', v, page);
  v.note(`Not now on the offer → the job goes on and posts "${FOUND}"`);
  if ((await approvals()) !== approvalsBefore) throw new Error('an Approval card appeared after Not now');

  // 2. An asked booking: a PENDING Approval card, built from the verified fields.
  await say(BOOK);
  const card = log.locator(byTid(TID.cardApproval)).last();
  await until(async () => (await approvals()) === approvalsBefore + 1, 'the Approval card', v, page);
  await card.scrollIntoViewIfNeeded();
  v.note(
    `"${BOOK}" → Approval card, state ${await card.getAttribute('data-card-state')}, reads "${(await card.innerText()).split('\n').slice(0, 3).join(' · ')}"`,
  );
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await rest(page);
    await settle(page);
    await v.shot(`approval-card-${theme}`);
  }
  await setTheme(page, 'light');

  // 3. Not now → declined, the job ends with the line (AT-110).
  await card.getByTestId(TID.cardApprovalNotNow).click();
  const line = log.locator(`${byTid(TID.bubbleFoo)}, ${byTid(TID.bubbleHelper)}`, { hasText: 'Okay, I won’t. Nothing else to do here.' });
  await until(() => line.last().isVisible(), 'the decline line', v, page);
  v.note(
    `Not now → card state ${await card.getAttribute('data-card-state')}; foo says "${(await line.last().innerText()).split('\n')[0]}"`,
  );
  await rest(page);
  await settle(page);
  await v.shot('declined');
}
