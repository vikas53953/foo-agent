// Spec: 08-2 §8.4 sign-in lanes, 05-3 §5.10.2–§5.10.3 (the Sign-in card goes live, signs in by itself when the page moves on;
// the CAPTCHA card waits for Take over), 06-3 §11.2 Take over / Hand back ("Carrying on from here."), 09 §9.27.3 (the banner
// over Edge), 10-1 AT-056 / AT-057 / AT-058. foo-verify journey for M9 T7: in the real app a fake-AI job meets the T2 sign-in
// site, the person signs in on the page in foo's browser (the test stands in for them over CDP), and the job carries on;
// then a job meets the CAPTCHA site, the person taps Take over, solves it, and hands back from the banner. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m9-t7-lanes.journey.ts
import { chromium, type Browser, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import type { FakeLine } from '../e2e/fakeAi';
import { browserJob, done, signinCard, tool } from '../e2e/m9-lanes';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';
import { serveLaneSites } from '../integration/browser/laneSites';

const PASS = 'CANARY-pw-a90f2e';
const SIGN_ASK = 'Find my train bookings on RailPass';
const SIGN_RESULT = 'You have no train trips booked on RailPass yet.';
const DEAL_ASK = 'Look at the offers on the deals page';
const DEAL_RESULT = 'The deals page is open past the check. No offers are listed today.';

interface Turn {
  purpose: string;
  prompt?: string;
}

async function until(page: Page, cond: () => Promise<boolean>, what: string, v: Verify) {
  for (let i = 0; i < 400; i++) {
    if (await cond()) return;
    await page.evaluate(() => window.__fooTest!.clock.advance(500));
    await page.waitForTimeout(100);
  }
  const seen = (v.fakeTurns() as { purpose: string; matchedLine: number | null }[]).map((x) => `${x.purpose}:${x.matchedLine}`);
  throw new Error(`never: ${what} (fake AI turns ${seen.join()})`);
}

/** foo's own browser as the person sees it (FOO_TEST_BROWSER_DEBUG=1 runs only), and the page on `host`. */
async function person(app: ElectronApplication, host: string): Promise<{ cdp: Browser; site: Page }> {
  const dataDir = (await app.evaluate(() => process.env.FOO_DATA_DIR)) as string;
  const portFile = join(dataDir, 'browser', 'profile', 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 200));
  const cdp = await chromium.connectOverCDP(`http://127.0.0.1:${readFileSync(portFile, 'utf8').split('\n')[0]!.trim()}`);
  for (let i = 0; i < 100; i++) {
    const site = cdp
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => p.url().includes(host));
    if (site) return { cdp, site };
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no page on ${host} in foo's browser`);
}

async function start(v: Verify, script: FakeLine[]) {
  const { app, page } = await v.launch({
    fakeAi: script,
    env: { FOO_TEST_ALLOW_HOSTS: '127.0.0.1,localhost', FOO_TEST_BROWSER_DEBUG: '1' },
  });
  await openWorld(app, page);
  await openChat(page, 'Home');
  await setTheme(page, 'light');
  await rest(page);
  await settle(page);
  await page.getByTestId(TID.composerField).focus();
  return { app, page };
}

const said = (page: Page, text: string) =>
  page
    .getByTestId(TID.threadLog)
    .locator(`${byTid(TID.bubbleFoo)}, ${byTid(TID.bubbleHelper)}`, { hasText: text })
    .first();
const state = (page: Page) =>
  signinCard(page)
    .getAttribute('data-state')
    .catch(() => null);

async function both(v: Verify, page: Page, name: string, selector?: string) {
  await rest(page);
  await settle(page);
  await v.shot(name, selector);
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot(name, selector);
  await setTheme(page, 'light');
  await settle(page);
}

