// Spec: 11-fidelity §11.2.3 (one spec per chapter, one test.step per walkthrough step named with its id; the s and f facts by
// hand, then the Tier R capture), 05-3 §5.17 (memory chip: saved, guessed, updated, with Undo), 08-3 §12.4 (post-turn review:
// `add` guessed needs ≥ 2 evidence messages and a reason; `update` supersedes in place), §12.4.2 (R-20 chip placement), §12.2
// (memory file format), 03-shell-2 §3.6.2.1 / §3.7.3.3 ("What I know about you", See all), 06-2 §7.1–§7.5 (Memory page, filters,
// rows, ⋯ menu, Forget + 5 s Undo), 06-3 §14 C-3 / C-4 (count and "stays connected"; typed FORGET), CR-0010 (M6 memory).
// Chapter 18 is drawn on Fri 16 Oct around 12:00 PM. Steps 1, 2 and 6 come from the real engine on the fake AI (08-3 §22.3):
// step 1 is the intake `memory` remember op, step 2 the post-turn review's guessed `add` in Trips, step 6 its `update`. The
// fake reads its script once, at the first AI turn, and a guessed add names its evidence message ids, so the two Trips
// messages are sent while foo is offline (04 §3.3 Waiting to send: stored, no AI turn), their ids read from the window, the
// script written, and the queue drained by going back online.
// M6 builds no Gmail connector (M8): the From Gmail facts of steps 4, 5 and 8 are seeded as data, 23 lines with the `Gmail`
// origin label appended to about-you.md (08-3 §12.2), as is "Lives in Mumbai" for step 6; the watcher indexes them. Mumbai is
// dated Thu 15 Oct so it is among the facts a review is shown (§24.21: ≤ 4,000 chars, most used then newest first).
// Drawing-vs-app gaps (R1/R2 disputes go to a CR, never into code):
// - UX-18-01: the chip reads "I’ll remember: Allergic to peanuts" + Undo (05-3 §5.17.1), with the `Brain` icon, not "🧠".
// - UX-18-02: the drawn "I noticed you pick window seats. Saved · Undo" is §5.17.1's guessed kind "I’ll remember: {fact} · I
//   guessed" + Undo; the fact goes to Trips' notes (helper scope); two user messages are its evidence (§12.3), so the frame
//   holds them above the drawn foo bubble.
// - UX-18-03: the panel's count is the world's own, after steps 1 and 2.
// - UX-18-04 is superseded (06-2 §7.3 ⋯ menu): the page has no People / From WhatsApp chips without such facts, and its
//   forget actions sit in the ⋯ menu, not as buttons under the list.
// - UX-18-05: the ux-world's own guesses ("from your chats") and the 23 seeded Gmail guesses show beside the drawn two.
// - UX-18-06: the chip says "Updated: Lives in Pune (was Lives in Mumbai)" (the fact's own text, §5.17.1).
// - UX-18-07: the 48px undo bar reads "Forgot “Prefers window seats”." + Undo (02-3 §F21.3).
// - UX-18-08 / -09: C-3 / C-4 wording is 06-3 §14's ("Gmail stays connected. I just forget what I learned."; "Cancel").
// - UX-18-10: Notepad is another app and cannot be captured from foo's window. The frame is the nearest real state: the
//   Memory ⋯ menu with "Open the memory folder" (hl); the test reads about-you.md on disk for the drawn lines instead.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {} from '../../../src/shared/ipc';
import { t } from '../../../src/shared/copy/t';
import { TID } from '../../../src/shared/testids';
import type { MemoryFactView } from '../../../src/shared/types';
import { envelope, fakeTurns, launchWithFakeAi, VERIFY_OK, type FakeLine } from '../../e2e/fakeAi';
import { settleSeededJobs } from '../../e2e/m4-start';
import { byTid, captureUx, openChat, openMemory, openWorld, rest, setTheme, settle, step, THEMES, windowSize } from '../capture';

