// Spec: 08-2 §5.5 (a message during a job steers it: "Got it, I'll fold that in.", same job, part 10 of the next step
// turn), §5.7 (stop: no AI call after it, the report from the activity log), §5.6 + 05-3 §5.19 (three failures → the stuck
// card with what's wrong, the cost so far and three buttons; Stop on it cancels the job), 10-1 AT-077 / AT-084 / AT-107,
// 10-2 ART-18a. foo-verify journey for M4 T3 in the real app with the fake AI, light and dark. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m4-t3-stop-steer.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import type { FakeLine } from '../e2e/fakeAi';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const ASK_A = 'Find my bills due this week';
const STEER = 'actually make it cheaper';
const ASK_B = 'Check the stay site for rooms';
const WRONG = 'The stay site will not open for me.';
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const job = (title: string, plan: Record<string, unknown>[]) =>
  act({ kind: 'job', title, plan, estimate: { minutes: 1 }, routeHint: ['api'], needsApps: [] });
const SCRIPT: FakeLine[] = [
  { match: { purpose: 'verify' }, reply: 'ready', once: false },
  {
    match: { purpose: 'intake', promptIncludes: ASK_A },
    reply: job('Bills', [
      { phraseKey: 'read_email', slots: {}, route: 'api' },
      { phraseKey: 'look_for', slots: { what: 'bills due this week' }, route: 'api' },
    ]),
  },
  // Only the turn that carries the steer matches this line.
  { match: { purpose: 'step', promptIncludes: STEER }, reply: act({ kind: 'step_done', idx: 1 }), delayMs: 3_000 },
  { match: { purpose: 'step', promptIncludes: 'bills due this week' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: 6_000 },
  // Held long: the stop lands while this turn is still out.
  {
    match: { purpose: 'step', promptIncludes: 'bills due this week' },
    reply: act({ kind: 'done', result: 'x', unverified: true }),
    delayMs: 60_000,
  },
  {
    match: { purpose: 'intake', promptIncludes: ASK_B },
    reply: job('Stay', [
      { phraseKey: 'check_site', slots: { site: 'stay.example' }, route: 'browser' },
      { phraseKey: 'compare', slots: { what: 'rooms' }, route: 'api' },
    ]),
  },
  // The app has no site tool yet, so each call fails: three in a row is the stuck rule.
  ...Array.from({ length: 4 }, () => ({
    match: { purpose: 'step', promptIncludes: 'stay.example' },
    reply: act({ kind: 'tool', call: { tool: 'site.open', args: { site: 'stay.example' } }, why: 'open the site' }),
    delayMs: 1_000,
  })),
  { match: { purpose: 'classify' }, reply: `<say></say><act>${JSON.stringify({ whatsWrong: WRONG })}</act>` },
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
  const badgeOf = (text: string) =>
    log
      .locator(`div:has(${byTid(TID.bubbleBadge)})`, { has: page.locator(byTid(TID.bubbleMe), { hasText: text }) })
      .last()
      .getByTestId(TID.bubbleBadge);
  const say = async (text: string) => {
    await page.getByTestId(TID.composerField).focus();
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await log.locator(byTid(TID.bubbleMe), { hasText: text }).last().waitFor();
  };
  const advance = async (ms: number) => {
    for (let at = 0; at < ms; at += 500) {
      await page.evaluate(() => window.__fooTest!.clock.advance(500));
      await page.waitForTimeout(30);
    }
  };
  const REPLY = `${byTid(TID.bubbleFoo)}, ${byTid(TID.bubbleHelper)}`;
  const fooSays = async (text: string) => {
    try {
      await log.locator(REPLY, { hasText: text }).last().waitFor({ timeout: 10_000 });
    } catch {
      await v.shot(`missing-reply`);
      const seen = (v.fakeTurns() as { purpose: string; matchedLine: number | null }[]).map((x) => `${x.purpose}:${x.matchedLine}`);
      throw new Error(`foo never said "${text}" (fake AI turns ${seen.join()})`);
    }
  };
  const stepTurns = () => (v.fakeTurns() as { purpose: string }[]).filter((x) => x.purpose === 'step').length;
  const checklists = log.locator(byTid(TID.cardChecklist));
  const cardsBefore = await checklists.count();

  // 1 · Steer: a message while the job works is folded in; the same job carries on.
  await say(ASK_A);
  await badgeOf(ASK_A).and(page.locator('[data-state="working"]')).waitFor({ timeout: 8_000 });
  await advance(2_000);
  await say(STEER);
  // The steer goes into the next step turn; the reply comes when that turn settles.
  await advance(10_000);
  await fooSays(t('thread.steer.folded'));
  v.note(`"${STEER}" mid-job → foo: "${t('thread.steer.folded')}"`);
  const steered = (v.fakeTurns() as { purpose: string; prompt: string }[]).filter((x) => x.purpose === 'step' && x.prompt.includes(STEER));
  if (steered.length !== 1) throw new Error(`step turns carrying the steer: ${steered.length}`);
  if (!steered[0]!.prompt.includes('while you work (answer or fold in each one):')) throw new Error('part 10 header missing');
  v.note('the next step turn carried it in part 10: "New messages from … while you work (answer or fold in each one):"');
  const cardsMid = await checklists.count();
  if (cardsMid !== cardsBefore + 1) throw new Error(`checklist cards ${cardsBefore} → ${cardsMid}: the steer started a new job`);
  v.note('still one checklist card for the job: the steer did not start a new job');
  await rest(page);
  await settle(page);
  await v.shot('steer-folded');

  // 2 · Stop: the held turn is cut off, nothing runs after, and the reply says what was done.
  const turnsAtStop = stepTurns();
  await say('stop');
  await fooSays(t('thread.stop.report.nothing'));
  await badgeOf(ASK_A).and(page.locator('[data-state="stopped"]')).waitFor({ timeout: 5_000 });
  v.note(`"stop" → foo: "${t('thread.stop.report.nothing')}", my bubble ⛔ (badge data-state="stopped")`);
  await advance(70_000);
  if (stepTurns() !== turnsAtStop) throw new Error(`step turns ${turnsAtStop} → ${stepTurns()} after the stop`);
  v.note(`70 s on the clock after "stop": no new AI step turn (still ${turnsAtStop})`);
  await rest(page);
  await settle(page);
  await v.shot('stopped');

  // 3 · Stuck: three failures in a row → the stuck card, and no more tries.
  await say(ASK_B);
  const stuck = page.getByTestId(TID.cardStuck).last();
  for (let i = 0; i < 30 && !(await stuck.isVisible()); i++) await advance(500);
  await stuck.getByText(WRONG).waitFor({ timeout: 5_000 });
  for (const id of [TID.cardStuckOtherWay, TID.cardStuckTakeOver, TID.cardStuckStop]) await stuck.getByTestId(id).waitFor();
  await badgeOf(ASK_B).and(page.locator('[data-state="waiting"]')).waitFor({ timeout: 5_000 });
  v.note(`three failed site calls → stuck card: "${WRONG}", with Try another way, Take over and Stop; my bubble ⏳`);
  const turnsAtStuck = stepTurns();
  await advance(60_000);
  if (stepTurns() !== turnsAtStuck) throw new Error('the job kept trying after the stuck card');
  v.note('60 s later: no more step turns while the card waits');
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await stuck.scrollIntoViewIfNeeded();
    await rest(page);
    await settle(page);
    await v.shot(`stuck-${theme}`);
  }
  await setTheme(page, 'light');

  await stuck.getByTestId(TID.cardStuckStop).click();
  await badgeOf(ASK_B).and(page.locator('[data-state="stopped"]')).waitFor({ timeout: 5_000 });
  v.note('Stop on the stuck card → the job is cancelled, my bubble ⛔');
  await rest(page);
  await settle(page);
  await v.shot('stuck-stopped');
}