export default async function journey(v: Verify): Promise<void> {
  const sites = await serveLaneSites();
  sites.toggles.signin.password = PASS;
  try {
    // 1. Sign in here: the card goes live, the person signs in, foo sees the page move on and carries on.
    {
      const { app, page } = await start(v, [
        ...browserJob(SIGN_ASK, 'Train bookings'),
        tool('browser.open', { url: sites.signin() }),
        tool('job.needSignIn', { site: 'RailPass', kind: 'password' }),
        done(SIGN_RESULT),
      ]);
      await page.keyboard.type(SIGN_ASK);
      await page.keyboard.press('Enter');
      await until(page, async () => (await state(page)) === 'live', 'the Sign-in card goes live', v);
      const title = t('cards.signin.title.sign_in', { site: '127.0.0.1' });
      if (!((await signinCard(page).textContent()) ?? '').includes(title)) throw new Error('the live card has the wrong title');
      v.note(`the job paused on the sign-in page: the Sign-in card is live and reads "${title}"`);
      await both(v, page, 'signin-live');
      const stepsAtPause = (v.fakeTurns() as Turn[]).filter((x) => x.purpose === 'step').length;

      const { cdp, site } = await person(app, '127.0.0.1');
      await site.locator('input[name=username]').fill('sandbox-user');
      await site.locator('input[name=password]').fill(PASS);
      await site.locator('button[type=submit]').click();
      await site.waitForURL(/\/otp$/);
      await site.locator('input[name=otp]').fill('123456');
      await site.locator('button[type=submit]').click();
      await site.waitForURL(/\/account$/);
      v.note('the person typed the password and the code on the page in foo’s browser; foo typed nothing');
      await until(page, async () => (await state(page)) === 'signed_in', 'the card reads signed in', v);
      v.note(`AT-057: the page moved on and the card ended "${((await signinCard(page).textContent()) ?? '').trim()}" with no tap`);
      await until(page, () => said(page, SIGN_RESULT).isVisible(), 'the job carries on to its result', v);
      const turns = v.fakeTurns() as Turn[];
      const resumed = turns.filter((x) => x.purpose === 'step').slice(stepsAtPause);
      if (resumed.length !== 1 || !(resumed[0]!.prompt ?? '').includes('- Sign-in on 127.0.0.1 → done'))
        throw new Error(`the AI was asked during the sign-in, or not told it was done: ${resumed.length} step turns`);
      v.note('no AI step ran while the sign-in was in front; the next step prompt says "- Sign-in on 127.0.0.1 → done"');
      if (turns.some((x) => JSON.stringify(x).includes(PASS) || JSON.stringify(x).includes('123456')))
        throw new Error('the password or the code reached the AI');
      v.note(`AT-056: the password and the code are in none of the ${turns.length} recorded AI turns`);
      await both(v, page, 'signin-done');
      await cdp.close().catch(() => undefined);
      await app.close();
    }

    // 2. CAPTCHA: the card waits; Take over brings the banner; the person solves it; Hand back carries on.
    {
      const { app, page } = await start(v, [
        ...browserJob(DEAL_ASK, 'Deals page'),
        tool('browser.open', { url: sites.captcha() }),
        tool('browser.snapshot', {}),
        done(DEAL_RESULT),
      ]);
      await page.keyboard.type(DEAL_ASK);
      await page.keyboard.press('Enter');
      await until(page, async () => (await state(page)) === 'waiting', 'the CAPTCHA card posts', v);
      v.note(`the challenge page posted the CAPTCHA card: "${t('cards.signin.title.captcha')}"`);
      await both(v, page, 'captcha-waiting');
      await signinCard(page).getByTestId(TID.cardSigninTakeOver).click();
      await until(page, async () => (await state(page)) === 'live', 'Take over puts the card live', v);
      const stepsAtTakeOver = (v.fakeTurns() as Turn[]).filter((x) => x.purpose === 'step').length;
      const { cdp, site } = await person(app, 'localhost');
      for (const n of [1, 4, 8]) await site.locator(`input[name=tile][value="${n}"]`).check();
      await site.getByRole('button', { name: 'Verify' }).click();
      await site.getByRole('heading', { name: /Thanks, you.re through/ }).waitFor();
      for (let i = 0; i < 10; i++) await page.evaluate(() => window.__fooTest!.clock.advance(1_000));
      if ((v.fakeTurns() as Turn[]).filter((x) => x.purpose === 'step').length !== stepsAtTakeOver)
        throw new Error('foo took a step while the person was in control');
      if (sites.counts.attempts !== 1) throw new Error(`the puzzle was submitted ${sites.counts.attempts} times`);
      v.note('AT-058: after Take over the person solved the puzzle (1 submit, theirs); foo took no step and clicked nothing');

      let banner: Page | undefined;
      for (let i = 0; i < 100 && !banner; i++) {
        banner = app.windows().find((w) => w.url().includes('signin-banner'));
        if (!banner) await new Promise((r) => setTimeout(r, 200));
      }
      if (!banner) throw new Error('no take-over banner window');
      v.note(`the take-over banner window is open over foo's browser: ${banner.url().replace(/^.*\//, '')}`);
      await banner.getByTestId(TID.signinBannerHandBack).click();
      await until(page, async () => (await state(page)) === 'handed_back', 'the card ends handed back', v);
      await until(page, () => said(page, t('cards.signin.hand_back_line')).isVisible(), 'foo says it is carrying on', v);
      await until(page, () => said(page, DEAL_RESULT).isVisible(), 'the job carries on to its result', v);
      v.note(`Hand back from the banner: the card ended handed_back, foo said "${t('cards.signin.hand_back_line')}" and the job finished`);
      await both(v, page, 'captcha-handed-back');
      await cdp.close().catch(() => undefined);
      await app.close();
    }
  } finally {
    await sites.close();
  }
}
