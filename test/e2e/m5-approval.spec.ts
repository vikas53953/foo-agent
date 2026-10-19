// Spec: 05-2 §5.5 Approval card (§5.5.2 kinds: send / book / delete cards hide the scope and show "I'll always ask for this
// one."; calendar-add and helper-app cards show the scope with "Just this once"; §5.5.4 states and copy; §5.5.5 Ctrl+Enter
// does nothing), 07-2 §5 (Approve → APPROVED → RUNNING, SM-A6 "Approved by you at {Fri 16 Oct, 9:48 AM}. Doing it now…";
// Not now → DECLINED, never auto-retried; timer ends → EXPIRED + [ Ask me again ]), 08-2 §9.1 (main's expiry tick on the
// absolute expires_at), 08-0 §A.2 (settings:set → SETTING_LOCKED; the Permissions page is M13, AT-280's UI half). Cards are
// seeded through test:card.seed (CR-0009) on the X-10 clock; no engine runs, so APPROVED stays APPROVED (RUNNING is the
// runner's write-ahead, T7) and the integration tests cover the engine half.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { CardSeedRequest } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import type { ApprovalFields, ApprovalScope } from '../../src/shared/types';
import { byTid, openChat, openWorld } from '../fidelity/capture';
import { launch } from './launch';

const T = Date.parse('2026-10-16T09:41:00+05:30');
const MIN = 60_000;

function approval(
  fields: ApprovalFields,
  title: string,
  impact: string,
  o: { min: number; scopes?: ApprovalScope[]; hard?: boolean },
): CardSeedRequest {
  const expiresAt = T + o.min * MIN;
  return {
    type: 'approval',
    state: 'PENDING',
    payload: {
      variant: 'standard',
      approvalId: '',
      verb: fields.verb,
      title,
      impact,
      fields,
      scopes: o.scopes ?? ['once'],
      hardLimit: o.hard ?? true,
      expiresAt,
    },
    approval: { fields, hardLimit: o.hard ?? true, expiresAt },
  };
}

const BOOK = approval(
  {
    verb: 'book',
    payee: 'Pizza by the Bay',
    siteDomain: 'example.com',
    partySize: 4,
    amountPaise: 0,
    cancelTerms: { freeUntil: T + 9 * 60 * MIN, feePaise: 100_000, refundable: true },
    irreversible: false,
  },
  'Book this table?',
  'Pizza by the Bay, Marine Drive · Sun 18 Oct, 8:00 PM · 4 people',
  { min: 15 },
);
const SEND = approval(
  {
    verb: 'send',
    channel: 'email',
    recipients: [{ name: 'Priya Example', address: 'priya@example.com', isNew: true, isGroup: false }],
    contentSummary: 'Hi Priya, sharing the Goa dates: 12–14 Dec…',
    irreversible: true,
  },
  'Send this email to Priya Example?',
  'Will send to priya@example.com from your Gmail. You haven’t emailed her before. Can’t be unsent.',
  { min: 60 },
);
const DELETE = approval(
  { verb: 'delete', item: '3 emails', channel: 'email', irreversible: true },
  'Delete 3 emails from Example Mobile?',
  'This can’t be undone.',
  { min: 60 },
);
const CALENDAR = approval(
  { verb: 'calendar_write', item: 'Train to Mumbai', irreversible: false },
  'Add Train to Mumbai to your calendar?',
  'Sat 17 Oct, 4:30 PM · Mumbai Central · Google Calendar',
  { min: 60, scopes: ['once', 'chat', 'always'], hard: false },
);
const USE_APP = approval(
  { verb: 'use_app', app: 'calendar', irreversible: false },
  'Let Trips use Calendar?',
  'Trips will read your events and add trips. It won’t delete anything.',
  {
    min: 60,
    scopes: ['once', 'chat', 'always'],
    hard: false,
  },
);

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await launch();
  page = await app.firstWindow();
  await openWorld(app, page);
  await openChat(page, 'foo');
});
test.afterAll(async () => app?.close());

