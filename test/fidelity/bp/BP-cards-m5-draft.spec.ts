// Spec: 11-fidelity §11.2.4 (Tier R app side), §11.12 M5 fidelity exit (BP-CARD-07, CR-0009), 05-2 §5.7 Draft card (base).
// The Blueprint's card gallery mini 7 draws an X post draft; M5 builds the email base (the X and WhatsApp variants are M8),
// so the app side is a pending known-recipient email Draft, seeded through test:card.seed with its approvals row on the
// X-10 clock, in the foo chat. The minis are drawn in 350px panels, so R2 boxes are disputed by construction (CR-0003 §b);
// the words differ by variant (CR-0009 BP-CARD-07 row). Captures land in golden/out/app; the golden lane's Tier R step
// compares them with golden/ref/bp.
import { expect, test } from '@playwright/test';
import type { CardSeedRequest } from '../../../src/shared/ipc';
import { TID } from '../../../src/shared/testids';
import type { ApprovalFields } from '../../../src/shared/types';
import { launch } from '../../e2e/launch';
import { byTid, captureBp, openChat, openWorld, rest, setTheme, settle, THEMES } from '../capture';

const T = Date.parse('2026-10-16T09:41:00+05:30');
const FIELDS: ApprovalFields = {
  verb: 'send',
  channel: 'email',
  recipients: [{ name: 'Rakesh Sharma', address: 'r.sharma@example.com', isNew: false, isGroup: false }],
  contentSummary: 'Re: October rent\nHi Rakesh, I’ll pay October’s rent on Tuesday 20 Oct. Thanks for your patience. Vikas',
  irreversible: true,
};
const DRAFT_SEED: CardSeedRequest = {
  type: 'draft',
  state: 'pending',
  payload: {
    approvalId: '',
    channel: 'email',
    to: { name: 'Rakesh Sharma', address: 'r.sharma@example.com', isNew: false },
    subject: 'Re: October rent',
    body: 'Hi Rakesh, I’ll pay October’s rent on Tuesday 20 Oct. Thanks for your patience. Vikas',
    edited: false,
    sendAllowed: true,
    gmailDraftId: 'gd_seed',
  },
  approval: { fields: FIELDS, expiresAt: T + 60 * 60_000 },
};

test('M5 Blueprint capture for Tier R: BP-CARD-07 (Draft), both themes', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await openWorld(app, page);
  await openChat(page, 'foo');
  const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), DRAFT_SEED);
  const sel = `${byTid(TID.cardDraft)}[data-card-id="${r.cardId}"]`;
  const card = page.locator(sel);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await rest(page);
    await settle(page);
    await captureBp(page, 'BP-CARD-07', sel, theme);
  }
  await app.close();
});