const PEANUTS = 'remember I’m allergic to peanuts';
const PEANUTS_FACT = 'Allergic to peanuts';
const TRIPS_ASK = 'book the Deccan Queen for Sat 24 Oct, 2 seats';
const TRIPS_SEATS = 'window seats, like the last 4 times';
const BOOKED = 'Booked 2 window seats on the Deccan Queen, Sat 24 Oct.';
const SEATS_FACT = 'Picks window seats';
const MOVED = 'actually I moved to Pune';
const MUMBAI = { id: 'f_01929a3e-7c41-7d2a-9b1e-3f5a2c8d4e81', text: 'Lives in Mumbai' };
const PUNE = 'Lives in Pune';
const FORGOTTEN = 'Prefers window seats';
const GMAIL_GUESS = 'Mom’s birthday is Sun 18 Oct';
/** 23 facts learned from Gmail (the drawn "Forget 23 things I learned from your Gmail?"); M8 learns them for real. */
const GMAIL = [
  GMAIL_GUESS,
  'Flies IndiGo for work trips',
  'Netflix renews on the 3rd',
  'Electricity bill comes from BESCOM',
  'Orders from Swiggy most Fridays',
  'Has an Amazon Prime membership',
  'Car insurance renews in March',
  'Gets the Hindu newspaper e-paper',
  'Books cabs with Uber',
  'Car service is due in November',
  'Dentist is Dr Rao in Indiranagar',
  'Gym membership is at Cult',
  'Pays rent to Rakesh Sharma',
  'Landlord is Rakesh Sharma',
  'Kids’ school fees are due in June',
  'Spotify family plan',
  'Shops for clothes on Myntra',
  'Books movies on BookMyShow',
  'Goa stay is at the Taj Holiday Village',
  'Uses DigiLocker for documents',
  'Broadband plan is Airtel 200 Mbps',
  'Buys books on Kindle',
  'Phone is an iPhone 15',
];
const gmailLine = (text: string, i: number) =>
  `- ${text}  {I guessed · 2026-10-09 · Gmail · from your Gmail · fact · f_01929b00-0000-7000-8000-${(i + 1).toString(16).padStart(12, '0')}}`;

const intakeMemory = (text: string) =>
  `<say></say><act>${JSON.stringify({ decision: { kind: 'memory', op: 'remember', text }, usedMemoryIds: [] })}</act>`;
const reviewAct = (ops: unknown[]) => `<say></say><act>${JSON.stringify({ ops })}</act>`;

/** The whole script, written once the Trips evidence ids are known (the fake reads it at the first AI turn). */
const script = (trips: string, evidence: [string, string]): FakeLine[] => [
  VERIFY_OK,
  { match: { purpose: 'intake', promptIncludes: TRIPS_ASK }, reply: envelope('', { kind: 'react', emoji: '👍' }) },
  { match: { purpose: 'intake', promptIncludes: TRIPS_SEATS }, reply: envelope(BOOKED) },
  { match: { purpose: 'intake', promptIncludes: PEANUTS }, reply: intakeMemory(PEANUTS_FACT) },
  { match: { purpose: 'intake', promptIncludes: MOVED }, reply: envelope('', { kind: 'react', emoji: '👍' }) },
  // Step 6: the review supersedes "Lives in Mumbai" (§12.4 update).
  {
    match: { purpose: 'memory_review', promptIncludes: MOVED },
    reply: reviewAct([{ op: 'update', factId: MUMBAI.id, text: PUNE, evidenceMessageIds: [] }]),
  },
  // Step 2: the review's guess in Trips, from the two messages (§12.3: ≥ 2 evidence events and a reason).
  {
    match: { purpose: 'memory_review', chatId: trips },
    reply: reviewAct([
      {
        op: 'add',
        scope: 'helper',
        text: SEATS_FACT,
        provenance: 'guessed',
        evidenceMessageIds: evidence,
        reason: 'from 4 bookings',
        category: 'travel',
        kind: 'preference',
        private: false,
      },
    ]),
  },
  { match: { purpose: 'memory_review' }, reply: reviewAct([{ op: 'nothing' }]), once: false },
];

