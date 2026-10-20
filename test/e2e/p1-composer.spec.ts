// Spec: 10-acceptance-2 §C.8 AT-307 (starter chips: 3 in an empty chat; a click fills and focuses the field and sends
// nothing; hidden on the first keystroke), AT-308 (follow-ups only from the reply's stored suggestions, the line stripped from
// the bubble, banned words dropped; none after a Draft card; none in groups), AT-309 (hold mic floods the button; send → ✓
// for 2s on delivery; "Add details…" while a job works), AT-325 (the composer details animate at Full, fade at Basic, are
// still at Off, read from computed style); 04-2 §21.7, CR-0021 picks 10, 11. Every reply comes from the fake AI (08-3 §22.3).
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { FAKE_MIC, openChat, openWorld } from '../fidelity/capture';
import { fakeTurns, intake, launchWithFakeAi, VERIFY_OK } from './fakeAi';
import type { testDirs } from './launch';
import { settleSeededJobs } from './m4-start';

const ASK = 'when does my train leave';
const SAY = 'Your train leaves at 9:00 AM from Pune.';

let app: ElectronApplication;
let page: Page;
let dirs: ReturnType<typeof testDirs>;
let refs: Record<string, string>;

const chips = () => page.getByTestId(TID.composerSuggestionChip);
const field = () => page.getByTestId(TID.composerField);
const send = () => page.getByTestId(TID.composerSend);

/** Empties one seeded chat in foo.db (the seed has no empty chat; a new helper chat starts like this). */
function emptyChat(chatId: string): void {
  const db = new Database(join(dirs.FOO_DATA_DIR, 'data', 'foo.db'));
  try {
    db.pragma('foreign_keys = OFF');
    for (const table of ['cards', 'messages', 'jobs']) db.prepare(`DELETE FROM ${table} WHERE chat_id = ?`).run(chatId);
  } finally {
    db.close();
  }
}

test.beforeAll(async () => {
  const run = await launchWithFakeAi(
    [VERIFY_OK, intake(ASK, `${SAY}\nSuggestions: Book a cab | Check the API key | Show the map | Set a reminder`)],
    { args: FAKE_MIC },
  );
  app = run.app;
  dirs = run.dirs;
  page = await app.firstWindow();
  refs = await openWorld(app, page);
  await settleSeededJobs(page, refs);
  emptyChat(refs.news!);
});
test.afterAll(async () => app?.close());

test('AT-307 starters: 3 in an empty chat; a click fills and focuses the field and sends nothing; hidden on the first keystroke', async () => {
  await openChat(page, 'News & X');
  await expect(page.getByTestId(TID.composerSuggestions)).toHaveAttribute('role', 'group');
  await expect(page.getByTestId(TID.composerSuggestions)).toHaveAttribute('aria-label', t('composer.suggest.label'));
  await expect(chips()).toHaveText([
    t('composer.suggest.starter.helper.1'),
    t('composer.suggest.starter.helper.2'),
    t('composer.suggest.starter.helper.3'),
  ]);
  const turns = fakeTurns(dirs).length;
  await chips().first().click();
  await expect(field()).toHaveText(t('composer.suggest.starter.helper.1'));
  await expect(field()).toBeFocused();
  await expect(chips()).toHaveCount(0);
  await expect(page.getByTestId(TID.threadLog).getByTestId(TID.bubbleMe)).toHaveCount(0);
  expect(fakeTurns(dirs)).toHaveLength(turns);
  // Cleared again → the starters come back; the first keystroke hides them.
  await field().press('Control+A');
  await field().press('Backspace');
  await expect(chips()).toHaveCount(3);
  await field().press('H');
  await expect(chips()).toHaveCount(0);
  await field().press('Backspace');
});

