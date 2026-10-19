// Spec: 08-3 §12.7 (the nightly tidy: a conflict between "Lives in Mumbai" and a newer "Lives in Pune" (both You said) is
// asked once as a Choice card in foo's chat, unprompted with the "Why am I getting this?" footer; the answer keeps the
// picked fact as `you said · {today}` and forgets the other; one line in memory\.tidy-log.md), §15.2 step 5 (the card is
// counted in the daily budget), AT-219, CR-0010 G-M6-02 (`purpose='conflict'`), G-M6-09 (`test.memoryTidy` runs it now).
// M6 T7 proof, through the real engine, main and window:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m6-t7-tidy.journey.ts
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import type { MemoryFactView } from '../../src/shared/types';
import { settleSeededJobs } from '../e2e/m4-start';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

type R<T> = { ok: true; value: T } | { ok: false; error: { kind: string; message?: string } };

const MUMBAI = 'f_01929a3e-7c41-7d2a-9b1e-3f5a2c8d4e71';
const PUNE = 'f_0193b2c4-1a07-7e3f-8c55-0d9e6f7a1b72';
const QUESTION = 'Do you live in Pune now, or Mumbai?';
const ACT = { conflicts: [{ factIds: [MUMBAI, PUNE], entity: 'lives in', ask: { question: QUESTION, options: ['Pune', 'Mumbai'] } }] };

const invoke = <T>(page: Page, channel: string, payload: unknown) =>
  page.evaluate(([c, p]) => window.foo.invoke(c as never, p as never), [channel, payload] as const) as Promise<R<T>>;

async function facts(page: Page): Promise<MemoryFactView[]> {
  const r = await invoke<MemoryFactView[]>(page, 'memory:list', { filter: { chip: 'all' } });
  if (!r.ok) throw new Error(`memory:list: ${r.error.kind}`);
  return r.value;
}

export default async function journey(v: Verify): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'foo-m6-t7-proof-'));
  const data = join(base, 'data');
  const { app, page } = await v.launch({
    fakeAi: [{ match: { purpose: 'tidy' }, reply: `<say></say><act>${JSON.stringify(ACT)}</act>`, once: false }],
    env: { FOO_DATA_DIR: data, FOO_LOCAL_DIR: join(base, 'local') },
  });
  await settleSeededJobs(page, await openWorld(app, page));

  // Two said facts as Notepad would add them: Mumbai first, Pune newer.
  const aboutYou = join(data, 'memory', 'about-you.md');
  appendFileSync(
    aboutYou,
    `- Lives in Mumbai  {you said · 2026-09-01 · chat · ${MUMBAI}}\n- Lives in Pune  {you said · 2026-10-10 · chat · ${PUNE}}\n`,
  );
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__fooTest!.clock.advance(600));
  for (let i = 0; i < 50 && (await facts(page)).filter((f) => f.id === MUMBAI || f.id === PUNE).length < 2; i++)
    await page.waitForTimeout(100);
  const seeded = await facts(page);
  if (seeded.filter((f) => f.id === MUMBAI || f.id === PUNE).length !== 2) throw new Error('the two facts were not indexed');
  v.note(
    `about-you.md holds "Lives in Mumbai" (2026-09-01) and the newer "Lives in Pune" (2026-10-10), both You said; ${seeded.length} facts indexed`,
  );

  await openChat(page, 'foo');
  await setTheme(page, 'light');
  await rest(page);
  await settle(page);
  await v.shot('foo-chat-before');

  const report = (await page.evaluate(() => window.__fooTest!.memoryTidy())) as R<Record<string, number>>;
  if (!report.ok) throw new Error(`tidy: ${report.error.kind} ${report.error.message ?? ''}`);
  v.note(`test.memoryTidy → ${JSON.stringify(report.value)}`);
  const turns = readFileSync(join(data, 'test', 'turns.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { purpose: string; prompt: string })
    .filter((x) => x.purpose === 'tidy');
  if (turns.length !== 1) throw new Error(`tidy turns: ${turns.length}`);
  if (!turns[0]!.prompt.includes('Facts grouped by entity:') || !turns[0]!.prompt.includes('## lives in'))
    throw new Error('the tidy turn did not get the §24.21 facts block');
  v.note('one fake-AI turn with purpose tidy; its prompt has "Facts grouped by entity:" and a "## lives in" group');

  const card = page.locator(`${byTid(TID.cardChoice)}[data-purpose="conflict"]`);
  await card.waitFor();
  if ((await card.count()) !== 1) throw new Error(`conflict cards: ${await card.count()}`);
  const text = await card.innerText();
  if (!text.includes(QUESTION) || !text.includes('Pune') || !text.includes('Mumbai')) throw new Error(`card text: ${text}`);
  const why = page.locator(byTid(TID.bubbleWhy)).last();
  const whyText = await why.innerText();
  if (!whyText.includes('Why am I getting this?')) throw new Error(`why footer: ${whyText}`);
  v.note(`one Choice card (data-purpose="conflict") in foo’s chat: "${QUESTION}" [ Pune ] [ Mumbai ], with the footer "${whyText.trim()}"`);
  await card.scrollIntoViewIfNeeded();
  await settle(page);
  await v.shot('conflict-card');
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('conflict-card');
  await setTheme(page, 'light');

  // Asked once: a second run adds no card.
  const again = (await page.evaluate(() => window.__fooTest!.memoryTidy())) as R<{ asked: number }>;
  if (!again.ok || again.value.asked !== 0) throw new Error(`second tidy: ${JSON.stringify(again)}`);
  await settle(page);
  if ((await card.count()) !== 1) throw new Error('a second conflict card was posted');
  v.note('a second tidy run asks nothing: still one conflict card');

  await card.locator(byTid(TID.cardChoiceOption)).filter({ hasText: 'Pune' }).first().click();
  for (let i = 0; i < 50 && (await facts(page)).some((f) => f.id === MUMBAI); i++) await page.waitForTimeout(100);
  const after = await facts(page);
  const pune = after.find((f) => f.id === PUNE);
  if (after.some((f) => f.id === MUMBAI) || pune?.provenance !== 'said') throw new Error('the answer did not keep Pune and forget Mumbai');
  const file = readFileSync(aboutYou, 'utf8');
  const line = file.split('\n').find((l) => l.includes(PUNE)) ?? '';
  if (!line.startsWith('- Lives in Pune  {you said · 2026-10-16 · chat ·') || file.includes('Mumbai'))
    throw new Error(`about-you.md: ${line}`);
  const tomb = readFileSync(join(data, 'memory', '.tombstones'), 'utf8').trim();
  v.note(`tapped Pune: about-you.md now has "${line}" and no Mumbai line; memory\\.tombstones holds ${tomb.split('\n').length} line(s)`);
  await settle(page);
  await v.shot('conflict-answered');

  const log = readFileSync(join(data, 'memory', '.tidy-log.md'), 'utf8')
    .trim()
    .split('\n');
  v.note(`memory\\.tidy-log.md: ${log.map((l) => `"${l}"`).join(', ')}`);
}
