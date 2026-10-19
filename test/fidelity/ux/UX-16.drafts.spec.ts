// Spec: 11-fidelity §11.2.3 (one spec per chapter, one test.step per walkthrough step named with its id; the s and f facts by
// hand, then the Tier R capture), 05-2 §5.7 Draft card (pending look of X-65, Change mode, Send → "Sending in {5}…" + Undo),
// §5.5 Approval card (send to someone new: a hard limit, "I'll always ask for this one."), X-79 ("Change", never "Edit"),
// 08-0 §G.7, CR-0009 (UX-16-02, -04, -06 first tested in M5; the rest of chapter 16 is M8's Gmail, WhatsApp and X).
// The frames are drawn in the foo chat on Fri 16 Oct from 11:00 AM. M5 has no Gmail connector, so the cards are seeded rows
// (test:card.seed) with their approvals rows; Change, Send and Undo are real taps on the Draft card.
// Drawing-vs-app gaps (R1/R2 disputes go to a CR, never into code; CR-0009 row UX-16):
// - fixtures use example.com addresses (public repo), not the drawn gmail.com / company.com ones;
// - the drawn Draft has [ Not now ]; 05-2 §5.7.2 names it [ Discard ]; the drawing puts the pending line in a grey box and the
//   app follows §5.7.1 (a --t-small line); the M8 chat bubbles ("reply to my landlord…", the ⏳ badge) are not drawn by M5;
// - UX-16-04 draws a dark "Sending… Undo" bar over the chat; 05-2 §5.7.2 puts the countdown and Undo in the card's button
//   row ("Sending in {5}…", then "Sending…" when the window closes);
// - UX-16-06 is superseded by X-79 ("Change", not "Edit") and draws a compact header countdown.
import { expect, test, type Page } from '@playwright/test';
import type { CardSeedRequest } from '../../../src/shared/ipc';
import { t } from '../../../src/shared/copy/t';
import { TID } from '../../../src/shared/testids';
import type { ApprovalFields } from '../../../src/shared/types';
import { launch } from '../../e2e/launch';
import { byTid, captureUx, openChat, openWorld, rest, setTheme, settle, step, THEMES, windowSize } from '../capture';

const AT = (hhmm: string) => Date.parse(`2026-10-16T${hhmm}:00+05:30`);
const RAKESH = { name: 'Rakesh Sharma', address: 'r.sharma@example.com' };
const BODY = 'Hi Rakesh, I’ll pay October’s rent on Mon 19 Oct. Thanks for your patience. Vikas';
const FORMAL =
  'Dear Rakesh, I wanted to let you know that I will pay October’s rent on Monday, 19 October. Thank you for your patience. Regards, Vikas Sharma';

const draftSeed = (expiresAt: number): CardSeedRequest => {
  const fields: ApprovalFields = {
    verb: 'send',
    channel: 'email',
    recipients: [{ ...RAKESH, isNew: false, isGroup: false }],
    contentSummary: `Re: October rent\n${BODY}`,
    irreversible: true,
  };
  return {
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
      gmailDraftId: 'gd_ux16',
    },
    approval: { fields, expiresAt },
  };
};

const PRIYA_TEXT = 'Hi Priya, we’re in Goa Sat 12 – Mon 14 Dec at the Taj Holiday Village. Vikas';
const priyaSeed = (expiresAt: number): CardSeedRequest => {
  const fields: ApprovalFields = {
    verb: 'send',
    channel: 'email',
    recipients: [{ name: 'Priya Nair', address: 'priya.n@example.com', isNew: true, isGroup: false }],
    contentSummary: PRIYA_TEXT,
    irreversible: true,
  };
  return {
    type: 'approval',
    state: 'PENDING',
    payload: {
      variant: 'standard',
      approvalId: '',
      verb: 'send',
      title: t('cards.approval.send_email.title', { name: 'Priya Nair' }),
      impact: t('cards.approval.send_email.impact', { address: 'priya.n@example.com', app: 'Gmail', them: 'her' }),
      fields,
      scopes: ['once'],
      hardLimit: true,
      expiresAt,
    },
    approval: { fields, hardLimit: true, expiresAt },
  };
};

async function shoot(page: Page, id: string, sel: string): Promise<void> {
  await page.getByTestId(TID.threadLog).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await rest(page);
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await settle(page);
    await captureUx(page, id, sel, theme);
  }
  await setTheme(page, 'light');
}

