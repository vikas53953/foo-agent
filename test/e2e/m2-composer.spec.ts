// Spec: 10-acceptance-1 AT-007 (a pasted sk-proj- key, a Luhn-valid card number or a code right after foo asked for one: Enter
// sends nothing and the paste catcher appears) with 10-acceptance-2 §C.3 row "Composer" and 04-2 §27: the paste catcher (C8,
// Article 8; 04-2 §22.4: a pasted sk-proj- key, a typed Luhn-valid card number and a labelled one-time code are masked "••••",
// Enter sends nothing, the panel shows; Esc keeps the mask; Send anyway stores "•••• (hidden)"), sending (§21.3: the bubble
// shows at once, the field clears, "Sent."), §E PERF-02 (keydown → paint p95 < 16 ms with the perf seed's 5,000-message chat
// open), §D ART-26a for the composer (axe on its states, light and dark) and 11-fidelity FID-14 (SV-10, SV-11, SV-12, SV-26
// placeholder, SV-30). spec/trace.csv routes these ids to this file (CR-0003). P16 (a bare code right after foo asked for
// one) needs a foo question within 10 minutes, which no seed has; it is covered by test/unit/m2b-composer-main.test.ts and
// test/articles/ART-08b.test.ts. Runs on the ux-world and perf seeds (08-3 §22.9) in Electron.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {} from '../../src/shared/ipc';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import { TID } from '../../src/shared/testids';
import { checkSpecValues, readRows, type SvResult } from '../fidelity/spec-values';
import { launch, testDirs } from './launch';

const byTid = (id: string) => `[data-testid="${id}"]`;
/** 02-2 §F13.3: one frame at 60 fps (PERF-02's bound). */
const PAINT_P95_MS = 16;
const KEYS = 80;

/**
 * `animations` stands for a settings.json the user already has: a first run on a runner with ≤ 4 logical CPUs stores
 * "Basic" (02 F7 X-150), where every fade is `--m-basic`; SV-30 is the "Full" value of `--m-fast`.
 */
