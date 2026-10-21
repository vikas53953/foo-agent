// Spec: 10-acceptance-2 §C.9 AT-363 ("foo read:": the line shows the people, places, dates, times and amounts understood,
// and never a secret), AT-364 (Ask about this: a side question is answered while a running job keeps running; its checklist
// does not stop or re-plan), AT-365 (paste bands: ≤ 2,000 inline; 2,001–10,000 "Pasted text" chip; > 10,000
// `pasted-{time}.txt` file chip; the paste catcher runs first in every band); 04 §6.5, §1.9, §17.4, §17.5, 04-2 §22.4,
// §22.5, CR-0022 picks 6, 7 (X-180). Every reply comes from the fake AI (08-3 §22.3); sample data only.
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { openChat, openWorld, windowSize } from '../fidelity/capture';
import { envelope, fakeTurns, intake, launchWithFakeAi, VERIFY_OK, type FakeLine } from './fakeAi';
import type { testDirs } from './launch';
import { settleSeededJobs } from './m4-start';
import { typeInComposer } from './typeInComposer';

const BOOK = 'Book a table for 4 at Toit on Fri 7 pm';
const SECRET_ASK = 'my password is hunter2xyz, meet at Toit tomorrow';
const EMI_ASK = 'what is my loan EMI';
const EMI_SAY = 'Your EMI is ₹12,400 a month for 5 years.';
const JOB_ASK = 'Find my bills due this week sideq';
const SIDE_ASK = 'what does EMI stand for';
const SIDE_SAY = 'EMI means equated monthly instalment.';

const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;

const SCRIPT: FakeLine[] = [
  VERIFY_OK,
  intake(BOOK, 'Sure, I can look for a table at Toit.'),
  intake('at Toit tomorrow', 'I hid that. Shall I look at Toit for tomorrow?'),
  intake(EMI_ASK, EMI_SAY),
  // The side question's prompt carries the quoted words and the question (ChatLane.sideMessage).
  { match: { purpose: 'intake', promptIncludes: SIDE_ASK }, reply: envelope(SIDE_SAY) },
  {
    match: { purpose: 'intake', promptIncludes: 'sideq' },
    reply: act({
      kind: 'job',
      title: 'Bills',
      plan: [
        { phraseKey: 'read_email', slots: {}, route: 'api' },
        { phraseKey: 'look_for', slots: { what: 'bills' }, route: 'api' },
      ],
      estimate: { minutes: 1 },
      routeHint: ['api'],
      needsApps: [],
    }),
  },
  // The job's first step is held, so the job is still running when the side question comes.
  { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: 600_000, once: false },
];

let app: ElectronApplication;
let page: Page;
let dirs: ReturnType<typeof testDirs>;

const field = () => page.getByTestId(TID.composerField);
const log = () => page.getByTestId(TID.threadLog);
const foos = (text: string) => log().getByTestId(TID.bubbleFoo).filter({ hasText: text });
const readLine = () => log().getByTestId(TID.bubbleReadLine);

function db<T>(fn: (d: Database.Database) => T): T {
  const d = new Database(join(dirs.FOO_DATA_DIR, 'data', 'foo.db'), { readonly: true });
  try {
    return fn(d);
  } finally {
    d.close();
  }
}

/** The log keeps only rows near the viewport in the DOM; pin it to the newest row. */
const toNewest = () =>
  log().evaluate(async (el) => {
    for (let i = 0; i < 6; i++) {
      el.scrollTop = el.scrollHeight;
      await new Promise((r) => requestAnimationFrame(r));
    }
  });

async function send(text: string) {
  await typeInComposer(page, text);
  await page.keyboard.press('Enter');
}

