// Spec: 08-3 §22.3 (fakes only), §22.5 (the sandbox booking sites), 08-4 §27.6 (FOO_TEST_ALLOW_HOSTS). Shared start for the
// M9 T8 booking specs and the foo-verify journey: the T2 sandbox over HTTPS, and the real app on the fake AI whose browser maps
// the sandbox `.test` names onto 127.0.0.1 and trusts only the sandbox key (FOO_TEST_BROWSER_HOST_RULES / _SPKI, test runs
// only). Tool calls are numbered tc_000001… (FOO_TEST_TOOL_IDS=counting) so the script can cite its own evidence and proof.
// Fictional places, a made-up name; never a real booking.
import { expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { TID } from '../../src/shared/testids';
import { control, type ControlState } from '../sites/client';
import { startSandbox, type Sandbox } from '../sites/server';
import { byTid, openChat, openWorld } from '../fidelity/capture';
import type { FakeLine } from './fakeAi';
import { launch, testDirs } from './launch';
import { settleSeededJobs } from './m4-start';

export const ASK_TABLES = 'are there tables at an Italian place in Bandra Saturday';

const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
export const stepLine = (decision: Record<string, unknown>, delayMs = 0): FakeLine => ({
  match: { purpose: 'step' },
  reply: act(decision),
  ...(delayMs ? { delayMs } : {}),
});
export const toolLine = (name: string, args: Record<string, unknown>, delayMs = 0) =>
  stepLine({ kind: 'tool', call: { tool: name, args }, why: 'next' }, delayMs);

export const SETUP_LINES: FakeLine[] = [
  { match: { purpose: 'verify' }, reply: 'ready', once: false },
  // 08-2 §9.6: the second look finds the card text matches the user's words.
  { match: { purpose: 'second_look' }, reply: `<say></say><act>${JSON.stringify({ match: true })}</act>`, once: false },
];

export const bookingIntake = (ask: string, title = 'Table on Saturday'): FakeLine => ({
  match: { purpose: 'intake', promptIncludes: ask },
  reply: act({
    kind: 'job',
    title,
    plan: [{ phraseKey: 'check_site', slots: { site: 'tablejoy.test' }, route: 'browser' }],
    estimate: { minutes: 2 },
    routeHint: ['browser'],
    needsApps: [],
  }),
});

const tc = (n: number) => `tc_${String(n).padStart(6, '0')}`;

/** The booking request on the Coastline page whose snapshot is tool call `snapAt` (its fee line is the evidence). */
export const requestBooking = (snapAt: number, delayMs = 0) =>
  stepLine(
    {
      kind: 'request_approval',
      draft: {
        verb: 'book',
        fields: {
          verb: 'book',
          payee: 'Coastline Kitchen',
          partySize: 4,
          cancelTerms: { refundable: true, feePaise: 1 },
          irreversible: false,
        },
        // `ref` marks the money evidence (08-4 §28.1 item 1); the engine reads the amount from the quoted line.
        evidence: [{ field: 'cancelTerms', toolCallId: tc(snapAt), quote: 'No-show fee ₹1,000', ref: 'e3' }],
      },
      submitRef: 'e3',
    },
    delayMs,
  );

export const bookedLine = (submitAt: number, delayMs = 0) =>
  stepLine(
    {
      kind: 'done',
      result: 'Booked. Coastline Kitchen, Sun 18 Oct at 8:00 PM for 4. Your code is TJ8821.',
      proof: { kind: 'confirmation', code: 'TJ8821', site: 'tablejoy.test', seenInToolCallId: tc(submitAt) },
    },
    delayMs,
  );

export interface BookingApp {
  app: ElectronApplication;
  page: Page;
  sb: Sandbox;
  /** The run's foo.db, read-only (the app keeps writing; WAL readers see each commit). */
  db(): Database.Database;
  control(): Promise<ControlState>;
  close(): Promise<void>;
}

/**
 * Starts the sandbox, writes the script and launches the app at Fri 16 Oct 2026 11:01 AM IST in the Home chat (`opts` moves
 * the start time and the chat, e.g. the walkthrough's foo chat at 9:05 AM in test/fidelity/ux/UX-12.restaurant.spec.ts).
 */
export async function startBooking(lines: (sb: Sandbox) => FakeLine[], opts: { at?: string; chat?: string } = {}): Promise<BookingApp> {
  const sb = await startSandbox();
  const dirs = testDirs();
  const script = join(dirname(dirs.FOO_DATA_DIR), 'fake-ai.jsonl');
  mkdirSync(dirname(script), { recursive: true });
  writeFileSync(
    script,
    lines(sb)
      .map((l) => JSON.stringify(l))
      .join('\n') + '\n',
  );
  const app = await launch(dirs, [], {
    FOO_FAKE_AI: script,
    FOO_TEST_ALLOW_HOSTS: sb.allowHosts,
    FOO_TEST_BROWSER_HOST_RULES: sb.resolverRules,
    FOO_TEST_BROWSER_SPKI: sb.cert.spkiSha256,
    FOO_TEST_TOOL_IDS: 'counting',
  });
  const page = await app.firstWindow();
  await settleSeededJobs(page, await openWorld(app, page, opts.at ?? '2026-10-16T11:01:00+05:30'));
  await openChat(page, opts.chat ?? 'Home');
  let db: Database.Database | null = null;
  return {
    app,
    page,
    sb,
    db: () => (db ??= new Database(join(dirs.FOO_DATA_DIR, 'data', 'foo.db'), { readonly: true, fileMustExist: true })),
    control: () => control(sb, 'restaurant'),
    async close() {
      if (process.env.DEBUG_BOOKING) {
        const { readFileSync, existsSync } = await import('node:fs');
        const f = join(dirs.FOO_DATA_DIR, 'test', 'turns.jsonl');
        if (existsSync(f))
          for (const l of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
            const j = JSON.parse(l) as { purpose: string; prompt: string };
            console.log(
              'TURN',
              j.purpose,
              (j.prompt.match(/Last observation[^\n]*|Approved so far:[\s\S]{0,200}|Decisions:[\s\S]{0,300}/gu) ?? [])
                .join(' | ')
                .replace(/\n/g, ' ⏎ '),
            );
          }
        const logs = join(dirs.FOO_DATA_DIR, 'logs');
        if (existsSync(logs))
          for (const n of (await import('node:fs')).readdirSync(logs)) console.log(readFileSync(join(logs, n), 'utf8').slice(-4000));
      }
      db?.close();
      await app.close();
      await sb.close();
    },
  };
}

export async function say(page: Page, text: string): Promise<void> {
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/**
 * Moves main's fake clock in small steps until `target` shows. foo's browser runs on real time (page loads, the 2 s idle), so
 * the loop is bounded by real time and the clock moves gently beside it.
 */
export async function advanceUntil(page: Page, target: Locator, realMs = 60_000): Promise<void> {
  const until = Date.now() + realMs;
  while (Date.now() < until && !(await target.count())) {
    await page.evaluate(() => window.__fooTest!.clock.advance(250));
    await page.waitForTimeout(100);
  }
  await expect(target.first()).toBeVisible({ timeout: 10_000 });
}

export const lastCard = (page: Page, tid: string) => page.getByTestId(TID.threadLog).locator(byTid(tid)).last();
