// Spec: Vikas 2026-10-26 (independent QA: every defect gets a regression test the builder did not write); findings in
// /mnt/project-files/foo/qa-explore/2026-10-26/findings.md; the spec rows each check cites. One test per defect found by
// using the running batch-1 app. Each asserts what a user should see, so it is RED until the defect is fixed and then
// guards it for good. Never relax an assertion here to get green: fix the app, or change the spec through a CR.
import { expect, test, type Page } from '@playwright/test';
import { TID } from '../../src/shared/testids';
import { finishSetup, open, say, send, turns, type World } from './world';

let w: World | undefined;
test.afterEach(async () => {
  await w?.stop();
  w = undefined;
});

// A wide answer (a table) fills the bubble's max width, which is where the hover toolbar runs out of room.
const TABLE = '| Plan | Price | Data |\n|---|---|---|\n| Airtel | ₹649 | 75 GB |\n| Jio | ₹599 | 60 GB |';
const lastFoo = (p: Page) => p.getByTestId(TID.bubbleFoo).last();
async function hover(p: Page, loc: ReturnType<Page['locator']>) {
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const b = (await loc.boundingBox())!;
  await p.mouse.move(b.x + 30, b.y + 15);
  await p.waitForTimeout(500);
}

test('QA-X-F06 · Open profile never shows a blank screen (06-2 foo profile; batch-1 hides what is not built)', async () => {
  w = await open([], { firstRun: true });
  await finishSetup(w.page);
  await w.page.getByTestId(TID.chatHeaderAvatar).click();
  await w.page.waitForTimeout(800);
  const profile = w.page.getByTestId(TID.screenFooProfile);
  if (await profile.count()) expect((await profile.innerText()).trim().length, 'profile screen has content').toBeGreaterThan(20);
});

test('QA-X-F14 · the talk style picked in setup reaches the AI (08-4 {vibeLine})', async () => {
  w = await open([say('QAX-F14', 'Okay.')], { firstRun: true });
  await finishSetup(w.page, { name: 'Asha', face: 1, vibe: 2 });
  await send(w.page, 'QAX-F14 hello');
  const t = turns(w)
    .filter((x) => x.purpose === 'intake')
    .pop()!;
  expect(t.system ?? '', 'system line carries the chosen style').not.toContain('Vibe:  .');
  expect(t.system ?? '').toMatch(/Vibe: \S/);
});

test('QA-X-F07 · every Settings page a user can open has content (Keyboard shortcuts, About)', async () => {
  w = await open([], { firstRun: true });
  await finishSetup(w.page);
  await w.page.getByTestId(TID.sidebarFooterSettings).click();
  for (const nav of [TID.settingsNavShortcuts, TID.settingsNavAbout]) {
    const item = w.page.getByTestId(nav);
    if (!(await item.count())) continue;
    await item.click();
    await w.page.waitForTimeout(400);
    const navText = (await w.page.locator('[data-testid^="settings-nav-"]').allInnerTexts()).join('');
    const body = (await w.page.getByTestId(TID.screenSettings).innerText()).replace(/\s+/g, '');
    expect(body.length - navText.replace(/\s+/g, '').length - 'Settings'.length, `${nav} page content`).toBeGreaterThan(40);
  }
});

test('QA-X-F15 · Ctrl+/ shows the keyboard shortcuts, as the ⋯ menu promises', async () => {
  w = await open([], { firstRun: true });
  await finishSetup(w.page);
  const before = await w.page.evaluate(() => document.body.innerText);
  await w.page.keyboard.press('Control+/');
  await w.page.waitForTimeout(800);
  expect(await w.page.evaluate(() => document.body.innerText), 'something new on screen').not.toBe(before);
});

test('QA-X-F08 · an empty message box never shows "Draft:" in the chat list (03-1 §3.4.6 rule 2)', async () => {
  // Seen three times in one long session; not yet isolated to one step, so this walks the same mix of steps.
  w = await open([say('QAX-F08', 'Hi!')], { firstRun: true });
  await finishSetup(w.page, { name: 'Asha', face: 3, vibe: 2 });
  await send(w.page, 'QAX-F08 hello');
  const p = w.page;
  const b = (await lastFoo(p).boundingBox())!;
  await p.mouse.click(b.x + 20, b.y + 10, { button: 'right' });
  await p.getByTestId(TID.bubbleMenuReply).click();
  await p.getByTestId(TID.composerField).fill('reply text');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(1500);
  await p.getByTestId(TID.chatHeaderPrivateToggle).click();
  await p.keyboard.press('Control+f');
  await p.keyboard.type('Hi');
  await p.keyboard.press('Escape');
  await p.getByTestId(TID.composerSend).click();
  await w.page.getByTestId(TID.sidebarFooterSettings).click();
  await w.page.waitForTimeout(600);
  await expect(w.page.getByTestId(TID.chatlistRow).first()).not.toContainText('Draft:');
});

test('QA-X-F05 · the hover 😊 and ⋯ of a full-width answer are inside the chat and clickable (04 §9.2)', async () => {
  w = await open([say('QAX-F05', TABLE)], { firstRun: true });
  await finishSetup(w.page);
  await send(w.page, 'QAX-F05 long please');
  await hover(w.page, lastFoo(w.page));
  const pane = (await w.page.getByTestId(TID.threadLog).boundingBox())!;
  const shown = (await w.page.evaluate(() => window.__qa.controls())).filter((c) => /^bubble-toolbar-(react|more)$/.test(c.tid));
  const bubble = (await lastFoo(w.page).boundingBox())!;
  const mine = shown.filter((c) => Math.abs(c.box[1]! - bubble.y) < 60);
  expect(mine.map((c) => c.tid).sort(), 'React and ⋯ shown beside the hovered answer').toEqual([
    TID.bubbleToolbarMore,
    TID.bubbleToolbarReact,
  ]);
  for (const c of mine) {
    expect(c.box[0]! + c.box[2]!, `${c.tid} inside the chat pane`).toBeLessThanOrEqual(pane.x + pane.width);
    const hit = await w.page.evaluate(
      ([x, y]) => (document.elementFromPoint(x!, y!)?.closest('[data-testid]') as HTMLElement | null)?.dataset.testid,
      [c.box[0]! + c.box[2]! / 2, c.box[1]! + c.box[3]! / 2],
    );
    expect(hit, `${c.tid} is what the pointer hits`).toBe(c.tid);
  }
});

