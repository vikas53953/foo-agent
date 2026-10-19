// Spec: 05-2 §5.7 Draft card (§5.7.1 pending look, Change mode; §5.7.2 Send → "Sending in {5}…" + Undo, Undo → "Not sent.
// The draft is still here.", Sent "✓ Sent · {time}" + the Sent-folder proof chip, "Draft discarded"; §5.7.4 Ctrl+Enter
// never sends), 08-0 §G.7 (X-65), CR-0009. foo-verify journey for M5 T6: seed a known-recipient email Draft (with its
// approvals row) in the foo chat; Change the body and Save; Send, see the countdown and Undo; Send again and let the 5 s pass
// on the test clock until main's tick sends it; then seed a second draft and Discard it. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m5-t6-draft.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import type { CardSeedRequest } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import type { ApprovalFields } from '../../src/shared/types';
import { byTid, openChat, openWorld, rest, settle } from '../fidelity/capture';

const T = Date.parse('2026-10-16T09:41:00+05:30');
const BODY = 'Hi Rakesh, I’ll pay October’s rent on Tuesday 20 Oct. Thanks for your patience. Vikas';
const FIELDS: ApprovalFields = {
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
    gmailDraftId: 'gd_seed',
  },
  approval: { fields: FIELDS, expiresAt: T + 60 * 60_000 },
};

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch();
  await openWorld(app, page);
  await openChat(page, 'foo');
  const seed = async () => {
    const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), DRAFT);
    const sel = `${byTid(TID.cardDraft)}[data-card-id="${r.cardId}"]`;
    const card = page.locator(sel);
    await card.scrollIntoViewIfNeeded();
    await card.waitFor();
    return { sel, card };
  };
  const stateIs = (sel: string, s: string, timeout = 5_000) =>
    page.waitForFunction(([q, want]) => document.querySelector(q)?.getAttribute('data-card-state') === want, [sel, s] as const, {
      timeout,
    });
  const text = async (sel: string) => (await page.locator(sel).textContent()) ?? '';
  const shoot = async (name: string, sel: string) => {
    await rest(page);
    await settle(page);
    await v.shot(name, sel);
  };

  // 1. Pending look (X-65): the where-it-goes line and the 60 min footer; no Approve-style edge.
  const one = await seed();
  const pending = await text(one.sel);
  for (const want of [
    'Draft · not sent',
    'Email',
    'Rakesh Sharma <r.sharma@example.com>',
    'Re: October rent',
    'Will send to r.sharma@example.com from your Gmail. Can’t be unsent.',
    'Expires Fri 16 Oct, 10:41 AM · If you don’t answer, I won’t send it.',
  ])
    if (!pending.includes(want)) throw new Error(`pending card lacks "${want}": ${pending}`);
  v.note(
    'Draft seeded pending: "Will send to r.sharma@example.com from your Gmail. Can’t be unsent." + "Expires Fri 16 Oct, 10:41 AM · …"',
  );
  await shoot('pending', one.sel);

  // 2. Ctrl+Enter outside Change mode never sends (09 §9.17.4).
  await one.card.getByTestId(TID.cardDraftDiscard).focus();
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(500);
  if ((await one.card.getAttribute('data-card-state')) !== 'pending') throw new Error('Ctrl+Enter moved the draft');
  v.note('Ctrl+Enter with focus inside the card: still pending (it never sends)');

  // 3. Change → edit mode → Save changes (Ctrl+Enter) → "Email · edited".
  await one.card.getByTestId(TID.cardDraftChange).click();
  await stateIs(one.sel, 'editing');
  const area = one.card.locator(`textarea[data-testid="${TID.cardDraftBody}"]`);
  await area.fill('Hi Rakesh, I’ll pay October’s rent on Tuesday. Thanks, Vikas');
  await shoot('editing', one.sel);
  await area.focus();
  await page.keyboard.press('Control+Enter');
  await stateIs(one.sel, 'pending');
  await page.waitForFunction((q) => document.querySelector(q)?.textContent?.includes('Email · edited'), one.sel);
  const edited = await one.card.getByTestId(TID.cardDraftBody).textContent();
  if (edited !== 'Hi Rakesh, I’ll pay October’s rent on Tuesday. Thanks, Vikas') throw new Error(`body after Save: "${edited}"`);
  v.note('Change → textarea; Ctrl+Enter = Save changes → body updated in place, header right label "Email · edited"');
  await shoot('edited', one.sel);

  // 4. Send → undo window: "Sending in 5…" with Undo focused, counting down; Undo inside the 5 s.
  await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T09:48:00+05:30'));
  await one.card.getByTestId(TID.cardDraftSend).click();
  await stateIs(one.sel, 'undo_window');
  const c5 = await one.card.getByTestId(TID.cardDraftCountdown).textContent();
  if (c5 !== 'Sending in 5…' && c5 !== 'Sending in 4…') throw new Error(`countdown reads "${c5}"`);
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  if (focused !== TID.cardDraftUndo) throw new Error(`focus is on ${focused}, not Undo`);
  await shoot('undo-window', one.sel);
  await page.waitForFunction((q) => /Sending in [1-3]…/.test(document.querySelector(q)?.textContent ?? ''), one.sel);
  const c3 = await one.card.getByTestId(TID.cardDraftCountdown).textContent();
  v.note(`Send → data-card-state="undo_window", "${c5}" with Undo focused; then "${c3}" (counting down)`);
  await one.card.getByTestId(TID.cardDraftUndo).click();
  await stateIs(one.sel, 'pending');
  const undone = await text(one.sel);
  if (!undone.includes('Not sent. The draft is still here.')) throw new Error(`after Undo: ${undone}`);
  v.note('Undo → back to pending, "Not sent. The draft is still here."');
  await shoot('undone', one.sel);

  // 5. Send again; the clock passes the 5 s; main's tick sends it → "Sent · 9:48 AM" + proof chip.
  await one.card.getByTestId(TID.cardDraftSend).click();
  await stateIs(one.sel, 'undo_window');
  await page.evaluate(() => window.__fooTest!.clock.advance(5_000));
  await stateIs(one.sel, 'sent');
  const sent = await text(one.sel);
  if (!sent.includes('Sent · 9:48 AM') || !sent.includes('Proof: in your Gmail Sent folder')) throw new Error(`sent card reads "${sent}"`);
  v.note('Send again, clock +5 s → within one tick data-card-state="sent", "Sent · 9:48 AM" + "Proof: in your Gmail Sent folder"');
  await shoot('sent', one.sel);

  // 6. A second draft → Discard → "Draft discarded".
  const two = await seed();
  await two.card.getByTestId(TID.cardDraftDiscard).click();
  await stateIs(two.sel, 'discarded');
  const gone = await text(two.sel);
  if (!gone.includes('Draft discarded')) throw new Error(`discarded card reads "${gone}"`);
  v.note('Second draft → Discard → data-card-state="discarded", "Draft discarded"');
  await shoot('discarded', two.sel);
}
