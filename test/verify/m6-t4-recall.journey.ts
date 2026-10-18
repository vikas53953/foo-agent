// Spec: 08-4 §24.16 (parts 5/5b; Art. 14 group exclusion; line format `[{factId}] {text} ({You said|I guessed}, {Sat 12
// Dec})`), §24.1 (intake: part 5 in the system), 08-3 §12.5, §22.3 (the fake AI records every request in turns.jsonl).
// M6 T4 proof: in the ux-world, foo knows "Sister Meera lives in Pune" (a made-up seeded fact in about-you.md). Asking foo
// in its own chat sends that fact line in the system text; asking in the Family group sends no about-you fact. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m6-t4-recall.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { intake } from '../e2e/fakeAi';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const ASK_FOO = 'Where does my sister live?';
const ANSWER_FOO = 'Meera lives in Pune.';
const ASK_GROUP = 'Who is coming on Sunday, and where does my sister live?';
const ANSWER_GROUP = 'Let me check with everyone.';
const FACT_LINE = /\[f_[0-9a-z_-]+\] Sister Meera lives in Pune \((?:You said|I guessed), \w{3} \d{1,2} \w{3}\)/i;

interface Turn {
  purpose: string;
  prompt: string;
  system?: string;
}

async function ask(v: Verify, page: Parameters<typeof openChat>[0], text: string, answer: string): Promise<void> {
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page
    .locator(`${byTid(TID.threadLog)} ${byTid(TID.bubbleFoo)}`, { hasText: answer })
    .first()
    .waitFor({ timeout: 15_000 });
  v.note(`asked "${text}"; foo answered "${answer}"`);
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: [intake(ASK_FOO, ANSWER_FOO), intake(ASK_GROUP, ANSWER_GROUP)] });
  await openWorld(app, page);
  await setTheme(page, 'light');

  await openChat(page, 'foo');
  await ask(v, page, ASK_FOO, ANSWER_FOO);
  const fooTurn = (v.fakeTurns() as Turn[]).find((t) => t.purpose === 'intake' && t.prompt.includes(ASK_FOO));
  if (!fooTurn) throw new Error('no intake turn recorded for the foo chat');
  const sys = fooTurn.system ?? '';
  const line = sys.match(FACT_LINE)?.[0];
  if (!sys.includes('What you know about') || !line) throw new Error(`foo chat: part 5 lacks the sister fact:\n${sys.slice(-1500)}`);
  v.note(`foo chat: system part 5 carries "${line}"`);
  await rest(page);
  await settle(page);
  await v.shot('foo-recall');

  await openChat(page, 'Family group');
  await ask(v, page, ASK_GROUP, ANSWER_GROUP);
  const groupTurn = (v.fakeTurns() as Turn[]).find((t) => t.purpose === 'intake' && t.prompt.includes(ASK_GROUP));
  if (!groupTurn) throw new Error('no intake turn recorded for the Family group');
  const all = `${groupTurn.system ?? ''}\n${groupTurn.prompt}`;
  if (FACT_LINE.test(all) || all.includes('Sister Meera')) throw new Error('Family group: an about-you fact reached the prompt');
  if (/\[f_[0-9a-z_-]+\] /i.test(all)) throw new Error('Family group: a fact line reached the prompt');
  v.note('Family group: no about-you fact (and no fact line at all) in the system or the prompt (Art. 14)');
  await rest(page);
  await settle(page);
  await v.shot('group-no-recall');
}
