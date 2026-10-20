// Spec: 10-acceptance-1 §B.10 AT-270 (a mirror with 250 stored WhatsApp messages from 3 senders plus the user renders the
// newest 200 under "I keep 7 days of WhatsApp messages.", the user's own on the right; the list row is muted with the WhatsApp
// mark) and AT-269 part 1 (the mirror composer says "Draft a message for {group}"; the send routing is M8 T7), on the ingest
// side: 06-2 §6.8 Settings → Connections → Link WhatsApp opens `dialog-link-whatsapp` with the 05-3 §5.11.1 QR panel, the
// FOO_TEST fake phone scans, the row reads "Linked · {+91 98••• ••210}", every group becomes a muted `wa_mirror` chat, group
// messages flow into the mirror thread (08-3 §16.4.3); Unlink → 06-3 C-11 removes the mirrors; C-8 "Hide from foo" and the
// "Groups I read" toggle (08-1 §3.2 chat:archive). Fake numbers only; no real WhatsApp, no send path.
import { expect, test, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { FAKE_WA } from '../../src/wa-bridge/fakeSocket';
import { openChat, openWorld, windowSize } from '../fidelity/capture';
import { launchWithFakeAi, VERIFY_OK } from './fakeAi';
import { listRow } from './m4-start';

const FAMILY = FAKE_WA.groups[0];
const SENDERS = ['919800000001@s.whatsapp.net', '919800000002@s.whatsapp.net', '919800000003@s.whatsapp.net'];

const wa = (page: Page, op: Parameters<NonNullable<Window['__fooTest']>['wa']>[0]) => page.evaluate((o) => window.__fooTest!.wa(o), op);

/** The ux-world at 1440 × 900 with an engine (a FOO_TEST run without the fake AI starts none, and the engine owns the link). */
async function startWorld() {
  const { app } = await launchWithFakeAi([VERIFY_OK]);
  const page = await app.firstWindow();
  await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  return { app, page };
}

async function openConnections(page: Page): Promise<void> {
  await page.keyboard.press('Control+,');
  await page.getByTestId(TID.settingsNavConnections).click();
  await expect(page.getByTestId(TID.settingsRowConnectionsWhatsapp)).toBeVisible();
}

/** Link WhatsApp → the QR panel → the fake phone scans → the row is linked and the dialog closes itself. */
async function link(page: Page, button: string): Promise<void> {
  const row = page.getByTestId(TID.settingsRowConnectionsWhatsapp);
  await row.getByRole('button', { name: button }).click();
  const dialog = page.getByTestId(TID.dialogLinkWhatsapp);
  await expect(dialog.getByTestId(TID.cardConnectQr)).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByTestId(TID.cardConnectQr)).toHaveAttribute('alt', t('cards.connect.qr.alt'));
  for (const k of ['step_1', 'step_2', 'step_3', 'risk'] as const) await expect(dialog).toContainText(t(`cards.connect.qr.${k}`));
  await expect.poll(async () => (await wa(page, { op: 'scan' })).delivered).toBe(true);
  await expect(dialog).toHaveAttribute('data-phase', 'linked', { timeout: 10_000 });
  await expect(dialog).toContainText('✓ WhatsApp linked (+91 98');
  await expect(dialog).toBeHidden({ timeout: 5_000 });
  await expect(row).toHaveAttribute('data-state', 'linked');
  await expect(row).toContainText('Linked · +91 98');
}

test('Link WhatsApp from Settings: QR, scan, linked row and risk note; groups become muted mirrors; Unlink (C-11) removes them', async () => {
  const { app, page } = await startWorld();
  await openConnections(page);
  const row = page.getByTestId(TID.settingsRowConnectionsWhatsapp);
  await expect(row).toHaveAttribute('data-state', 'not_linked');
  await expect(row).toContainText(t('settings.connections.whatsapp.not_linked'));
  await expect(page.getByTestId(TID.screenSettings)).toContainText(t('settings.connections.whatsapp.note'));

  await link(page, t('settings.connections.whatsapp.link'));
  for (const g of FAKE_WA.groups)
    await expect(page.getByTestId(TID.settingsRowConnectionsWHidden).and(page.locator(`[data-row-id="${g.jid}"]`))).toBeVisible();
  await expect(page.getByRole('switch', { name: t('settings.connections.whatsapp.read') })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: t('settings.connections.whatsapp.draft') })).toHaveAttribute('aria-checked', 'true');

  // Unlink → C-11 (destructive, Cancel focused) → the row reads Not linked and the mirrors leave the list
  await row.getByRole('button', { name: t('settings.connections.whatsapp.unlink') }).click();
  const c11 = page.getByTestId(TID.dialogC11);
  await expect(c11).toHaveAttribute('role', 'alertdialog');
  await expect(c11).toContainText(t('dialog.c_11.title'));
  await expect(c11).toContainText(t('dialog.c_11.body'));
  await expect(c11.getByTestId(TID.dialogSecondary)).toBeFocused();
  await c11.getByTestId(TID.dialogPrimary).click();
  await expect(row).toHaveAttribute('data-state', 'not_linked');
  await expect(page.getByTestId(TID.settingsRowConnectionsWHidden)).toHaveCount(0);
  await page.keyboard.press('Escape');
  for (const g of FAKE_WA.groups) await expect(listRow(page, g.name)).toHaveCount(0);

  // Linking again makes every group a mirror again, muted, with the WhatsApp mark
  await openConnections(page);
  await link(page, t('settings.connections.whatsapp.link'));
  await page.keyboard.press('Escape');
  for (const g of FAKE_WA.groups) {
    const r = listRow(page, g.name);
    await expect(r).toHaveAttribute('data-chat-kind', 'wa_mirror');
    await expect(r.getByTestId(TID.chatlistRowSource)).toHaveAttribute('data-state', 'whatsapp');
  }
  await app.close();
});

