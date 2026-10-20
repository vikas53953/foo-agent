// Spec: 06-2 §6.8 (Connections → WhatsApp: Link WhatsApp → `dialog-link-whatsapp` with the 05-3 §5.11.1 QR panel; linked
// row "Linked · {+91 98••• ••210}", toggles, "Groups I read", risk note; Unlink → 06-3 C-11), 08-3 §16.4.3 (every group a
// muted wa_mirror chat; group messages flow into the mirror thread), 04 §10.11 (the mirror thread). foo-verify journey for
// M8 T3 on the ux-world seed with the FOO_TEST fake phone (scan and an incoming group message are the phone's actions, played
// through window.__fooTest.wa; everything foo does is the real app). Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m8-t3-whatsapp.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { FAKE_WA } from '../../src/wa-bridge/fakeSocket';
import { VERIFY_OK } from '../e2e/fakeAi';
import { byTid, openChat, openWorld, rest, setTheme, settle, windowSize } from '../fidelity/capture';

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: [VERIFY_OK] });
  await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  await setTheme(page, 'light');
  const group = FAKE_WA.groups[0];
  const row = page.getByTestId(TID.settingsRowConnectionsWhatsapp);
  const listRow = () =>
    page.getByTestId(TID.chatlistRow).filter({ has: page.getByTestId(TID.chatlistRowName).getByText(group.name, { exact: true }) });

  // Settings → Connections: Not linked
  await page.keyboard.press('Control+,');
  await page.getByTestId(TID.settingsNavConnections).click();
  await row.waitFor();
  if ((await row.getAttribute('data-state')) !== 'not_linked') throw new Error('WhatsApp row is not "Not linked" at start');
  v.note(`Connections → WhatsApp row: "${(await row.innerText()).replace(/\n/g, ' · ')}"`);
  await settle(page);
  await v.shot('connections-not-linked');

  // Link WhatsApp → the dialog with a code
  await row.getByRole('button', { name: t('settings.connections.whatsapp.link') }).click();
  const dialog = page.getByTestId(TID.dialogLinkWhatsapp);
  await dialog.getByTestId(TID.cardConnectQr).waitFor({ timeout: 15_000 });
  const alt = await dialog.getByTestId(TID.cardConnectQr).getAttribute('alt');
  if (alt !== t('cards.connect.qr.alt')) throw new Error(`QR alt is "${alt}"`);
  const size = await dialog.getByTestId(TID.cardConnectQr).evaluate((el) => `${el.clientWidth}×${el.clientHeight}`);
  if (size !== '200×200') throw new Error(`QR is ${size}, not 200×200`);
  v.note(`"${t('dialog.link_whatsapp.title')}" dialog shows a ${size} QR with the 3 steps and the risk note`);
  await rest(page);
  await settle(page);
  await v.shot('link-dialog-qr', byTid(TID.dialogLinkWhatsapp));
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('link-dialog-qr', byTid(TID.dialogLinkWhatsapp));
  await setTheme(page, 'light');

  // the phone scans → linked, and the dialog closes itself
  const scanned = await page.evaluate(() => window.__fooTest!.wa({ op: 'scan' }));
  if (!scanned.delivered) throw new Error('the fake phone did not get the scan');
  await dialog.and(page.locator('[data-phase="linked"]')).waitFor({ timeout: 10_000 });
  v.note(`after the scan the dialog says "${await dialog.getByRole('status').innerText()}"`);
  await settle(page);
  await v.shot('link-dialog-linked', byTid(TID.dialogLinkWhatsapp));
  await dialog.waitFor({ state: 'hidden', timeout: 5_000 });
  await row.and(page.locator('[data-state="linked"]')).waitFor();
  const groups = await page.getByTestId(TID.settingsRowConnectionsWHidden).count();
  if (groups !== FAKE_WA.groups.length) throw new Error(`Groups I read lists ${groups} groups`);
  v.note(`dialog closed by itself; row "${(await row.innerText()).replace(/\n/g, ' · ')}"; Groups I read lists ${groups} groups`);
  await settle(page);
  await v.shot('connections-linked');
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('connections-linked');
  await setTheme(page, 'light');

  // the group is a muted mirror chat; a message from the phone lands in its thread
  await page.keyboard.press('Escape');
  await listRow().waitFor();
  if ((await listRow().getAttribute('data-chat-kind')) !== 'wa_mirror') throw new Error('the group is not a wa_mirror chat');
  const now = (await page.evaluate(() => window.__fooTest!.clock.now())).now;
  const text = 'Water tank cleaning on Sunday 10 AM';
  const msg = await page.evaluate(
    ([jid, at, body]) =>
      window.__fooTest!.wa({
        op: 'message',
        chatJid: jid,
        keyId: 'verify-1',
        sender: '919800000001@s.whatsapp.net',
        pushName: 'Asha',
        text: body,
        at,
      }),
    [group.jid, now, text] as const,
  );
  if (!msg.delivered) throw new Error('the fake phone did not send the group message');
  await openChat(page, group.name);
  const bubble = page.getByTestId(TID.bubbleWa).filter({ hasText: text });
  await bubble.waitFor({ timeout: 10_000 });
  v.note(
    `"${group.name}" is a muted wa_mirror chat; the phone's message shows in its thread: "${(await bubble.innerText()).replace(/\n/g, ' · ')}"`,
  );
  await settle(page);
  await v.shot('mirror-thread');

  // Unlink → C-11 → the mirrors leave the list
  await page.keyboard.press('Control+,');
  await page.getByTestId(TID.settingsNavConnections).click();
  await row.getByRole('button', { name: t('settings.connections.whatsapp.unlink') }).click();
  const c11 = page.getByTestId(TID.dialogC11);
  await c11.waitFor();
  v.note(`Unlink → C-11 "${await c11.getByRole('heading').textContent()}"`);
  await settle(page);
  await v.shot('unlink-c11', byTid(TID.dialogC11));
  await c11.getByTestId(TID.dialogPrimary).click();
  await row.and(page.locator('[data-state="not_linked"]')).waitFor();
  await page.keyboard.press('Escape');
  await listRow().waitFor({ state: 'detached' });
  v.note(`after Unlink the row reads "${t('settings.connections.whatsapp.not_linked')}" and "${group.name}" is gone from the chat list`);
  await settle(page);
  await v.shot('after-unlink');
}
