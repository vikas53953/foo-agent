// Spec: 02 §F7.1 "Chat list" [X-179, CR-0021 picks 1–3], 10-2 AT-323. foo-verify journey for P1 T4: seed chats, make one
// unread, start a job, pin a chat, switch filters and search, at Full, Basic and Off, light and dark. Shots are taken with
// animations finished (end states); the motion itself is proven by the notes (which CSS animation ran, for how long, and
// which rows the FLIP and the stagger touched). Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/p1-04-chatlist.journey.ts
import type { Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import type { CardSeedRequest } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import type { JobState } from '../../src/shared/types';
import { byTid, openWorld, rest, setTheme, settle, windowSize } from '../fidelity/capture';

const DRAFT: CardSeedRequest = {
  type: 'draft',
  state: 'pending',
  payload: {
    approvalId: '',
    channel: 'email',
    to: { name: 'Asha Example', address: 'asha@example.com', isNew: false },
    subject: 'Gas cylinder',
    body: 'Hi Asha, the cylinder comes on Mon 19 Oct.',
    edited: false,
    sendAllowed: true,
    gmailDraftId: 'gd_p1_verify',
  },
};

const row = (page: Page, name: string) =>
  page.getByTestId(TID.chatlistRow).filter({ has: page.getByTestId(TID.chatlistRowName).getByText(name, { exact: true }) });

const anim = (el: Locator) =>
  el.evaluate((n) => {
    const cs = getComputedStyle(n);
    return `${cs.animationName.replace(/^.*?_/, '').replace(/_.*$/, '')} ${Math.round(parseFloat(cs.animationDuration) * 1000)}ms`;
  });

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch();
  const refs = await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  const jobState = (id: string, s: JobState) => page.evaluate(([j, st]) => window.__fooTest!.jobState(j, st), [id, s] as const);
  const level = (l: 'full' | 'basic' | 'off') =>
    page.evaluate((x) => {
      document.documentElement.dataset.motion = x;
    }, l);
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __flips: string[] }).__flips = seen;
    new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target as HTMLElement;
        const val = el.getAttribute(m.attributeName ?? '');
        const name = el.querySelector('[data-testid="chatlist-row-name"]')?.textContent ?? '';
        if (val !== null)
          seen.push(`${m.attributeName}=${val} ${name}${el.style.getPropertyValue('--i') ? ` i=${el.style.getPropertyValue('--i')}` : ''}`);
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-flip', 'data-arrive'] });
  });
  const flips = () => page.evaluate(() => (window as unknown as { __flips: string[] }).__flips.splice(0));
  const list = byTid(TID.sidebar);

  await setTheme(page, 'light');
  await rest(page);
  await settle(page);
  await v.shot('list-at-rest', list);
  const quiet = await page.locator('[data-pop], [data-pulse], [data-shimmer], [data-fade]').count();
  if (quiet !== 0) throw new Error(`${quiet} one-shot details fired on the first paint`);
  v.note('first paint: 0 one-shot details fire (badges, pills and working rows already there stay at rest)');

  for (const l of ['full', 'basic', 'off'] as const) {
    await level(l);
    const home = row(page, 'Home');
    await page.evaluate((req) => window.__fooTest!.cardSeed(req), { ...DRAFT, chatId: (await home.getAttribute('data-chat-id'))! });
    const badge = home.getByTestId(TID.chatlistRowUnread);
    await badge.and(page.locator('[data-pop]')).waitFor();
    await jobState(refs.moneyJob!, 'needs_you');
    const pill = row(page, 'Money').locator('[data-pulse]');
    await pill.waitFor();
    await jobState(refs.tripsJob!, 'queued');
    await jobState(refs.tripsJob!, 'working');
    const shimmer = row(page, 'Trips').locator('[data-shimmer]');
    await shimmer.waitFor();
    v.note(
      `${l}: message into Home → badge "${await anim(badge)}"; Money needs you → pill "${await anim(pill)}"; Trips starts → preview "${await anim(shimmer)}"`,
    );
    await jobState(refs.moneyJob!, 'working');
  }
  await level('full');
  await settle(page);
  await v.shot('after-unread-job', list);

  // pin News & X: it moves to the pinned group with the overshooting spring; the rows it passes glide
  await flips();
  await row(page, 'News & X').click({ button: 'right' });
  await page.getByTestId(TID.chatlistMenuPin).click();
  await row(page, 'News & X').getByTestId(TID.chatlistRowPin).waitFor();
  await page.waitForTimeout(100);
  v.note(`full, pin News & X → ${(await flips()).filter((f) => !f.startsWith('data-flip=from')).join('; ')}`);

  // filters: the highlight slides to the chip (Full only)
  await page.getByTestId(TID.chatlistFilterWorking).click();
  const hl = page.getByTestId(TID.chatlistFilters).locator('span[aria-hidden="true"]').first();
  const moving = await hl.evaluate((n) => getComputedStyle(n).transitionDuration);
  v.note(`full, Working chip → highlight slides (transition ${moving})`);
  await settle(page);
  await rest(page);
  await v.shot('filter-working', list);
  await page.getByTestId(TID.chatlistFilterAll).click();

  // search: the box widens 8px and results stagger 30ms
  const box = page.getByTestId(TID.sidebarSearchField);
  const w0 = (await box.boundingBox())!.width;
  await box.locator('input').focus();
  await page.waitForTimeout(600);
  const w1 = (await box.boundingBox())!.width;
  await flips();
  await box.locator('input').fill('o');
  await page.waitForTimeout(200);
  v.note(`full, search focus → box ${Math.round(w0)} → ${Math.round(w1)}px; "o" → ${(await flips()).join('; ')}`);
  await settle(page);
  await v.shot('search-o', list);

  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('search-o', list);
  await box.locator('input').fill('');
  await level('off');
  await flips();
  await box.locator('input').fill('o');
  await page.waitForTimeout(200);
  const offFlips = await flips();
  if (offFlips.length) throw new Error(`Off still ran: ${offFlips.join('; ')}`);
  v.note('off, search "o" → no stagger, no glide (nothing moves)');
  await box.locator('input').fill('');
  await rest(page);
  await settle(page);
  await v.shot('list-dark-off', list);

  // no results: foo's face scans in the icon slot (Full), light and dark
  await level('full');
  await box.locator('input').fill('zzqx');
  const pose = page.getByTestId(TID.chatlistEmpty).locator('[data-pose="scan"]');
  await pose.waitFor();
  v.note(
    `no results for "zzqx" → face pose "${await pose.getAttribute('data-pose')}", ${Math.round((await pose.boundingBox())!.width)}px, aria-hidden`,
  );
  await rest(page);
  await settle(page);
  await v.shot('no-results', list);
  await setTheme(page, 'light');
  await settle(page);
  await v.shot('no-results', list);
}
