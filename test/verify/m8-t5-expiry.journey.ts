// Spec: AT-220 (J19: the Gmail connection expires → the job that needs Gmail waits with one error card "Your Gmail connection
// expired. Bills and drafts are on hold." [ Reconnect ]; Settings → Connections shows Needs sign-in ("Your Gmail connection
// expired.", 06-2 §6.8); Reconnect → the card is edited in place and the job goes on at the same step), 08-3 §21.2 CONN_EXPIRED,
// §16.1.1 (Reconnect: prompt=select_account + login_hint), 05-3 §5.20 (the card; G-M8-10 the plug icon), 07-2 SM-A10. foo-verify
// journey for M8 T5, light and dark. Fakes only: the fake Google token endpoint (FOO_TEST_GOOGLE_BASE), a fake client file and a
// fake Gmail (FOO_FAKE_GOOGLE); the browser is played by the journey. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m8-t5-expiry.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import type { FakeLine } from '../e2e/fakeAi';
import { browserReturns, googleEnv, lastOpened, openConnections, openConnectWorld } from '../e2e/m8-google';
import { byTid, openChat, rest, setTheme, settle } from '../fidelity/capture';
import { fakeGmailRead, gmailState, serveFakeGoogle } from '../fakes/connectors/gmail-read';

const ASK = 'Find bills due this week';
const RESULT = 'Two bills are due this week: electricity ₹1,240 by Tue 20 Oct and broadband ₹799 by Thu 22 Oct.';
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const tool = (name: string, args: Record<string, unknown>) => act({ kind: 'tool', call: { tool: name, args }, why: 'next' });
const HOLD = 1_500;
const SCRIPT: FakeLine[] = [
  { match: { purpose: 'verify' }, reply: 'ready', once: false },
  {
    match: { purpose: 'intake', promptIncludes: ASK },
    reply: act({
      kind: 'job',
      title: 'Bills',
      plan: [
        { phraseKey: 'read_email', slots: {}, route: 'api' },
        { phraseKey: 'look_for', slots: { what: 'bills due this week' }, route: 'api' },
      ],
      estimate: { minutes: 1 },
      routeHint: ['api'],
      needsApps: [],
    }),
  },
  // Google refuses the token on this one; after Reconnect the same step asks again.
  { match: { purpose: 'step' }, reply: tool('gmail.search', { query: 'bill', sinceDays: 7 }), delayMs: HOLD },
  { match: { purpose: 'step' }, reply: tool('gmail.search', { query: 'bill', sinceDays: 7 }), delayMs: HOLD },
  { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: HOLD },
  { match: { purpose: 'step' }, reply: tool('gmail.read', { messageId: 'm_bill_fibre' }), delayMs: HOLD },
  { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 1 }), delayMs: HOLD },
  {
    match: { purpose: 'step' },
    reply: act({ kind: 'done', result: RESULT, proof: { kind: 'emails_read', count: 2, messageIds: ['m_bill_power', 'm_bill_fibre'] } }),
    delayMs: HOLD,
  },
];

