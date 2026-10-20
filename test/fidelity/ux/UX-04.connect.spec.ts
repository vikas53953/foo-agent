// Spec: 11-fidelity §11.2.3 (one spec per chapter, one test.step per walkthrough step named with its id; the s and f facts by
// hand, then the Tier R capture), CR-0012 G-PREP-03 (the early M8 steps UX-04-04…09 run before their owner M12 completes the
// chapter), 05-3 §5.11 Connect card (`google` variant: title, lines, [ Connect ] [ Not now ], Waiting…, "✓ Connected as
// {account}"; `whatsapp` variant: [ Show QR code ], the §5.11.1 QR panel, "✓ WhatsApp linked ({account})"), 06-2 §6.8
// (WhatsApp groups become muted mirror rows with the WhatsApp mark), 08-3 §16.1 (Google sign-in in the normal browser, PKCE,
// loopback return), 03-shell-2 §3.7.3.2 (Details → Using).
// Two fake worlds, one per connector, as the M8 e2e specs run them: the Google steps on the ux-world-m8-connect seed with the
// fake Google token endpoint and no engine (test/e2e/m8-connectors.spec.ts), the WhatsApp steps on the ux-world with the fake
// AI's engine (it owns the link) and the FOO_TEST fake phone (test/e2e/m8-whatsapp.spec.ts). No real account anywhere.
// Drawing-vs-app gaps (R1/R2 disputes go to the lead's CR-0012 close-out, never into code):
// - the walkthrough draws chapter 4 as the Thu 15 Oct first-run interview ("4 of 8", "5 of 8", the interview answers above);
//   the interview is M12's, so the cards are drawn at the end of foo's chat in the Fri 16 Oct ux-world;
// - UX-04-04: 05-3 §5.11.2 gives the `google` variant a third line ("See your contacts, so I message the right person (I never
//   change them).", G-M8 contacts pick); the drawing has two; the drawn "✉" title glyph is the card's 32 logo;
// - UX-04-05: Google's own consent page is UNVERIFIABLE (scripts/golden-manifest.ts, CR-0012: it is Google's, not foo's; the
//   manifest row still has the drawn browser hl, so Tier R R4 will not match); the picture is what foo shows meanwhile, the
//   card's `waiting` state, and the step checks the scopes the sign-in link asks for;
// - UX-04-06: the drawn "v••••@gmail.com" is the fake account masked by 05-3 §5.11 / 08-2 §11.4 ("v***@example.com"); the
//   drawn Using chips "Gmail, Calendar" are not shown, because 03-shell-2 §3.7.3.2 lists apps a job used in the last 24 h,
//   and connecting is not a use, so the section keeps the world's Browser chip and no Gmail one; the picture keeps the
//   drawn hl (Using);
// - UX-04-04, UX-04-07: the walkthrough types straight apostrophes ("I'll"), the copy file the typographic one (R1 words);
// - UX-04-08: the QR is a fresh pairing code each run, so its pixels vary between runs;
// - UX-04-07: the drawn risk note sits under the offered card; 05-3 §5.11.1 puts it in the QR panel (UX-04-08);
// - UX-04-09: the fake phone's groups are the ux-world mirrors ("Building society", "School friends"), not the drawn
//   "Family group" (the ux-world's "Family group" is a foo group chat, 08-3 §22.9); its row shows the seeded preview, not
//   "Mom: Sunday lunch at 1? 🙂".
import { expect, test, type Page } from '@playwright/test';
import { t } from '../../../src/shared/copy/t';
import { TID } from '../../../src/shared/testids';
import { FAKE_WA } from '../../../src/wa-bridge/fakeSocket';
import { launchWithFakeAi, VERIFY_OK } from '../../e2e/fakeAi';
import { launch, testDirs } from '../../e2e/launch';
import { listRow } from '../../e2e/m4-start';
import { browserReturns, googleEnv, lastOpened, openConnectWorld } from '../../e2e/m8-google';
import { byTid, captureUx, openChat, openWorld, quoted, rest, setTheme, settle, step, THEMES, windowSize } from '../capture';