async function paste(text: string) {
  await field().evaluate((el, s) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', s);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}

async function clearComposer() {
  await field().focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  for (let i = (await page.getByTestId(TID.composerChipRemove).count()) - 1; i >= 0; i--)
    await page.getByTestId(TID.composerChipRemove).nth(i).click();
  await expect(page.getByTestId(TID.composerChip)).toHaveCount(0);
}

/** A sample long text with no secret-looking strings (words with spaces; the high-entropy rule P17 never fires). */
const words = (n: number) => 'the quick brown fox jumps over the lazy dog '.repeat(Math.ceil(n / 44)).slice(0, n);

test.beforeAll(async () => {
  const run = await launchWithFakeAi(SCRIPT);
  app = run.app;
  dirs = run.dirs;
  page = await app.firstWindow();
  const refs = await openWorld(app, page);
  await settleSeededJobs(page, refs);
  await windowSize(app, page, 1440, 900);
  await openChat(page, 'foo');
});
test.afterAll(async () => app?.close());

test('AT-363 "foo read:" shows the people, places, dates, times and amounts, under the last user bubble only, never a secret', async () => {
  await send(BOOK);
  await expect(foos('a table at Toit')).toBeVisible();
  await toNewest();
  const label = t('bubble.read.label', { agentName: 'foo' });
  const items = [t('bubble.read.people', { n: 4 }), 'Toit', 'Fri 16 Oct, 7:00 PM'].join(' · ');
  await expect(readLine()).toHaveText(`${label} ${items}`);
  await expect(readLine()).toHaveAttribute('aria-label', t('bubble.read.accessible_name', { agentName: 'foo', items }));
  expect(db((d) => d.prepare('SELECT understood FROM messages WHERE text = ?').pluck().get(BOOK))).toBe(
    JSON.stringify([t('bubble.read.people', { n: 4 }), 'Toit', 'Fri 16 Oct, 7:00 PM']),
  );

  // A secret in the next message: the catcher hides it ("Send anyway"), and the line shows only what is left.
  await send(SECRET_ASK);
  await expect(page.getByTestId(TID.composerPaste)).toBeVisible();
  await page.getByTestId(TID.composerPasteSend).click();
  await expect(foos('Toit for tomorrow')).toBeVisible();
  await toNewest();
  await expect(readLine()).toHaveCount(1);
  await expect(readLine()).toHaveText(`${label} Toit · Sat 17 Oct`);
  expect(await log().innerText()).not.toContain('hunter2xyz');
  const stored = db((d) => d.prepare("SELECT understood FROM messages WHERE text LIKE '%at Toit tomorrow'").pluck().get()) as string;
  expect(stored).not.toContain('hunter2xyz');
});

test('AT-364 a side question is answered while a running job keeps running (no stop, no re-plan)', async () => {
  await send(EMI_ASK);
  await expect(foos(EMI_SAY)).toBeVisible();
  await send(JOB_ASK);
  const bills = () =>
    db(
      (d) =>
        d.prepare('SELECT j.id, j.state FROM jobs j JOIN messages m ON m.id = j.user_message_id WHERE m.text = ?').get(JOB_ASK) as
          { id: string; state: string } | undefined,
    );
  await expect.poll(() => bills()?.state).toBe('working');
  const job = bills()!;
  const stepsBefore = db((d) => d.prepare('SELECT idx, phrase_key, state FROM steps WHERE job_id = ? ORDER BY idx').all(job.id));
  const intakesBefore = fakeTurns(dirs).filter((x) => x.purpose === 'intake').length;

  // The pill: a selection inside foo's bubble shows "Ask about this"; a click opens the side strip quoting the words.
  await toNewest();
  const bubble = foos(EMI_SAY).last();
  await bubble.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode()))
      if (node.textContent?.includes('EMI')) {
        const at = node.textContent.indexOf('EMI');
        const r = document.createRange();
        r.setStart(node, at);
        r.setEnd(node, at + 3);
        const sel = document.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(r);
        return;
      }
  });
  await expect(page.getByTestId(TID.bubbleAskPill)).toHaveText(t('bubble.ask.pill'));
  await page.getByTestId(TID.bubbleAskPill).click();
  const strip = page.getByTestId(TID.composerSideStrip);
  await expect(strip).toContainText(t('composer.side.label'));
  await expect(strip).toContainText('EMI');
  await expect(page.getByTestId(TID.composerSideStripClose)).toHaveAttribute('aria-label', t('composer.side.close'));
  await page.getByTestId(TID.composerSideStripClose).click();
  await expect(strip).toHaveCount(0);

  // The same from foo's message menu: the whole message is quoted.
  await bubble.click({ button: 'right' });
  await page.getByTestId(TID.bubbleMenuAsk).click();
  await expect(strip).toContainText(EMI_SAY);
  await send(SIDE_ASK);
  await expect(strip).toHaveCount(0);
  await expect(foos(SIDE_SAY)).toBeVisible();

  // The side question and its answer are marked; the job is still running with the same checklist.
  const rows = db((d) =>
    d.prepare('SELECT author_kind, side, reply_to_id FROM messages WHERE text IN (?, ?) ORDER BY seq').all(SIDE_ASK, SIDE_SAY),
  ) as {
    author_kind: string;
    side: number;
    reply_to_id: string | null;
  }[];
  expect(rows.map((r) => [r.author_kind, r.side])).toEqual([
    ['user', 1],
    ['foo', 1],
  ]);
  expect(rows[0]!.reply_to_id).toBeTruthy();
  const after = db((d) => d.prepare('SELECT state FROM jobs WHERE id = ?').pluck().get(job.id));
  expect(after).toBe(job.state);
  expect(db((d) => d.prepare('SELECT idx, phrase_key, state FROM steps WHERE job_id = ? ORDER BY idx').all(job.id))).toEqual(stepsBefore);
  // One intake turn for the side question; no second turn re-planned the job.
  expect(fakeTurns(dirs).filter((x) => x.purpose === 'intake').length).toBe(intakesBefore + 1);
  expect(
    fakeTurns(dirs)
      .filter((x) => x.purpose === 'intake')
      .at(-1)!.prompt,
  ).toContain(EMI_SAY);
});

