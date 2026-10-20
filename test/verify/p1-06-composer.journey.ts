// Spec: 04-2 §21.7 (suggestion chips), CR-0021 picks 10, 11, 02 §F7.1 "Composer". foo-verify journey for P1 T6 on the
// ux-world with the fake AI: an empty chat shows 3 starters; a click fills the field and sends nothing; a reply's
// `Suggestions:` line becomes follow-up chips (never bubble text, banned words dropped); an Approval card hides them; holding
// the mic floods the button; ✓ after delivery; "Add details…" while a job works. Light and dark. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/p1-06-composer.journey.ts
import Database from 'better-sqlite3';
import { join } from 'node:path';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { intake, VERIFY_OK } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { byTid, FAKE_MIC, openChat, openWorld, rest, setTheme, settle, windowSize } from '../fidelity/capture';

const ASK = 'when does my train leave';
const MIN = 60_000;

async function until(check: () => Promise<boolean>, what: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for ${what}`);
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({
    fakeAi: [VERIFY_OK, intake(ASK, 'Your train leaves at 9:00 AM from Pune.\nSuggestions: Book a cab | Check the API key | Show the map')],
    args: FAKE_MIC,
  });
  const refs = await openWorld(app, page);
  await settleSeededJobs(page, refs);
  await windowSize(app, page, 1440, 900);
  const chipTexts = () => page.locator(byTid(TID.composerSuggestionChip)).allInnerTexts();
  const field = page.locator(byTid(TID.composerField));

  // 1. An empty helper chat (News & X emptied in foo.db, as a new helper chat starts) shows the 3 starters.
  const dataDir = await app.evaluate(() => process.env.FOO_DATA_DIR ?? '');
  const db = new Database(join(dataDir, 'data', 'foo.db'));
  db.pragma('foreign_keys = OFF');
  for (const table of ['cards', 'messages', 'jobs']) db.prepare(`DELETE FROM ${table} WHERE chat_id = ?`).run(refs.news!);
  db.close();
  await openChat(page, 'News & X');
  await until(async () => (await chipTexts()).length === 3, 'the starter chips');
  v.note(`empty chat shows starters: ${JSON.stringify(await chipTexts())}`);
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await rest(page);
    await settle(page);
    await v.shot(`starters-${theme}`, byTid(TID.composer));
  }
  await setTheme(page, 'light');

  // 2. A click fills the field and focuses it; nothing is sent.
  const turns = v.fakeTurns().length;
  await page.locator(byTid(TID.composerSuggestionChip)).first().click();
  await until(async () => (await field.innerText()).trim() === 'What can you do?', 'the field to fill');
  await until(async () => (await chipTexts()).length === 0, 'the chips to fade out');
  const focused = await field.evaluate((el) => el === document.activeElement);
  const mine = await page.locator(`${byTid(TID.threadLog)} ${byTid(TID.bubbleMe)}`).count();
  v.note(
    `chip click → field "${(await field.innerText()).trim()}", focused ${focused}, chips now ${(await chipTexts()).length}, ` +
      `my bubbles ${mine}, AI requests +${v.fakeTurns().length - turns}`,
  );
  await settle(page);
  await v.shot('chip-filled', byTid(TID.composer));
  await field.press('Control+A');
  await field.press('Backspace');

  // 3. A reply with a Suggestions line in foo's chat: the line leaves the bubble; the chips show the clean follow-ups.
  await openChat(page, 'foo');
  await field.click();
  await field.pressSequentially(ASK);
  await field.press('Enter');
  await until(async () => (await chipTexts()).length > 0, 'the follow-up chips');
  const bubble = page.locator(byTid(TID.bubbleFoo)).filter({ hasText: 'Your train leaves at 9:00 AM' }).last();
  v.note(`reply bubble reads "${(await bubble.innerText()).split('\n')[0]}"; follow-ups ${JSON.stringify(await chipTexts())}`);
  v.note(`button after delivery: data-confirmed=${await page.locator(byTid(TID.composerSend)).getAttribute('data-confirmed')}`);
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await rest(page);
    await settle(page);
    await v.shot(`follow-ups-${theme}`);
  }
  await setTheme(page, 'light');

  // 4. An Approval card after the reply hides them.
  const now = (await page.evaluate(() => window.__fooTest!.clock.now())).now;
  const fields = { verb: 'calendar_write', item: 'Train to Pune', irreversible: false } as const;
  await page.evaluate((s) => window.__fooTest!.cardSeed(s), {
    chatId: refs.foo!,
    type: 'approval' as const,
    state: 'PENDING',
    payload: {
      variant: 'standard',
      approvalId: '',
      verb: fields.verb,
      title: 'Add Train to Pune to your calendar?',
      impact: 'Fri 16 Oct, 9:00 AM · Pune · Google Calendar',
      fields,
      scopes: ['once'],
      hardLimit: false,
      expiresAt: now + 60 * MIN,
    },
    approval: { fields, hardLimit: false, expiresAt: now + 60 * MIN },
  });
  await until(async () => (await page.locator(byTid(TID.composerSuggestions)).count()) === 0, 'the chips to hide');
  v.note('after an Approval card the chip row is gone');

  // 5. "Add details…" while a job of the chat works.
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'working'), refs.goaJob!);
  await until(async () => (await field.getAttribute('aria-description')) === 'Add details…', 'the working placeholder');
  v.note(`Goa stay WORKING → placeholder "${await field.getAttribute('aria-description')}"`);
  await settle(page);
  await v.shot('working-placeholder', byTid(TID.composer));

  // 6. Hold the mic: the button floods dark (--bubble-me) and the level ring shows.
  const send = page.locator(byTid(TID.composerSend));
  const box = (await send.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await until(async () => (await send.getAttribute('data-state')) === 'recording', 'hold mode');
  await new Promise((r) => setTimeout(r, 600));
  const flood = await send.evaluate((b) => [...b.children].some((c) => getComputedStyle(c).animationName.includes('flood')));
  v.note(`holding the mic → state recording, flood layer ${flood}`);
  await v.shot('mic-flood', byTid(TID.composer));
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await until(async () => (await page.locator(byTid(TID.composerRecording)).count()) === 0, 'the bar to shrink away');
  v.note('Esc → the voice bar is gone and the pill is back');
}
