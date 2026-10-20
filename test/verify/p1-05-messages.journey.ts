// Spec: 02 §F7.1 "Chat" (CR-0021, X-179), 10-acceptance-2 §C.8 AT-324 (message details animate at Full, fade at Basic, are
// still at Off).
// foo-verify journey for P1 T5, real app on the seeded world with the fake AI: send (your bubble grows from the send
// button), receive a streamed reply (words fade in), copy its code (icon → ✓), react (picker springs, the reaction bounces
// once), jump to a message from a reply quote (the row glows), fail and retry a reply (shake once, spinner → ✓). Pictures are
// taken with motion off (foo-verify); the notes record each detail's computed animation at that moment.
// Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/p1-05-messages.journey.ts
import type { Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { intake } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { byTid, openChat, openWorld, setTheme, settle } from '../fidelity/capture';

const HOLD_MS = 1500;
const ACT = `<act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`;

const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);
const rowOf = (page: Page, has: Locator) => page.locator(`${byTid(TID.threadLog)} [data-message-id]`).filter({ has });

async function showUp(page: Page, loc: Locator) {
  for (let i = 0; i < 60 && (await loc.count()) === 0; i++) {
    await advance(page, HOLD_MS + 100);
    await page.waitForTimeout(500);
  }
  await loc.first().waitFor();
}

function anim(loc: Locator, sel?: string) {
  return loc.evaluate((el, s) => {
    const target = (s ? el.querySelector(s) : el) as HTMLElement | null;
    if (!target) return 'none';
    const cs = getComputedStyle(target);
    return `${cs.animationName} ${cs.animationDuration} ${cs.animationTimingFunction.slice(0, 12)}`;
  }, sel);
}

async function send(page: Page, text: string): Promise<Locator> {
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  const bubble = page.getByTestId(TID.bubbleMe).filter({ hasText: text });
  await bubble.waitFor();
  return rowOf(page, bubble);
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({
    fakeAi: [
      {
        match: { purpose: 'intake', promptIncludes: 'build it' },
        chunks: [
          { text: '<say>Run this in the project folder. ' },
          { text: 'It takes about a minute:\n\n```bash\nnpm run build\n```</say>\n' + ACT, delayMs: 20_000 },
        ],
      },
      intake('train times', '', { error: 'AI_TIMEOUT' }),
      intake('train times', 'The 7:10 AM Deccan Queen gets to Mumbai by 10:25 AM.'),
    ],
  });
  // The seeded jobs settle first, as the e2e runs do: a live job in foo's chat would take each message as a steer.
  await settleSeededJobs(page, await openWorld(app, page));
  await setTheme(page, 'light');
  await page.evaluate(() => (document.documentElement.dataset.motion = 'full'));
  await openChat(page, 'foo');
  await settle(page);
  await v.shot('before');

  // 1. Send: the user's row grows from the send button with the spring.
  const mine = await send(page, 'how do I build it?');
  v.note(`sent: data-new=${await mine.getAttribute('data-new')}, animation ${await anim(mine, ':scope > div')}`);

  // 2. A streamed reply: the words that just came in fade (150ms linear).
  const reply = page.getByTestId(TID.bubbleFoo).filter({ hasText: 'Run this in the project folder.' });
  await showUp(page, reply);
  v.note(
    `streaming: state=${await reply.getAttribute('data-state')}, newest words ${await anim(reply.locator('span[class*="wordIn"]').last())}`,
  );
  await v.shot('streaming');
  await advance(page, 20_000);
  await reply.filter({ hasText: 'npm run build' }).waitFor();
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.getAttribute('data-state') === 'complete',
    `${byTid(TID.bubbleFoo)}:has(${byTid(TID.bubbleCode)})`,
  );

  // 3. Copy the code: the icon turns into ✓ with the spring.
  const copy = reply.getByTestId(TID.bubbleCodeCopy);
  await copy.click();
  await copy.filter({ hasText: 'Copied' }).waitFor();
  v.note(`code copy: "${(await copy.textContent())?.trim()}", icon ${await anim(copy, 'svg')}`);
  await v.shot('code-copied');

  // 4. React: the picker springs from the bubble; the picked reaction bounces once.
  const replyRow = rowOf(page, reply);
  await reply.click({ button: 'right' });
  await page.getByTestId(TID.bubbleMenuReact).click();
  const picker = page.getByTestId(TID.bubbleReactPicker);
  await picker.waitFor();
  v.note(`picker: ${await anim(picker)}, origin ${await picker.evaluate((el) => el.style.transformOrigin)}`);
  await v.shot('picker');
  await picker.getByTestId(TID.bubbleReactOption).first().click();
  const chip = replyRow.getByTestId(TID.bubbleReaction).first();
  await chip.waitFor();
  v.note(`reaction ${(await chip.textContent())?.trim()}: data-pop=${await chip.getAttribute('data-pop')}, ${await anim(chip)}`);
  await v.shot('reacted');

  // 5. Jump to a message: reply to foo's answer, then click the quote; the original row glows.
  await reply.click({ button: 'right' });
  await page.getByTestId(TID.bubbleMenuReply).click();
  const quoted = await send(page, 'thanks, done');
  await quoted.getByTestId(TID.bubbleQuote).click();
  const glow = replyRow.locator('[data-highlight]');
  await glow.waitFor();
  v.note(`jump: highlight on, background ${await glow.evaluate((el) => getComputedStyle(el).transitionDuration)}`);
  await v.shot('jump-glow');
  await page.waitForTimeout(2_200);
  v.note(`jump: highlight after hold = ${await replyRow.locator('[data-highlight]').count()}`);

  // 6. A failed reply shakes once (no red flash); Try again spins, then turns into ✓.
  await send(page, 'train times to Mumbai?');
  const cut = page.locator(`${byTid(TID.bubbleFoo)}[data-state="failed"]`).last();
  await showUp(page, cut);
  const cutRow = rowOf(page, cut).last();
  v.note(`cut off: shake ${await anim(cutRow.locator('[data-shake]'))}`);
  await v.shot('cut-off');
  await cut.getByTestId(TID.bubbleErrorRetry).click();
  const retry = cutRow.getByTestId(TID.bubbleErrorRetry);
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.getAttribute('data-state') === 'done',
    `${byTid(TID.bubbleErrorRetry)}[data-state]`,
  );
  v.note(`retry: state=${await retry.getAttribute('data-state')}`);
  await showUp(page, page.getByTestId(TID.bubbleFoo).filter({ hasText: 'Deccan Queen' }));
  await settle(page);
  await v.shot('retried');

  // 7. Basic and Off: the same rise is a fade, then a still 83ms fade.
  for (const level of ['basic', 'off'] as const) {
    await page.evaluate((l) => (document.documentElement.dataset.motion = l), level);
    const r = await send(page, `checking ${level}`);
    const move = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim());
    v.note(`${level}: rise ${await anim(r, ':scope > div')}, --motion-move ${move}`);
  }
  await v.shot('after');
}
