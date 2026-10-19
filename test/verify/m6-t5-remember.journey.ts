// Spec: 08-3 §12.4.2 (chip placement, R-20; no "Got it." bubble), 05-3 §5.17.1 (the chip's kinds, Undo, "Forgot it…"),
// CR-0010 G-M6-03 (chat "remember" = the manual-add path), G-M6-04 (chat "forget": one match → forget + 5 s Undo chip),
// J17 ("don't remember this" → "Not saving this one."). M6 T5 proof in the foo chat, typed the way Vikas would; the
// post-turn review and AT-076 are proven in test/integration/m6-review.test.ts and the "Used:" chip in UX-10-02:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m6-t5-remember.journey.ts
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import type { MemoryFactView } from '../../src/shared/types';
import { settleSeededJobs } from '../e2e/m4-start';
import { envelope, type FakeLine } from '../e2e/fakeAi';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const REMEMBER = 'remember that my sister’s flat is in Koregaon Park';
const FACT = 'Sister’s flat is in Koregaon Park';
const PRIVATE = "don't remember this, but my PIN hint is our dog's name";
const FORGET = 'forget that I take the train to Pune, not the bus';
const SEEDED = 'Takes the train to Pune, not the bus';
const memory = (op: 'remember' | 'forget', text: string) =>
  `<say></say><act>${JSON.stringify({ decision: { kind: 'memory', op, text }, usedMemoryIds: [] })}</act>`;
const SCRIPT: FakeLine[] = [
  { match: { purpose: 'intake', promptIncludes: 'Koregaon Park' }, reply: memory('remember', FACT) },
  { match: { purpose: 'intake', promptIncludes: 'PIN hint' }, reply: envelope('Okay, I won’t keep that.') },
  { match: { purpose: 'intake', promptIncludes: 'train to Pune' }, reply: memory('forget', 'I take the train to Pune, not the bus') },
];

type R<T> = { ok: true; value: T } | { ok: false; error: { kind: string; message?: string } };
const list = async (page: Page) => {
  const r = (await page.evaluate(() => window.foo.invoke('memory:list', { filter: { chip: 'all' } }))) as R<MemoryFactView[]>;
  if (!r.ok) throw new Error(`memory:list: ${r.error.kind}`);
  return r.value;
};

async function send(page: Page, text: string): Promise<void> {
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** Advances the fake clock until `done` holds (the engine's writes land on its own schedule). */
async function until(page: Page, what: string, done: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 120; i++) {
    if (await done()) return;
    await page.evaluate(() => window.__fooTest!.clock.advance(250));
    await page.waitForTimeout(50);
  }
  throw new Error(`never happened: ${what}`);
}

async function both(v: Verify, page: Page, name: string, sel: string): Promise<void> {
  await page.getByTestId(TID.threadLog).evaluate((el) => (el.scrollTop = el.scrollHeight));
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await rest(page);
    await settle(page);
    await v.shot(name, sel);
  }
  await setTheme(page, 'light');
}

