// Spec: 02-2 §F15.9 (the living face), CR-0021 picks 6–8 (X-179), 10-2 §C.8 AT-304–AT-306, §C.7.1 / C.7.4. foo-verify
// journey for P1 T2: open foo's chat (the two-eyes face on the row and header, no letter), send a message (Noticed →
// the 26px Thinking face → the reply), move a job to WORKING (the turning ring on the row and the header), an empty Memory
// search (the scanning pose), and "Show foo's eyes" off through settings:set (still poses, rings kept). Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/p1-02-face.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { intake } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { byTid, openChat, rest, setTheme, settle, windowSize } from '../fidelity/capture';

const ASK = 'What is on today?';
const ANSWER = 'Two things today: the dentist at 4 PM and the cake pickup at 6.';

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: [intake('on today', ANSWER, { delayMs: 3_000 })] });
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const { refs } = await page.evaluate(() => window.__fooTest!.seed('ux-world'));
  await page.getByTestId(TID.chatlistRow).first().waitFor();
  await settleSeededJobs(page, refs);
  await windowSize(app, page, 1440, 900);
  await setTheme(page, 'light');
  await openChat(page, 'foo');
  const fooRow = page
    .getByTestId(TID.chatlistRow)
    .filter({ has: page.getByTestId(TID.chatlistRowName).getByText('foo', { exact: true }) })
    .first();
  const rowFace = fooRow.getByTestId(TID.chatlistRowAvatar);
  const header = page.getByTestId(TID.chatHeaderAvatar).locator('[data-face]');
  const attr = (l: typeof rowFace, a: string) => l.getAttribute(a);

  if (!/^living:/.test((await attr(rowFace, 'data-face')) ?? '')) throw new Error('foo row face is not the living face');
  if ((await rowFace.innerText()).trim() !== '') throw new Error('foo row face draws a letter');
  v.note(
    `foo's row face ${await attr(rowFace, 'data-face')} at ${await attr(rowFace, 'data-size')}px, header at ${await attr(header, 'data-size')}px, no letter; mood ${await attr(rowFace, 'data-state')}`,
  );
  await rest(page);
  await settle(page);
  await v.shot('foo-chat-face');

  // Send: 👀 Noticed, then the 26px Thinking face while the request is in flight, then the reply.
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(ASK);
  await page.keyboard.press('Enter');
  const thinking = page.getByTestId(TID.threadThinking);
  await thinking.waitFor();
  const tf = thinking.locator('[data-face]');
  if ((await attr(tf, 'data-state')) !== 'thinking' || (await attr(tf, 'data-size')) !== '26')
    throw new Error(`Thinking row face: ${await attr(tf, 'data-state')} at ${await attr(tf, 'data-size')}`);
  v.note('while the request is in flight the Thinking row shows the 26px Thinking face (no dots, no letter)');
  await settle(page);
  await v.shot('thinking-face', byTid(TID.threadLog));
  const bubble = page.locator(`${byTid(TID.threadLog)} ${byTid(TID.bubbleFoo)}`, { hasText: ANSWER }).first();
  for (let i = 0; i < 20 && (await bubble.count()) === 0; i++) await page.evaluate(() => window.__fooTest!.clock.advance(1_000));
  await bubble.waitFor();
  if ((await thinking.count()) !== 0) throw new Error('Thinking row still shown after the reply');
  v.note('the reply bubble takes the Thinking row’s place; the row is gone');

  // A job turns WORKING: the turning ring, the same on the row (48) and the header (40).
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'working'), refs!.goaJob!);
  await rowFace.and(page.locator('[data-state="working"]')).waitFor();
  await header.and(page.locator('[data-state="working"]')).waitFor();
  v.note(`job WORKING → row and header both "working", ring ${await rowFace.locator('[data-ring]').getAttribute('data-ring')}`);
  await rest(page);
  await settle(page);
  await v.shot('working-ring');
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('working-ring');
  await setTheme(page, 'light');

  // "Show foo's eyes" off: still poses, the ring stays.
  const set = await page.evaluate(() => window.foo.invoke('settings:set', { path: 'appearance.faceMotion', value: false }));
  if (!set.ok) throw new Error(`settings:set appearance.faceMotion refused: ${JSON.stringify(set.error)}`);
  await rowFace.and(page.locator('[data-motion-face="off"]')).waitFor();
  v.note(
    `"Show foo's eyes" off → faces hold still (data-motion-face=off), ring still ${await rowFace.locator('[data-ring]').getAttribute('data-ring')}`,
  );
  await page.evaluate(() => window.foo.invoke('settings:set', { path: 'appearance.faceMotion', value: true }));

  // Memory, no results: the 64px scanning pose (decorative, no ring).
  await page.getByTestId(TID.sidebarMore).click();
  await page.getByTestId(TID.sidebarMenuMemory).click();
  await page.getByTestId(TID.screenMemory).and(page.locator('[data-state="list"]')).waitFor();
  await page.getByTestId(TID.memorySearch).fill('zzqx');
  const pose = page.getByTestId(TID.screenEmpty).locator('[data-pose]');
  await pose.waitFor();
  if ((await pose.getAttribute('aria-hidden')) !== 'true' || (await pose.locator('[data-ring]').count()) !== 0)
    throw new Error('empty-state pose is not decorative');
  v.note(
    `Memory "zzqx" → empty state shows the ${await pose.getAttribute('data-size')}px "${await pose.getAttribute('data-pose')}" pose, aria-hidden, no ring`,
  );
  await rest(page);
  await settle(page);
  await v.shot('memory-no-match-pose');
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('memory-no-match-pose');
}
