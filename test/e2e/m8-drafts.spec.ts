// Spec: 10-acceptance-1 AT-051 (J12: "draft a reply to my landlord" → a Draft card, and no email is sent until the user taps
// "Send email"), AT-052 (a recipient the user has never emailed: Send opens a full Approval card "You haven't emailed {them}
// before" with no scope chips), 05-2 §5.7 (the email Draft card; Send → "Sending in {5}…" + Undo, then "✓ Sent" with the
// Sent-folder proof), §5.5 (the full Approval card, a hard limit), 08-2 §8.2 (`gmail.draft` is prepare and never sends; the
// engine resolves the person, 08-3 §16.7), 08-3 §16.1.4 (drafts.create, then drafts.send only after the tap). M8 T6: the real
// app on the fake AI and a fake Google on 127.0.0.1 (FOO_FAKE_GOOGLE); never a real account. Made-up addresses only.
import { expect, test } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { byTid, openChat, openWorld } from '../fidelity/capture';
import {
  ASK_LANDLORD,
  ASK_NEW,
  LANDLORD,
  NEW_PERSON,
  advance,
  askForDraft,
  draftsGoogle,
  draftsScript,
  launchDrafts,
} from './m8-drafts-world';

test('AT-051 "draft a reply to my landlord" gives a Draft card; nothing is sent until Send email', async () => {
  test.setTimeout(120_000);
  const google = await draftsGoogle();
  const app = await launchDrafts(google, draftsScript(['landlord']));
  try {
    const page = await app.firstWindow();
    await openWorld(app, page, '2026-10-16T11:01:00+05:30');
    await openChat(page, 'Home');
    const cardId = await askForDraft(page, ASK_LANDLORD);
    const draft = page.locator(`${byTid(TID.cardDraft)}[data-card-id="${cardId}"]`);
    await expect(draft).toHaveAttribute('data-card-state', 'pending');
    await expect(draft).toContainText(`${LANDLORD.name} <${LANDLORD.address}>`);
    await expect(draft.getByTestId(TID.cardDraftSubject)).toHaveText('Re: October rent');
    await expect(draft).toContainText(t('cards.draft.line.pending', { address: LANDLORD.address, app: 'Gmail' }));
    await expect(draft).toContainText('Sent from foo tester');
    // The Gmail draft exists, in Rakesh's thread; nothing has gone out.
    expect(google.drafts.calls).toEqual(['create']);
    expect([...google.drafts.drafts.values()][0]!.threadId).toBe('t_rent');
    await advance(page, 60_000);
    expect(google.drafts.sent).toEqual([]);
    expect(google.requests.some((r) => r.path.endsWith('/drafts/send'))).toBe(false);

    await draft.getByTestId(TID.cardDraftSend).click();
    await expect(draft).toHaveAttribute('data-card-state', 'undo_window');
    expect(google.drafts.sent).toEqual([]);
    await advance(page, 6_000);
    await expect(draft).toHaveAttribute('data-card-state', 'sent', { timeout: 10_000 });
    await expect(draft.getByTestId(TID.threadProofChip)).toBeVisible();
    expect(google.drafts.calls).toEqual(['create', 'send:r_1']);
    expect(google.mail.messages.filter((m) => m.labels?.includes('SENT') && m.to === LANDLORD.address)).toHaveLength(2);
  } finally {
    await app.close();
    await google.close();
  }
});

test('AT-052 someone never emailed: Send opens the full Approval card, "You haven’t emailed them before", no scope chips', async () => {
  test.setTimeout(120_000);
  const google = await draftsGoogle();
  const app = await launchDrafts(google, draftsScript(['new']));
  try {
    const page = await app.firstWindow();
    await openWorld(app, page, '2026-10-16T11:01:00+05:30');
    await openChat(page, 'Home');
    const cardId = await askForDraft(page, ASK_NEW);
    const draft = page.locator(`${byTid(TID.cardDraft)}[data-card-id="${cardId}"]`);
    await expect(draft).toContainText(`${NEW_PERSON.name} <${NEW_PERSON.address}>`);
    await draft.getByTestId(TID.cardDraftSend).click();
    // No 5 s undo: the draft waits on the full card below it.
    const waiting = draft.getByTestId(TID.cardDraftWaiting);
    await expect(waiting).toHaveText(t('cards.draft.line.waiting_approval'));
    await expect(draft).toHaveAttribute('data-card-state', 'pending');
    const full = page.getByTestId(TID.threadLog).locator(byTid(TID.cardApproval)).last();
    await expect(full).toHaveAttribute('data-card-state', 'PENDING');
    await expect(full).toContainText(t('cards.approval.send_email.title', { name: NEW_PERSON.name }));
    await expect(full.getByTestId(TID.cardApprovalImpact)).toHaveText(
      t('cards.approval.send_email.impact', { address: NEW_PERSON.address, app: 'Gmail', them: t('cards.approval.them') }),
    );
    await expect(full.getByTestId(TID.cardApprovalScope)).toHaveCount(0);
    await expect(full).toContainText(t('cards.approval.hard_limit_line'));
    await waiting.click();
    await expect(full.getByTestId(TID.cardApprovalApprove)).toBeFocused();
    await advance(page, 30_000);
    expect(google.drafts.sent).toEqual([]);

    // The full card's tap sends it, once, with no undo window.
    await full.getByTestId(TID.cardApprovalApprove).click();
    await expect(draft).toHaveAttribute('data-card-state', 'sent', { timeout: 10_000 });
    expect(google.drafts.calls).toEqual(['create', 'send:r_1']);
  } finally {
    await app.close();
    await google.close();
  }
});
