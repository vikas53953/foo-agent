// Spec: 10-acceptance-2 §D ART-08a (seed the canaries as AI key, site password, card number, CVV and OTP, run the app,
// search everything it left behind). The M5 secret journeys, through the real paths: 04-2 §22.4 paste catcher ("Move to
// secret box" for the AI key and the card; "Send anyway" for a password, a CVV and a code: the bubble keeps "•••• (hidden)"),
// 05-2 §5.8 Secret box (Save securely; the card form never saves the CVV, §5.8.4), the code box (`code:submit` registers
// the code and hands the engine a ref, 08-1 §3.2), a login box, and an AI turn after every value is in (the captured request
// body is searched). Shared by test/e2e/m5-canary.spec.ts and the foo-verify journey. No real key, card or code.
import type { ElectronApplication, Page } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { envelope, VERIFY_OK, type FakeLine } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { byTid, openChat, openWorld, windowSize } from '../fidelity/capture';
import { CANARIES, groupedCard } from './canaries';
import { scan, type ScanReport, type TextSource } from './scan';

/** The fake AI: every verify passes and every intake turn answers "Okay." (08-3 §22.3). */
export const CANARY_AI: FakeLine[] = [VERIFY_OK, { match: { purpose: 'intake' }, reply: envelope('Okay.'), once: false }];

/** M5 has no export zip, toast or crash reporter yet; the report names them so a later milestone adds them here. */
export const NOT_COVERED_M5: ScanReport['notCovered'] = [
  { what: 'export zip', why: 'Export (08-3 §19.4) is M12; nothing to search in M5' },
  { what: 'toasts', why: 'Windows toasts are M11; in M5 a toast request is only a tech-log line, which is searched' },
  { what: 'crash reports', why: 'crashReporter (08-3 §19.2) starts in a later milestone; {DATA}/logs/crashes is searched if present' },
  { what: 'OCR of screenshots and live-view frames', why: 'M5 searches the DOM at each capture (G-M5-35); OCR and live view come later' },
  { what: 'a job that uses the key (vault.use → AI request header)', why: 'no real AI call in M5; the fake AI never reads the key' },
  { what: '{LOCAL}', why: 'searched, but M5 writes nothing there (caches and the voice pack come later)' },
];

/**
 * What one picture shows, as text: the markup, the rendered text, and the value of every field that is not a password field
 * (React sets `value` as a property, so neither the markup nor innerText holds it; an unmasked field would slip past both).
 */
export async function captureTexts(page: Page, label: string): Promise<TextSource[]> {
  const [markup, rendered, values] = await Promise.all([
    page.content(),
    page.evaluate(() => document.body.innerText),
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
        .filter((el) => el.type !== 'password')
        .map((el) => el.value)
        .join('\n'),
    ),
  ]);
  return [
    { source: 'dom', label, text: markup },
    { source: 'dom-text', label, text: rendered },
    { source: 'field-values', label, text: values },
  ];
}

/** Every request the fake AI recorded, whole (system prompt, prompt, purpose): the AI request bodies. */
export const aiRequestTexts = (turns: { turnId: string }[]): TextSource[] =>
  turns.map((t) => ({ source: 'ai-request', label: t.turnId, text: JSON.stringify(t) }));

const RUN_ON = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls `check` (real time, fake clock moved a little each round so the runner's timers go on). */
async function until(page: Page, check: () => Promise<boolean>, what: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (await check()) return;
    await page.evaluate(() => window.__fooTest!.clock.advance(250));
    await sleep(RUN_ON / 2);
  }
  throw new Error(`canary run: timed out waiting for ${what}`);
}

async function typeAndCatch(page: Page, text: string): Promise<void> {
  await page.getByTestId(TID.composerField).focus();
  // "Move to secret box" leaves the rest of the line in the field (04-2 §22.4); each step starts from an empty field.
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.getByTestId(TID.composerPaste).waitFor();
}

async function savedState(card: ReturnType<Page['locator']>, page: Page, state: string, what: string): Promise<void> {
  await until(page, async () => (await card.getAttribute('data-card-state')) === state, what);
}

/** Seeds a Secret box the engine would ask with (test:card.seed, CR-0009), and returns its locator. */
async function seedSecret(page: Page, payload: Record<string, unknown>) {
  const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), { type: 'secret' as const, state: 'asking', payload });
  const card = page.locator(`${byTid(TID.cardSecret)}[data-card-id="${r.cardId}"]`);
  await until(
    page,
    async () => {
      await card.scrollIntoViewIfNeeded({ timeout: 1_000 }).catch(() => undefined);
      return card.isVisible();
    },
    `the ${String(payload.secretKind)} box`,
  );
  return card;
}

