// Spec: 05-1 §0.7 (a new card is announced in the message list's polite live region: "{sender} sent {card name}: {title}",
// gated cards add ", needs you"), 05-1 §0.5 (a folded card's summary row toggles a read-only expanded view with the decision
// line at the bottom), 05-2 §5.5.4 ("Approved by you at {time} · {scope}"), §5.7.3 ("Sent by you at {time}"), §5.8.4 (code box
// placeholder "123 456"). M5 T15. Cards are seeded through test:card.seed (CR-0009) on the X-10 clock.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import type { CardSeedRequest } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import type { ApprovalFields } from '../../src/shared/types';
import { byTid, openChat, openWorld } from '../fidelity/capture';
import { FLIGHTS, seed as choiceSeed } from './m5-choice-seeds';
import { launch } from './launch';

const T = Date.parse('2026-10-16T09:41:00+05:30');
const MIN = 60_000;

const BOOK_FIELDS: ApprovalFields = {
  verb: 'book',
  payee: 'Pizza by the Bay',
  siteDomain: 'example.com',
  partySize: 4,
  amountPaise: 0,
  cancelTerms: { freeUntil: T + 9 * 60 * MIN, feePaise: 100_000, refundable: true },
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
    expiresAt: T + 15 * MIN,
  },
  approval: { fields: BOOK_FIELDS, hardLimit: true, expiresAt: T + 15 * MIN },
};
const SEND_FIELDS: ApprovalFields = {
  verb: 'send',
  channel: 'email',
  recipients: [{ name: 'Rakesh Example', address: 'rakesh@example.com', isNew: false, isGroup: false }],
  contentSummary: 'Re: October rent\nHi Rakesh, I’ll pay October’s rent on Mon 19 Oct.',
  irreversible: true,
};
const draft = (state: string, extra: Record<string, unknown> = {}): CardSeedRequest => ({
  type: 'draft',
  state,
  payload: {
    approvalId: '',
    channel: 'email',
    to: { name: 'Rakesh Example', address: 'rakesh@example.com', isNew: false },
    subject: 'Re: October rent',
    body: 'Hi Rakesh, I’ll pay October’s rent on Mon 19 Oct.',
    edited: false,
    sendAllowed: true,
    gmailDraftId: 'gd_announce',
    ...extra,
  },
  approval: { fields: SEND_FIELDS, expiresAt: T + 60 * MIN, ...(state === 'sent' ? { state: 'COMPLETED' as const } : {}) },
});

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await launch();
  page = await app.firstWindow();
  await openWorld(app, page);
  await openChat(page, 'foo');
  // Other lines share the polite region (the "{n} things are waiting" chip), so every text it shows is kept.
  await page.evaluate((tid) => {
    const el = document.querySelector(`[data-testid="${tid}"] [aria-live="polite"]`)!;
    const said: string[] = [];
    (window as unknown as { __said: string[] }).__said = said;
    new MutationObserver(() => {
      if (el.textContent) said.push(el.textContent);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }, TID.appAnnouncer);
});

const said = () => page.evaluate(() => (window as unknown as { __said: string[] }).__said);
const expectSaid = (text: string) => expect.poll(said).toContain(text);
test.afterAll(async () => app?.close());

async function seed(req: CardSeedRequest, tid: string) {
  const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), req);
  const card = page.locator(`${byTid(tid)}[data-card-id="${r.cardId}"]`);
  // The virtual list can swap the row while it measures, so the scroll is retried until the card holds still.
  await expect(async () => {
    await card.scrollIntoViewIfNeeded({ timeout: 1_000 });
    await expect(card).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return { ...r, card };
}

test('05-1 §0.7 a gated card is announced "{sender} sent Approval needed: {title}, needs you"', async () => {
  await page.evaluate((ms) => window.__fooTest!.clock.set(new Date(ms).toISOString()), T);
  await seed(BOOK, TID.cardApproval);
  await expectSaid(t('cards.common.arrival_gated', { sender: 'foo', cardName: t('cards.approval.card_name'), title: 'Book this table?' }));
});

test('05-1 §0.7 plain cards are announced "{sender} sent {card name}: {title}" with no "needs you"', async () => {
  await seed(choiceSeed(FLIGHTS), TID.cardChoice);
  await expectSaid(t('cards.common.arrival', { sender: 'foo', cardName: t('cards.choice.card_name'), title: String(FLIGHTS.question) }));
  await seed(draft('pending'), TID.cardDraft);
  await expectSaid(
    t('cards.common.arrival', {
      sender: 'foo',
      cardName: t('cards.draft.card_name'),
      title: t('cards.draft.label', { channel: t('cards.draft.right_label.email'), name: 'Rakesh Example' }).replace(
        `${t('cards.draft.card_name')}: `,
        '',
      ),
    }),
  );
});

test('05-2 §5.5.4 the approved summary expands to the card plus "Approved by you at {time} · Just this once"', async () => {
  await page.evaluate((ms) => window.__fooTest!.clock.set(new Date(ms).toISOString()), T);
  const { card } = await seed(BOOK, TID.cardApproval);
  await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T09:48:00+05:30'));
  await card.getByTestId(TID.cardApprovalApprove).click();
  await expect(card).toHaveAttribute('data-card-state', 'APPROVED');
  const line = t('cards.approval.decision_line', { time: '9:48 AM', scope: t('cards.approval.scope.once') });
  await expect(card).not.toContainText(line);
  const row = card.getByRole('button', { expanded: false });
  await row.click();
  await expect(card).toHaveAttribute('data-expanded', 'true');
  await expect(card).toContainText(line);
  await expect(card.getByTestId(TID.cardApprovalImpact)).toHaveText('Pizza by the Bay, Marine Drive · Sun 18 Oct, 8:00 PM · 4 people');
  // Enter on the row folds it again.
  await card.getByRole('button', { expanded: true }).press('Enter');
  await expect(card).not.toContainText(line);
});

test('05-2 §5.7.3 the sent Draft summary expands to the sent text plus "Sent by you at {time}"', async () => {
  const sentAt = Date.parse('2026-10-16T09:52:00+05:30');
  const { card } = await seed(draft('sent', { sentAt, sentMessageId: 'msg_announce' }), TID.cardDraft);
  const line = t('cards.draft.decision_line', { time: '9:52 AM' });
  await expect(card).not.toContainText(line);
  await card.getByRole('button', { expanded: false }).click();
  await expect(card).toContainText(line);
  await expect(card.getByTestId(TID.cardDraftBody)).toHaveText('Hi Rakesh, I’ll pay October’s rent on Mon 19 Oct.');
});

test('05-2 §5.8.4 the code box field shows the placeholder "123 456"', async () => {
  const { card } = await seed(
    {
      type: 'secret',
      state: 'asking',
      payload: { secretKind: 'otp', name: 'Bank code', why: 'Your bank sent a code.', fields: [{ key: 'code', label: '', masked: true }] },
    },
    TID.cardSecret,
  );
  await expect(card.getByTestId(TID.cardSecretField)).toHaveAttribute('placeholder', t('cards.secret.otp.placeholder'));
});
