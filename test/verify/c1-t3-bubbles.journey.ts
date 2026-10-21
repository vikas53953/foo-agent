// Spec: 10-acceptance-2 §C.10 AT-421, AT-427, AT-428, AT-429; 04 §8 (chip anchor bottom −18px), §1.2 (24px under a chip),
// §12.3 (one bubble, paragraphs 8px apart), §12.4 (sender label in foo's own chat); 02 F2 `--bubble-me`; CR-0024 B2, F2, F6.
// foo-verify journey for C1 T3, real app on the seeded world with the fake AI: ask foo something, get a 3-paragraph reply
// whose last line is one short word, react 👎 to it through the picker, send the next message, and check: one bubble with
// one time, foo's face and name above it, the chip clear of the words and the next row 24px below; light and dark.
// B3 (real-PC run): suggestion chips under a reply, then a taller composer, and the newest bubble stays in view.
// Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/c1-t3-bubbles.journey.ts
import type { Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { intake } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const HOLD_MS = 1500;
const ASK = 'when is the train to Pune';
const THREE = [
  'The train to Pune leaves at 7:10 from Dadar and gets in by 10:45.',
  'I kept the window seat you like and the ticket is in your email.',
  'So.',
];
const NEXT = 'thanks, and the return';
const NEXT_ANSWER = 'The return is on Sunday at 18:05.';
const TABLE = 'a table for Friday';
const TABLE_ANSWER = 'Toit has a table for 4 on Fri at 7 PM.';

const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);
const rowOf = (page: Page, has: Locator) => page.locator(`${byTid(TID.threadLog)} [data-message-id]`).filter({ has });
const box = (l: Locator) => l.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);