test('QA-X-F04 · an answer’s action row never covers the next bubble’s words (04 §17.1)', async () => {
  w = await open([], { firstRun: true });
  await finishSetup(w.page, { name: 'Asha', face: 1, vibe: 2 });
  const bubbles = w.page.getByTestId(TID.bubbleFoo);
  for (let i = 0; i < (await bubbles.count()); i++) {
    await hover(w.page, bubbles.nth(i));
    const covered = await w.page.evaluate(() =>
      window.__qa.invariants().filter((x) => x.kind === 'text-covered' || x.kind === 'control-covered'),
    );
    expect(covered, `bubble ${i}`).toEqual([]);
  }
});

test('QA-X-F12 · Try again on an answer asks the AI again and replaces the answer (04 §17.1)', async () => {
  w = await open([say('QAX-F12', 'Version one.'), say('QAX-F12', 'Version two.')], { firstRun: true });
  await finishSetup(w.page);
  await send(w.page, 'QAX-F12 answer me');
  const asked = turns(w).length;
  await hover(w.page, lastFoo(w.page));
  await w.page.getByTestId(TID.bubbleActionsRetry).last().click();
  await w.page.waitForTimeout(3_000);
  expect(turns(w).length, 'a new AI request').toBeGreaterThan(asked);
  await expect(lastFoo(w.page)).toContainText('Version two.');
});

test('QA-X-F03 · the face picked in setup keeps its colour in the header (06-1 §2.3 Card 2b)', async () => {
  w = await open([], { firstRun: true });
  await finishSetup(w.page, { name: 'Asha', face: 3, vibe: 1 });
  const bg = await w.page.getByTestId(TID.chatHeaderAvatar).evaluate((e) => {
    const a = e.querySelector('[data-mood]') ?? e;
    return getComputedStyle(a).backgroundColor;
  });
  const [r, g, b] = (bg.match(/\d+/g) ?? []).map(Number);
  expect(g! > r! && g! > b!, `face 3 is green, header avatar is ${bg}`).toBe(true);
});

test('QA-X-F20 · editing your last message tells the AI (04 Edit: "The user changed their message to")', async () => {
  w = await open([say('QAX-F20', 'First answer.')], { firstRun: true });
  await finishSetup(w.page);
  await send(w.page, 'QAX-F20 what is 2+2');
  const asked = turns(w).length;
  const me = w.page.getByTestId(TID.bubbleMe).last();
  const b = (await me.boundingBox())!;
  await w.page.mouse.click(b.x + 20, b.y + 10, { button: 'right' });
  await w.page.getByTestId(TID.bubbleMenuEdit).click();
  await w.page.keyboard.press('Control+A');
  await w.page.keyboard.type('what is 3+3');
  await w.page.keyboard.press('Enter');
  await w.page.waitForTimeout(3_000);
  expect(turns(w).length, 'the AI hears about the change').toBeGreaterThan(asked);
});

// F02 withdrawn 26 Oct: 06-1 §2.3 says a name over 20 keeps the first 20 AND shows the field error, which the app does.
// This checks that rule instead (QA's earlier expectation contradicted the spec).
test('QA-X-N02 · a name over 20 letters keeps the first 20 and shows the field error (06-1 §2.3)', async () => {
  w = await open([], { firstRun: true });
  await w.page.getByTestId(TID.setupWelcomeStart).click();
  await w.page.getByTestId(TID.setupAiUse).click({ timeout: 20_000 });
  await w.page.getByTestId(TID.setupNameField).fill('Shri Venkateswara Balaji Narasimha');
  expect(await w.page.getByTestId(TID.setupNameField).inputValue()).toBe('Shri Venkateswara Ba');
  await expect(w.page.getByText(/under 20 letters/)).toBeVisible();
});

test('QA-X-F16 · 👍 on an answer is still on after a restart (04 §17.2 "saved on this PC")', async () => {
  w = await open([say('QAX-F16', 'Nice answer.')], { firstRun: true });
  await finishSetup(w.page);
  await send(w.page, 'QAX-F16 hi');
  await hover(w.page, lastFoo(w.page));
  await w.page.getByTestId(TID.bubbleActionsGood).last().click();
  await expect(w.page.getByTestId(TID.bubbleActionsGood).last()).toHaveAttribute('aria-pressed', 'true');
  const first = w;
  await first.stop();
  w = await open([], { reuse: first });
  await hover(w.page, lastFoo(w.page));
  await expect(w.page.getByTestId(TID.bubbleActionsGood).last()).toHaveAttribute('aria-pressed', 'true');
});

test('QA-X-F24 · the chat-list preview never shows raw table markdown (03-1 §3.4.6 preview line)', async () => {
  w = await open([say('QAX-F24', TABLE)], { firstRun: true });
  await finishSetup(w.page);
  await send(w.page, 'QAX-F24 compare plans');
  await expect(w.page.getByTestId(TID.chatlistRow).first()).not.toContainText('|---|');
});