/**
 * Drives the five canaries through the app. `snap` is called at each step; it returns the DOM text captured with the
 * step's picture (05-2 §5.8.5: a value is never in the markup a screenshot is taken from).
 */
export async function driveCanaries(page: Page, snap: (name: string) => Promise<void>): Promise<void> {
  const { aiKey, sitePassword, cardNumber, cvv, otp } = CANARIES;
  await openChat(page, 'foo');

  // 1. AI key: typed, caught (P1), moved to its Secret box, saved.
  await typeAndCatch(page, `here is my OpenAI key ${aiKey.value}`);
  await snap('ai-key-caught');
  await page.getByTestId(TID.composerPasteMove).click();
  const keyBox = page.locator(byTid(TID.cardSecret)).last();
  await keyBox.getByTestId(TID.cardSecretSave).click();
  await savedState(keyBox, page, 'saved', 'the OpenAI key saved');
  await snap('ai-key-saved');

  // 2. Card number and CVV: typed, caught (P12), moved to the card form; the CVV is typed into its field (never saved).
  await typeAndCatch(page, `my card ${groupedCard(cardNumber.value)}`);
  await page.getByTestId(TID.composerPasteMove).click();
  const cardBox = page.locator(byTid(TID.cardSecret)).last();
  const fields = cardBox.getByTestId(TID.cardSecretField);
  await until(page, async () => (await fields.count()) === 4 && (await fields.nth(0).inputValue()) !== '', 'the card form');
  await fields.nth(1).fill('08/29');
  await fields.nth(2).fill(cvv.value);
  await fields.nth(3).fill('Asha Example');
  await snap('card-form-filled');
  await cardBox.getByTestId(TID.cardSecretSave).click();
  await savedState(cardBox, page, 'saved', 'the card saved');
  await snap('card-saved');

  // 3. Site password: the login box foo asks with, filled and saved.
  const login = await seedSecret(page, { secretKind: 'login', name: 'example.com login', why: '', fields: [], vaultName: 'example.com' });
  await login.getByTestId(TID.cardSecretField).nth(0).fill('asha@example.com');
  await login.getByTestId(TID.cardSecretField).nth(1).fill(sitePassword.value);
  await login.getByTestId(TID.cardSecretSave).click();
  await savedState(login, page, 'saved', 'the login saved');
  await snap('login-saved');

  // 4. OTP: the code box foo asks with; Use code hands it to the engine (code:submit).
  const code = await seedSecret(page, { secretKind: 'otp', name: 'Code', why: '', fields: [], requestId: 'req_canary_otp' });
  await code.getByTestId(TID.cardSecretField).fill(otp.value);
  await code.getByTestId(TID.cardSecretUseCode).click();
  await savedState(code, page, 'saved', 'the code used');
  await snap('code-used');

  // 5. "Send anyway" with each value in a chat message: the bubble keeps "•••• (hidden)", the AI gets the hidden note.
  for (const text of [`my password is ${sitePassword.value}`, `the CVV is ${cvv.value}`, `OTP is ${otp.value}`]) {
    await typeAndCatch(page, text);
    await page.getByTestId(TID.composerPasteSend).click();
    await page.getByTestId(TID.composerPaste).waitFor({ state: 'hidden' });
  }
  await snap('sent-anyway');
}

export interface CanaryDirs {
  FOO_DATA_DIR: string;
  FOO_LOCAL_DIR: string;
  FOO_OUT_DIR: string;
}

/** Opens the ux-world at X-10 in a 1440 × 900 window (the right shell open), with the seeded jobs ended. */
export async function openCanaryWorld(app: ElectronApplication, page: Page): Promise<void> {
  await settleSeededJobs(page, await openWorld(app, page));
  await windowSize(app, page, 1440, 900);
}

/** Waits until the fake AI has recorded `n` intake requests (each is a captured AI request body). */
export async function untilAiTurns(page: Page, count: () => number, n: number): Promise<void> {
  await until(page, async () => count() >= n, `${n} AI requests`);
}

/** Searches every folder the run wrote, plus the DOM captures, the process output and the AI request bodies. */
export function scanRun(dirs: CanaryDirs, texts: TextSource[]): ScanReport {
  return scan(
    {
      roots: { DATA: dirs.FOO_DATA_DIR, LOCAL: dirs.FOO_LOCAL_DIR, OUT: dirs.FOO_OUT_DIR },
      texts,
      canaries: Object.values(CANARIES),
    },
    NOT_COVERED_M5,
  );
}