type R<T> = { ok: true; value: T } | { ok: false; error: { kind: string } };
async function facts(page: Page): Promise<MemoryFactView[]> {
  const r = (await page.evaluate(() => window.foo.invoke('memory:list', { filter: { chip: 'all' } }))) as R<MemoryFactView[]>;
  if (!r.ok) throw new Error(`memory:list: ${r.error.kind}`);
  return r.value;
}

/** Moves the fake clock in small steps until `done` holds (the engine's writes land on its own schedule). */
async function until(page: Page, done: () => Promise<boolean>, what: string, by = 250): Promise<void> {
  for (let i = 0; i < 160; i++) {
    if (await done()) return;
    await page.evaluate((ms) => window.__fooTest!.clock.advance(ms), by);
    await page.waitForTimeout(40);
  }
  throw new Error(`never happened: ${what}`);
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

const userRow = (page: Page, text: string): Locator =>
  page.getByTestId(TID.threadLog).locator('[data-message-id]', { has: page.getByTestId(TID.bubbleMe).filter({ hasText: text }) });

async function shoot(page: Page, id: string, sel: string, scrollLog = true): Promise<void> {
  if (scrollLog) await page.getByTestId(TID.threadLog).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await rest(page);
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await settle(page);
    await captureUx(page, id, sel, theme);
  }
  await setTheme(page, 'light');
}

const chipSel = (kind: 'saved' | 'guessed' | 'updated') => `${byTid(TID.threadMarker)}[data-state="memory"][data-kind="${kind}"]`;
const filterSel = (chip: string) => `${byTid(TID.memoryFilter)}[data-row-id="${chip}"]`;