async function seed(req: CardSeedRequest) {
  const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), req);
  const card = page.locator(`${byTid(TID.cardApproval)}[data-card-id="${r.cardId}"]`);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  return { ...r, card };
}

test('AT-122 Approve → APPROVED with "Approved by you at {Fri 16 Oct, 9:48 AM}. Doing it now…"; Ctrl+Enter never approves', async () => {
  const { card } = await seed(BOOK);
  await expect(card).toHaveAttribute('data-card-state', 'PENDING');
  await expect(card.getByTestId(TID.cardApprovalExpiry)).toHaveText(/^Expires in 1[45]:\d\d$/);
  await expect(card.getByTestId(TID.cardApprovalFooter)).toHaveText('Expires Fri 16 Oct, 9:56 AM · If you don’t answer, I won’t book it.');
  // 09 §9.17.4: Ctrl+Enter inside the card does nothing, and the Primary is never focused for you.
  await card.getByTestId(TID.cardApprovalNotNow).focus();
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(300);
  await expect(card).toHaveAttribute('data-card-state', 'PENDING');
  await expect(card.getByTestId(TID.cardApprovalApprove)).not.toBeFocused();
  await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T09:48:00+05:30'));
  await card.getByTestId(TID.cardApprovalApprove).click();
  await expect(card).toHaveAttribute('data-card-state', 'APPROVED');
  await expect(card).toContainText('Approved by you at Fri 16 Oct, 9:48 AM. Doing it now…');
  await expect(card.getByTestId(TID.cardApprovalApprove)).toHaveCount(0);
});

test('AT-126 Not now → DECLINED "You said no. Nothing was booked." and nothing retries', async () => {
  await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T09:41:00+05:30'));
  const { card } = await seed(BOOK);
  await card.getByTestId(TID.cardApprovalNotNow).click();
  await expect(card).toHaveAttribute('data-card-state', 'DECLINED');
  await expect(card).toContainText('You said no. Nothing was booked.');
  await page.evaluate(() => window.__fooTest!.clock.advance(30 * 60_000));
  await page.waitForTimeout(1_500);
  await expect(card).toHaveAttribute('data-card-state', 'DECLINED');
  await expect(card.getByTestId(TID.cardApprovalAskAgain)).toHaveCount(0);
});

test('AT-127 timer ends → EXPIRED at its absolute time + [ Ask me again ]; the tap builds a fresh PENDING card', async () => {
  await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T09:41:00+05:30'));
  const { card } = await seed(BOOK);
  await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T09:56:00+05:30'));
  await expect(card).toHaveAttribute('data-card-state', 'EXPIRED', { timeout: 5_000 });
  await expect(card).toContainText('This expired at Fri 16 Oct, 9:56 AM. Nothing was booked.');
  const before = await page.locator(byTid(TID.cardApproval)).count();
  await card.getByTestId(TID.cardApprovalAskAgain).click();
  await expect(page.locator(byTid(TID.cardApproval))).toHaveCount(before + 1);
  const fresh = page.locator(byTid(TID.cardApproval)).last();
  await expect(fresh).toHaveAttribute('data-card-state', 'PENDING');
  await expect(card).toHaveAttribute('data-card-state', 'EXPIRED');
});