async function start(seed: 'perf' | 'ux-world', o: { animations?: 'full' } = {}) {
  const dirs = testDirs();
  if (o.animations) {
    mkdirSync(dirs.FOO_DATA_DIR, { recursive: true });
    writeFileSync(
      join(dirs.FOO_DATA_DIR, 'settings.json'),
      JSON.stringify({ ...settingsDefaults, appearance: { ...settingsDefaults.appearance, animations: o.animations } }),
    );
  }
  const app = await launch(dirs);
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await page.evaluate((s) => window.__fooTest!.seed(s), seed);
  await expect(page.getByTestId(TID.chatlistRow).first()).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await page.waitForFunction(() => window.innerWidth === 1440);
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

/** A clipboard paste into the field (the same event the Ctrl+V path fires). */
async function paste(page: Page, text: string) {
  await page.getByTestId(TID.composerField).evaluate((el, t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}

const field = (page: Page) => page.getByTestId(TID.composerField);
const mine = (page: Page) => page.getByTestId(TID.bubbleMe);

async function clearField(page: Page) {
  await field(page).focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await expect(field(page)).toHaveText('');
}

test('AT-007 · a pasted key, a typed card number and a labelled code are caught before anything is sent', async () => {
  test.setTimeout(120_000);
  // FID-15: the acceptance text, verbatim from 10-acceptance-1 §B.
  test.info().annotations.push({
    type: 'AT-007',
    description:
      '**Given** the user pastes `sk-proj-…` (or a Luhn-valid 16-digit number, or a code right after foo asked for one) into the composer, **when** they press Enter, **then** nothing is sent and the paste catcher appears. *(also covers J7, J13 branches)*',
  });
  const { app, page } = await start('ux-world');
  await openChat(page, 'foo');
  const before = await mine(page).count();
  const send = page.getByTestId(TID.composerSend);

  // A pasted OpenAI key: masked, the panel opens, focus is on "Move to secret box", the button is disabled.
  await field(page).focus();
  await paste(page, 'here is my key sk-proj-AbCdEfGhIjKlMnOpQrStUvWx1234');
  await expect(page.getByTestId(TID.composerPaste)).toBeVisible();
  await expect(page.getByTestId(TID.composerPasteMove)).toBeFocused();
  await expect(field(page)).toContainText('••••');
  await expect(field(page)).not.toContainText('sk-proj');
  await expect(send).toHaveAttribute('data-state', 'disabled');
  await field(page).focus();
  await page.keyboard.press('Enter');
  await expect(mine(page)).toHaveCount(before);

  // Esc: the panel closes, the span stays masked; the next Send runs the check again and the panel reopens.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId(TID.composerPaste)).toHaveCount(0);
  await expect(field(page)).toContainText('••••');
  await expect(send).toHaveAttribute('data-state', 'send');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId(TID.composerPaste)).toBeVisible();
  await expect(mine(page)).toHaveCount(before);

  // Move to secret box removes the span and keeps the rest of the text.
  await page.getByTestId(TID.composerPasteMove).click();
  await expect(page.getByTestId(TID.composerPaste)).toHaveCount(0);
  await expect(field(page)).not.toContainText('••••');
  await expect(field(page)).toContainText('here is my key');

  // A typed Luhn-valid card number is caught 800 ms after typing stops.
  await clearField(page);
  await page.keyboard.type('card 4111 1111 1111 1111');
  await expect(page.getByTestId(TID.composerPaste)).toBeVisible();
  await expect(field(page)).not.toContainText('4111');
  await field(page).focus();
  await page.keyboard.press('Enter');
  await expect(mine(page)).toHaveCount(before);
  await page.getByTestId(TID.composerPasteMove).click();

  // A labelled one-time code, then "Send anyway": the bubble shows "•••• (hidden)" and never the code.
  await clearField(page);
  await paste(page, 'the OTP is 482913');
  await expect(page.getByTestId(TID.composerPaste)).toBeVisible();
  await page.getByTestId(TID.composerPasteSend).click();
  await expect(mine(page)).toHaveCount(before + 1);
  await expect(mine(page).last()).toContainText('•••• (hidden)');
  await expect(mine(page).last()).not.toContainText('482913');
  await expect(field(page)).toHaveText('');
  await app.close();
});

test('Enter sends: the bubble shows at once, the field clears and keeps focus, Shift+Enter is a new line', async () => {
  const { app, page } = await start('ux-world');
  await openChat(page, 'foo');
  const before = await mine(page).count();
  await field(page).focus();
  await page.keyboard.type('Remind me about the electricity bill');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('before Friday');
  await expect(page.getByTestId(TID.composerSend)).toHaveAttribute('data-state', 'send');
  await page.keyboard.press('Enter');
  await expect(mine(page)).toHaveCount(before + 1);
  await expect(mine(page).last()).toContainText('Remind me about the electricity bill');
  await expect(mine(page).last()).toContainText('before Friday');
  await expect(field(page)).toHaveText('');
  await expect(field(page)).toBeFocused();
  await expect(page.getByTestId(TID.composerSend)).toHaveAttribute('data-state', 'mic');
  await app.close();
});

test('PERF-02 · typing in the 5,000-message chat paints within a frame (p95)', async () => {
  test.setTimeout(180_000);
  const { app, page } = await start('perf');
  await openChat(page, 'foo');
  await field(page).focus();
  await page.evaluate(() => {
    const w = window as unknown as { __paint: number[] };
    w.__paint = [];
    window.addEventListener(
      'keydown',
      (e) => {
        const t0 = e.timeStamp;
        requestAnimationFrame(() => setTimeout(() => w.__paint.push(performance.now() - t0), 0));
      },
      true,
    );
  });
  for (let i = 0; i < KEYS; i++) await page.keyboard.press(i % 10 === 9 ? 'Space' : 'KeyA');
  await page.waitForFunction((n) => (window as unknown as { __paint: number[] }).__paint.length >= n, KEYS);
  const times = await page.evaluate(() => (window as unknown as { __paint: number[] }).__paint.slice().sort((a, b) => a - b));
  const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
  console.log(`keydown → paint p95 ${p95.toFixed(1)} ms over ${times.length} keys`);
  // Control, logged and not asserted: the same keys and the same probe in the same window, with nothing focused, so the
  // app does no work for them. Its p95 is the floor the runner sets (frame cadence, timers); the evidence a PERF CR needs.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    (window as unknown as { __paint: number[] }).__paint = [];
  });
  for (let i = 0; i < KEYS; i++) await page.keyboard.press(i % 10 === 9 ? 'Space' : 'KeyA');
  await page.waitForFunction((n) => (window as unknown as { __paint: number[] }).__paint.length >= n, KEYS);
  const control = await page.evaluate(() => (window as unknown as { __paint: number[] }).__paint.slice().sort((a, b) => a - b));
  const at = (q: number) => control[Math.ceil(control.length * q) - 1]!.toFixed(1);
  const mine50 = times[Math.ceil(times.length * 0.5) - 1]!.toFixed(1);
  console.log(`PERF-02 control, keys with nothing focused: p50 ${at(0.5)} ms, p95 ${at(0.95)} ms; typing p50 ${mine50} ms`);
  // CR-0005: on a GitHub-hosted runner the probe's own floor (the control's p95, the same keys with the app doing no work)
  // can sit above 16 ms; there typing passes at p95 < 16 ms or at p95 ≤ that floor, both logged. Anywhere else (a real PC)
  // the strict p95 < 16 ms stays the rule.
  const floor = control[Math.ceil(control.length * 0.95) - 1]!;
  const hosted = process.env.RUNNER_ENVIRONMENT === 'github-hosted';
  console.log(
    `PERF-02 rule: ${hosted ? `hosted runner (CR-0005): p95 ${p95.toFixed(1)} ms < ${PAINT_P95_MS} or ≤ control ${floor.toFixed(1)} ms` : `strict: p95 ${p95.toFixed(1)} ms < ${PAINT_P95_MS}`}`,
  );
  if (hosted && p95 >= PAINT_P95_MS) expect(p95).toBeLessThanOrEqual(floor);
  else expect(p95).toBeLessThan(PAINT_P95_MS);
  await app.close();
});

