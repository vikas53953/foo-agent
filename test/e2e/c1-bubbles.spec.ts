// Spec: 10-acceptance-2 §C.10 AT-421 (a 👎 chip on a reply whose last line ends near the left edge never overlaps the text;
// the next row sits 24px below), AT-427 (a 3-paragraph chat-mode reply of ≤ 600 characters is one bubble with one time),
// AT-428 (foo's chat and a helper's chat show the face and name above the first bubble of each output run), AT-429 (dark
// user bubble #2C359A, light #0B0B10). 04 §8 anchor (`bottom: -18px`), §1.2 rhythm row (24px under a reaction chip), §12.3
// (chat mode: one bubble, paragraphs 8px apart inside), §12.4 (sender label), 02 F2 `--bubble-me`; CR-0024 B2, F2, F6; B3 from the real-PC run (04 §1.6,
// 03-shell-2 §3.6.4: a list at the bottom stays pinned within 15px when the chips or a taller composer shrink it). Every
// reply comes from the fake AI (FOO_FAKE_AI, 08-3 §22.3); no test reaches a real AI or the network.
import { expect, test, type Locator, type Page } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { intake, launchWithFakeAi, type FakeLine } from './fakeAi';
import { settleSeededJobs } from './m4-start';
import { typeInComposer } from './typeInComposer';

const byTid = (id: string) => `[data-testid="${id}"]`;
/** The engine's hold before a reply streams (08-4 §25.5 item 2). */
const HOLD_MS = 1500;

/** Three short paragraphs, the last one a single word that ends near the left edge (Vikas's "so." screenshot). */
const THREE = [
  'The train to Pune leaves at 7:10 from Dadar and gets in by 10:45.',
  'I kept the window seat you like and the ticket is in your email.',
  'So.',
];

async function start(lines: FakeLine[]) {
  const { app } = await launchWithFakeAi(lines);
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const { refs } = await page.evaluate(() => window.__fooTest!.seed('ux-world'));
  await expect(page.getByTestId(TID.chatlistRow).first()).toBeVisible();
  await settleSeededJobs(page, refs);
  // The helpers slice loads with the bootstrap (store/apply.ts loadHelpers), before the seed: reload so names are known.
  await page.reload();
  await expect(page.getByTestId(TID.chatlistRow).first()).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800));
  await page.waitForFunction(() => window.innerWidth === 1280);
  return { app, page };
}

async function openChat(page: Page, name: string) {
  await page
    .getByTestId(TID.chatlistRow)
    .filter({ has: page.getByTestId(TID.chatlistRowName).getByText(name, { exact: true }) })
    .first()
    .click();
  await expect(page.getByTestId(TID.chatHeaderName)).toContainText(name);
  await expect(page.getByTestId(TID.composerField)).toBeVisible();
}

const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

/** Sends `text` and waits for foo's answer to it (the turn starts on the engine's clock); returns the answer's row. */
async function ask(page: Page, text: string, answer: string): Promise<{ me: Locator; reply: Locator }> {
  const field = page.getByTestId(TID.composerField);
  await expect(field).toHaveAttribute('contenteditable', 'true', { timeout: 15_000 });
  await typeInComposer(page, text);
  await page.keyboard.press('Enter');
  const me = page
    .locator(`${byTid(TID.threadLog)} [data-message-id]`)
    .filter({ has: page.getByTestId(TID.bubbleMe).filter({ hasText: text }) });
  await expect(me).toBeVisible();
  const first = answer.split('\n')[0]!;
  const reply = page
    .locator(`${byTid(TID.threadLog)} [data-message-id]`)
    .filter({ has: page.getByTestId(TID.bubbleFoo).filter({ hasText: first }) });
  await expect
    .poll(async () => {
      await advance(page, HOLD_MS + 100);
      return reply.count();
    })
    .toBeGreaterThan(0);
  await expect(reply.last()).toBeVisible();
  return { me, reply: reply.last() };
}

const rect = (l: Locator) => l.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);