async function showUp(page: Page, loc: Locator) {
  for (let i = 0; i < 60 && (await loc.count()) === 0; i++) {
    await advance(page, HOLD_MS + 100);
    await page.waitForTimeout(300);
  }
  await loc.first().waitFor();
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
  // Every check runs and every picture is taken (the "before" build fails several); the journey fails at the end.
  const problems: string[] = [];
  const check = (ok: boolean, why: string) => ok || problems.push(why);
  const { app, page } = await v.launch({
    fakeAi: [
      intake(ASK, THREE.join('\n\n')),
      intake(NEXT, NEXT_ANSWER),
      intake(TABLE, `${TABLE_ANSWER}\nSuggestions: Book it | Other places`),
    ],
  });
  await settleSeededJobs(page, await openWorld(app, page));
  // The helpers slice loads with the bootstrap, before the seed: reload so every name is known.
  await page.reload();
  await page.getByTestId(TID.chatlistRow).first().waitFor();
  await setTheme(page, 'light');
  await openChat(page, 'foo');
  await rest(page);
  await settle(page);
  await v.shot('foo-chat-open');

  // 1. A 3-paragraph reply: one bubble, one time, even after the old 0.8–2.5 s pacing would have added more.
  await send(page, ASK);
  const reply = page.getByTestId(TID.bubbleFoo).filter({ hasText: THREE[0]! });
  await showUp(page, reply);
  const replyRow = rowOf(page, reply);
  await page.waitForTimeout(3_000);
  await settle(page);
  await v.shot('three-paragraph-reply');
  // Every row of this message: the old renderer gave each part its own row with the same message id.
  const parts = page.locator(`${byTid(TID.threadLog)} [data-message-id="${await replyRow.getAttribute('data-message-id')}"]`);
  const bubbles = await parts.getByTestId(TID.bubbleFoo).count();
  const times = await parts.getByTestId(TID.bubbleMeta).count();
  v.note(`AT-427: the reply shows as ${bubbles} bubble(s) with ${times} time(s)`);
  check(bubbles === 1 && times === 1, `expected one bubble with one time, got ${bubbles} / ${times}`);
  const ps = parts.locator('p');
  const gap = Math.round((await box(ps.nth(1))).top - (await box(ps.nth(0))).bottom);
  v.note(`AT-427: ${await ps.count()} paragraphs inside, ${gap}px apart`);
  check(gap === 8, `paragraph gap ${gap}px, spec 8px`);

  // 2. foo's face and name sit above the first bubble of the run (AT-428); my bubble carries none.
  const label = replyRow.getByTestId(TID.bubbleSender);
  const name = (await label.count()) ? (await label.textContent())?.trim() : '';
  v.note(
    `AT-428: label above the reply reads "${name}"; my bubble has ${await rowOf(
      page,
      page.getByTestId(TID.bubbleMe).filter({ hasText: ASK }),
    )
      .getByTestId(TID.bubbleSender)
      .count()} labels`,
  );
  check(!!name, 'no sender label above foo’s reply');

  // 3. The next message, then 👎 on the reply through the picker (AT-421).
  const next = await send(page, NEXT);
  await showUp(page, page.getByTestId(TID.bubbleFoo).filter({ hasText: NEXT_ANSWER }));
  await reply.click({ button: 'right' });
  await page.getByTestId(TID.bubbleMenuReact).click();
  const picker = page.getByTestId(TID.bubbleReactPicker);
  await picker.waitFor();
  await picker.getByTestId(TID.bubbleReactOption).filter({ hasText: '👎' }).click();
  const chip = parts.getByTestId(TID.bubbleReaction).first();
  // The bubble the chip hangs from (the old renderer hung it on the last part).
  const hung = parts.getByTestId(TID.bubbleFoo).last();
  await chip.waitFor();
  await page.mouse.move(1, 1);
  await rest(page);
  await settle(page);

  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await settle(page);
    const lines = await hung.evaluate((el) => {
      const out: DOMRect[] = [];
      for (const p of el.querySelectorAll('p')) {
        const r = document.createRange();
        r.selectNodeContents(p);
        for (const b of r.getClientRects()) out.push(b.toJSON() as DOMRect);
      }
      return out;
    });
    const c = await box(chip);
    const bb = await box(hung);
    const hit = lines.filter((b) => b.left < c.right && b.right > c.left && b.top < c.bottom && b.bottom > c.top).length;
    const below = Math.round(c.bottom - bb.bottom);
    const nextGap = Math.round((await box(next.getByTestId(TID.bubbleMe))).top - bb.bottom);
    v.note(`AT-421 (${theme}): chip covers ${hit} line(s) of words; hangs ${below}px below the bubble; next row ${nextGap}px below`);
    check(hit === 0 && below === 18 && nextGap === 24, `${theme}: chip ${hit} / ${below}px / next ${nextGap}px`);
    const fill = await next.getByTestId(TID.bubbleMe).evaluate((el) => getComputedStyle(el).backgroundColor);
    v.note(`AT-429 (${theme}): my bubble is ${fill}`);
    const want = theme === 'dark' ? 'rgb(44, 53, 154)' : 'rgb(11, 11, 16)';
    check(fill === want, `${theme}: my bubble ${fill}, spec ${want}`);
    await v.shot('reply-with-thumbs-down');
  }

  // 4. B3: a reply with suggestion chips, then a taller composer: the list's viewport shrinks and the newest bubble stays
  // in view, pinned within 15px of the end (04 §1.6, X-152).
  await setTheme(page, 'light');
  await send(page, TABLE);
  const table = page.getByTestId(TID.bubbleFoo).filter({ hasText: TABLE_ANSWER });
  await showUp(page, table);
  await page.getByTestId(TID.composerSuggestionChip).first().waitFor();
  const log = page.getByTestId(TID.threadLog);
  for (const step of ['chips shown', 'composer three lines taller'] as const) {
    if (step === 'composer three lines taller') {
      await page.getByTestId(TID.composerField).focus();
      await page.keyboard.type('and');
      for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+Enter');
    }
    await page.waitForTimeout(500);
    const off = await log.evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight));
    const inView = (await box(table)).bottom <= (await box(log)).bottom;
    v.note(`B3 (${step}): newest bubble in view = ${inView}; ${off}px from the end`);
    check(inView && off < 15, `B3 ${step}: in view ${inView}, ${off}px from the end`);
    await settle(page);
    await v.shot(`b3-${step.split(' ')[0]}`);
  }

  if (problems.length) throw new Error(problems.join('; '));
}
