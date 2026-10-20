// Spec: 10-acceptance AT-142 (asked to pay on a netbanking site → foo does not open it in its own window; the card says "This
// is your bank's site. I'll open it for you, and you do this part." and [ Open {site} ] opens the user's default browser),
// 08-2 §8.3.10 (hand-back sites are never driven), 08-1 §3.2 (`app:openExternal { target: 'handback_site' }` with the card's id
// and nonce), 05-3 §5.20 (the error card). M9 T8: the real app on the fake AI; the bank is the sandbox name
// `netbanking.sandbank.test` under the reserved `.test` domain, caught by the production matcher. FOO_TEST runs never open a
// browser: the address foo would have opened is kept in `__fooOpenedExternal` (08-3 §22.3).
import { expect, test } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { byTid, openChat, openWorld } from '../fidelity/capture';
import { launchWithFakeAi, type FakeLine } from './fakeAi';

const BANK = 'https://netbanking.sandbank.test/pay?amount=500';
const ASK = 'pay my electricity bill on my bank site';

const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;

const SCRIPT: FakeLine[] = [
  { match: { purpose: 'verify' }, reply: 'ready', once: false },
  {
    match: { purpose: 'intake', promptIncludes: ASK },
    reply: act({
      kind: 'job',
      title: 'Pay the bill',
      plan: [{ phraseKey: 'check_site', slots: { site: 'netbanking.sandbank.test' }, route: 'browser' }],
      estimate: { minutes: 1 },
      routeHint: ['browser'],
      needsApps: [],
    }),
  },
  { match: { purpose: 'step' }, reply: act({ kind: 'tool', call: { tool: 'browser.open', args: { url: BANK } }, why: 'next' }) },
];

test('AT-142 a netbanking site is handed back: the card’s words, and Open site opens the user’s browser, not foo’s', async () => {
  test.setTimeout(120_000);
  const { app } = await launchWithFakeAi(SCRIPT);
  try {
    const page = await app.firstWindow();
    await openWorld(app, page, '2026-10-16T11:01:00+05:30');
    await openChat(page, 'Home');
    await page.getByTestId(TID.composerField).focus();
    await page.keyboard.type(ASK);
    await page.keyboard.press('Enter');

    const log = page.getByTestId(TID.threadLog);
    const card = log.locator(byTid(TID.cardError)).last();
    for (let i = 0; i < 80 && !(await card.count()); i++) {
      await page.evaluate(() => window.__fooTest!.clock.advance(500));
      await page.waitForTimeout(50);
    }
    await expect(card).toContainText(t('errors.site_handback.body'));
    const open = card.getByTestId(TID.cardErrorFix);
    await expect(open).toHaveText(t('errors.site_handback.button', { site: 'netbanking.sandbank.test' }));

    const opened = () => app.evaluate(() => (globalThis as { __fooOpenedExternal?: string[] }).__fooOpenedExternal ?? []);
    expect(await opened()).toEqual([]);
    await open.click();
    await expect.poll(opened).toEqual([BANK]);
    // foo's own browser never opened a window on the bank.
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally {
    await app.close();
  }
});