test('AT-270: 250 ingested messages from 3 senders plus the user: the mirror shows the newest 200 under the retention line', async () => {
  const { app, page } = await startWorld();
  await openConnections(page);
  await link(page, t('settings.connections.whatsapp.link'));
  await page.keyboard.press('Escape');

  const now = await page.evaluate(() => window.__fooTest!.clock.now());
  const delivered = await page.evaluate(
    async ([jid, senders, me, base]) => {
      let n = 0;
      for (let i = 0; i < 250; i++) {
        const sender = i % 4 === 3 ? me : senders[i % 3]!;
        const r = await window.__fooTest!.wa({
          op: 'message',
          chatJid: jid,
          keyId: `k${i}`,
          sender,
          text: `Message ${i}`,
          at: base - (250 - i) * 60_000,
        });
        if (r.delivered) n++;
      }
      return n;
    },
    [FAMILY.jid, SENDERS, FAKE_WA.me, now.now] as const,
  );
  expect(delivered).toBe(250);

  // the stored side: chat:open hands the mirror its newest 200 rows (04 §10.11), oldest first
  const chatId = await listRow(page, FAMILY.name).getAttribute('data-chat-id');
  await expect
    .poll(async () =>
      page.evaluate(async (id) => {
        const r = await window.foo.invoke('chat:open', { chatId: id! });
        return r.ok ? (r.value.waMessages ?? []).map((m) => m.text) : [];
      }, chatId),
    )
    .toHaveLength(200);
  const texts = await page.evaluate(async (id) => {
    const r = await window.foo.invoke('chat:open', { chatId: id! });
    return r.ok ? (r.value.waMessages ?? []).map((m) => m.text) : [];
  }, chatId);
  expect(texts).toContain('Message 249');
  expect(texts).not.toContain('Message 49');

  // the list row: muted, WhatsApp mark, "{sender}: {text}" preview, no pill
  const r = listRow(page, FAMILY.name);
  await expect(r).toHaveAttribute('data-chat-kind', 'wa_mirror');
  await expect(r.getByTestId(TID.chatlistRowSource)).toBeVisible();

  // the thread: retention line on top, the newest message at the bottom, the user's own on the right
  await openChat(page, FAMILY.name);
  await expect(page.getByTestId(TID.bubbleWa).filter({ hasText: 'Message 249' })).toBeVisible();
  await expect(page.getByTestId(TID.bubbleWa).filter({ hasText: 'Message 247' })).toHaveAttribute('data-from-me', 'true');
  await expect(page.getByTestId(TID.bubbleWa).filter({ hasText: 'Message 248' })).toHaveAttribute('data-from-me', 'false');
  // the top of the virtual log: the retention line; Message 49 (the 201st newest) is not there
  const log = page.getByTestId(TID.threadLog);
  await expect
    .poll(async () => {
      await log.evaluate((el) => (el.scrollTop = 0));
      return page.getByText(t('thread.wa_mirror.retention')).isVisible();
    })
    .toBe(true);
  await expect(page.getByTestId(TID.bubbleWa).getByText('Message 49', { exact: true })).toHaveCount(0);
  await app.close();
});

test('AT-269 (part 1): a mirrored group composer says "Draft a message for {group}"', async () => {
  const { app, page } = await startWorld();
  await openChat(page, FAMILY.name);
  await expect(page.getByTestId(TID.composerField)).toHaveAttribute(
    'aria-description',
    new RegExp(`^${t('composer.placeholder.wa_mirror', { group: FAMILY.name })}`),
  );
  await expect(page.getByTestId(TID.composer)).toContainText(t('composer.placeholder.wa_mirror', { group: FAMILY.name }));
  await app.close();
});

test('Hide from foo (C-8) archives the mirror; Groups I read shows it again', async () => {
  const { app, page } = await startWorld();
  await openConnections(page);
  await link(page, t('settings.connections.whatsapp.link'));
  await page.keyboard.press('Escape');

  await openChat(page, FAMILY.name);
  await page.getByTestId(TID.chatHeaderMore).click();
  await page.getByRole('menuitem', { name: t('chat_header.menu.hide_from_foo') }).click();
  const c8 = page.getByTestId(TID.dialogC08);
  await expect(c8).toContainText(t('dialog.c_08.title', { group: FAMILY.name }));
  await expect(c8).toContainText(t('dialog.c_08.body'));
  await expect(c8.getByTestId(TID.dialogSecondary)).toBeFocused();
  await c8.getByTestId(TID.dialogPrimary).click();
  await expect(listRow(page, FAMILY.name)).toHaveCount(0);

  await openConnections(page);
  const group = page.getByTestId(TID.settingsRowConnectionsWHidden).and(page.locator(`[data-row-id="${FAMILY.jid}"]`));
  const toggle = group.getByRole('switch', { name: FAMILY.name });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(listRow(page, FAMILY.name)).toHaveCount(1);
  await app.close();
});
