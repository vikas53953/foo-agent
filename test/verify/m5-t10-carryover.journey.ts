// Spec: 08-2 §5.3.3 ("Change plan" → the next message goes back to intake with the old plan attached), 05-3 §5.12.2 (the
// new Plan card shows below; the old one reads changed), 04-1 §20.4 (the composer placeholder after Change plan), 08-2
// §5.10 item 3 (spend:update after every AI turn). foo-verify journey for M5 T10 (CR-0008 (j) rows 1 and 3). Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m5-t10-carryover.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { settleSeededJobs } from '../e2e/m4-start';
import { VERIFY_OK, type FakeLine } from '../e2e/fakeAi';
import { byTid, openChat, openWorld, setTheme, settle } from '../fidelity/capture';

const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const goa = (under: string) =>
  act({
    kind: 'job',
    title: 'Goa stay',
    plan: [
      { phraseKey: 'look_for', slots: { what: `Goa stays under ${under}` }, route: 'api' },
      { phraseKey: 'look_for', slots: { what: 'beach walks' }, route: 'api' },
    ],
    estimate: { minutes: 6 },
    routeHint: ['api'],
    needsApps: [],
  });
const SCRIPT: FakeLine[] = [
  VERIFY_OK,
  { match: { purpose: 'intake', promptIncludes: 'Find a Goa stay' }, reply: goa('₹8,000') },
  { match: { purpose: 'intake', promptIncludes: 'cheaper please' }, reply: goa('₹5,000') },
];

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: SCRIPT });
  await settleSeededJobs(page, await openWorld(app, page));
  await openChat(page, 'foo');
  await setTheme(page, 'light');
  await page.evaluate(() => {
    const w = window as unknown as { __spend: number };
    w.__spend = 0;
    window.foo.on('spend:update', () => (w.__spend += 1));
  });
  const spendEvents = () => page.evaluate(() => (window as unknown as { __spend: number }).__spend);
  const send = async (text: string) => {
    await page.getByTestId(TID.composerField).focus();
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  };
  const plans = page.getByTestId(TID.threadLog).getByTestId(TID.cardPlan);

  await send('Find a Goa stay');
  await plans.first().waitFor({ timeout: 10_000 });
  await settle(page);
  if ((await plans.count()) !== 1) throw new Error(`expected one Plan card, saw ${await plans.count()}`);
  const n1 = await spendEvents();
  if (n1 < 1) throw new Error('no spend:update after the intake turn');
  v.note(`"Find a Goa stay" → Plan card pending; ${n1} spend:update event(s) after the AI turn (row 1)`);
  await v.shot('plan-pending', byTid(TID.threadLog));

  await plans.first().getByTestId(TID.cardPlanChange).click();
  const want = t('cards.plan.change_placeholder');
  await page.getByText(want, { exact: true }).waitFor({ timeout: 5_000 });
  v.note(`Change plan → the old card reads changed and the composer says "${want}" (row 3)`);
  await v.shot('change-placeholder');

  await send('cheaper please');
  await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 2, `${byTid(TID.threadLog)} ${byTid(TID.cardPlan)}`, {
    timeout: 10_000,
  });
  await settle(page);
  const states = await plans.evaluateAll((els) => els.map((e) => e.getAttribute('data-card-state')));
  if (states[0] !== 'changed' || states[1] !== 'pending') throw new Error(`Plan card states ${states.join(', ')}`);
  const text = (await plans.nth(1).textContent()) ?? '';
  if (!text.includes('₹5,000')) throw new Error(`the new Plan card does not show the new plan: ${text}`);
  const turns = v.fakeTurns() as { purpose?: string; prompt?: string }[];
  const second = turns.filter((x) => x.purpose === 'intake').at(-1)?.prompt ?? '';
  if (!second.includes('Goa stays under ₹8,000')) throw new Error('the second intake prompt has no old plan');
  v.note(`"cheaper please" → intake prompt carries the old plan; new Plan card (₹5,000) pending below the changed one`);
  await v.shot('new-plan-below', byTid(TID.threadLog));
  await setTheme(page, 'dark');
  await v.shot('new-plan-below', byTid(TID.threadLog));
  if ((await spendEvents()) <= n1) throw new Error('no spend:update after the second intake turn');
}
