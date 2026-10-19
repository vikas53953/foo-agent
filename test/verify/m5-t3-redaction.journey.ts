// Spec: 04-2 §22.4 ("Send anyway": the bubble and the chat store show the span as "•••• (hidden)"; the AI receives "[the
// user typed a secret; it was hidden]"; the real value is not kept anywhere), 08-2 §11.4 R1 / R2 / R7 / R3, 08-3 §19.1 (the
// tech log never holds a secret), 11-fidelity §11.2.3. M5 T3 proof: type a made-up sk-proj- canary, choose Send anyway, see
// the bubble, then search every file the app wrote (database, WAL, logs, activity, fake-AI record) for the canary: 0 hits.
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m5-t3-redaction.journey.ts
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { intake } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const CANARY = 'sk-proj-FAKE0canary0T3journey000000000';
const HIDDEN_NOTE = '[the user typed a secret; it was hidden]';
const ANSWER = 'Thanks, I did not keep that.';

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

export default async function journey(v: Verify): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'foo-t3-proof-'));
  const dirs = { FOO_DATA_DIR: join(base, 'data'), FOO_LOCAL_DIR: join(base, 'local') };
  const { app, page } = await v.launch({ fakeAi: [intake(HIDDEN_NOTE, ANSWER)], env: dirs });
  // The ux-world seed carries live M4 jobs; a message sent while one runs steers it instead of starting a reply.
  await settleSeededJobs(page, await openWorld(app, page));
  await openChat(page, 'foo');
  await setTheme(page, 'light');
  await rest(page);
  await settle(page);

  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(`my key ${CANARY} thanks`);
  await page.keyboard.press('Enter');
  await page.getByTestId(TID.composerPaste).waitFor();
  await settle(page);
  await v.shot('paste-catch-open');
  v.note('typing the canary and pressing Enter opened the paste catch');

  await page.getByTestId(TID.composerPasteSend).click();
  const mine = page.locator(`${byTid(TID.threadLog)} ${byTid(TID.bubbleMe)}`, { hasText: '•••• (hidden)' }).first();
  await mine.waitFor();
  const bubble = (await mine.innerText()).trim();
  if (bubble.includes(CANARY) || !bubble.includes('my key •••• (hidden) thanks')) throw new Error(`bubble: ${bubble}`);
  v.note(`Send anyway: my bubble reads "${bubble.split('\n')[0]}"`);

  await page
    .locator(`${byTid(TID.threadLog)} ${byTid(TID.bubbleFoo)}`, { hasText: ANSWER })
    .first()
    .waitFor({ timeout: 15_000 });
  // The journey chose its own data folder (to search it afterwards), so the fake AI's record is read from there.
  const turns = readFileSync(join(dirs.FOO_DATA_DIR, 'test', 'turns.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { purpose: string; prompt?: string });
  const asked = turns.filter((t) => t.purpose === 'intake');
  if (!asked.length || JSON.stringify(turns).includes(CANARY) || !JSON.stringify(asked).includes(HIDDEN_NOTE))
    throw new Error(`fake AI turns: ${JSON.stringify(turns).slice(0, 400)}`);
  v.note(`the AI request carried "${HIDDEN_NOTE}" and not the key (${asked.length} intake request)`);
  await rest(page);
  await settle(page);
  await v.shot('sent-anyway');
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('sent-anyway');

  // Close the app so the database and the logs are flushed, then search every byte it wrote.
  await app.close();
  const written = [...files(dirs.FOO_DATA_DIR), ...files(dirs.FOO_LOCAL_DIR)];
  const hits = written.filter((f) => readFileSync(f).includes(CANARY));
  const db = written.filter((f) => /foo\.db/.test(f));
  if (!db.length) throw new Error(`no database among ${written.length} files`);
  if (hits.length) throw new Error(`canary found in ${hits.join(', ')}`);
  v.note(
    `searched ${written.length} files the app wrote (${db.map((f) => f.slice(base.length)).join(', ')}, logs, activity): 0 hits for the canary`,
  );
}
