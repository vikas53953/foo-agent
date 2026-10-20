// Spec: 04 §6.5 ("foo read:" line), §1.9 / §17.4 / §17.5 (Ask about this → side question answered while a job runs),
// 04-2 §22.5 (a paste over 10,000 characters becomes a `pasted-{time}.txt` file chip), CR-0022 picks 6, 7, X-180,
// AT-363..365. foo-verify journey for R1 T6, real app on the seeded world with the fake AI:
// (1) "Book a table for 4 at Toit on Fri 7 pm" shows the read line (light and dark); (2) a job runs, a side question about
// foo's last answer is asked from the selection pill and answered, and the job is still working; (3) a 14,200-character
// paste becomes a file chip.
// Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/r1-t6-input.journey.ts
import type { Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { envelope, intake, type FakeTurn } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { openChat, openWorld, setTheme, settle } from '../fidelity/capture';

const HOLD_MS = 1500;
const BOOK = 'Book a table for 4 at Toit on Fri 7 pm';
const EMI_SAY = 'Your EMI is ₹12,400 a month for 5 years.';
const SIDE_ASK = 'what does EMI stand for';
const SIDE_SAY = 'EMI means equated monthly instalment.';
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;

const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

async function showUp(page: Page, loc: Locator) {
  for (let i = 0; i < 60 && (await loc.count()) === 0; i++) {
    await advance(page, HOLD_MS + 100);
    await page.waitForTimeout(500);
  }
  await loc.first().waitFor({ state: 'attached' });
}

async function send(page: Page, text: string) {
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.getByTestId(TID.bubbleMe).filter({ hasText: text }).last().waitFor();
}

async function toNewest(page: Page) {
  await page.getByTestId(TID.threadLog).evaluate(async (el) => {
    for (let i = 0; i < 6; i++) {
      el.scrollTop = el.scrollHeight;
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({
    fakeAi: [
      intake(BOOK, 'Sure, I can look for a table at Toit.'),
      intake('what is my loan EMI', EMI_SAY),
      { match: { purpose: 'intake', promptIncludes: SIDE_ASK }, reply: envelope(SIDE_SAY) },
      {
        match: { purpose: 'intake', promptIncludes: 'bills due' },
        reply: act({
          kind: 'job',
          title: 'Bills',
          plan: [
            { phraseKey: 'read_email', slots: {}, route: 'api' },
            { phraseKey: 'look_for', slots: { what: 'bills' }, route: 'api' },
          ],
          estimate: { minutes: 1 },
          routeHint: ['api'],
          needsApps: [],
        }),
      },
      { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: 600_000, once: false },
    ],
  });
  await settleSeededJobs(page, await openWorld(app, page));
  await setTheme(page, 'light');
  await openChat(page, 'foo');
  await settle(page);

  // 1. "foo read:".
  await send(page, BOOK);
  await showUp(page, page.getByTestId(TID.bubbleFoo).filter({ hasText: 'a table at Toit' }));
  await toNewest(page);
  const line = page.getByTestId(TID.bubbleReadLine);
  await line.waitFor();
  v.note(`read line: "${await line.textContent()}"`);
  v.note(`read line Narrator: "${await line.getAttribute('aria-label')}"`);
  await settle(page);
  await v.shot('read-line');
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('read-line');
  await setTheme(page, 'light');

  // 2. Ask about this while a job runs.
  await send(page, 'what is my loan EMI');
  await showUp(page, page.getByTestId(TID.bubbleFoo).filter({ hasText: EMI_SAY }));
  await send(page, 'Find my bills due this week');
  await page.waitForTimeout(1500);
  await toNewest(page);
  const answer = page.getByTestId(TID.bubbleFoo).filter({ hasText: EMI_SAY }).last();
  await answer.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode()))
      if (node.textContent?.includes('EMI')) {
        const at = node.textContent.indexOf('EMI');
        const r = document.createRange();
        r.setStart(node, at);
        r.setEnd(node, at + 3);
        document.getSelection()!.removeAllRanges();
        document.getSelection()!.addRange(r);
        return;
      }
  });
  const pill = page.getByTestId(TID.bubbleAskPill);
  await pill.waitFor();
  await v.shot('ask-pill');
  await pill.click();
  const strip = page.getByTestId(TID.composerSideStrip);
  await strip.waitFor();
  v.note(`side strip: "${(await strip.innerText()).replace(/\s+/g, ' ').trim()}"`);
  await v.shot('side-strip');
  await send(page, SIDE_ASK);
  await showUp(page, page.getByTestId(TID.bubbleFoo).filter({ hasText: SIDE_SAY }));
  await toNewest(page);
  const all = v.fakeTurns() as FakeTurn[];
  const turns = all.filter((x) => x.purpose === 'intake');
  if (!turns.at(-1)?.prompt.includes('> EMI\n')) throw new Error('the side question did not carry the picked words');
  v.note(
    `side question answered: "${SIDE_SAY}"; intake turns ${turns.length}, step turns ${all.filter((x) => x.purpose === 'step').length}; the AI got the picked words "> EMI"`,
  );
  const doing = await page
    .getByTestId(TID.bubbleMe)
    .filter({ hasText: 'Find my bills due this week' })
    .last()
    .locator('xpath=..')
    .getByTestId(TID.bubbleBadge)
    .getAttribute('data-state');
  if (doing !== 'working') throw new Error(`the job is not working after the side question: ${doing}`);
  v.note(`job badge after the side question: ${doing}`);
  await settle(page);
  await v.shot('side-answer');

  // 3. A 14,200-character paste becomes a file chip.
  await page.getByTestId(TID.composerField).evaluate(
    (el, s) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', s);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    'the quick brown fox jumps over the lazy dog '.repeat(323).slice(0, 14_200),
  );
  const chip = page.getByTestId(TID.composerChip);
  await chip.waitFor();
  v.note(`14,200-character paste → chip "${(await chip.innerText()).replace(/\s+/g, ' ').trim()}"`);
  await settle(page);
  await v.shot('paste-file-chip');
}
