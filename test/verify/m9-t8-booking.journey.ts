// Spec: 07-1 J9 (a table for 4: options, the Approval card, "Booked." with proof), AT-037 (one submit), AT-114a (the booking
// code as proof), AT-144 (the recipe keeps role + name, never values), 08-2 §8.3.8 (step pictures), §8.3.9 (site notes),
// §10.4 (browser.submit once after the write-ahead). foo-verify journey for M9 T8: the real app on the fake AI, foo's real
// browser on the T2 sandbox restaurant (`tablejoy.test`, mapped onto 127.0.0.1, its key trusted, test runs only); light and
// dark. Fictional places, a made-up name; never a real booking. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m9-t8-booking.journey.ts
import type { Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import {
  SETUP_LINES,
  advanceUntil,
  bookedLine,
  bookingIntake,
  lastCard,
  requestBooking,
  say,
  stepLine,
  toolLine,
} from '../e2e/m9-booking-world';
import { settleSeededJobs } from '../e2e/m4-start';
import { byTid, openChat, openWorld, rest, setTheme, settle, windowSize } from '../fidelity/capture';
import { control } from '../sites/client';
import { startSandbox } from '../sites/server';

const ASK = 'book a table for 4 at an Italian place in Bandra on Sunday';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(what);
}

async function both(v: Verify, page: Page, name: string, sel?: string): Promise<void> {
  await rest(page);
  await settle(page);
  await v.shot(name, sel);
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot(name, sel);
  await setTheme(page, 'light');
}

export default async function journey(v: Verify): Promise<void> {
  const sb = await startSandbox();
  try {
    const { app, page } = await v.launch({
      fakeAi: [
        ...SETUP_LINES,
        bookingIntake(ASK, 'Table for 4 on Sunday'),
        toolLine('browser.open', { url: sb.url('restaurant', '/') }),
        toolLine('browser.snapshot', {}),
        stepLine({
          kind: 'ask',
          card: {
            question: 'Which place for Sunday?',
            options: [
              { label: 'Coastline Kitchen', detail: 'Marine Drive · 4.5' },
              { label: 'Saffron Table', detail: 'Bandra West · 4.3' },
              { label: 'Bay Leaf Pizzeria', detail: 'Colaba · 4.4' },
            ],
          },
        }),
        toolLine('browser.open', { url: sb.url('restaurant', '/book/coastline?party=4&time=8:00 PM') }),
        toolLine('browser.snapshot', {}),
        requestBooking(4),
        bookedLine(5),
      ],
      env: {
        FOO_TEST_ALLOW_HOSTS: sb.allowHosts,
        FOO_TEST_BROWSER_HOST_RULES: sb.resolverRules,
        FOO_TEST_BROWSER_SPKI: sb.cert.spkiSha256,
        FOO_TEST_TOOL_IDS: 'counting',
      },
    });
    await settleSeededJobs(page, await openWorld(app, page, '2026-10-16T11:01:00+05:30'));
    await windowSize(app, page, 1440, 900);
    await setTheme(page, 'light');
    await openChat(page, 'Home');
    const dataDir = (await app.evaluate(() => process.env.FOO_DATA_DIR)) as string;
    const db = new Database(join(dataDir, 'data', 'foo.db'), { readonly: true, fileMustExist: true });

    // 1 · the ask; three options from the site.
    await say(page, ASK);
    const options = lastCard(page, TID.cardChoice);
    await advanceUntil(page, options);
    const rows = options.getByTestId(TID.cardChoiceOption);
    check((await rows.count()) === 3, 'three options');
    check((await page.getByTestId(TID.cardApproval).count()) === 0, 'no Approval card before a place is picked');
    v.note('Three options shown (Coastline Kitchen, Saffron Table, Bay Leaf Pizzeria); no Approval card yet');
    await both(v, page, 'options', byTid(TID.cardChoice));
    await rows.nth(0).click();

    // 2 · the Approval card (booking variant), nothing submitted yet.
    const approval = lastCard(page, TID.cardApproval);
    await advanceUntil(page, approval);
    const primary = await approval.getByTestId(TID.cardApprovalApprove).innerText();
    check(primary.includes(t('cards.approval.book.primary.table')), `primary button: ${primary}`);
    check(((await control(sb, 'restaurant')).counters.submits ?? 0) === 0, 'no submit before the tap');
    v.note(`Approval card: "${(await approval.innerText()).split('\n').slice(0, 4).join(' · ')}"; submits so far 0`);
    await both(v, page, 'approval', byTid(TID.cardApproval));

    // 3 · Book table → one submit, "Booked." with the code as proof.
    await approval.getByTestId(TID.cardApprovalApprove).click();
    const proof = page.getByTestId(TID.threadLog).getByTestId(TID.threadProofChip);
    await advanceUntil(page, proof);
    const submits = (await control(sb, 'restaurant')).counters.submits;
    check(submits === 1, `submits ${String(submits)}`);
    const job = db.prepare("SELECT id, state, proof FROM jobs WHERE title LIKE '%Table%' ORDER BY created_at DESC LIMIT 1").get() as {
      id: string;
      state: string;
      proof: string;
    };
    check(job.state === 'done', `job state ${job.state}`);
    check((JSON.parse(job.proof) as { code: string }).code === 'TJ8821', 'proof code TJ8821');
    v.note(`Booked: job done with proof ${job.proof}; the sandbox counted ${String(submits)} submit`);
    const tools = (
      db.prepare('SELECT tool FROM tool_calls WHERE job_id = ? ORDER BY started_at, id').all(job.id) as { tool: string }[]
    ).map((r) => r.tool);
    v.note(`Tool calls: ${tools.join(', ')}`);
    check(tools.filter((x) => x === 'browser.submit').length === 1, 'exactly one browser.submit');
    // The ask's badge follows the job to ✅ (it lands just after the proof chip).
    const askBadge = page.getByTestId(TID.threadLog).getByTestId(TID.bubbleBadge).last();
    for (let i = 0; i < 50 && (await askBadge.getAttribute('data-state')) !== 'done'; i++) await page.waitForTimeout(100);
    check((await askBadge.getAttribute('data-state')) === 'done', 'the ask shows ✅');
    await both(v, page, 'booked', byTid(TID.threadLog));

    // 4 · side effects: step pictures, the site note, the saved recipe (no values).
    const steps = join(dataDir, 'jobs', job.id, 'steps');
    const pics = existsSync(steps) ? readdirSync(steps) : [];
    check(
      pics.some((f) => f.startsWith('shot-')),
      'a masked picture after browser.submit',
    );
    v.note(`Step pictures: ${pics.join(', ')}`);
    const note = db.prepare("SELECT flags FROM site_notes WHERE domain = 'tablejoy.test'").get() as { flags: string } | undefined;
    check(Boolean(note && (JSON.parse(note.flags) as { bookingWorks?: boolean }).bookingWorks), 'site note bookingWorks');
    v.note(`Site note tablejoy.test: ${note!.flags}`);
    const asked = db.prepare('SELECT badge FROM messages WHERE id = (SELECT user_message_id FROM jobs WHERE id = ?)').get(job.id) as {
      badge: string;
    };
    v.note(`The ask's badge in the DB: ${asked.badge}`);
    db.close();
  } finally {
    await sb.close();
  }
}
