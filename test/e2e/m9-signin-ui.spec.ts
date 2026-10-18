// Spec: 05-3 §5.10.1–§5.10.2 (Sign-in card: lane titles and buttons, LIVE only in `live`, signed-in summary), 05-1 §0.5
// (offline line; Skip stays enabled), 05-3 §5.18.1 / §5.18.3 (handoff marker: helper names are `thread-marker-link` with
// `data-index`, opening that helper's chat), 08-1 §3.2 (signin:done without a running engine fails and sends nothing;
// a finished job is JOB_GONE). The `m9-signin` seed (M9 T6). The engine side is T7's: these runs start no engine.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import type { SeedReply } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { openChat, windowSize } from '../fidelity/capture';
import { launch } from './launch';

async function start(): Promise<{ app: ElectronApplication; page: Page; refs: Record<string, string> }> {
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const reply = (await page.evaluate(async () => {
    await window.__fooTest!.clock.set('2026-10-16T09:41:00+05:30');
    return window.__fooTest!.seed('m9-signin');
  })) as SeedReply;
  await page.reload();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await windowSize(app, page, 1280, 800);
  return { app, page, refs: reply.refs ?? {} };
}

const card = (page: Page, state: string) => page.locator(`[data-testid="${TID.cardSignin}"][data-state="${state}"]`);

test('sign-in card: sign_in and captcha lanes, exact words and buttons, LIVE only while live, no Watch', async () => {
  const { app, page } = await start();
  await openChat(page, 'Trips');
  const waiting = card(page, 'waiting');
  await expect(waiting).toContainText(t('cards.signin.title.sign_in', { site: 'irctc.co.in' }));
  await expect(waiting.getByTestId(TID.cardSigninDone)).toHaveText(t('cards.signin.button.done'));
  await expect(waiting.getByTestId(TID.cardSigninTakeOver)).toHaveText(t('cards.signin.button.take_over'));
  await expect(waiting.getByTestId(TID.cardSigninSkip)).toHaveText(t('cards.signin.button.skip'));
  await expect(waiting.getByTestId(TID.cardSigninLive)).toHaveCount(0);
  await expect(waiting).toHaveAttribute('aria-label', `Sign-in needed: ${t('cards.signin.title.sign_in', { site: 'irctc.co.in' })}`);

  const live = card(page, 'live');
  await expect(live).toContainText(t('cards.signin.title.captcha'));
  await expect(live.getByRole('button')).toHaveText([t('cards.signin.button.take_over'), t('cards.signin.button.skip')]);
  await expect(live.getByTestId(TID.cardSigninLive)).toHaveText(t('cards.signin.live.pill'));
  await expect(page.getByTestId(TID.cardSignin).getByText(/watch/i)).toHaveCount(0);

  await openChat(page, 'Money');
  await expect(card(page, 'signed_in')).toHaveText('✓ Signed in to biller.example.test · 9:02 AM');
  await app.close();
});

test('sign-in card offline: the offline line, I’m done and Take over disabled, Skip enabled', async () => {
  const { app, page } = await start();
  await openChat(page, 'Trips');
  await page.evaluate(() => window.__fooTest!.setOnline(false));
  await page.evaluate(() => window.__fooTest!.clock.advance(10_000)); // offline shows after 10 s (PERF-11)
  const waiting = card(page, 'waiting');
  await expect(waiting).toContainText(t('cards.common.offline_line'));
  await expect(waiting.getByTestId(TID.cardSigninDone)).toHaveAttribute('aria-disabled', 'true');
  await expect(waiting.getByTestId(TID.cardSigninTakeOver)).toHaveAttribute('aria-disabled', 'true');
  await expect(waiting.getByTestId(TID.cardSigninSkip)).not.toHaveAttribute('aria-disabled', 'true');
  await app.close();
});

test('sign-in IPC: no engine → nothing pretended; a finished job → JOB_GONE', async () => {
  const { app, page, refs } = await start();
  const call = (channel: 'signin:done' | 'job:takeOver', jobId: string) =>
    page.evaluate(([c, j]) => window.foo.invoke(c, { jobId: j }), [channel, jobId] as const);
  expect(await call('signin:done', refs.signinJob!)).toEqual({ ok: false, error: { kind: 'UNKNOWN', message: 'engine not running' } });
  expect(await call('job:takeOver', 'j_missing')).toEqual({ ok: false, error: { kind: 'JOB_GONE' } });
  await app.close();
});

test('handoff markers: foo → helper and helper → helper, names are links in reading order', async () => {
  const { app, page } = await start();
  await openChat(page, 'foo');
  const markers = page.locator(`[data-testid="${TID.threadMarker}"][data-state="handoff"]`);
  await expect(markers).toHaveCount(2);
  await expect(markers.nth(0)).toHaveText('foo asked Trips to find flights to Delhi on Fri 23 Oct');
  await expect(markers.nth(0).getByTestId(TID.threadMarkerLink)).toHaveText(['Trips']);
  const links = markers.nth(1).getByTestId(TID.threadMarkerLink);
  await expect(links).toHaveText(['Trips', 'Money']);
  await expect(links.nth(1)).toHaveAttribute('data-index', '1');
  await links.nth(1).click();
  await expect(page.getByTestId(TID.chatHeaderName)).toContainText('Money');
  await app.close();
});