test('AT-365 paste bands: inline, "Pasted text" chip, pasted-{time}.txt file chip; the catcher runs first in every band', async () => {
  await clearComposer();
  // ≤ 2,000: inline.
  await paste(words(1_500));
  await expect(field()).toHaveText(words(1_500));
  await expect(page.getByTestId(TID.composerChip)).toHaveCount(0);
  await clearComposer();

  // 2,001–10,000: the "Pasted text" chip.
  await paste(words(5_000));
  await expect(page.getByTestId(TID.composerChip)).toContainText(t('composer.chip.pasted_name'));
  await expect(field()).toHaveText('');
  await clearComposer();

  // > 10,000: saved as pasted-{time}.txt, a file chip; Send carries the file.
  await paste(words(14_200));
  const chip = page.getByTestId(TID.composerChip);
  await expect(chip).toContainText(/pasted-2026-10-16-\d{4}\.txt/);
  await expect(chip).toContainText('TXT');
  await expect(field()).toHaveText('');
  await page.getByTestId(TID.composerSend).click();
  await toNewest();
  await expect(
    log()
      .getByTestId(TID.bubbleFile)
      .filter({ hasText: /pasted-2026-10-16-\d{4}\.txt/ })
      .last(),
  ).toBeVisible();

  // The catcher first, in each band: a key inside the paste opens the panel before anything is inserted or saved.
  for (const n of [1_500, 5_000, 14_200]) {
    await clearComposer();
    await paste(`${words(n - 60)} sk-proj-AbCdEfGhIjKlMnOpQrStUvWx1234 `);
    await expect(page.getByTestId(TID.composerPaste)).toBeVisible();
    expect(await page.getByTestId(TID.composer).innerText()).not.toContain('sk-proj-AbCd');
    await page.keyboard.press('Escape');
  }
  await clearComposer();
});