async function audit(page: Page, label: string) {
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => window.__fooTest!.theme(t), theme);
    if (process.platform !== 'win32') await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          // A looping animation (a spinner with animations "Full") never finishes: wait for the finite ones only.
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ),
    );
    const r = await new AxeBuilder({ page }).setLegacyMode(true).include(byTid(TID.composer)).analyze();
    expect(r.violations.map((v) => `${label} ${theme} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
}

test('ART-26a · the composer passes axe in light and dark: rest, text, reply strip, mention menu and paste catcher', async () => {
  test.setTimeout(180_000);
  const { app, page } = await start('ux-world');
  await openChat(page, 'foo');
  await audit(page, 'rest');

  await field(page).focus();
  await page.keyboard.type('Book the Goa flights');
  await audit(page, 'text');

  const reply = page.getByTestId(TID.bubbleFoo).last();
  await reply.scrollIntoViewIfNeeded();
  await reply.click({ button: 'right' });
  await page.getByTestId(TID.bubbleMenuReply).click();
  await expect(page.getByTestId(TID.composerReply)).toBeVisible();
  await audit(page, 'reply');

  await field(page).focus();
  await page.keyboard.type(' @');
  await expect(page.getByTestId(TID.composerMention)).toBeVisible();
  await audit(page, 'mention');
  await page.keyboard.press('Escape');

  await paste(page, ' sk-proj-AbCdEfGhIjKlMnOpQrStUvWx1234');
  await expect(page.getByTestId(TID.composerPaste)).toBeVisible();
  await audit(page, 'catch');
  await app.close();
});

/** SV-30 (02 F7 --m-fast): the round buttons' hover fill changes over 83 ms (every listed transition of the button). */
async function hoverMotion(page: Page): Promise<SvResult> {
  const m = await page.evaluate(
    (sel) => {
      return Array.from(document.querySelectorAll(sel)).map((el) => {
        const cs = getComputedStyle(el);
        return { property: cs.transitionProperty, duration: cs.transitionDuration };
      });
    },
    `${byTid(TID.composerAttach)}, ${byTid(TID.composerSend)}`,
  );
  const ok = m.length > 0 && m.every((x) => x.property.includes('background-color') && x.duration.split(', ').every((d) => d === '0.083s'));
  return {
    id: 'SV-30',
    ok,
    expected: 'transition-duration: 0.083s (background-color)',
    measured: m.length ? m.map((x) => `${x.property} ${x.duration}`).join('; ') : 'element not found',
  };
}

test('FID-14 spec values for the composer: SV-10, SV-11, SV-12, SV-26 (placeholder) and SV-30, light and dark', async () => {
  const { app, page } = await start('ux-world', { animations: 'full' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  await openChat(page, 'foo');
  const rows = readRows();
  const pick = (...ids: string[]) => rows.filter((r) => ids.includes(r.id));
  await expect(page.getByTestId(TID.composerSend)).toHaveAttribute('data-state', 'mic');
  const results: SvResult[] = [
    ...(await checkSpecValues(page, { theme: 'light', rows: pick('SV-10', 'SV-11', 'SV-12', 'SV-26') })),
    await hoverMotion(page),
  ];
  await page.evaluate(() => window.__fooTest!.theme('dark'));
  if (process.platform !== 'win32') await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // A looping animation (a spinner with animations "Full") never finishes: wait for the finite ones only.
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const dark = await checkSpecValues(page, { theme: 'dark', rows: pick('SV-26') });
  results.push(...dark.map((r) => ({ ...r, note: 'dark' })));
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'fid-14-m2-composer.json'), JSON.stringify(results, null, 2) + '\n');
  expect(results.filter((r) => !r.ok)).toEqual([]);
  await app.close();
});
