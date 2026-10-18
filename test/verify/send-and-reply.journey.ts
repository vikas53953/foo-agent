// Spec: 04 §3.3, §12.3 (a sent message and foo's reply in the foo chat), 08-3 §22.3 (the fake AI), 11-fidelity §11.2.3.
// foo-verify sample journey (.claude/skills/foo-verify/features/chat-reply.md): open the foo chat in the ux-world, send a
// message through the composer, and see foo's reply bubble, light and dark. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/send-and-reply.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { intake } from '../e2e/fakeAi';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const ASK = 'What is on today?';
const ANSWER = 'Two things today: the dentist at 4 PM and Riya’s birthday cake pickup at 6.';

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: [intake(ASK, ANSWER)] });
  await openWorld(app, page);
  await openChat(page, 'foo');
  await setTheme(page, 'light');
  await rest(page);
  await settle(page);
  await v.shot('foo-chat-open');

  const before = await page.getByTestId(TID.bubbleFoo).count();
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(ASK);
  await page.keyboard.press('Enter');
  await page
    .locator(`${byTid(TID.threadLog)} ${byTid(TID.bubbleMe)}`, { hasText: ASK })
    .first()
    .waitFor();
  v.note(`sent "${ASK}" through the composer; it shows as my bubble`);

  await page
    .locator(`${byTid(TID.threadLog)} ${byTid(TID.bubbleFoo)}`, { hasText: ANSWER })
    .first()
    .waitFor({ timeout: 15_000 });
  const after = await page.getByTestId(TID.bubbleFoo).count();
  if (after <= before) throw new Error(`expected a new foo bubble, had ${before}, now ${after}`);
  v.note(`foo answered "${ANSWER}" in a new bubble (${before} → ${after} foo bubbles)`);
  const turns = v.fakeTurns() as { purpose: string; matchedLine: number | null }[];
  const intakes = turns.filter((t) => t.purpose === 'intake');
  if (intakes.length !== 1 || intakes[0]!.matchedLine !== 1) throw new Error(`fake AI turns: ${JSON.stringify(turns)}`);
  v.note('the fake AI got exactly one intake request and answered it with line 1');

  await rest(page);
  await settle(page);
  await v.shot('foo-replied');
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('foo-replied');
}