test('AT-427 · a 3-paragraph chat-mode reply of ≤ 600 characters is one bubble with one time', async () => {
  const text = THREE.join('\n\n');
  expect(text.length).toBeLessThanOrEqual(600);
  const { app, page } = await start([intake('train to Pune', text)]);
  await openChat(page, 'foo');
  const { reply } = await ask(page, 'when is the train to Pune', text);
  const id = await reply.getAttribute('data-message-id');
  const bubbles = page.locator(`${byTid(TID.threadLog)} [data-message-id="${id}"] ${byTid(TID.bubbleFoo)}`);
  await expect(bubbles).toHaveCount(1);
  // The old renderer showed a 2nd and 3rd bubble 0.8–2.5 s later (04 §12.3 before CR-0024): nothing more arrives.
  await page.waitForTimeout(3_000);
  await expect(bubbles).toHaveCount(1);
  for (const p of THREE) await expect(bubbles).toContainText(p);
  await expect(bubbles.getByTestId(TID.bubbleMeta)).toHaveCount(1);
  // The paragraphs sit 8px apart inside the bubble (04 §12.3, §13 block gap).
  const ps = bubbles.locator('p');
  await expect(ps).toHaveCount(3);
  const [a, b] = [await rect(ps.nth(0)), await rect(ps.nth(1))];
  expect(Math.round(b.top - a.bottom)).toBe(8);
  await app.close();
});

test('AT-428 · foo’s chat and a helper’s chat show the face and name above the first bubble of each output run', async () => {
  const { app, page } = await start([intake('train to Pune', THREE.join('\n\n'))]);
  await openChat(page, 'foo');
  const { me, reply } = await ask(page, 'when is the train to Pune', THREE.join('\n\n'));
  const label = reply.getByTestId(TID.bubbleSender);
  await expect(label).toHaveCount(1);
  await expect(label).toContainText('foo');
  await expect(label.locator(':scope > :first-child')).toBeVisible();
  // The label sits above the bubble, 4px clear of it; the user's own bubble has none.
  const [l, bub] = [await rect(label), await rect(reply.getByTestId(TID.bubbleFoo))];
  expect(Math.round(bub.top - l.bottom)).toBe(4);
  await expect(me.getByTestId(TID.bubbleSender)).toHaveCount(0);

  await openChat(page, 'Trips');
  const log = page.getByTestId(TID.threadLog);
  const runs = log.locator('[data-message-id]').filter({ has: page.getByTestId(TID.bubbleHelper) });
  await expect(runs.last()).toBeVisible();
  const labels = log.getByTestId(TID.bubbleSender);
  await expect(labels.first()).toBeVisible();
  await expect(labels.first()).toContainText('Trips');
  // One label per output run: never on a bubble that continues a run (data-pos middle / last).
  const counts = await log.locator('[data-message-id]').evaluateAll(
    (rows, ids) => {
      let labelled = 0;
      let firsts = 0;
      for (const r of rows) {
        const helper = r.querySelector(`[data-testid="${ids.helper}"]`);
        if (!helper) continue;
        const pos = helper.getAttribute('data-pos');
        if (pos === 'first' || pos === 'single') firsts++;
        if (r.querySelector(`[data-testid="${ids.sender}"]`)) labelled++;
      }
      return { labelled, firsts };
    },
    { helper: TID.bubbleHelper, sender: TID.bubbleSender },
  );
  expect(counts.firsts).toBeGreaterThan(0);
  expect(counts.labelled).toBe(counts.firsts);
  await app.close();
});

test('AT-421 · a 👎 on a reply whose last line ends near the left edge never overlaps the text; the next row sits 24px below', async () => {
  const text = THREE.join('\n\n');
  const { app, page } = await start([intake('train to Pune', text), intake('thanks, and the return', 'The return is on Sunday at 18:05.')]);
  await openChat(page, 'foo');
  const { reply } = await ask(page, 'when is the train to Pune', text);
  const id = (await reply.getAttribute('data-message-id'))!;
  const { me: next } = await ask(page, 'thanks, and the return', 'The return is on Sunday at 18:05.');
  await page.evaluate((m) => window.foo.invoke('message:react', { messageId: m, emoji: '👎', on: true }), id);
  const row = page.locator(`${byTid(TID.threadLog)} [data-message-id="${id}"]`);
  const chip = row.getByTestId(TID.bubbleReaction).first();
  await expect(chip).toContainText('👎');
  await page.mouse.move(1, 1);

  const bubble = row.getByTestId(TID.bubbleFoo);
  // Every line box of the words, against the chip.
  const lines = await bubble.evaluate((el) => {
    const out: DOMRect[] = [];
    for (const p of el.querySelectorAll('p')) {
      const r = document.createRange();
      r.selectNodeContents(p);
      for (const box of r.getClientRects()) out.push(box.toJSON() as DOMRect);
    }
    return out;
  });
  expect(lines.length).toBeGreaterThan(0);
  const c = await rect(chip);
  const overlaps = lines.filter((b) => b.left < c.right && b.right > c.left && b.top < c.bottom && b.bottom > c.top);
  expect(overlaps).toEqual([]);
  // 04 §8: the chip hangs 18px below the bubble's bottom edge, 8px left of it.
  const bb = await rect(bubble);
  expect(Math.round(c.bottom - bb.bottom)).toBe(18);
  // 04 §1.2: the next row's bubble starts 24px below the bubble that carries the chip.
  const nb = await rect(next.getByTestId(TID.bubbleMe));
  expect(Math.round(nb.top - bb.bottom)).toBe(24);
  await app.close();
});

