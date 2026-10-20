// Spec: 05-2 §5.5.4 (CHECKING → FAILED: "I can't tell if {site} did it…" + [ It went through ] [ It didn't ], no Try again; a
// tap collapses the card and it stays FAILED; plain FAILED keeps [ Try again ]), §5.7.2 Draft HELD (second look: "Before I
// send this, one check: you said {Monday}, the draft says {Tuesday 20 Oct}. Which one?" + one button per value), 08-2 §9.6,
// 08-3 §16.1, Art. 7, 10, 11. M5 T14, CR-0009 G-M5-39. foo-verify journey: a booking left CHECKING passes its 15 min on the
// test clock; the user says it went through; a plain FAILED booking beside it for contrast (that is the look the unknown
// result used to get); then a Draft whose text says Tuesday after the user asked for Monday is held at Send, and picking the
// draft's value sends it. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m5-t14-unknown-result.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import type { CardSeedRequest } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import type { ApprovalFields } from '../../src/shared/types';
import { intake, VERIFY_OK, type FakeLine } from '../e2e/fakeAi';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const T = Date.parse('2026-10-16T09:41:00+05:30');
const MIN = 60_000;
const BOOK: ApprovalFields = {
  verb: 'book',
  payee: 'Pizza by the Bay',
  siteDomain: 'example.com',
  partySize: 4,
  amountPaise: 0,
  cancelTerms: { freeUntil: T + 9 * 60 * MIN, feePaise: 100_000, refundable: true },
  irreversible: false,
};
const booking = (state: 'CHECKING' | 'FAILED'): CardSeedRequest => ({
  type: 'approval',
  state,
  payload: {
    variant: 'standard',
    approvalId: '',
    verb: 'book',
    title: 'Book this table?',
    impact: 'Pizza by the Bay, Marine Drive · Sun 18 Oct, 8:00 PM · 4 people',
    fields: BOOK,
    scopes: ['once'],
    hardLimit: true,
    expiresAt: T + 15 * MIN,
  },
  approval: { fields: BOOK, hardLimit: true, expiresAt: T + 15 * MIN, state, submittedAt: T },
});
const RAKESH = { name: 'Rakesh Example', address: 'rakesh@example.com' };
const BODY = 'Hi Rakesh, I’ll pay October’s rent on Tuesday 20 Oct. Thanks.';
const DRAFT: CardSeedRequest = {
  type: 'draft',
  state: 'pending',
  payload: {
    approvalId: '',
    channel: 'email',
    to: { ...RAKESH, isNew: false },
    subject: 'Re: October rent',
    body: BODY,
    edited: false,
    sendAllowed: true,
    gmailDraftId: 'gd_t14',
  },
  approval: {
    fields: {
      verb: 'send',
      channel: 'email',
      recipients: [{ ...RAKESH, isNew: false, isGroup: false }],
      contentSummary: `Re: October rent\n${BODY}`,
      irreversible: true,
    },
    expiresAt: T + 60 * MIN,
  },
};
const ASK = 'Email Rakesh that I’ll pay the rent on Monday';
const HELD = 'Before I send this, one check: you said Monday 19 Oct, the draft says Tuesday 20 Oct. Which one?';
const SCRIPT: FakeLine[] = [
  VERIFY_OK,
  intake(ASK, 'Okay.'),
  {
    match: { purpose: 'second_look', promptIncludes: 'Tuesday 20 Oct' },
    reply: `<say></say><act>${JSON.stringify({ match: false, field: 'date', userSaid: 'Monday 19 Oct', actionHas: 'Tuesday 20 Oct' })}</act>`,
  },
];

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: SCRIPT });
  await openWorld(app, page);
  await openChat(page, 'foo');
  const seed = async (req: CardSeedRequest, tid: 'cardApproval' | 'cardDraft') => {
    const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), req);
    const sel = `${byTid(TID[tid])}[data-card-id="${r.cardId}"]`;
    await page.locator(sel).scrollIntoViewIfNeeded();
    await page.locator(sel).waitFor();
    return sel;
  };
  const text = async (sel: string) => (await page.locator(sel).textContent()) ?? '';
  const until = async (what: string, check: () => Promise<boolean>) => {
    for (let i = 0; i < 60; i++) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    await v.shot(`timeout-${what}`);
    throw new Error(`timed out waiting for ${what}`);
  };
  const shoot = async (name: string, sel: string) => {
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await rest(page);
      await settle(page);
      await v.shot(name, sel);
    }
    await setTheme(page, 'light');
  };

  // 1. A booking left CHECKING: at +15 min with no proof it says foo can't tell, with the two answers and no Try again.
  const unknown = await seed(booking('CHECKING'), 'cardApproval');
  await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T09:56:00+05:30'));
  await until('FAILED', async () => (await page.locator(unknown).getAttribute('data-card-state')) === 'FAILED');
  const failed = await text(unknown);
  const want = 'I can’t tell if example.com did it. Check example.com before trying again.';
  if (!failed.includes(want) || failed.includes('Nothing was booked')) throw new Error(`unknown-result card reads "${failed}"`);
  if (await page.locator(`${unknown} ${byTid(TID.cardApprovalTryAgain)}`).count()) throw new Error('Try again is offered');
  const buttons = await page.locator(`${unknown} button`).allTextContents();
  v.note(`CHECKING booking, clock 9:41 → 9:56 AM: FAILED, "${want}", buttons [${buttons.join('] [')}], no Try again`);
  await shoot('unknown-result', unknown);

  // 2. "It went through" collapses it; the card stays FAILED (foo has no proof).
  await page.locator(`${unknown} ${byTid(TID.cardApprovalWentThrough)}`).click();
  await until('collapsed', async () => (await text(unknown)).includes('You said it went through.'));
  if ((await page.locator(unknown).getAttribute('data-card-state')) !== 'FAILED') throw new Error('the card left FAILED');
  if (await page.locator(`${unknown} button`).count()) throw new Error('buttons left after the answer');
  v.note('Tap "It went through" → "You said it went through.", data-card-state still "FAILED", no buttons left');
  await shoot('said-went-through', unknown);

  // 3. Contrast: a plain FAILED booking (the site refused) keeps "Nothing was booked." + Try again.
  const refused = await seed(booking('FAILED'), 'cardApproval');
  const r = await text(refused);
  if (
    !r.includes('example.com didn’t accept it. Nothing was booked.') ||
    !(await page.locator(`${refused} ${byTid(TID.cardApprovalTryAgain)}`).count())
  )
    throw new Error(`plain FAILED reads "${r}"`);
  v.note(
    'Plain FAILED (site refused) beside it: "example.com didn’t accept it. Nothing was booked." + [ Try again ] (the look the unknown result used to get)',
  );
  await shoot('plain-failed', refused);

  // 4. A Draft that says Tuesday after the user asked for Monday: Send → the 5 s pass → held, nothing sent.
  await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T10:00:00+05:30'));
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(ASK);
  await page.keyboard.press('Enter');
  await page.getByTestId(TID.threadLog).locator(byTid(TID.bubbleMe), { hasText: ASK }).last().waitFor();
  const d = await seed(DRAFT, 'cardDraft');
  await page.locator(`${d} ${byTid(TID.cardDraftSend)}`).click();
  await until('undo window', async () => (await page.locator(d).getAttribute('data-card-state')) === 'undo_window');
  await page.evaluate(() => window.__fooTest!.clock.advance(5_000));
  await until('held', async () => (await text(d)).includes(HELD));
  const opts = await page.locator(`${d} ${byTid(TID.cardDraftHeldOption)}`).allTextContents();
  if (opts.join('|') !== 'Monday 19 Oct|Tuesday 20 Oct') throw new Error(`held options "${opts.join('|')}"`);
  if (await page.locator(`${d} ${byTid(TID.cardDraftSend)}`).count()) throw new Error('Send is still offered on a held draft');
  const turns = v.fakeTurns() as { purpose: string; prompt: string }[];
  if (!turns.some((x) => x.purpose === 'second_look' && x.prompt.includes('Tuesday 20 Oct')))
    throw new Error('no second look turn on the card text');
  v.note(
    `"${ASK}", then Draft (body says Tuesday 20 Oct) → Send → clock +5 s → one second_look turn on the card text → held: "${HELD}" with [${opts.join('] [')}], no Send`,
  );
  await shoot('draft-held', d);

  // 5. Picking the draft's own value sends it.
  await page
    .locator(`${d} ${byTid(TID.cardDraftHeldOption)}`)
    .nth(1)
    .click();
  await until('sent', async () => (await page.locator(d).getAttribute('data-card-state')) === 'sent');
  if (!(await text(d)).includes('Sent · 10:00 AM')) throw new Error(`sent draft reads "${await text(d)}"`);
  v.note('Pick "Tuesday 20 Oct" → data-card-state "sent", "Sent · 10:00 AM"');
  await shoot('draft-sent', d);
}
