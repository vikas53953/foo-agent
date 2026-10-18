// Spec: 05-3 §5.10 (Sign-in card lanes, buttons, LIVE, summary), §5.10.3 (the docked banner: waiting, in_control,
// signed_in, 2 s success then close), §5.18.1 (handoff marker links), 08-1 §3.2 (I'm done = one `signin.done` engine
// message, X-124). foo-verify journey for M9 T6, on the `m9-signin` seed with the fake AI (so the engine runs). The banner
// is opened the way the sign-in lanes (T7) will open it, through main's `signinBanners()`, with a fixed Edge rectangle (no
// Edge in the container). Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m9-t6-signin.journey.ts
import type { ElectronApplication, Page } from '@playwright/test';
import { dirname, join, resolve } from 'node:path';
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import type { SeedReply } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { byTid, openChat, rest, setTheme, settle, windowSize } from '../fidelity/capture';

async function openSigninWorld(app: ElectronApplication, page: Page): Promise<Record<string, string>> {
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const reply = (await page.evaluate(async () => {
    const t = window.__fooTest!;
    await t.clock.set('2026-10-16T09:41:00+05:30');
    return t.seed('m9-signin');
  })) as SeedReply;
  await page.reload();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await windowSize(app, page, 1280, 800);
  return reply.refs ?? {};
}

/** Main's stdout lines (the sign-in tech-log lines, 05-3 §5.10.4). */
function stdoutLines(app: ElectronApplication): string[] {
  const lines: string[] = [];
  app.process().stdout?.on('data', (b: Buffer) => lines.push(...b.toString().split('\n').filter(Boolean)));
  return lines;
}

const EDGE = { x: 80, y: 60, width: 1100, height: 700, chromeTop: 84, minimised: false };

/** Opens / drives a banner through main's SigninBanners (what T7's sign-in lanes call). */
async function banner(app: ElectronApplication, op: 'open' | 'signedIn', a: { jobId: string; mode?: string; url?: string }) {
  await app.evaluate(
    (_e, [o, arg, edge, file]) => {
      const m = (process as unknown as { mainModule: NodeJS.Module }).mainModule.require(file) as {
        signinBanners(): {
          open(x: unknown): void;
          signedIn(j: string): void;
        } | null;
      };
      const b = m.signinBanners()!;
      // No arrow here: tsx's keepNames would wrap it in a __name() call main does not have.
      if (o === 'open') b.open({ jobId: arg.jobId, mode: arg.mode, url: arg.url, readBounds: Promise.resolve.bind(Promise, edge) });
      else b.signedIn(arg.jobId);
    },
    [op, a, EDGE, resolve('out/main/main/jobs/signinIpc.js')] as const,
  );
}

