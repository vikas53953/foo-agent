// Spec: CR-0054 (X-211, the batch-1 build: install, ai, name, chat, settings); 07-1 J1–J3 (first run), J7 (just chatting,
// Hinglish, streaming), J21 (settings by asking); 06-1 §2.2 (the key row and its Secret box); 08-3 §22.2 (FOO_TEST keeps
// the vault in memory, so a key found in any file under the data folders is a leak); 01-articles Art. 4 (a secret never
// lands in a log, the database or a prompt). The whole batch-1 walk on the fake AI, with evidence for `pnpm qa`: a shot per
// step, the AI requests, the database counts and a key scan of every file foo wrote.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {} from '../../src/shared/ipc';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { evidence } from '../qa/evidence';
import { aiHome, finder, finderRow } from './ai-step-world';
import { fakeTurns, intake, VERIFY_OK, type FakeLine } from './fakeAi';
import { launch, testDirs } from './launch';

const BATCH_1 = 'install,ai,name,chat,settings';
const FAKE_KEY = 'sk-ant-api03-qab1FAKEnotREAL0000000000000000000000000000000000000000000000000000-AAAAAA';
const act = (decision: Record<string, unknown>) => `<say></say>\n<act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const JOKE = 'Ek baar ek computer doctor ke paas gaya. Doctor ne pucha kya hua? Computer bola: mujhe virus ho gaya!';

const LINES: FakeLine[] = [
  VERIFY_OK,
  {
    match: { purpose: 'intake', promptIncludes: 'kaise ho' },
    chunks: [{ text: '<say>Main badhiya hoon! ' }, { text: 'Aap batao, aaj kya plan hai?</say>', delayMs: 800 }],
  },
  intake('joke', JOKE),
  {
    match: { purpose: 'intake', promptIncludes: 'Book a table' },
    reply: act({
      kind: 'job',
      title: 'Book a table',
      plan: [{ phraseKey: 'check_site', slots: { site: 'cafe.example' }, route: 'browser' }],
      routeHint: ['browser'],
      needsApps: [],
    }),
  },
  { match: { purpose: 'intake', promptIncludes: 'vegetarian' }, reply: act({ kind: 'memory', op: 'remember', text: 'Is vegetarian' }) },
  { match: { purpose: 'intake', promptIncludes: 'dark mode' }, reply: act({ kind: 'setting', path: 'appearance.theme', value: 'dark' }) },
];

const out = () => process.env.QA_EVIDENCE_DIR;
async function shot(page: Page, name: string) {
  const dir = out();
  if (!dir) return;
  mkdirSync(join(dir, 'shots'), { recursive: true });
  await page.screenshot({ path: join(dir, 'shots', `QA-B1-E01-${name}.png`) });
}
const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

/** Sends `text` and moves the test clock until a new foo answer (bubble or system line) shows. */
async function say(page: Page, text: string) {
  const answers = page.locator(`[data-testid="${TID.bubbleFoo}"], [data-testid="${TID.threadMarker}"][data-state="system_line"]`);
  const before = await answers.count();
  await page.getByTestId(TID.composerField).fill(text);
  await page.keyboard.press('Enter');
  await expect
    .poll(
      async () => {
        await advance(page, 400);
        return answers.count();
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(before);
  await advance(page, 2_000);
  await page.waitForTimeout(300);
}

/** Every file under `dir`, as bytes. */
function files(dir: string): string[] {
  const all: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else all.push(p);
    }
  };
  walk(dir);
  return all;
}

test('QA-B1-E01 · batch-1 walk: own key in the Secret box, Hinglish chat streams, off asks say so, dark by chat, no key in any file', async () => {
  test.setTimeout(180_000);
  const dirs = testDirs();
  const script = join(dirs.FOO_DATA_DIR, '..', 'fake-ai.jsonl');
  mkdirSync(join(dirs.FOO_DATA_DIR, '..'), { recursive: true });
  writeFileSync(script, LINES.map((l) => JSON.stringify(l)).join('\n') + '\n');
  // Chromium's own profile (Local Storage, IndexedDB, caches, crash dumps) goes in this run's folder too, so the scan sees it.
  const chromium = join(dirs.FOO_DATA_DIR, '..', 'chromium');
  const app = await launch(dirs, [`--user-data-dir=${chromium}`], {
    FOO_FAKE_AI: script,
    FOO_TEST_FIRST_RUN: '1',
    FOO_TEST_AI_HOME: aiHome([]),
    FOO_FEATURES: BATCH_1,
  });
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800));
  await shot(page, '1-welcome');
  await page.getByTestId(TID.setupWelcomeStart).click();

  // J2: no AI on this PC, so foo offers a key; the key goes into foo's own Secret box, masked.
  await expect(finder(page)).toContainText(t('setup.ai_finder.nothing.question'), { timeout: 20_000 });
  await finder(page).locator(`[data-testid="${TID.cardChoiceOption}"][data-option="key"]`).click();
  await finder(page).locator(`[data-testid="${TID.cardChoiceOption}"][data-option="anthropic-key"]`).click();
  const box = page.locator(`[data-testid="${TID.cardSecret}"]`).last();
  await box.getByTestId(TID.cardSecretField).fill(FAKE_KEY);
  await expect(box.getByTestId(TID.cardSecretField)).toHaveAttribute('type', 'password');
  await shot(page, '2-secret-box');
  await box.getByTestId(TID.cardSecretSave).click();
  await expect(finderRow(page, 'anthropic-key')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  await shot(page, '3-key-works');
  const use = page.getByTestId(TID.setupAiUse);
  if (await use.count()) await use.first().click();
  await page.getByTestId(TID.setupSkipRest).click();
  await expect(page.getByTestId(TID.composerField)).toBeEnabled({ timeout: 20_000 });
  await shot(page, '4-first-chat');

  // J7: Hinglish, streamed (the second piece arrives 800 ms after the first), then a joke.
  await say(page, 'hi foo, kaise ho?');
  await expect(page.getByTestId(TID.bubbleFoo).last()).toContainText('Aap batao, aaj kya plan hai?');
  await say(page, 'mujhe ek chhota sa joke sunao');
  await expect(page.getByTestId(TID.bubbleFoo).last()).toContainText('virus ho gaya');
  await shot(page, '5-hinglish');

  // CR-0054: tasks and memory are off in batch 1; each ask gets its one line and leaves nothing behind.
  await say(page, 'Book a table for 2 tonight at a cafe in Delhi');
  await expect(page.getByTestId(TID.bubbleFoo).last()).toContainText(t('thread.feature_off.jobs'));
  await say(page, 'remember that I am vegetarian');
  await expect(page.getByTestId(TID.bubbleFoo).last()).toContainText(t('thread.feature_off.memory'));
  await expect(page.locator('[data-testid="card-checklist"], [data-testid="card-plan"]')).toHaveCount(0);
  await shot(page, '6-off-asks');

  // J21: settings by asking stays on.
  await say(page, 'Switch to dark mode');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 20_000 });
  await expect(page.locator(`[data-testid="${TID.threadMarker}"][data-setting="changed"]`).last()).toContainText('Changed: Theme → Dark.');
  await shot(page, '7-dark');

  await app.close();

  // Art. 4: the key is in the in-memory vault only; no file foo wrote holds it (UTF-8 or UTF-16).
  const needles = [Buffer.from(FAKE_KEY, 'utf8'), Buffer.from(FAKE_KEY, 'utf16le'), Buffer.from(FAKE_KEY.slice(14, 40), 'utf8')];
  const written = [dirs.FOO_DATA_DIR, dirs.FOO_LOCAL_DIR, dirs.FOO_OUT_DIR, chromium].flatMap((d) => {
    try {
      return files(d);
    } catch {
      return [];
    }
  });
  const leaks = written.filter((f) => {
    const b = readFileSync(f);
    return needles.some((n) => b.includes(n));
  });
  const turns = fakeTurns(dirs);
  // The run's own database, read back after foo closed: nothing the off asks could have left behind.
  const dbFile = written.find((f) => /\.(db|sqlite)$/.test(f));
  // 08-3 §12.2: the memory files are the truth and the index a cache, so a fact file counts even without its index row.
  const memoryFiles = written.filter((f) => f.startsWith(join(dirs.FOO_DATA_DIR, 'memory'))).length;
  const chromiumFiles = written.filter((f) => f.startsWith(chromium)).length;
  const counts: Record<string, number> = {};
  if (dbFile) {
    const db = new Database(dbFile, { readonly: true });
    for (const tbl of ['jobs', 'tool_calls', 'memory_index', 'routines', 'approvals', 'outbox'])
      counts[tbl] = (db.prepare(`SELECT COUNT(*) AS n FROM ${tbl}`).get() as { n: number }).n;
    db.close();
  }
  evidence({
    id: 'QA-B1-E01',
    request: [
      '(first run, own key)',
      'hi foo, kaise ho?',
      'mujhe ek chhota sa joke sunao',
      'Book a table…',
      'remember…',
      'Switch to dark mode',
    ],
    aiTurns: turns.map((x) => ({ purpose: x.purpose, prompt: x.prompt.slice(-200) })),
    state: {
      filesScanned: written.length,
      keyLeaks: leaks.map((f) => f.replace(dirs.FOO_DATA_DIR, '{DATA}')),
      db: dbFile ? 'read' : 'not found',
      memoryFiles,
      chromiumFiles,
      ...counts,
    },
    expected: 'streamed Hinglish, two off lines, dark theme, 0 files holding the key',
    actual: `${leaks.length} files hold the key; ${turns.length} AI requests`,
  });
  expect(written.length).toBeGreaterThan(0);
  expect(dbFile).toBeTruthy();
  expect(chromiumFiles).toBeGreaterThan(0);
  expect(memoryFiles).toBe(0);
  expect(counts).toEqual({ jobs: 0, tool_calls: 0, memory_index: 0, routines: 0, approvals: 0, outbox: 0 });
  expect(leaks).toEqual([]);
  // No AI request ever carries the key either.
  expect(turns.filter((x) => x.prompt.includes(FAKE_KEY.slice(14, 40)))).toEqual([]);
});

/**
 * Serious and critical axe findings on the whole window, as "rule: target" lines. One kind is kept apart, not dropped: the
 * locked composer's hint ("Connect your AI first…") while the composer is disabled. WCAG 2.2 SC 1.4.3 exempts text that is
 * part of an inactive control; axe still flags it, so the report lists it under `exempt` for a person to confirm.
 */
async function axe(page: Page, exempt: string[]): Promise<string[]> {
  // Measure the settled screen: a card that just changed state fades in (Card.module.css card-fade), and mid-fade text is
  // blended with the page. Finite animations only; an endless shimmer would never finish.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity))
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const r = await new AxeBuilder({ page }).setLegacyMode(true).analyze();
  const locked = t('setup.composer.locked');
  const disabled = await page
    .getByTestId(TID.composerField)
    .isDisabled()
    .catch(() => false);
  const out: string[] = [];
  for (const v of r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical'))
    for (const n of v.nodes) {
      const line = `${v.id}: ${n.target.join(' ')} ${n.html.slice(0, 80)} (${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 160)})`;
      if (v.id === 'color-contrast' && disabled && n.html.includes(locked)) exempt.push(line);
      else out.push(line);
    }
  return out;
}

test('QA-B1-A01 · batch-1 screens pass axe (serious and critical) in light and dark: Welcome, Find your AI, chat, Settings', async () => {
  test.setTimeout(180_000);
  const dirs = testDirs();
  const script = join(dirs.FOO_DATA_DIR, '..', 'fake-ai.jsonl');
  mkdirSync(join(dirs.FOO_DATA_DIR, '..'), { recursive: true });
  writeFileSync(script, LINES.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const app = await launch(dirs, [], {
    FOO_FAKE_AI: script,
    FOO_TEST_FIRST_RUN: '1',
    FOO_TEST_AI_HOME: aiHome(['claude']),
    FOO_FEATURES: BATCH_1,
  });
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800));
  const found: Record<string, string[]> = {};
  const exempt: string[] = [];
  const theme = (v: 'light' | 'dark') => page.evaluate((x) => window.foo.invoke('settings:set', { path: 'appearance.theme', value: x }), v);
  const both = async (name: string) => {
    for (const v of ['light', 'dark'] as const) {
      await theme(v);
      await expect(page.locator('html')).toHaveAttribute('data-theme', v);
      found[`${name}-${v}`] = await axe(page, exempt);
      await shot(page, `a11y-${name}-${v}`);
    }
  };
  await both('welcome');
  await page.getByTestId(TID.setupWelcomeStart).click();
  await expect(finderRow(page, 'claude-cli')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  await both('finder');
  const use = page.getByTestId(TID.setupAiUse);
  if (await use.count()) await use.first().click();
  await page.getByTestId(TID.setupSkipRest).click();
  await expect(page.getByTestId(TID.composerField)).toBeEnabled({ timeout: 20_000 });
  await say(page, 'hi foo, kaise ho?');
  await both('chat');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.send('navigate', { view: { kind: 'settings', page: 'appearance' } }),
  );
  await page.getByTestId(TID.screenSettings).waitFor();
  await both('settings');
  await app.close();
  const all = Object.entries(found).flatMap(([k, v]) => v.map((x) => `${k} ${x}`));
  evidence({
    id: 'QA-B1-A01',
    request: ['Welcome', 'Find your AI', 'chat', 'Settings › Appearance', '× light, dark'],
    state: { screens: Object.keys(found).length, findings: all.length, exempt },
    expected: 'no serious or critical axe finding',
    actual: all.length ? all.slice(0, 20).join(' | ') : 'none',
  });
  expect(all).toEqual([]);
});
