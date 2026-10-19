// Spec: 05-1 §0.7 (card arrival: "{sender} sent {card name}: {title}", gated cards add ", needs you"), §0.5 (the summary row
// toggles the read-only expanded view with the decision line), 05-2 §5.5.4 ("Approved by you at {time} · {scope}"), §5.7.3
// ("Sent by you at {time}"), §5.8.4 (code box placeholder "123 456"). foo-verify journey for M5 T15: seed a booking Approval,
// a Draft and a code box in the foo chat; read every line the polite live region spoke; Approve and expand the folded card;
// Send the draft, let the 5 s pass, expand it. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m5-t15-announce.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import type { CardSeedRequest } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import type { ApprovalFields } from '../../src/shared/types';
import { byTid, openChat, openWorld, rest, settle } from '../fidelity/capture';

const T = Date.parse('2026-10-16T09:41:00+05:30');
const BOOK_FIELDS: ApprovalFields = {
  verb: 'book',
  payee: 'Pizza by the Bay',
  siteDomain: 'example.com',
  partySize: 4,
  amountPaise: 0,
  cancelTerms: { freeUntil: T + 9 * 3_600_000, feePaise: 100_000, refundable: true },
  irreversible: false,
};
const BOOK: CardSeedRequest = {
  type: 'approval',
  state: 'PENDING',
  payload: {
    variant: 'standard',
    approvalId: '',
    verb: 'book',
    title: 'Book this table?',
    impact: 'Pizza by the Bay, Marine Drive · Sun 18 Oct, 8:00 PM · 4 people',
    fields: BOOK_FIELDS,
    scopes: ['once'],
    hardLimit: true,
    expiresAt: T + 15 * 60_000,
  },
  approval: { fields: BOOK_FIELDS, hardLimit: true, expiresAt: T + 15 * 60_000 },
};
const BODY = 'Hi Rakesh, I’ll pay October’s rent on Tuesday 20 Oct. Thanks for your patience.';
const SEND_FIELDS: ApprovalFields = {
  verb: 'send',
  channel: 'email',
  recipients: [{ name: 'Rakesh Sharma', address: 'r.sharma@example.com', isNew: false, isGroup: false }],
  contentSummary: `Re: October rent\n${BODY}`,
  irreversible: true,
};
const DRAFT: CardSeedRequest = {
  type: 'draft',
  state: 'pending',
  payload: {
    approvalId: '',
    channel: 'email',
    to: { name: 'Rakesh Sharma', address: 'r.sharma@example.com', isNew: false },
    subject: 'Re: October rent',
    body: BODY,
    edited: false,
    sendAllowed: true,
    gmailDraftId: 'gd_t15',
  },
  approval: { fields: SEND_FIELDS, expiresAt: T + 60 * 60_000 },
};
const OTP: CardSeedRequest = {
  type: 'secret',
  state: 'asking',
  payload: { secretKind: 'otp', name: 'Bank code', why: 'Your bank sent a code.', fields: [{ key: 'code', label: '', masked: true }] },
};

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch();
  await openWorld(app, page);
  await openChat(page, 'foo');
  await page.evaluate((tid) => {
    const el = document.querySelector(`[data-testid="${tid}"] [aria-live="polite"]`)!;
    const said: string[] = [];
    (window as unknown as { __said: string[] }).__said = said;
    new MutationObserver(() => {
      if (el.textContent) said.push(el.textContent);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }, TID.appAnnouncer);
  const said = () => page.evaluate(() => (window as unknown as { __said: string[] }).__said);
  const heard = async (want: string) => {
    await page
      .waitForFunction((w) => (window as unknown as { __said: string[] }).__said.includes(w), want, { timeout: 5_000 })
      .catch(async () => {
        throw new Error(`live region never said "${want}"; it said ${JSON.stringify(await said())}`);
      });
  };
  const seed = async (req: CardSeedRequest, tid: string) => {
    const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), req);
    const sel = `${byTid(tid)}[data-card-id="${r.cardId}"]`;
    const card = page.locator(sel);
    await card.scrollIntoViewIfNeeded();
    await card.waitFor();
    return { sel, card };
  };
  const stateIs = (sel: string, s: string) =>
    page.waitForFunction(([q, want]) => document.querySelector(q)?.getAttribute('data-card-state') === want, [sel, s] as const, {
      timeout: 5_000,
    });
  const text = async (sel: string) => (await page.locator(sel).textContent()) ?? '';
  const shoot = async (name: string, sel: string) => {
    await rest(page);
    await settle(page);
    await v.shot(name, sel);
  };

  // 1. A gated card arrives: "foo sent Approval needed: Book this table?, needs you".
  const book = await seed(BOOK, TID.cardApproval);
  await heard('foo sent Approval needed: Book this table?, needs you');
  v.note('Approval seeded → live region: "foo sent Approval needed: Book this table?, needs you"');

  // 2. A plain card: the draft, no "needs you".
  const draft = await seed(DRAFT, TID.cardDraft);
  await heard('foo sent Draft, not sent: Email to Rakesh Sharma');
  v.note('Draft seeded → live region: "foo sent Draft, not sent: Email to Rakesh Sharma" (no "needs you")');

  // 3. Approve at 9:48 → folded row; click → the card as approved + "Approved by you at 9:48 AM · Just this once".
  await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T09:48:00+05:30'));
  await book.card.getByTestId(TID.cardApprovalApprove).click();
  await stateIs(book.sel, 'APPROVED');
  const line = 'Approved by you at 9:48 AM · Just this once';
  if ((await text(book.sel)).includes(line)) throw new Error('decision line shows before the row is expanded');
  await book.card.getByRole('button', { expanded: false }).click();
  const open = await text(book.sel);
  if (!open.includes(line) || !open.includes('Pizza by the Bay, Marine Drive')) throw new Error(`expanded approval reads "${open}"`);
  v.note(`Approve → APPROVED; click the folded row → impact line + "${line}"`);
  await shoot('approval-expanded', book.sel);

  // 4. Send the draft; the 5 s pass; expand → the sent text + "Sent by you at 9:48 AM".
  await draft.card.getByTestId(TID.cardDraftSend).click();
  await stateIs(draft.sel, 'undo_window');
  await page.evaluate(() => window.__fooTest!.clock.advance(5_000));
  await stateIs(draft.sel, 'sent');
  await draft.card.getByRole('button', { expanded: false }).click();
  const sent = await text(draft.sel);
  if (!sent.includes('Sent by you at 9:48 AM') || !sent.includes(BODY)) throw new Error(`expanded draft reads "${sent}"`);
  v.note('Send → sent; click the Sent row → the sent body + "Sent by you at 9:48 AM"');
  await shoot('draft-expanded', draft.sel);

  // 5. The code box field shows "123 456".
  const otp = await seed(OTP, TID.cardSecret);
  const ph = await otp.card.getByTestId(TID.cardSecretField).getAttribute('placeholder');
  if (ph !== '123 456') throw new Error(`code box placeholder is "${ph}"`);
  await heard('foo sent Secret box: Bank code');
  v.note('Code box seeded → placeholder "123 456"; live region: "foo sent Secret box: Bank code"');
  await shoot('code-box', otp.sel);
}