async function bannerPage(app: ElectronApplication): Promise<Page> {
  for (let i = 0; i < 50; i++) {
    const p = app.windows().find((w) => w.url().includes('signin-banner.html'));
    if (p) return p;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the sign-in banner window did not open');
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: [] });
  const out = stdoutLines(app);
  const refs = await openSigninWorld(app, page);
  await setTheme(page, 'light');

  // Lane sign_in, waiting: title, domain, [ I'm done ] [ Take over ] Skip, no LIVE, no Watch.
  await openChat(page, 'Trips');
  const signin = page.locator(`${byTid(TID.cardSignin)}[data-state="waiting"]`);
  await signin.waitFor();
  const title = t('cards.signin.title.sign_in', { site: 'irctc.co.in' });
  if (!(await signin.textContent())?.includes(title)) throw new Error(`sign-in card title should read "${title}"`);
  const buttons = await signin.getByRole('button').allTextContents();
  const want = ['I’m done', 'Take over', 'Skip'];
  if (want.some((b) => !buttons.includes(b)) || buttons.some((b) => /watch/i.test(b)))
    throw new Error(`sign-in buttons ${JSON.stringify(buttons)}`);
  if (await signin.getByTestId(TID.cardSigninLive).count()) throw new Error('LIVE shown while Edge is not in front');
  v.note(`sign_in lane (waiting): "${title}", buttons ${want.join(' · ')}, no LIVE, no Watch`);

  // Lane captcha (take_over), live: [ Take over ] Skip and the LIVE pill.
  const captcha = page.locator(`${byTid(TID.cardSignin)}[data-state="live"]`);
  const cButtons = await captcha.getByRole('button').allTextContents();
  if (cButtons.join() !== ['Take over', 'Skip'].join()) throw new Error(`captcha buttons ${JSON.stringify(cButtons)}`);
  await captcha.getByTestId(TID.cardSigninLive).waitFor();
  v.note('captcha lane (live): buttons Take over · Skip, "● LIVE" pill shown');
  await rest(page);
  await settle(page);
  await v.shot('trips-signin-cards');
  await v.shot('signin-card', `${byTid(TID.cardSignin)}[data-state="waiting"]`);
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('signin-card', `${byTid(TID.cardSignin)}[data-state="waiting"]`);
  await setTheme(page, 'light');

  // I'm done → exactly one signin.done engine message (X-124).
  await signin.getByTestId(TID.cardSigninDone).click();
  for (let i = 0; i < 30 && !out.some((l) => l.includes('signin: signin.done')); i++) await new Promise((r) => setTimeout(r, 100));
  const sent = out.filter((l) => l.startsWith('signin: '));
  if (sent.join('|') !== `signin: signin.done ${refs.signinJob}`) throw new Error(`engine messages: ${JSON.stringify(sent)}`);
  v.note(`clicked "I’m done" → main sent exactly one engine message: ${sent[0]}`);

  // Take over on the captcha lane → one job.takeOver.
  await captcha.getByTestId(TID.cardSigninTakeOver).click();
  for (let i = 0; i < 30 && !out.some((l) => l.includes('job.takeOver')); i++) await new Promise((r) => setTimeout(r, 100));
  const all = out.filter((l) => l.startsWith('signin: '));
  if (all.length !== 2 || all[1] !== `signin: job.takeOver ${refs.captchaJob}`) throw new Error(`engine messages: ${JSON.stringify(all)}`);
  v.note(`clicked "Take over" → one more engine message: ${all[1]}`);

  // Money: the signed-in summary row.
  await openChat(page, 'Money');
  const done = page.locator(`${byTid(TID.cardSignin)}[data-state="signed_in"]`);
  await done.waitFor();
  v.note(`signed_in summary: "${(await done.textContent())?.trim()}"`);
  await rest(page);
  await v.shot('signin-summary', `${byTid(TID.cardSignin)}[data-state="signed_in"]`);

  // foo's chat: handoff markers, helper names as links (helper → helper has two, data-index 0 and 1).
  await openChat(page, 'foo');
  const markers = page.locator(`${byTid(TID.threadMarker)}[data-state="handoff"]`);
  await markers.nth(1).waitFor();
  const two = markers.nth(1).getByTestId(TID.threadMarkerLink);
  const names = await two.allTextContents();
  const idx = await two.evaluateAll((els) => els.map((e) => e.getAttribute('data-index')));
  if (names.join() !== 'Trips,Money' || idx.join() !== '0,1') throw new Error(`marker links ${names} ${idx}`);
  v.note('handoff markers: "foo asked Trips…" (1 link), "Trips told Money…" (links Trips [0], Money [1])');
  await rest(page);
  await settle(page);
  await v.shot('foo-handoff-markers');
  await two.nth(1).click();
  await page.waitForFunction(([head]) => document.querySelector(`[data-testid="${head}"]`)?.textContent?.includes('Money') ?? false, [
    TID.chatHeaderName,
  ] as const);
  v.note('clicking "Money" in the marker opened Money’s chat');

  // The docked banner: sign in (waiting), then signed_in for 2 s, then it closes.
  const dir = dirname(await v.shot('before-banner'));
  await banner(app, 'open', { jobId: refs.signinJob!, mode: 'sign_in_here', url: 'https://www.irctc.co.in/nget/signin?ref=x' });
  const b = await bannerPage(app);
  await b.getByTestId(TID.signinBanner).waitFor();
  const st = await b.getByTestId(TID.signinBanner).getAttribute('data-state');
  const size = await b.evaluate(() => [window.innerWidth, window.innerHeight]);
  const addr = (await b.getByTestId(TID.signinBannerAddress).textContent())?.trim();
  if (st !== 'waiting' || size[0] !== EDGE.width || size[1] !== 72) throw new Error(`banner ${st} ${size}`);
  if (addr !== 'www.irctc.co.in/nget/signin') throw new Error(`address row "${addr}"`);
  v.note(`banner opened in "waiting", ${size[0]}×${size[1]} (Edge's width × 72), address row "${addr}" (no query)`);
  await b.screenshot({ path: join(dir, 'banner-waiting.light.png') });

  await b.getByTestId(TID.signinBannerDone).click();
  for (let i = 0; i < 30 && out.filter((l) => l.startsWith('signin: ')).length < 3; i++) await new Promise((r) => setTimeout(r, 100));
  v.note(`banner "I’m done" → ${out.filter((l) => l.startsWith('signin: ')).at(-1)}`);

  await banner(app, 'signedIn', { jobId: refs.signinJob! });
  await b.getByTestId(TID.signinBannerSuccess).waitFor();
  await b.screenshot({ path: join(dir, 'banner-signed-in.light.png') });
  const t0 = Date.now();
  await b.waitForEvent('close', { timeout: 5_000 });
  v.note(`success banner shown, window closed after ${Date.now() - t0} ms (spec: 2 s)`);

  await banner(app, 'open', { jobId: refs.captchaJob!, mode: 'take_over', url: 'https://example.test/check' });
  const c = await bannerPage(app);
  await c.getByTestId(TID.signinBannerHandBack).waitFor();
  if ((await c.getByTestId(TID.signinBanner).getAttribute('data-state')) !== 'in_control') throw new Error('take-over banner state');
  v.note(`take-over banner: "in_control", button "${(await c.getByTestId(TID.signinBannerHandBack).textContent())?.trim()}"`);
  await c.screenshot({ path: join(dir, 'banner-in-control.light.png') });
}
