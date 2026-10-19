// Spec: 05-2 §5.5 Approval card (§5.5.4 states and copy, §5.5.5 Ctrl+Enter does nothing), 07-2 §5 SM-A6 ("Approved by you
// at {Fri 16 Oct, 9:48 AM}. Doing it now…"), 08-2 §9.1 (main's expiry tick on the absolute expires_at), CR-0009.
// foo-verify journey for M5 T4: seed a booking approval in the foo chat, see the countdown, press Ctrl+Enter (nothing
// happens), Approve and read the line; seed a second, set the test clock past its expiry, see EXPIRED + Ask me again, and
// tap it for a fresh card. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m5-t4-approval.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import type { CardSeedRequest } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import type { ApprovalFields } from '../../src/shared/types';
import { byTid, openChat, openWorld, rest, settle } from '../fidelity/capture';

const T = Date.parse('2026-10-16T09:41:00+05:30');
const FIELDS: ApprovalFields = {
  verb: 'book',
  payee: 'Pizza by the Bay',
  siteDomain: 'example.com',
  partySize: 4,
  amountPaise: 0,
  cancelTerms: { freeUntil: Date.parse('2026-10-18T18:00:00+05:30'), feePaise: 100_000, refundable: true },
  irreversible: false,
};
const BOOK = (expiresAt: number): CardSeedRequest => ({
  type: 'approval',
  state: 'PENDING',
  payload: {
    variant: 'standard',
    approvalId: '',
    verb: 'book',
    title: 'Book this table?',
    impact: 'Pizza by the Bay, Marine Drive · Sun 18 Oct, 8:00 PM · 4 people',
    fields: FIELDS,
    scopes: ['once'],
    hardLimit: false,
    expiresAt,
  },
  approval: { fields: FIELDS, expiresAt },
});

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch();
  await openWorld(app, page);
  await openChat(page, 'foo');
  const seed = async (req: CardSeedRequest) => {
    const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), req);
    const sel = `${byTid(TID.cardApproval)}[data-card-id="${r.cardId}"]`;
    const card = page.locator(sel);
    await card.scrollIntoViewIfNeeded();
    await card.waitFor();
    return { sel, card };
  };
  const state = (card: ReturnType<typeof page.locator>) => card.getAttribute('data-card-state');

  // 1. PENDING with a live countdown.
  const one = await seed(BOOK(T + 15 * 60_000));
  const countdown = await one.card.getByTestId(TID.cardApprovalExpiry).textContent();
  const footer = await one.card.getByTestId(TID.cardApprovalFooter).textContent();
  if (!/^Expires in 1[45]:\d\d$/.test(countdown ?? '')) throw new Error(`countdown reads "${countdown}"`);
  v.note(`booking approval seeded PENDING: countdown "${countdown}", footer "${footer}"`);
  await rest(page);
  await settle(page);
  await v.shot('pending', one.sel);

  // 2. Ctrl+Enter inside the card does nothing (09 §9.17.4).
  await one.card.getByTestId(TID.cardApprovalNotNow).focus();
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(500);
  if ((await state(one.card)) !== 'PENDING') throw new Error(`Ctrl+Enter moved the card to ${await state(one.card)}`);
  v.note('Ctrl+Enter with focus inside the card: still PENDING (no shortcut approves)');

  // 3. Approve at 9:48 → APPROVED and the SM-A6 line.
  await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T09:48:00+05:30'));
  await one.card.getByTestId(TID.cardApprovalApprove).click();
  await page.waitForFunction((s) => document.querySelector(s)?.getAttribute('data-card-state') === 'APPROVED', one.sel);
  const line = (await one.card.textContent()) ?? '';
  if (!line.includes('Approved by you at Fri 16 Oct, 9:48 AM. Doing it now…')) throw new Error(`approved card reads "${line}"`);
  v.note('Approve tapped at 9:48 → data-card-state="APPROVED", line "Approved by you at Fri 16 Oct, 9:48 AM. Doing it now…"');
  await rest(page);
  await settle(page);
  await v.shot('approved', one.sel);

  // 4. A second card; the test clock passes its expiry; main's 1 s tick expires it.
  const two = await seed(BOOK(Date.parse('2026-10-16T10:03:00+05:30')));
  await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T10:03:00+05:30'));
  await page.waitForFunction((s) => document.querySelector(s)?.getAttribute('data-card-state') === 'EXPIRED', two.sel, { timeout: 5_000 });
  const expired = (await two.card.textContent()) ?? '';
  if (!expired.includes('This expired at Fri 16 Oct, 10:03 AM. Nothing was booked.')) throw new Error(`expired card reads "${expired}"`);
  v.note(
    'clock set to 10:03 → within one tick data-card-state="EXPIRED", "This expired at Fri 16 Oct, 10:03 AM. Nothing was booked." + Ask me again',
  );
  await rest(page);
  await settle(page);
  await v.shot('expired', two.sel);

  // 5. Ask me again → a fresh PENDING card under it; the expired one stays EXPIRED.
  const before = await page.locator(byTid(TID.cardApproval)).count();
  await two.card.getByTestId(TID.cardApprovalAskAgain).click();
  await page.waitForFunction(([s, n]) => document.querySelectorAll(s).length === n, [byTid(TID.cardApproval), before + 1] as const);
  const fresh = page.locator(byTid(TID.cardApproval)).last();
  if ((await state(fresh)) !== 'PENDING' || (await state(two.card)) !== 'EXPIRED')
    throw new Error('Ask me again did not build a fresh PENDING card');
  v.note('Ask me again → a new PENDING Approval card; the expired card stays EXPIRED');
  await fresh.scrollIntoViewIfNeeded();
  await rest(page);
  await settle(page);
  await v.shot('asked-again');
}