export default async function journey(v: Verify): Promise<void> {
  const { server, env } = await googleEnv();
  const gmail = await serveFakeGoogle([fakeGmailRead(gmailState())]);
  try {
    const { app, page } = await v.launch({ fakeAi: SCRIPT, env: { ...env, FOO_FAKE_GOOGLE: gmail.url } });
    await openConnectWorld(app, page);
    await openChat(page, 'foo');
    const advance = async (ms: number) => {
      for (let at = 0; at < ms; at += 500) {
        await page.evaluate(() => window.__fooTest!.clock.advance(500));
        await page.waitForTimeout(40);
      }
    };

    // Sign in once (T2's Connect card), then Google stops accepting the refresh token.
    const connect = page.getByTestId(TID.cardConnect);
    await connect.getByTestId(TID.cardConnectConnect).click();
    await browserReturns(await lastOpened(app));
    await connect.getByText(t('cards.connect.line.connected', { account: 'v***@example.com' })).waitFor({ timeout: 5_000 });
    server.fake.opts.refresh = 'expired';
    v.note('signed in through the Connect card on the fake Google; then the fake token endpoint answers invalid_grant');
    // Home has no live job: in foo's chat the seeded "Goa stay" would take the message as a steer (08-2 §5.2).
    await openChat(page, 'Home');

    const log = page.getByTestId(TID.threadLog);
    await page.getByTestId(TID.composerField).focus();
    await page.keyboard.type(ASK);
    await page.keyboard.press('Enter');
    await log.locator(byTid(TID.bubbleMe), { hasText: ASK }).last().waitFor();
    const card = log.locator(byTid(TID.cardError)).last();
    for (let i = 0; i < 30 && !(await card.isVisible().catch(() => false)); i++) await advance(500);
    const line1 = t('errors.conn_expired.what_happened', { app: 'Gmail' });
    const line2 = t('errors.conn_expired.what_is_safe');
    await card.getByText(line1).waitFor({ timeout: 5_000 });
    await card.getByText(line2).waitFor();
    const fix = card.getByTestId(TID.cardErrorFix);
    if ((await fix.innerText()).trim() !== t('errors.conn_expired.button')) throw new Error(`button reads ${await fix.innerText()}`);
    if ((await log.locator(byTid(TID.cardError)).count()) !== 1) throw new Error('more than one error card');
    v.note(`one error card: "${line1}" / "${line2}" with the one button [ Reconnect ] (AT-220 words)`);
    await rest(page);
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await settle(page);
      await v.shot('card-expired', byTid(TID.cardError));
    }
    await setTheme(page, 'light');

    await openConnections(app, page);
    await page.getByTestId(TID.settingsRowConnectionsGmail).getByText(t('settings.connections.gmail.needs_signin')).waitFor();
    v.note(`Settings → Connections: the Gmail row is Needs sign-in ("${t('settings.connections.gmail.needs_signin')}")`);
    await settle(page);
    await v.shot('connections-needs-signin');

    await openChat(page, 'Home');
    await log.locator(byTid(TID.cardError)).last().getByTestId(TID.cardErrorFix).click();
    const link = await lastOpened(app);
    if (link.searchParams.get('prompt') !== 'select_account') throw new Error(`Reconnect prompt=${link.searchParams.get('prompt')}`);
    if (link.searchParams.get('login_hint') !== 'vikas.tester@example.com') throw new Error('Reconnect has no login_hint');
    v.note('[ Reconnect ] → main opened accounts.google.com with prompt=select_account and login_hint (08-3 §16.1.1)');
    server.fake.opts.refresh = 'ok';
    await browserReturns(link);

    const resumed = t('cards.checklist.resumed', { n: 1 });
    const fixedCard = log.locator(byTid(TID.cardError)).last();
    for (
      let i = 0;
      i < 30 &&
      !(await fixedCard
        .getByText(resumed)
        .isVisible()
        .catch(() => false));
      i++
    )
      await advance(500);
    await fixedCard.getByText(resumed).waitFor({ timeout: 5_000 });
    if ((await log.locator(byTid(TID.cardError)).count()) !== 1) throw new Error('Reconnect added a second error card');
    v.note(`the same card is edited in place: "${resumed}" (SM-A10), no new card`);
    await settle(page);
    await v.shot('card-fixed', byTid(TID.cardError));

    await advance(15_000);
    await log
      .locator(`${byTid(TID.bubbleFoo)}, ${byTid(TID.bubbleHelper)}`, { hasText: RESULT })
      .first()
      .waitFor({ timeout: 15_000 });
    const paths = gmail.requests.map((r) => `${r.method} ${r.path}`);
    for (const want of ['GET /gmail/v1/users/me/profile', 'GET /gmail/v1/users/me/messages', 'GET /v1/people/me/connections'])
      if (!paths.includes(want)) throw new Error(`fake Google never saw ${want}: ${paths.join(' | ')}`);
    v.note(`the job went on at step 1 and finished: "${RESULT}"`);
    v.note(
      'after Reconnect the Gmail poller took its baseline (users.getProfile), Contacts synced (people.connections) and the step ' +
        `searched Gmail; every call went to the fake Google: ${[...new Set(paths)].join(' · ')}`,
    );
    await rest(page);
    await settle(page);
    await v.shot('job-done');
    await setTheme(page, 'dark');
    await settle(page);
    await v.shot('job-done');
  } finally {
    await gmail.close();
    await server.close();
  }
}