test('AT-429 · the dark theme user bubble is #2C359A; light stays #0B0B10', async () => {
  const { app, page } = await start([]);
  await openChat(page, 'foo');
  const mine = page.getByTestId(TID.bubbleMe).last();
  await expect(mine).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await mine.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(11, 11, 16)');
  await page.evaluate(() => (window as unknown as { __fooTest: { theme(t: string): Promise<unknown> } }).__fooTest.theme('dark'));
  // As m1-shell-main.spec.ts: Linux has no desktop theme bridge, so the media query is emulated there.
  if (process.platform !== 'win32') await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await mine.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(44, 53, 154)');
  await app.close();
});

test('B3 · when the suggestion chips appear under a reply, the newest bubble stays in view (04 §1.6)', async () => {
  // A streamed reply (as a real AI answers): the bubble fills, then on completion the Suggestions line leaves it and the
  // chips appear above the composer, so the list's viewport shrinks after the list followed the reply.
  const act = `<act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`;
  const first = 'Toit has a table for 4 on Fri at 7 PM.';
  const { app, page } = await start([
    {
      match: { purpose: 'intake', promptIncludes: 'table for Friday' },
      chunks: [
        { text: `<say>${first} ` },
        { text: `It is quiet there after 8.\nSuggestions: Book it | Other places</say>\n${act}`, delayMs: 20_000 },
      ],
    },
  ]);
  await openChat(page, 'foo');
  const { reply } = await ask(page, 'a table for Friday', first);
  await advance(page, 20_000);
  await expect(reply.getByTestId(TID.bubbleFoo)).toContainText('quiet there');
  await expect(page.getByTestId(TID.composerSuggestionChip).first()).toBeVisible();
  const log = page.getByTestId(TID.threadLog);
  // The chips are in; give the list a few frames (it must not need more), then the reply must be fully on screen.
  const pinned = async () => {
    await page.waitForTimeout(500);
    const [l, b] = [await rect(log), await rect(reply.getByTestId(TID.bubbleFoo))];
    expect(b.bottom).toBeLessThanOrEqual(l.bottom);
    // Still pinned to the bottom (04 §1.6 / X-152: within 15px).
    expect(await log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(15);
  };
  await pinned();
  // The same cause without the chips: the composer grows by three lines, so the list's viewport shrinks again.
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type('and');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+Enter');
  await pinned();
  await app.close();
});

test('X-216 · an older answer has no action row: hovering it moves nothing and covers nothing', async () => {
  const text = THREE.join('\n\n');
  const { app, page } = await start([intake('train to Pune', text), intake('thanks, and the return', 'The return is on Sunday at 18:05.')]);
  await openChat(page, 'foo');
  const { reply } = await ask(page, 'when is the train to Pune', text);
  const { me: next } = await ask(page, 'thanks, and the return', 'The return is on Sunday at 18:05.');
  await page.mouse.move(1, 1);
  const bubble = reply.getByTestId(TID.bubbleFoo);
  // At rest: 04 §1.2, 12px to the next run.
  const before = await rect(next.getByTestId(TID.bubbleMe));
  expect(Math.round(before.top - (await rect(bubble)).bottom)).toBe(12);
  // Hover: no action row appears under the older answer, and the next row stays where it was (CR-0059 row 2).
  await bubble.hover();
  await expect(reply.getByTestId(TID.bubbleActionsCopy)).toHaveCount(0);
  const after = await rect(next.getByTestId(TID.bubbleMe));
  expect(after.top).toBe(before.top);
  await app.close();
});
