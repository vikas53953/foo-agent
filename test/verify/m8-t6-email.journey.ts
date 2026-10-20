// Spec: AT-051 (J12: "draft a reply to my landlord" → a Draft card; nothing is sent until "Send email"), AT-053 (Undo inside
// 5 s → nothing in Gmail's Sent folder), AT-052 (someone never emailed → the full Approval card, no scope chips), 05-2 §5.7
// (email Draft card, Change → "Email · edited", Send → "Sending in {5}…" + Undo → "✓ Sent" + Sent-folder proof), 08-2 §8.2
// (`gmail.draft`, the engine resolves the person), 08-3 §16.1.4 (drafts.create / update / send on the real port), §22.3 (a fake
// Google on 127.0.0.1, never a real account). foo-verify journey for M8 T6, light and dark. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m8-t6-email.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { ASK_LANDLORD, ASK_NEW, LANDLORD, advance, askForDraft, draftsGoogle, draftsScript } from '../e2e/m8-drafts-world';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(what);
}

export default async function journey(v: Verify): Promise<void> {
  const google = await draftsGoogle();
  try {
    const { app, page } = await v.launch({ fakeAi: draftsScript(['landlord', 'new']), env: { FOO_FAKE_GOOGLE: google.url } });
    await openWorld(app, page, '2026-10-16T11:01:00+05:30');
    await openChat(page, 'Home');
    await setTheme(page, 'light');

    // 1 · the ask makes a Draft card through the engine's gmail.draft; Gmail has a draft and nothing sent.
    const cardId = await askForDraft(page, ASK_LANDLORD);
    const sel = `${byTid(TID.cardDraft)}[data-card-id="${cardId}"]`;
    const draft = page.locator(sel);
    await draft.scrollIntoViewIfNeeded();
    await rest(page);
    await settle(page);
    check((await draft.getAttribute('data-card-state')) === 'pending', 'the draft is not pending');
    check((await draft.textContent())!.includes(`${LANDLORD.name} <${LANDLORD.address}>`), 'the To line is not Rakesh');
    check(google.drafts.calls.join() === 'create', `Gmail saw ${google.drafts.calls.join()}`);
    await v.shot('draft-pending', sel);
    await advance(page, 60_000);
    check(google.drafts.sent.length === 0, 'something was sent with no tap');
    v.note(
      `"${ASK_LANDLORD}" → a Draft card to ${LANDLORD.name} <${LANDLORD.address}>, "Re: October rent", in his Gmail thread; a minute later Gmail has sent nothing (AT-051)`,
    );

    // 2 · Change edits the one card and the Gmail draft.
    await draft.getByTestId(TID.cardDraftChange).click();
    await draft.locator(`textarea[data-testid="${TID.cardDraftBody}"]`).fill('Hi Rakesh, rent goes out on Mon 19 Oct. Vikas');
    await draft.getByTestId(TID.cardDraftSave).click();
    await draft.getByText(t('cards.draft.right_label.edited', { channel: 'Email' })).waitFor();
    check(google.drafts.calls.join() === 'create,update:r_1', `Gmail saw ${google.drafts.calls.join()}`);
    await rest(page);
    await v.shot('draft-edited', sel);
    v.note('Change → Save changes: the card reads "Email · edited" and Gmail got drafts.update on the same draft');

    // 3 · Send then Undo inside 5 s: nothing goes out.
    await draft.getByTestId(TID.cardDraftSend).click();
    await draft.and(page.locator('[data-card-state="undo_window"]')).waitFor();
    await v.shot('undo-window', sel);
    await advance(page, 2_000);
    await draft.getByTestId(TID.cardDraftUndo).click();
    await draft.getByText(t('cards.draft.line.undone')).waitFor();
    await advance(page, 10_000);
    check(google.drafts.sent.length === 0, 'Undo did not stop the send');
    await rest(page);
    await v.shot('undone', sel);
    v.note('Send → "Sending in 5…" + Undo; Undo after 2 s → "Not sent. The draft is still here." and Gmail has no sent message (AT-053)');

    // 4 · Send again and let the 5 s pass: Sent with the Gmail Sent-folder proof.
    await draft.getByTestId(TID.cardDraftSend).click();
    await advance(page, 6_000);
    await draft.and(page.locator('[data-card-state="sent"]')).waitFor({ timeout: 10_000 });
    await draft.getByTestId(TID.threadProofChip).waitFor();
    check(google.drafts.calls.join() === 'create,update:r_1,send:r_1', `Gmail saw ${google.drafts.calls.join()}`);
    await rest(page);
    await settle(page);
    await v.shot('sent', sel);
    await setTheme(page, 'dark');
    await settle(page);
    await v.shot('sent', sel);
    await setTheme(page, 'light');
    v.note('second Send, 5 s later → "✓ Sent" with the proof chip; Gmail saw drafts.send once (never messages.send)');

    // 5 · someone never emailed: the full Approval card, no scope chips; its tap sends.
    const newId = await askForDraft(page, ASK_NEW);
    const fresh = page.locator(`${byTid(TID.cardDraft)}[data-card-id="${newId}"]`);
    await fresh.getByTestId(TID.cardDraftSend).click();
    await fresh.getByTestId(TID.cardDraftWaiting).waitFor();
    const full = page.getByTestId(TID.threadLog).locator(byTid(TID.cardApproval)).last();
    await full.waitFor();
    check((await full.getByTestId(TID.cardApprovalScope).count()) === 0, 'the full card shows scope chips');
    const impact = (await full.getByTestId(TID.cardApprovalImpact).textContent()) ?? '';
    check(impact.includes('You haven’t emailed them before'), `impact reads "${impact}"`);
    await full.scrollIntoViewIfNeeded();
    await rest(page);
    await settle(page);
    await v.shot('someone-new');
    await setTheme(page, 'dark');
    await settle(page);
    await v.shot('someone-new');
    await setTheme(page, 'light');
    check(google.drafts.sent.length === 1, 'the new person’s email went out before the full card was tapped');
    await full.getByTestId(TID.cardApprovalApprove).click();
    await fresh.and(page.locator('[data-card-state="sent"]')).waitFor({ timeout: 10_000 });
    check(google.drafts.sent.length === 2, 'the full card’s tap did not send');
    await rest(page);
    await v.shot('someone-new-sent');
    v.note(
      `Send on a draft to someone new → "Waiting for your OK below ›" and a full Approval card "${impact}" with no scope chips; its tap sent it once, with no undo window (AT-052)`,
    );
  } finally {
    await google.close();
  }
}