test('AT-325 the chips rise 60ms apart at Full, fade at Basic, are still at Off; the field grows smoothly only at Full', async () => {
  await openChat(page, 'News & X');
  await expect(chips()).toHaveCount(3);
  const look = (level: string) =>
    page.evaluate(
      ([lvl, chip, fld]) => {
        document.documentElement.dataset.motion = lvl;
        const c = getComputedStyle(document.querySelectorAll(`[data-testid="${chip}"]`)[2]!);
        const f = getComputedStyle(document.querySelector(`[data-testid="${fld}"]`)!);
        const move = getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim();
        return {
          name: c.animationName,
          duration: c.animationDuration,
          delay: c.animationDelay,
          ease: c.animationTimingFunction,
          move,
          grow: f.transitionDuration,
        };
      },
      [level, TID.composerSuggestionChip, TID.composerField] as const,
    );
  const full = await look('full');
  expect(full.name).toMatch(/rise/);
  expect(full).toMatchObject({ duration: '0.4s', delay: '0.12s', move: '1' });
  expect(full.ease).toMatch(/^linear\(/);
  expect(full.grow.split(', ')[0]).toBe('0.167s');
  const basic = await look('basic');
  expect(basic).toMatchObject({ duration: '0.2s', delay: '0s', move: '0' });
  expect(basic.grow.split(', ')[0]).toBe('0s');
  const off = await look('off');
  expect(off).toMatchObject({ duration: '0.083s', delay: '0s', move: '0' });
  expect(off.grow.split(', ')[0]).toBe('0s');
  await page.evaluate(() => (document.documentElement.dataset.motion = 'full'));
});

test('AT-308 follow-ups: the Suggestions line leaves the bubble; ≤ 3 chips, banned words dropped; none after a Draft card; none in groups', async () => {
  await openChat(page, 'foo');
  await field().click();
  await field().pressSequentially(ASK);
  await field().press('Enter');
  const reply = page.getByTestId(TID.bubbleFoo).filter({ hasText: SAY });
  await expect(reply).toBeVisible();
  await expect(reply).not.toContainText('Suggestions');
  await expect(chips()).toHaveText(['Book a cab', 'Show the map', 'Set a reminder']);
  // A Draft card after the reply: the row goes.
  await page.evaluate(
    (chatId) =>
      window.__fooTest!.cardSeed({
        chatId,
        type: 'draft',
        state: 'pending',
        payload: {
          approvalId: '',
          channel: 'email',
          to: { name: 'Rakesh Example', address: 'rakesh@example.com', isNew: false },
          subject: 'Re: October rent',
          body: 'Hi Rakesh, the rent is sent.',
          edited: false,
          sendAllowed: true,
          gmailDraftId: 'gd_p1',
        },
      }),
    refs.foo!,
  );
  await expect(page.getByTestId(TID.composerSuggestions)).toHaveCount(0);
  await openChat(page, 'Family group');
  await expect(page.getByTestId(TID.composerSuggestions)).toHaveCount(0);
});

test('AT-309 send turns into ✓ for 2s on delivery; "Add details…" while a job of the chat works', async () => {
  await openChat(page, 'News & X');
  await field().click();
  await field().pressSequentially('thanks for the posts');
  await field().press('Enter');
  await expect(send()).toHaveAttribute('data-confirmed', 'true');
  await expect(send().locator('[data-icon="Checkmark"]')).toBeVisible();
  await expect(send()).not.toHaveAttribute('data-confirmed', 'true', { timeout: 4_000 });

  // Goa stay is foo's job (ux-world); the runner moving it to WORKING changes foo's placeholder.
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'working'), refs.goaJob!);
  await openChat(page, 'foo');
  await expect(field()).toHaveAttribute('aria-description', t('composer.placeholder.working'));
});

test('AT-309 holding the mic floods the button dark (--bubble-me) outward and a level ring circles it', async () => {
  await openChat(page, 'News & X');
  const box = (await send().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(send()).toHaveAttribute('data-state', 'recording');
  const flood = await send().evaluate((b) => {
    const span = [...b.children].find((c) => getComputedStyle(c).animationName.includes('flood'));
    const probe = document.createElement('i');
    probe.style.color = 'var(--bubble-me)';
    document.body.append(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return span ? { bg: getComputedStyle(span).backgroundColor, want } : null;
  });
  expect(flood).not.toBeNull();
  expect(flood!.bg).toBe(flood!.want);
  await expect(send().locator('xpath=ancestor::span[contains(@class, "morphWrap")]').locator('[class*="levelRing"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByTestId(TID.composerRecording)).toHaveCount(0);
  await expect(field()).toBeVisible();
});