export default async function journey(v: Verify): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'foo-m6-t5-proof-'));
  const data = join(base, 'data');
  const { app, page } = await v.launch({ fakeAi: SCRIPT, env: { FOO_DATA_DIR: data, FOO_LOCAL_DIR: join(base, 'local') } });
  await settleSeededJobs(page, await openWorld(app, page));
  await openChat(page, 'foo');
  const log = page.getByTestId(TID.threadLog);
  const chips = log.locator(`${byTid(TID.threadMarker)}[data-state="memory"]`);
  const chipFor = (text: string): Locator => chips.filter({ hasText: text });
  const foos = async () => log.getByTestId(TID.bubbleFoo).count();

  // 1. "remember …": 👍 on my bubble, the chip under it, no "Got it." bubble; the line is in about-you.md.
  const foosBefore = await foos();
  await send(page, REMEMBER);
  await until(page, 'the saved chip', async () => (await chipFor(FACT).count()) === 1);
  const saved = chipFor(FACT);
  if ((await saved.textContent())?.trim() !== `${t('memory_chip.line.saved', { fact: FACT })}${t('memory_chip.button.undo')}`)
    throw new Error(`saved chip reads "${await saved.textContent()}"`);
  const mine = log.locator('[data-message-id]', { has: page.getByTestId(TID.bubbleMe).filter({ hasText: REMEMBER }) });
  await until(page, 'a 👍 on my bubble', async () => (await mine.getByTestId(TID.bubbleReaction).filter({ hasText: '👍' }).count()) > 0);
  if ((await foos()) !== foosBefore) throw new Error('foo wrote a bubble for a plain "remember"');
  const file = readFileSync(join(data, 'memory', 'about-you.md'), 'utf8');
  const line = file.split('\n').find((l) => l.startsWith(`- ${FACT}  {you said · 2026-10-16 · chat · `));
  if (!line) throw new Error('the fact is not in about-you.md');
  v.note(`typed "${REMEMBER}": 👍 on my bubble, chip "${t('memory_chip.line.saved', { fact: FACT })}" + Undo, no foo bubble`);
  v.note(`about-you.md gained: ${line}`);
  await both(v, page, 'remember-chip', byTid(TID.threadLog));

  // 2. Undo on the chip: the fact goes (tombstoned), the chip says so.
  await saved.getByTestId(TID.threadMemoryUndo).click();
  const undone = chips.filter({ hasText: t('memory_chip.line.undone') });
  await until(page, 'the undone chip', async () => (await undone.count()) === 1);
  if ((await list(page)).some((f) => f.text === FACT)) throw new Error('the fact is still in memory after Undo');
  if (!readFileSync(join(data, 'memory', '.tombstones'), 'utf8').includes('"chat"')) throw new Error('no chat tombstone');
  v.note(`Undo → chip "${t('memory_chip.line.undone')}"; memory:list no longer has it; a tombstone keeps it from coming back`);
  await both(v, page, 'remember-undone', byTid(TID.threadLog));

  // 3. "don't remember this …": the not-saving chip, nothing saved.
  const count = (await list(page)).length;
  await send(page, PRIVATE);
  const notSaving = chips.filter({ hasText: t('memory_chip.line.not_saving') });
  await until(page, 'the not-saving chip', async () => (await notSaving.count()) === 1);
  if ((await list(page)).length !== count) throw new Error('a "don’t remember this" message changed memory');
  v.note(`typed "${PRIVATE}": chip "${t('memory_chip.line.not_saving')}", memory unchanged (${count} facts)`);
  await both(v, page, 'not-saving-chip', byTid(TID.threadLog));

  // 4. "forget …" with one match: forgotten, chip "Forgot it…" with a 5 s Undo.
  if (!(await list(page)).some((f) => f.text === SEEDED)) throw new Error(`the seed has no "${SEEDED}"`);
  await send(page, FORGET);
  const forgot = chips.filter({ hasText: t('memory_chip.line.forgotten') });
  await until(page, 'the forgot chip', async () => (await forgot.count()) === 1);
  if ((await list(page)).some((f) => f.text === SEEDED)) throw new Error('the matched fact is still there');
  if ((await forgot.getByTestId(TID.threadMemoryUndo).count()) !== 1) throw new Error('no Undo on the forgot chip');
  v.note(`typed "${FORGET}": "${SEEDED}" forgotten, chip "${t('memory_chip.line.forgotten')}" with Undo`);
  // The store's Undo lasts 5 s on the fake clock and settling a shot moves that clock, so one shot, then Undo at once;
  // the dark shot shows the chip after the Undo.
  await page.getByTestId(TID.threadLog).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await v.shot('forget-chip', byTid(TID.threadLog));
  await forgot.getByTestId(TID.threadMemoryUndo).click();
  await until(page, 'the fact back', async () => (await list(page)).some((f) => f.text === SEEDED));
  v.note(`its Undo inside 5 s put "${SEEDED}" back`);
  await both(v, page, 'forget-undone', byTid(TID.threadLog));

  // The run's own data folder (FOO_DATA_DIR above) holds what the fake AI was asked.
  const turns = readFileSync(join(data, 'test', 'turns.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => (JSON.parse(l) as { purpose: string }).purpose);
  if (turns.filter((p) => p === 'intake').length !== 3) throw new Error(`fake turns: ${turns.join(', ')}`);
  v.note(`the fake AI was asked: ${turns.join(', ')}`);
}
