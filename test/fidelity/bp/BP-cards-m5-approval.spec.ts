// Spec: 11-fidelity §11.2.4 (Tier R app side), §11.12 M5 fidelity exit (BP-CARD-05, CR-0009), 05-2 §5.5 Approval card.
// The Blueprint's card gallery mini 5 draws a PENDING send-email approval ("Send this email to Rakesh?"); the app side is the
// same kind of card, seeded through test:card.seed on the X-10 clock, in the foo chat. The minis are drawn in 350px panels,
// so R2 boxes are disputed by construction (CR-0003 §b); R3 and R4 count. Captures land in golden/out/app; the golden lane's
// Tier R step compares them with golden/ref/bp.
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
  recipients: [{ name: 'Rakesh', address: 'r.sharma@example.com', isNew: true, isGroup: false }],
  contentSummary: 'Hi Rakesh, the rent for October is sent.',
  irreversible: true,
};
const SEND: CardSeedRequest = {
  type: 'approval',
  state: 'PENDING',
  payload: {
    variant: 'standard',
    approvalId: '',
    verb: 'send',
    title: 'Send this email to Rakesh?',
    impact: 'Will send to r.sharma@example.com from your Gmail. You haven’t emailed him before. Can’t be unsent.',
    fields: FIELDS,
    scopes: ['once'],
    hardLimit: true,
    expiresAt: T + 60 * 60_000,
  },
  approval: { fields: FIELDS, hardLimit: true, expiresAt: T + 60 * 60_000 },
};

test('M5 Blueprint capture for Tier R: BP-CARD-05 (Approval), both themes', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await openWorld(app, page);
  await openChat(page, 'foo');
  const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), SEND);
  const sel = `${byTid(TID.cardApproval)}[data-card-id="${r.cardId}"]`;
  const card = page.locator(sel);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await rest(page);
    await settle(page);
    await captureBp(page, 'BP-CARD-05', sel, theme);
  }
  await app.close();
});
