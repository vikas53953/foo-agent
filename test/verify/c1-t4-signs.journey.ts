// Spec: CR-0024 F7–F10 (04 §17.1 / §17.3 older-answer action row on hover or focus; 04-2 §21.7 Look chip icons; 08-2 §5.5
// item 4 and 04 §3.3 an answered message shows ✓✓ read; 05 §5.2.2 "Slow here, trying another way"), 10-2 §C.10 AT-430–AT-433.
// foo-verify journey for C1 T4: in foo's chat a slow fake job whose first tool call fails (the retry line under the current
// step) and two messages sent while it works; in News & X two plain answers (✓✓ read stays after the answer, chips with
// icons, the older answer's action row on hover). The fake AI cannot name a message id the app makes, so the "answered"
// steer path is proven by AT-432 (test/integration/jobs/c1-steer-signs.test.ts); here the same read tick shows on a plain
// answer. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/c1-t4-signs.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { intake } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { byTid, openChat, rest, setTheme, settle, windowSize } from '../fidelity/capture';

const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const JOB_ASK = 'find the budget news';
const ASK_1 = 'when does my train leave';
const SAY_1 = 'Your train leaves at 9:00 AM from Pune.';
const ASK_2 = 'and the platform';
const SAY_2 = 'It leaves from platform 4.';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(what);
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({
    fakeAi: [
      {
        match: { purpose: 'intake', promptIncludes: JOB_ASK },
        reply: act({
          kind: 'job',
          title: 'Budget news',
          plan: [
            { phraseKey: 'look_for', slots: { what: 'budget news' }, route: 'api' },
            { phraseKey: 'compare', slots: { what: 'the stories' }, route: 'api' },
          ],
          estimate: { minutes: 2 },
          routeHint: ['api'],
          needsApps: [],
        }),
      },
      // The first call fails (no such tool: an error outcome, the job carries on); the next turn is held, so the job works on.
      { match: { purpose: 'step' }, reply: act({ kind: 'tool', call: { tool: 'news.slow_search', args: {} }, why: 'next' }) },
      { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: 600_000, once: false },
      intake(ASK_1, `${SAY_1}\nSuggestions: Check my inbox | Plan my day | Help me write it`),
      intake(ASK_2, SAY_2),
    ],
  });
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const { refs } = await page.evaluate(() => window.__fooTest!.seed('ux-world'));
  await page.getByTestId(TID.chatlistRow).first().waitFor();
  await settleSeededJobs(page, refs);
  await windowSize(app, page, 1440, 900);
  await setTheme(page, 'light');
  const field = page.getByTestId(TID.composerField);
  const say = async (text: string) => {
    await field.focus();
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  };

  // F10: a slow job whose first tool call failed.
  await openChat(page, 'foo');
  await say(JOB_ASK);
  const checklist = page.getByTestId(TID.cardChecklist).last();
  const retry = checklist.getByText(t('cards.checklist.retry_other_way'));
  for (let i = 0; i < 30 && (await retry.count()) === 0; i++) await page.evaluate(() => window.__fooTest!.clock.advance(500));
  await retry.waitFor();
  check((await checklist.getByText(t('cards.checklist.slow')).count()) === 0, 'the slow line shows beside the retry line');
  v.note(`a failed tool call with the job still working → "${t('cards.checklist.retry_other_way')}" under the current step`);

  // Two messages while it works: both queue as steers and follow the job's badge until the next step turn takes them.
  await say('which AI are you using');
  await say('only this week please');
  await settle(page);
  await rest(page);
  await v.shot('retry-line-and-steers', byTid(TID.threadLog));
  v.note('two messages sent during the slow job; they wait for the held step turn (AT-432 proves the answered one turns ✓✓ read)');

  // F9 root cause: a plain answer leaves its message ✓✓ read, not Delivered.
  await openChat(page, 'News & X');
  await say(ASK_1);
  const answer1 = page.getByTestId(TID.bubbleHelper).filter({ hasText: SAY_1 });
  await answer1.waitFor();
  const mine = page.locator('[data-message-id]').filter({ has: page.getByTestId(TID.bubbleMe).filter({ hasText: ASK_1 }) });
  await mine.getByTestId(TID.bubbleTick).and(page.locator('[data-state="read"]')).waitFor();
  v.note('a plain answered message keeps ✓✓ read after the 👀 clears (was "Delivered")');

  // F8: chips with icons.
  const chips = page.getByTestId(TID.composerSuggestionChip);
  await chips.nth(2).waitFor();
  const icons = await chips.locator('[data-icon]').evaluateAll((els) => els.map((e) => e.getAttribute('data-icon')));
  check(JSON.stringify(icons) === JSON.stringify(['Mail', 'CalendarLtr', 'Edit']), `chip icons ${JSON.stringify(icons)}`);
  v.note(`chips "Check my inbox" / "Plan my day" / "Help me write it" → ${icons.join(' / ')}`);
  await settle(page);
  await v.shot('chips-with-icons', byTid(TID.composerSuggestions));

  // F7: the older answer's actions on hover.
  await say(ASK_2);
  await page.getByTestId(TID.bubbleHelper).filter({ hasText: SAY_2 }).waitFor();
  const olderRow = page.locator('[data-message-id]').filter({ has: answer1 });
  const wrap = olderRow.getByRole('toolbar').locator('xpath=..');
  const opacity = () => wrap.evaluate((el) => getComputedStyle(el).opacity);
  await field.hover();
  await page.waitForTimeout(300);
  check((await opacity()) === '0', 'older answer actions visible without hover');
  await answer1.hover();
  await page.waitForTimeout(300);
  check((await opacity()) === '1', 'older answer actions hidden on hover');
  v.note('older answer: action row hidden, shows on hover (latest answer keeps its row)');
  await v.shot('older-answer-hover', byTid(TID.threadLog));
  await setTheme(page, 'dark');
  await answer1.hover();
  await settle(page);
  await v.shot('older-answer-hover', byTid(TID.threadLog));
}
