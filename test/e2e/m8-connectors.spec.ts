// AT-014 (J4; 08-3 §16.1, 05-3 §5.11): Gmail + Calendar asked, Google sign-in done → the card shows "✓ Connected as" with a
// masked address within 3 s of the browser returning. AT-093 (J21; 08-1 §3.2 connection:disconnect, C-10): Disconnect Google
// → foo makes no further Google requests and the right shell "Using" has no Gmail chip; Settings → Connections rows go to
// "Not connected". All on the fake Google token endpoint; the browser is played by the test.
import { expect, test } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { openChat } from '../fidelity/capture';
import { launch, testDirs } from './launch';
import { browserReturns, googleEnv, lastOpened, openConnections, openConnectWorld } from './m8-google';

test('AT-014: Connect card → Google sign-in → "✓ Connected as v***@example.com" within 3 s; three rows connected', async () => {
  const { server, env } = await googleEnv();
  const app = await launch(testDirs(), [], env);
  try {
    const page = await app.firstWindow();
    await openConnectWorld(app, page);
    await openChat(page, 'foo');
    const card = page.getByTestId(TID.cardConnect);
    await expect(card).toHaveAttribute('data-state', 'offered');
    await expect(card).toContainText(t('cards.connect.google.title'));
    await card.getByTestId(TID.cardConnectConnect).click();
    await expect(card).toHaveAttribute('data-state', 'waiting');
    await expect(card).toContainText(t('cards.connect.line.waiting'));

    const link = await lastOpened(app);
    expect(link.host).toBe('accounts.google.com');
    expect(link.searchParams.get('code_challenge_method')).toBe('S256');
    expect(link.searchParams.get('scope')).toContain('calendar.events');
    const page2 = await browserReturns(link);
    const returned = Date.now();
    expect(page2.body).toContain(t('app.signin_page.connected'));
    await expect(card).toContainText(t('cards.connect.line.connected', { account: 'v***@example.com' }), { timeout: 3_000 });
    expect(Date.now() - returned).toBeLessThan(3_000);
    await expect(card).toHaveAttribute('data-state', 'connected');
    expect(server.fake.paths()).toEqual(['/token']);

    await openConnections(app, page);
    await expect(page.getByTestId(TID.settingsRowConnectionsGmail)).toHaveAttribute('data-state', 'connected');
    await expect(page.getByTestId(TID.settingsRowConnectionsGmail)).toContainText(
      t('settings.connections.gmail.status_send', { account: 'v***@example.com' }),
    );
    await expect(page.getByTestId(TID.settingsRowConnectionsCalendar)).toHaveAttribute('data-state', 'on');
    await expect(page.getByTestId(TID.settingsRowConnectionsContacts)).toHaveAttribute('data-state', 'on');
    await expect(page.getByTestId(TID.settingsRowConnectionsX)).toContainText(t('settings.connections.x.status'));
  } finally {
    await app.close();
    await server.close();
  }
});

test('AT-093: Disconnect Google (C-10) → token revoked, no further Google requests, rows "Not connected", no Gmail in Using', async () => {
  const { server, env } = await googleEnv();
  const app = await launch(testDirs(), [], env);
  try {
    const page = await app.firstWindow();
    await openConnectWorld(app, page);
    await openChat(page, 'foo');
    const card = page.getByTestId(TID.cardConnect);
    await card.getByTestId(TID.cardConnectConnect).click();
    await expect(card).toHaveAttribute('data-state', 'waiting');
    await browserReturns(await lastOpened(app));
    await expect(card).toHaveAttribute('data-state', 'connected');

    await openConnections(app, page);
    const gmail = page.getByTestId(TID.settingsRowConnectionsGmail);
    await gmail.getByRole('button', { name: t('settings.connections.button.disconnect_google') }).click();
    const dialog = page.getByTestId(TID.dialogC10);
    await expect(dialog).toContainText(t('dialog.c_10.title'));
    await dialog.getByTestId(TID.dialogPrimary).click();
    await expect(gmail).toContainText(t('settings.connections.row.not_connected'));
    await expect(page.getByTestId(TID.settingsRowConnectionsCalendar)).toContainText(t('settings.connections.row.not_connected'));
    await expect(page.getByTestId(TID.settingsRowConnectionsContacts)).toContainText(t('settings.connections.row.not_connected'));
    await expect.poll(() => server.fake.revoked).toEqual(['fake-refresh-1']);
    const after = server.fake.requests.length;

    // nothing asks Google after Disconnect; the right shell's Using has no Gmail chip
    await openChat(page, 'foo');
    await page.waitForTimeout(500);
    expect(server.fake.requests.length).toBe(after);
    await expect(page.getByTestId(TID.appPanelUsing)).not.toContainText(t('settings.connections.app.gmail'));
  } finally {
    await app.close();
    await server.close();
  }
});