test('UX-18 · Memory you can see and forget: steps UX-18-01 to UX-18-10, light and dark', async () => {
  test.setTimeout(300_000);
  const run = await launchWithFakeAi([VERIFY_OK]);
  const { app, dirs } = run;
  const page = await app.firstWindow();
  const refs = await openWorld(app, page, '2026-10-16T11:58:00+05:30');
  await settleSeededJobs(page, refs);
  await windowSize(app, page, 1280, 800);
  const aboutYou = join(dirs.FOO_DATA_DIR, 'memory', 'about-you.md');

  // Step 2's evidence: two Trips messages stored while offline (no AI turn yet), then the script that names them.
  await page.evaluate(async () => {
    await window.__fooTest!.setOnline(false);
    // Offline counts after 10 s without the network (03-shell-1 §3.3.2); main then tells the engine.
    await window.__fooTest!.clock.advance(10_500);
  });
  await page.waitForTimeout(500);
  await openChat(page, 'Trips');
  await send(page, TRIPS_ASK);
  await expect(userRow(page, TRIPS_ASK)).toHaveCount(1);
  await send(page, TRIPS_SEATS);
  await expect(userRow(page, TRIPS_SEATS)).toHaveCount(1);
  const evidence = [
    (await userRow(page, TRIPS_ASK).getAttribute('data-message-id'))!,
    (await userRow(page, TRIPS_SEATS).getAttribute('data-message-id'))!,
  ] as [string, string];
  expect(fakeTurns(dirs)).toEqual([]);
  writeFileSync(
    run.script,
    script(refs.trips!, evidence)
      .map((l) => JSON.stringify(l))
      .join('\n') + '\n',
  );
  await page.evaluate(() => window.__fooTest!.setOnline(true));
  const tripsLog = page.getByTestId(TID.threadLog);
  await until(page, async () => (await tripsLog.getByText(BOOKED).count()) === 1, 'the Trips reply');
  // 20 s of quiet, then the review (§12.4) posts the guessed chip under the reply.
  await until(page, async () => (await page.locator(chipSel('guessed')).count()) === 1, 'the guessed chip');

  await test.step('UX-18-01 · "remember I’m allergic to peanuts": 👍 and a chip with exactly what was saved', async () => {
    const s = step('UX-18-01');
    expect(s.s).toContain('Allergic to peanuts · Undo');
    await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T12:00:00+05:30'));
    await openChat(page, 'foo');
    await send(page, PEANUTS);
    const chip = page.locator(chipSel('saved'));
    await until(page, async () => (await chip.count()) === 1, 'the saved chip');
    await expect(chip).toContainText(t('memory_chip.line.saved', { fact: PEANUTS_FACT }));
    await expect(chip.getByTestId(TID.threadMemoryUndo)).toHaveText(t('memory_chip.button.undo'));
    const mine = userRow(page, PEANUTS);
    await until(page, async () => (await mine.getByTestId(TID.bubbleReaction).filter({ hasText: '👍' }).count()) > 0, 'the 👍');
    // f: saved as "You said", dated today.
    expect(s.f).toContain('You said');
    const saved = (await facts(page)).find((f) => f.text === PEANUTS_FACT);
    expect(saved?.provenance).toBe('said');
    expect(readFileSync(aboutYou, 'utf8')).toContain(`- ${PEANUTS_FACT}  {you said · 2026-10-16 · chat`);
    await shoot(page, 'UX-18-01', chipSel('saved'));
  });

  await test.step('UX-18-02 · a guess says it is a guess, in Trips, with Undo', async () => {
    const s = step('UX-18-02');
    expect(s.s).toContain('In Trips');
    await openChat(page, 'Trips');
    const chip = page.locator(chipSel('guessed'));
    await expect(chip).toContainText(t('memory_chip.line.guessed', { fact: SEATS_FACT }));
    await expect(chip.getByTestId(TID.threadMemoryUndo)).toHaveText(t('memory_chip.button.undo'));
    const seats = (await facts(page)).find((f) => f.text === SEATS_FACT);
    expect(seats).toMatchObject({ provenance: 'guessed', reason: 'from 4 bookings' });
    await shoot(page, 'UX-18-02', chipSel('guessed'));
  });

  await test.step('UX-18-03 · the Details panel shows the top things foo knows, each "You said" or "I guessed"', async () => {
    const s = step('UX-18-03');
    expect(s.f).toContain('"You said" or "I guessed"');
    await openChat(page, 'foo');
    const know = page.getByTestId(TID.appPanelKnow);
    await expect(know).toContainText(t('app.panel.know.title.foo'));
    const tiles = know.getByTestId(TID.appPanelKnowFact);
    await expect(tiles.first()).toBeVisible();
    for (const tile of await tiles.all()) await expect(tile).toContainText(/You said|I guessed/);
    await expect(know.getByTestId(TID.appPanelKnowSeeAll)).toHaveText(/^See all \(\d+\)$/);
    await page.evaluate(
      (p) => document.querySelectorAll(`[data-testid="${p}"], [data-testid="${p}"] *`).forEach((el) => (el.scrollTop = 0)),
      TID.appPanel,
    );
    await shoot(page, 'UX-18-03', byTid(TID.appPanelKnow));
  });

  // The seeded From Gmail facts and "Lives in Mumbai" (08-3 §12.2 lines, indexed by the watcher).
  // Above the `## Private` heading (a line under it is private, §12.2).
  const added = `${GMAIL.map(gmailLine).join('\n')}\n- ${MUMBAI.text}  {you said · 2026-10-15 · chat · ${MUMBAI.id}}\n`;
  const before = readFileSync(aboutYou, 'utf8');
  const at = before.indexOf('\n## Private');
  writeFileSync(aboutYou, at === -1 ? before + added : `${before.slice(0, at + 1)}${added}${before.slice(at + 1)}`);
  await page.waitForTimeout(300);
  await until(
    page,
    async () => {
      const all = await facts(page);
      return all.some((f) => f.id === MUMBAI.id) && all.filter((f) => f.originKind === 'gmail').length === GMAIL.length;
    },
    'the seeded lines indexed',
  );

  await test.step('UX-18-04 · Ctrl+M: the full page, every fact with where it came from and when', async () => {
    const s = step('UX-18-04');
    expect(s.s).toContain('Filters All · You said · I guessed');
    const screen = await openMemory(page);
    await expect(page.locator(filterSel('all'))).toHaveAttribute('aria-pressed', 'true');
    for (const c of ['all', 'said', 'guessed', 'gmail'] as const) await expect(page.locator(filterSel(c))).toBeVisible();
    await expect(page.locator(filterSel('gmail'))).toHaveText(t('screen.memory.filter.gmail'));
    const row = page.getByTestId(TID.memoryRow).first();
    await expect(row.getByTestId(TID.memoryRowEdit)).toHaveCount(1);
    await expect(row.getByTestId(TID.memoryRowForget)).toHaveCount(1);
    await expect(screen).toContainText(t('screen.memory.section.facts').toLocaleUpperCase());
    await shoot(page, 'UX-18-04', filterSel('all'), false);
  });

  await test.step('UX-18-05 · filter to "I guessed": every guess shows its reason', async () => {
    const s = step('UX-18-05');
    expect(s.f).toContain('reason');
    await page.locator(filterSel('guessed')).click();
    const rows = page.getByTestId(TID.memoryRow);
    const lines = await rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.split('\n')[1] ?? ''));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(/^(I guessed · from .+|From Gmail) · \d{1,2} [A-Z][a-z]{2}( · Private)?$/);
    await expect(rows.filter({ hasText: FORGOTTEN })).toContainText(
      t('screen.memory.row.source.guessed', { reason: 'from your chats', date: '1 Oct' }),
    );
    await expect(rows.filter({ hasText: GMAIL_GUESS })).toContainText('From Gmail · 9 Oct');
    await shoot(page, 'UX-18-05', filterSel('guessed'), false);
    await page.locator(filterSel('all')).click();
  });

  await test.step('UX-18-06 · "actually I moved to Pune": the fact is updated in place, with Undo', async () => {
    const s = step('UX-18-06');
    expect(s.s).toContain('(was Mumbai)');
    await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T12:05:00+05:30'));
    await page
      .getByTestId(TID.screenMemory)
      .getByRole('button', { name: t('screen.memory.back') })
      .click();
    await openChat(page, 'foo');
    await send(page, MOVED);
    const chip = page.locator(chipSel('updated'));
    // The review waits for 20 s of quiet and at most one run per chat per 2 minutes (§12.4).
    await until(page, async () => (await chip.count()) === 1, 'the updated chip', 1_000);
    await expect(chip).toContainText(t('memory_chip.line.updated', { fact: PUNE, old: MUMBAI.text }));
    await expect(chip.getByTestId(TID.threadMemoryUndo)).toHaveText(t('memory_chip.button.undo'));
    // f: the fact and its date change; nothing is piled up.
    const all = await facts(page);
    expect(all.filter((f) => f.text === MUMBAI.text)).toEqual([]);
    expect(all.find((f) => f.id === MUMBAI.id)?.text).toBe(PUNE);
    expect(readFileSync(aboutYou, 'utf8')).toContain(`- ${PUNE}  {you said · 2026-10-16 · chat · ${MUMBAI.id}}`);
    await shoot(page, 'UX-18-06', chipSel('updated'));
  });

  await test.step('UX-18-07 · Forget one thing: the row goes, a bar offers Undo for 5 seconds', async () => {
    const s = step('UX-18-07');
    expect(s.s).toContain('Undo');
    await openMemory(page);
    const row = page.getByTestId(TID.memoryRow).filter({ hasText: FORGOTTEN });
    await expect(row).toHaveCount(1);
    await row.getByTestId(TID.memoryRowForget).click();
    await expect(row).toHaveCount(0);
    const bar = page.getByTestId(TID.appUndo);
    await expect(bar).toContainText(t('screen.memory.undo.text', { fact: FORGOTTEN }));
    await expect(bar.getByTestId(TID.appUndoAction)).toHaveText(t('screen.memory.undo.action'));
    await shoot(page, 'UX-18-07', byTid(TID.appUndo), false);
    // The bar's 5 s run out; the fact stays forgotten (the drawn step 8 has the row gone).
    await expect(bar).toHaveCount(0, { timeout: 15_000 });
    expect((await facts(page)).some((f) => f.text === FORGOTTEN)).toBe(false);
  });

  await test.step('UX-18-08 · Forget everything from Gmail: the count, and Gmail stays connected', async () => {
    const s = step('UX-18-08');
    expect(s.s).toContain('Forget 23 things');
    await page.getByTestId(TID.memoryMenu).click();
    await page.getByRole('menuitem', { name: t('screen.memory.menu.forget_gmail') }).click();
    const c3 = page.getByTestId(TID.dialogC03);
    await expect(c3.getByRole('heading')).toHaveText(t('dialog.c_03.title', { count: GMAIL.length, app: 'Gmail' }));
    await expect(c3).toContainText(t('dialog.c_03.body', { app: 'Gmail' }));
    await expect(c3.getByTestId(TID.dialogPrimary)).toHaveText(t('dialog.c_03.primary', { count: GMAIL.length }));
    await shoot(page, 'UX-18-08', `${byTid(TID.dialogC03)} ${byTid(TID.dialogPrimary)}`, false);
    // f: nothing is forgotten until the primary is pressed; Cancel keeps them (and the Gmail connection is never touched).
    await c3.getByTestId(TID.dialogSecondary).click();
    await expect(c3).toHaveCount(0);
    expect((await facts(page)).filter((f) => f.originKind === 'gmail')).toHaveLength(GMAIL.length);
  });

  await test.step('UX-18-09 · Forget everything needs FORGET typed; the button works only then', async () => {
    const s = step('UX-18-09');
    expect(s.s).toContain('Type FORGET to confirm');
    await page.getByTestId(TID.memoryMenu).click();
    await page.getByRole('menuitem', { name: t('screen.memory.menu.forget_all'), exact: true }).click();
    const c4 = page.getByTestId(TID.dialogC04);
    const primary = c4.getByTestId(TID.dialogPrimary);
    await expect(c4).toContainText(t('dialog.c_04.title'));
    await expect(c4).toContainText(t('dialog.c_04.body'));
    await expect(primary).toBeDisabled();
    await c4.getByTestId(TID.dialogConfirmField).fill('FORGET');
    await expect(primary).toBeEnabled();
    await expect(primary).toHaveText(t('dialog.c_04.primary'));
    await shoot(page, 'UX-18-09', `${byTid(TID.dialogC04)} ${byTid(TID.dialogPrimary)}`, false);
    await c4.getByTestId(TID.dialogSecondary).click();
    await expect(c4).toHaveCount(0);
  });

  await test.step('UX-18-10 · "Open the memory folder": the plain files (Notepad is outside the window; nearest real state)', async () => {
    const s = step('UX-18-10');
    expect(s.s).toContain('- Allergic to peanuts (you said, Fri 16 Oct)');
    // The file holds the drawn lines in 08-3 §12.2's format (Notepad would show these).
    const file = readFileSync(aboutYou, 'utf8');
    expect(file).toContain(`- ${PEANUTS_FACT}  {you said · 2026-10-16 · chat ·`);
    expect(file).toContain(`- ${PUNE}  {you said · 2026-10-16 · chat · ${MUMBAI.id}}`);
    expect(file).toContain('- Vegetarian on Tuesdays  {you said ·');
    await page.getByTestId(TID.memoryMenu).click();
    const item = page.locator('[data-menu-root] [data-entry="open-folder"]');
    await expect(item).toHaveText(t('screen.memory.menu.open_folder'));
    await shoot(page, 'UX-18-10', '[data-menu-root] [data-entry="open-folder"]', false);
    await page.keyboard.press('Escape');
  });
  await app.close();
});
