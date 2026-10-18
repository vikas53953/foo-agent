// Spec: 05-3 §5.11 (the Google Connect card: offered → waiting → "✓ Connected as"), 06-2 §6.8 (Settings → Connections:
// Gmail, Calendar, Contacts and X rows; Disconnect Google → C-10), 08-3 §16.1 (installed-app sign-in, loopback, revoke),
// 10-1 AT-014, AT-093. foo-verify journey for M8 T2, on the fake Google token endpoint and a fake client file; the
// browser is played by the journey (main's openExternal is recorded, then the loopback is called the way Google's redirect
// would). Fake accounts only (@example.com). Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m8-t2-google.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { browserReturns, googleEnv, lastOpened, openConnections, openConnectWorld } from '../e2e/m8-google';
import { byTid, openChat, rest, setTheme, settle } from '../fidelity/capture';

const attr = async (p: { getAttribute(n: string): Promise<string | null> }, want: string, what: string) => {
  const got = await p.getAttribute('data-state');
  if (got !== want) throw new Error(`${what} data-state ${got}, expected ${want}`);
};

export default async function journey(v: Verify): Promise<void> {
  const { server, env } = await googleEnv();
  try {
    const { app, page } = await v.launch({ env });
    await openConnectWorld(app, page);
    await openChat(page, 'foo');
    const card = page.getByTestId(TID.cardConnect);
    await card.waitFor();
    await attr(card, 'offered', 'Connect card');
    await rest(page);
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await settle(page);
      await v.shot('card-offered', byTid(TID.cardConnect));
    }
    await setTheme(page, 'light');
    v.note('Connect card shows "Connect Gmail and Calendar" with Connect / Not now; no Google request yet');

    await card.getByTestId(TID.cardConnectConnect).click();
    await card.getByText(t('cards.connect.line.waiting')).waitFor({ timeout: 3_000 });
    const link = await lastOpened(app);
    if (link.host !== 'accounts.google.com') throw new Error(`sign-in opened ${link.host}`);
    if (link.searchParams.get('code_challenge_method') !== 'S256') throw new Error('sign-in link has no S256 challenge');
    if (link.searchParams.get('prompt') !== 'consent') throw new Error(`prompt=${link.searchParams.get('prompt')}`);
    v.note(
      `Connect → main opened accounts.google.com (PKCE S256, prompt=consent, loopback ${new URL(link.searchParams.get('redirect_uri')!).host})`,
    );
    await settle(page);
    await v.shot('card-waiting', byTid(TID.cardConnect));

    const back = await browserReturns(link);
    const returned = Date.now();
    if (!back.body.includes(t('app.signin_page.connected'))) throw new Error('loopback page did not say connected');
    const done = t('cards.connect.line.connected', { account: 'v•••@example.com' });
    await card.getByText(done).waitFor({ timeout: 3_000 });
    v.note(`browser returned → card reads "${done}" after ${Date.now() - returned} ms (AT-014: under 3 s)`);
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await settle(page);
      await v.shot('card-connected', byTid(TID.cardConnect));
    }
    await setTheme(page, 'light');

    await openConnections(app, page);
    await attr(page.getByTestId(TID.settingsRowConnectionsGmail), 'connected', 'Gmail row');
    await attr(page.getByTestId(TID.settingsRowConnectionsCalendar), 'on', 'Calendar row');
    await attr(page.getByTestId(TID.settingsRowConnectionsContacts), 'on', 'Contacts row');
    v.note('Settings → Connections: Gmail connected (can send), Calendar and Contacts on, X "Drafts only"');
    await settle(page);
    await v.shot('connections-connected');

    await page
      .getByTestId(TID.settingsRowConnectionsGmail)
      .getByRole('button', { name: t('settings.connections.button.disconnect_google') })
      .click();
    await page.getByTestId(TID.dialogC10).waitFor();
    await settle(page);
    await v.shot('c10-disconnect');
    await page.getByTestId(TID.dialogC10).getByTestId(TID.dialogPrimary).click();
    await page.getByTestId(TID.settingsRowConnectionsGmail).getByText(t('settings.connections.row.not_connected')).waitFor();
    for (let i = 0; i < 20 && server.fake.revoked.length === 0; i++) await page.waitForTimeout(100);
    if (server.fake.revoked.join() !== 'fake-refresh-1') throw new Error(`revoked ${server.fake.revoked.join()}`);
    const after = server.fake.requests.length;
    await page.waitForTimeout(500);
    if (server.fake.requests.length !== after) throw new Error('foo asked Google after Disconnect');
    v.note(
      `C-10 Disconnect → token revoked at the fake endpoint, rows "Not connected", no Google request after (${server.fake.paths().join(', ')})`,
    );
    await settle(page);
    await v.shot('connections-disconnected');
  } finally {
    await server.close();
  }
}