test('AT-280 send / book / delete cards hide the scope with "I’ll always ask for this one."; calendar-add and helper-app cards show it; locks refuse always', async () => {
  await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T09:41:00+05:30'));
  for (const req of [SEND, BOOK, DELETE]) {
    const { card } = await seed(req);
    await expect(card.getByTestId(TID.cardApprovalScope)).toHaveCount(0);
    await expect(card).toContainText('I’ll always ask for this one.');
  }
  for (const req of [CALENDAR, USE_APP]) {
    const { card } = await seed(req);
    const scope = card.getByTestId(TID.cardApprovalScope);
    await expect(scope).toBeVisible();
    await expect(scope.getByRole('radio')).toHaveText(['Just this once', 'For this chat', 'Always']);
    await expect(scope.getByRole('radio', { name: 'Just this once' })).toHaveAttribute('aria-checked', 'true');
    await expect(card).not.toContainText('I’ll always ask for this one.');
  }
  // The send card: quote with Show all; no Change-free approve on the keyboard.
  const sendCard = page.locator(byTid(TID.cardApproval)).filter({ hasText: 'Send this email to Priya Example?' });
  await expect(sendCard.getByTestId(TID.cardApprovalQuote)).toContainText('Hi Priya');
  // "Always" on the helper-app card: the confirm line, then Approve writes the rule.
  const useApp = page.locator(byTid(TID.cardApproval)).filter({ hasText: 'Let Trips use Calendar?' });
  await useApp.getByRole('radio', { name: 'Always' }).click();
  await expect(useApp.getByTestId(TID.cardApprovalAlwaysLine)).toBeVisible();
  await useApp.getByTestId(TID.cardApprovalApprove).click();
  await expect(useApp).toHaveAttribute('data-card-state', 'APPROVED');
  // No send or spend rule from any surface: settings:set refuses always on the locked rows (08-0 §A.2).
  const locked = await page.evaluate(async () => {
    const out: Record<string, string> = {};
    for (const row of ['send', 'book', 'pay', 'delete', 'share', 'post']) {
      const r = await window.foo.invoke('settings:set', { path: `permissions.actions.${row}`, value: 'always' });
      out[row] = r.ok ? 'ok' : r.error.kind;
    }
    const calendar = await window.foo.invoke('settings:set', { path: 'permissions.actions.calendar', value: 'always' });
    out.calendar = calendar.ok ? 'ok' : calendar.error.kind;
    return out;
  });
  expect(locked).toEqual({
    send: 'SETTING_LOCKED',
    book: 'SETTING_LOCKED',
    pay: 'SETTING_LOCKED',
    delete: 'SETTING_LOCKED',
    share: 'SETTING_LOCKED',
    post: 'SETTING_LOCKED',
    calendar: 'ok',
  });
});

test('Narrator: Approval and Draft cards carry the §5.5.5 / §5.7.4 description after their label', async () => {
  await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T09:41:00+05:30'));
  const { card } = await seed(SEND);
  // §5.5.5: impact line + extra risk lines + "Expires {absolute time}".
  await expect(card).toHaveAttribute(
    'aria-description',
    /^Will send to priya@example\.com from your Gmail\..*Expires Fri 16 Oct, 10:41 AM/u,
  );
  const body = 'Hi Rakesh, I’ll pay October’s rent on Mon 19 Oct. ' + 'x'.repeat(300);
  const fields: ApprovalFields = {
    verb: 'send',
    channel: 'email',
    recipients: [{ name: 'Rakesh Example', address: 'rakesh@example.com', isNew: false, isGroup: false }],
    contentSummary: `Re: October rent\n${body}`,
    irreversible: true,
  };
  const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), {
    type: 'draft',
    state: 'pending',
    payload: {
      approvalId: '',
      channel: 'email',
      to: { name: 'Rakesh Example', address: 'rakesh@example.com', isNew: false },
      subject: 'Re: October rent',
      body,
      edited: false,
      sendAllowed: true,
      gmailDraftId: 'gd_narrator',
    },
    approval: { fields, expiresAt: T + 60 * MIN },
  } satisfies CardSeedRequest);
  const draft = page.locator(`${byTid(TID.cardDraft)}[data-card-id="${r.cardId}"]`);
  await draft.scrollIntoViewIfNeeded();
  // §5.7.4: "Subject {subject}. {first 200 characters of body}".
  await expect(draft).toHaveAttribute('aria-description', `Subject Re: October rent. ${body.slice(0, 200)}`);
});