test('UX-16 · Drafts and sends: steps UX-16-02, UX-16-04 and UX-16-06, light and dark', async () => {
  test.setTimeout(180_000);
  const app = await launch();
  const page = await app.firstWindow();
  await openWorld(app, page, '2026-10-16T11:01:00+05:30');
  await windowSize(app, page, 1280, 800);
  await openChat(page, 'foo');
  const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), draftSeed(AT('12:01')));
  const sel = `${byTid(TID.cardDraft)}[data-card-id="${r.cardId}"]`;
  const draft = page.locator(sel);

  await test.step('UX-16-02 · a Draft card that is also the approval; it is not sent', async () => {
    const s = step('UX-16-02');
    expect(s.s).toContain('Draft · not sent');
    await draft.scrollIntoViewIfNeeded();
    await expect(draft).toHaveAttribute('data-card-state', 'pending');
    await expect(draft).toContainText(t('cards.draft.title'));
    await expect(draft).toContainText(`${RAKESH.name} <${RAKESH.address}>`);
    await expect(draft.getByTestId(TID.cardDraftSubject)).toHaveText('Re: October rent');
    await expect(draft).toContainText(t('cards.draft.line.pending', { address: RAKESH.address, app: 'Gmail' }));
    await expect(draft.getByTestId(TID.cardDraftSend)).toHaveText(t('cards.draft.button.send_email'));
    await expect(draft.getByTestId(TID.cardDraftChange)).toHaveText(t('cards.draft.button.change'));
    // f: "this draft is also the approval. Expires in 60 minutes."
    expect(s.f).toContain('Expires in 60 minutes');
    await expect(draft).toContainText(t('cards.draft.footer', { time: 'Fri 16 Oct, 12:01 PM' }));
    await shoot(page, 'UX-16-02', sel);
  });

  await test.step('UX-16-04 · Send email: 5 seconds to undo before it leaves', async () => {
    const s = step('UX-16-04');
    expect(s.s).toContain('Undo');
    // UX-16-03's edit first (the drawn card reads "Email · edited"), made with Change (X-79).
    await draft.getByTestId(TID.cardDraftChange).click();
    await draft.locator(`textarea[data-testid="${TID.cardDraftBody}"]`).fill(FORMAL);
    await draft.getByTestId(TID.cardDraftSave).click();
    await expect(draft).toContainText(t('cards.draft.right_label.edited', { channel: 'Email' }));
    await draft.getByTestId(TID.cardDraftSend).click();
    await expect(draft).toHaveAttribute('data-card-state', 'undo_window');
    await expect(draft.getByTestId(TID.cardDraftCountdown)).toHaveText(/^Sending in [45]…$/);
    await expect(draft.getByTestId(TID.cardDraftUndo)).toBeFocused();
    // f: held on the PC; main's clock has not moved, so nothing leaves. The words settle on "Sending…" when the 5 s pass.
    await expect(draft.getByTestId(TID.cardDraftCountdown)).toHaveText(t('cards.draft.sending'), { timeout: 10_000 });
    await expect(draft).toHaveAttribute('data-card-state', 'undo_window');
    await shoot(page, 'UX-16-04', `${sel} div:has(> ${byTid(TID.cardDraftCountdown)})`);
  });

  await test.step('UX-16-06 · someone you have never emailed gets a full Approval card that says so', async () => {
    const s = step('UX-16-06');
    expect(s.f).toContain('always asks');
    await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T11:15:00+05:30'));
    const p = await page.evaluate((x) => window.__fooTest!.cardSeed(x), priyaSeed(AT('12:15')));
    const card = page.locator(`${byTid(TID.cardApproval)}[data-card-id="${p.cardId}"]`);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveAttribute('data-card-state', 'PENDING');
    await expect(card).toContainText('Send this email to Priya Nair?');
    await expect(card.getByTestId(TID.cardApprovalImpact)).toHaveText(
      'Will send to priya.n@example.com from your Gmail. You haven’t emailed her before. Can’t be unsent.',
    );
    await expect(card.getByTestId(TID.cardApprovalApprove)).toHaveText(t('cards.approval.send_email.primary'));
    await expect(card.getByTestId(TID.cardApprovalChange)).toHaveText(t('cards.approval.button.change'));
    await expect(card.getByTestId(TID.cardApprovalNotNow)).toHaveText(t('cards.approval.button.not_now'));
    // f: a new recipient is a hard limit: no scope choice, and the card says it always asks.
    await expect(card.getByTestId(TID.cardApprovalScope)).toHaveCount(0);
    await expect(card).toContainText(t('cards.approval.hard_limit_line'));
    await shoot(page, 'UX-16-06', `${byTid(TID.cardApproval)}[data-card-id="${p.cardId}"]`);
  });
  await app.close();
});