const MIRROR = FAKE_WA.groups[0]!;
/** The walkthrough types straight apostrophes; the copy file has the typographic one. */
const curly = (s: string) => s.replace(/'/g, '’');

async function shoot(page: Page, id: string, sel: string): Promise<void> {
  await page.getByTestId(TID.threadLog).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await rest(page);
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await settle(page);
    await captureUx(page, id, sel, theme);
  }
  await setTheme(page, 'light');
}

test('UX-04 · Connections: steps UX-04-04, UX-04-05, UX-04-06, UX-04-07, UX-04-08 and UX-04-09, light and dark', async () => {
  test.setTimeout(300_000);
  const { server, env } = await googleEnv();
  const google = await launch(testDirs(), [], env);
  try {
    const page = await google.firstWindow();
    await openConnectWorld(google, page);
    await windowSize(google, page, 1280, 800);
    await openChat(page, 'foo');
    await page.getByTestId(TID.appPanel).waitFor();
    const sel = byTid(TID.cardConnect);
    const card = page.locator(sel);

    await test.step('UX-04-04 · the Gmail and Calendar Connect card says what foo will and won’t do', async () => {
      const s = step('UX-04-04');
      await card.scrollIntoViewIfNeeded();
      await expect(card).toHaveAttribute('data-state', 'offered');
      const [words] = quoted(s.s);
      expect(curly(words!)).toBe(
        `${t('cards.connect.google.title')}. ${t('cards.connect.google.line_read')} ${t('cards.connect.google.line_drafts')}`,
      );
      await expect(card).toContainText(t('cards.connect.google.title'));
      await expect(card).toContainText(t('cards.connect.google.line_read'));
      await expect(card).toContainText(t('cards.connect.google.line_drafts'));
      await expect(card.getByTestId(TID.cardConnectConnect)).toHaveText(t('cards.connect.button.connect'));
      await expect(card.getByTestId(TID.cardConnectNotNow)).toHaveText(t('cards.connect.button.not_now'));
      // f: "Nothing yet." No sign-in link was opened and no Google request was made.
      expect(s.f).toContain('Nothing yet');
      expect(await google.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened)).toEqual([]);
      expect(server.fake.paths()).toEqual([]);
      await shoot(page, 'UX-04-04', `${sel} ${byTid(TID.cardConnectConnect)}`);
    });

    await test.step('UX-04-05 · Google’s own page opens in the browser; foo waits (the page itself is UNVERIFIABLE)', async () => {
      const s = step('UX-04-05');
      await card.getByTestId(TID.cardConnectConnect).click();
      await expect(card).toHaveAttribute('data-state', 'waiting');
      await expect(card).toContainText(t('cards.connect.line.waiting'));
      // s: read email · create drafts · send only after you approve in foo · see and add calendar events: the scopes asked.
      expect(s.s).toContain('Read email');
      const link = await lastOpened(google);
      expect(link.host).toBe('accounts.google.com');
      const scope = link.searchParams.get('scope') ?? '';
      for (const sc of ['gmail.readonly', 'gmail.compose', 'calendar.events']) expect(scope).toContain(sc);
      // f: "foo never sees your Google password": the sign-in is Google's page with a PKCE challenge, no password in foo.
      expect(s.f).toContain('never sees your Google password');
      expect(link.searchParams.get('code_challenge_method')).toBe('S256');
      await shoot(page, 'UX-04-05', sel);
    });

    await test.step('UX-04-06 · back in foo: "✓ Connected as" the masked account; Details shows Using', async () => {
      const s = step('UX-04-06');
      expect(quoted(s.s)[0]).toMatch(/^✓ Connected as /);
      await browserReturns(await lastOpened(google));
      await expect(card).toHaveAttribute('data-state', 'connected');
      await expect(card).toContainText(t('cards.connect.line.connected', { account: 'v***@example.com' }));
      // f: "Starts reading only what it needs": the token exchange is the only Google request so far.
      expect(server.fake.paths()).toEqual(['/token']);
      await expect(page.getByTestId(TID.appPanelUsing)).toContainText(t('app.panel.using.app.browser'));
      await expect(page.getByTestId(TID.appPanelUsing)).not.toContainText(t('settings.connections.app.gmail'));
      await shoot(page, 'UX-04-06', byTid(TID.appPanelUsing));
    });
  } finally {
    await google.close();
    await server.close();
  }

  // The fake AI's engine owns the WhatsApp link.
  const { app } = await launchWithFakeAi([VERIFY_OK]);
  try {
    const page = await app.firstWindow();
    await openWorld(app, page);
    await openChat(page, 'foo');
    const r = await page.evaluate(() =>
      window.__fooTest!.cardSeed({ type: 'connect', state: 'offered', payload: { variant: 'whatsapp', app: 'whatsapp' } }),
    );
    const sel = `${byTid(TID.cardConnect)}[data-card-id="${r.cardId}"]`;
    const card = page.locator(sel);

    await test.step('UX-04-07 · the WhatsApp card: read and draft, never sends without your tap', async () => {
      const s = step('UX-04-07');
      await card.scrollIntoViewIfNeeded();
      await expect(card).toHaveAttribute('data-state', 'offered');
      const [words] = quoted(s.s);
      expect(curly(words!)).toBe(
        `${t('cards.connect.whatsapp.title')}. ${t('cards.connect.whatsapp.line_read')} ${t('cards.connect.whatsapp.line_never_send')}`,
      );
      await expect(card).toContainText(t('cards.connect.whatsapp.title'));
      await expect(card).toContainText(t('cards.connect.whatsapp.line_read'));
      await expect(card).toContainText(t('cards.connect.whatsapp.line_never_send'));
      await expect(card.getByTestId(TID.cardConnectShowQr)).toHaveText(t('cards.connect.whatsapp.show_qr'));
      await expect(card.getByTestId(TID.cardConnectNotNow)).toHaveText(t('cards.connect.whatsapp.not_now'));
      // f: "Nothing until you tap Show QR code."
      expect(s.f).toContain('Show QR code');
      await expect(card.getByTestId(TID.cardConnectQr)).toHaveCount(0);
      await shoot(page, 'UX-04-07', `${sel} ${byTid(TID.cardConnectShowQr)}`);
    });

    await test.step('UX-04-08 · a QR code and three numbered lines', async () => {
      const s = step('UX-04-08');
      expect(s.s).toContain('three numbered lines');
      await card.getByTestId(TID.cardConnectShowQr).click();
      const qr = card.getByTestId(TID.cardConnectQr);
      await expect(qr).toBeVisible({ timeout: 15_000 });
      await expect(qr).toHaveAttribute('alt', t('cards.connect.qr.alt'));
      for (const k of ['step_1', 'step_2', 'step_3', 'risk'] as const) await expect(card).toContainText(t(`cards.connect.qr.${k}`));
      // f: "Waits for the phone to link."
      await expect(card).toHaveAttribute('data-state', 'waiting');
      await shoot(page, 'UX-04-08', `${sel} ${byTid(TID.cardConnectQr)}`);
    });

    await test.step('UX-04-09 · linked; the WhatsApp group shows in the chat list, muted, with the WhatsApp mark', async () => {
      const s = step('UX-04-09');
      await expect.poll(async () => (await page.evaluate(() => window.__fooTest!.wa({ op: 'scan' }))).delivered).toBe(true);
      await expect(card).toHaveAttribute('data-state', 'connected', { timeout: 10_000 });
      await expect(card).toContainText(quoted(s.s)[0]!);
      const row = listRow(page, MIRROR.name);
      await expect(row).toHaveAttribute('data-chat-kind', 'wa_mirror');
      await expect(row.getByTestId(TID.chatlistRowSource)).toHaveAttribute('data-state', 'whatsapp');
      // f: "It never posts in groups by itself": the mirror's composer only drafts (04 §10.11, AT-269 part 1).
      expect(s.f).toContain('never posts in groups');
      await shoot(page, 'UX-04-09', `${byTid(TID.chatlistRow)}[data-chat-id="${await row.getAttribute('data-chat-id')}"]`);
    });
  } finally {
    await app.close();
  }
});
