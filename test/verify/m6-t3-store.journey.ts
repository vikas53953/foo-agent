// Spec: 08-3 §12.2 (facts live in readable files; a Notepad edit is reindexed by the watcher after 500 ms), §12.4 (manual
// add: `said`, origin `manual`), §12.4.1 (a said health fact is saved private), §12.6 (forget + Undo restores the exact line at
// its place; tombstone in `memory\.tombstones`), 08-1 §3.2 memory rows, pack M6 Risk 1 (the seed's facts are files and the
// right shell still shows them). M6 T3 proof, through the real IPC path (the Memory page itself is T6):
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m6-t3-store.journey.ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import type { MemoryFactView } from '../../src/shared/types';
import { settleSeededJobs } from '../e2e/m4-start';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

type R<T> = { ok: true; value: T } | { ok: false; error: { kind: string; message?: string } };

const invoke = <T>(page: Page, channel: string, payload: unknown) =>
  page.evaluate(([c, p]) => window.foo.invoke(c as never, p as never), [channel, payload] as const) as Promise<R<T>>;

function value<T>(r: R<T>, what: string): T {
  if (!r.ok) throw new Error(`${what}: ${r.error.kind} ${r.error.message ?? ""}`);
  return r.value;
}

async function list(page: Page): Promise<MemoryFactView[]> {
  return value(await invoke<MemoryFactView[]>(page, 'memory:list', { filter: { chip: 'all' } }), 'memory:list');
}

export default async function journey(v: Verify): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'foo-m6-t3-proof-'));
  const data = join(base, 'data');
  // An empty fake AI script: a FOO_TEST run starts the engine only with one (08-2 §1 rule 5); no turn is asked here.
  const { app, page } = await v.launch({ fakeAi: [], env: { FOO_DATA_DIR: data, FOO_LOCAL_DIR: join(base, 'local') } });
  await settleSeededJobs(page, await openWorld(app, page));
  const aboutYou = join(data, 'memory', 'about-you.md');

  // Risk 1: the seed wrote its facts as file lines, and the right shell still lists them.
  const seeded = readFileSync(aboutYou, 'utf8').split('\n');
  const indexed = await list(page);
  const missing = indexed.filter((f) => f.file === 'memory/about-you.md' && !seeded[f.lineNo - 1]?.startsWith(`- ${f.text}  {`));
  if (seeded[0] !== '# About you' || missing.length) throw new Error(`seed file and index disagree: ${missing.map((f) => f.text).join(', ')}`);
  v.note(`the demo seed wrote about-you.md with ${seeded.length - 2} lines; every indexed about-you fact sits on its own line_no`);
  await openChat(page, 'foo');
  await setTheme(page, 'light');
  const tiles = page.locator(byTid(TID.appPanelKnowFact));
  await tiles.first().waitFor();
  v.note(`right shell "What I know" still shows ${await tiles.count()} seeded fact tiles`);
  await rest(page);
  await settle(page);
  await v.shot('right-shell-know', byTid(TID.appPanelKnow));

  // memory:add → a said, manual, private (health) line with its brace.
  const added = value(await invoke<MemoryFactView>(page, 'memory:add', { text: 'I’m allergic to peanuts' }), 'memory:add');
  const text = readFileSync(aboutYou, 'utf8');
  const line = text.split('\n')[added.lineNo - 1] ?? '';
  const want = `- I’m allergic to peanuts  {you said · 2026-10-16 · you typed it · private · ${added.id}}`;
  if (line !== want) throw new Error(`line ${added.lineNo}: "${line}", wanted "${want}"`);
  if (!text.includes('\n## Private\n')) throw new Error('no ## Private section');
  if (added.provenance !== 'said' || added.originKind !== 'manual' || !added.private) throw new Error(JSON.stringify(added));
  v.note(`memory:add wrote line ${added.lineNo} of about-you.md under ## Private: "${line}"`);

  // A Notepad edit: the watcher reindexes it 500 ms later (fake clock).
  writeFileSync(aboutYou, text.replace('I’m allergic to peanuts', 'I’m allergic to peanuts and cashews').replace(/\n/g, '\r\n'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__fooTest!.clock.advance(600));
  let edited: MemoryFactView | undefined;
  for (let i = 0; i < 50 && edited?.text !== 'I’m allergic to peanuts and cashews'; i++) {
    edited = (await list(page)).find((f) => f.id === added.id);
    if (edited?.text !== 'I’m allergic to peanuts and cashews') await page.waitForTimeout(100);
  }
  if (edited?.text !== 'I’m allergic to peanuts and cashews') throw new Error(`memory:list after the edit: ${edited?.text}`);
  v.note(`edited the line on disk (CRLF, as Notepad saves); after 600 ms memory:list shows "${edited.text}" (same id, line ${edited.lineNo})`);

  // Forget + Undo: the same line comes back at the same place.
  // foo writes LF (08-3 §12.2), so the Notepad CRLF becomes LF on its first write.
  const before = readFileSync(aboutYou, 'utf8').replace(/\r\n/g, '\n');
  const target = indexed.find((f) => f.text === 'Works from home on Fridays')!;
  const { undoToken } = value(await invoke<{ undoToken: string }>(page, 'memory:forget', { factId: target.id }), 'memory:forget');
  const gone = readFileSync(aboutYou, 'utf8');
  if (gone.includes('Works from home on Fridays')) throw new Error('the forgotten line is still in the file');
  const tomb = readFileSync(join(data, 'memory', '.tombstones'), 'utf8').trim();
  v.note(`memory:forget removed "Works from home on Fridays" (line ${target.lineNo}); memory\\.tombstones now holds ${tomb.split('\n').length} tombstone`);
  const back = value(await invoke<MemoryFactView>(page, 'memory:undo', { undoToken }), 'memory:undo');
  const after = readFileSync(aboutYou, 'utf8');
  if (after !== before || back.lineNo !== target.lineNo) throw new Error(`undo: line ${back.lineNo} vs ${target.lineNo}; file same: ${after === before}`);
  v.note(`memory:undo put the exact line back at line ${back.lineNo}; every line of the file is what it was`);
  await page.evaluate(() => window.__fooTest!.clock.advance(6_000));
  const late = await invoke(page, 'memory:undo', { undoToken });
  if (late.ok || late.error.kind !== 'TOO_LATE') throw new Error(`second undo: ${JSON.stringify(late)}`);
  v.note('the same undo again answers TOO_LATE');

  await settle(page);
  await v.shot('right-shell-know-after', byTid(TID.appPanelKnow));
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('right-shell-know-after', byTid(TID.appPanelKnow));
}
