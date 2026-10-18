// Spec: 08-2 §8.3 (foo drives its own browser window: Edge on Windows, Playwright's Chromium in the container), §8.3.4 (masked
// snapshot: a password reads [hidden], refs present), §8.2.1 (a click on "Pay" → USE_SUBMIT, nothing submitted), §11.5 (typing
// into the password field → SECRET_IN_TYPE), 10-1 AT-056 data part, 10-2 ART-08a (the canary is in no AI prompt).
// foo-verify journey for M9 T3: a fake-AI job in the real app opens a local page with a password field and a "Pay" button in
// foo's browser, takes the snapshot, tries the Pay click and tries to type into the password field. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m9-t3-browser.journey.ts
import Database from 'better-sqlite3';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import type { FakeLine } from '../e2e/fakeAi';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const ASK = 'Check my electricity bill page';
const CANARY = 'CANARY-pw-5d2e81';
const RESULT = 'I opened the bill page. Paying it needs your go-ahead first.';
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Electricity bill</title></head><body>
<h1>Your electricity bill</h1><p>Amount due ₹1,240</p>
<form method="get" action="/paid"><label>Password <input type="password" name="pw" value="${CANARY}"></label>
<button>Pay ₹1,240</button></form></body></html>`;

const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const tool = (name: string, args: Record<string, unknown>): FakeLine => ({
  match: { purpose: 'step' },
  reply: act({ kind: 'tool', call: { tool: name, args }, why: 'next' }),
});

interface Turn {
  purpose: string;
  prompt?: string;
  system?: string;
}

export default async function journey(v: Verify): Promise<void> {
  let paid = 0;
  const server = createServer((req, res) => {
    if ((req.url ?? '').startsWith('/paid')) paid += 1;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/bill`;
  try {
    const SCRIPT: FakeLine[] = [
      { match: { purpose: 'verify' }, reply: 'ready', once: false },
      {
        match: { purpose: 'intake', promptIncludes: ASK },
        reply: act({
          kind: 'job',
          title: 'Electricity bill',
          plan: [{ phraseKey: 'check_site', slots: { site: 'the bill page' }, route: 'browser' }],
          estimate: { minutes: 1 },
          routeHint: ['browser'],
          needsApps: [],
        }),
      },
      tool('browser.open', { url }),
      tool('browser.snapshot', {}),
      tool('browser.click', { ref: 'e2' }),
      tool('browser.type', { ref: 'e1', text: 'hello' }),
      { match: { purpose: 'step' }, reply: act({ kind: 'done', result: RESULT, unverified: true }) },
    ];
    const { app, page } = await v.launch({ fakeAi: SCRIPT, env: { FOO_TEST_ALLOW_HOSTS: '127.0.0.1' } });
    await openWorld(app, page);
    await openChat(page, 'foo');
    await setTheme(page, 'light');
    await rest(page);
    await settle(page);

    await page.getByTestId(TID.composerField).focus();
    await page.keyboard.type(ASK);
    await page.keyboard.press('Enter');
    const log = page.getByTestId(TID.threadLog);
    await log.locator(byTid(TID.bubbleFoo), { hasText: RESULT }).first().waitFor({ timeout: 90_000 });
    v.note(`the job ran to its result in the real app: "${RESULT}"`);

    const dataDir = (await app.evaluate(() => process.env.FOO_DATA_DIR)) as string;
    const db = new Database(join(dataDir, 'data', 'foo.db'), { readonly: true, fileMustExist: true });
    const calls = db
      .prepare(`SELECT tool, outcome, error_kind AS kind, result FROM tool_calls ORDER BY started_at, rowid`)
      .all() as { tool: string; outcome: string; kind: string | null; result: string | null }[];
    db.close();
    const row = (tool: string) => calls.find((c) => c.tool === tool);
    const summary = calls.map((c) => `${c.tool}=${c.outcome}${c.kind ? `/${c.kind}` : ''}`).join(', ');
    if (row('browser.open')?.outcome !== 'ok') throw new Error(`browser.open did not open the page: ${summary}`);
    v.note(`browser.open → ok: foo's own browser window loaded ${url}`);

    const snap = row('browser.snapshot');
    const snapText = snap?.result ? String((JSON.parse(snap.result) as { snapshot?: string }).snapshot ?? '') : '';
    if (snap?.outcome !== 'ok' || !/\[e1\] textbox "Password" \[hidden\]/.test(snapText) || !/\[e2\] button "Pay ₹1,240"/.test(snapText))
      throw new Error(`snapshot not masked as expected (${summary}):\n${snapText}`);
    if (snapText.includes(CANARY)) throw new Error('the password value is in the stored snapshot');
    v.note('browser.snapshot → ok: `[e1] textbox "Password" [hidden]` and `[e2] button "Pay ₹1,240"` (refs present, password masked at source)');

    if (row('browser.click')?.kind !== 'USE_SUBMIT') throw new Error(`Pay click not refused: ${summary}`);
    if (paid !== 0) throw new Error(`the form was submitted ${paid} time(s)`);
    v.note('browser.click on Pay (e2) → USE_SUBMIT; the page saw 0 submissions');
    if (row('browser.type')?.kind !== 'SECRET_IN_TYPE') throw new Error(`typing into the password field was not refused: ${summary}`);
    v.note('browser.type into the password field (e1) → SECRET_IN_TYPE; nothing typed');

    const turns = v.fakeTurns() as Turn[];
    const afterSnap = turns.filter((t) => t.purpose === 'step').find((t) => (t.prompt ?? '').includes('[e2] button "Pay ₹1,240"'));
    if (!afterSnap || !(afterSnap.prompt ?? '').includes('[e1] textbox \\"Password\\" [hidden]'))
      throw new Error('the AI never saw the masked snapshot');
    v.note('the next step prompt the AI received carried the masked snapshot');
    if (turns.some((t) => JSON.stringify(t).includes(CANARY))) throw new Error('the password value reached the AI');
    v.note(`the password value is in none of the ${turns.length} recorded AI turns (ART-08a canary)`);
    v.note(`tool calls in order: ${summary}`);

    await rest(page);
    await settle(page);
    await v.shot('job-done');
    await setTheme(page, 'dark');
    await settle(page);
    await v.shot('job-done');
  } finally {
    await new Promise<void>((ok) => server.close(() => ok()));
  }
}
