// AT-323 (10-acceptance-2 §C.8; 02 §F7.1 "Chat list", CR-0021 picks 1–3): each built chat-list detail animates at Full,
// fades at Basic and is still at Off. A detail "animates" when its CSS animation or transition runs with the spring tokens
// and `--motion-move` 1; "fades" when the same detail runs at `--m-basic` with `--motion-move` 0; "still" when nothing
// moves (`--motion-move` 0, every duration ≤ 83ms, the FLIP and stagger never start). One-shots fire on the state change.
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { CardSeedRequest } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { jobState, listRow, startWorld } from './m4-start';

type Level = 'full' | 'basic' | 'off';
const LEVELS: Level[] = ['full', 'basic', 'off'];
/** Spring 400ms at Full, the Basic fade 200ms, the Off table's 83ms (02 §F7, 02-3 §F25.4). */
const SPRING: Record<Level, number> = { full: 400, basic: 200, off: 83 };

/** A plain Draft card from foo: a new message in a chat that is not open, so its unread count grows. */
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
    gmailDraftId: 'gd_p1',
  },
};

const setLevel = (page: Page, level: Level) =>
  page.evaluate((l) => {
    document.documentElement.dataset.motion = l;
  }, level);

const move = (page: Page) => page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--motion-move')));

/** The element's running CSS animation: its (module-hashed) name and duration in ms. */
const animationOf = (el: Locator) =>
  el.evaluate((n) => {
    const cs = getComputedStyle(n);
    return { name: cs.animationName, ms: Math.round(parseFloat(cs.animationDuration) * 1000) };
  });

/**
 * Records every data-flip / data-arrive the list sets (the value at callback time, so a FLIP reads as its landing
 * "drop" or "glide"), with the row and its stagger index, and every FLIP start offset as `flip-y=<px>|<row>`.
 */
async function recordList(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __p1: string[] }).__p1 = seen;
    new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target as HTMLElement;
        if (m.attributeName === 'style') {
          const dy = /--flip-y:\s*(-?[\d.]+)px/.exec(m.oldValue ?? '')?.[1];
          if (dy) seen.push(`flip-y=${dy}|${el.dataset.chatId ?? ''}`);
          continue;
        }
        const v = el.getAttribute(m.attributeName ?? '');
        if (v !== null) seen.push(`${m.attributeName}=${v}|${el.dataset.chatId ?? ''}|${el.style.getPropertyValue('--i')}`);
      }
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['data-flip', 'data-arrive', 'style'],
    });
  });
}
const takeRecord = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __p1: string[] };
    return w.__p1.splice(0);
  });

test('AT-323: the badge, pill and shimmer fire once on their state change, by animation level', async () => {
  const { app, page, refs } = await startWorld();
  // The first paint fires nothing: rows that were already unread, needing you or working are at rest.
  await expect(page.locator('[data-pop], [data-pulse], [data-shimmer], [data-fade]')).toHaveCount(0);

  for (const level of LEVELS) {
    await setLevel(page, level);
    expect(await move(page)).toBe(level === 'full' ? 1 : 0);

    // A new message springs the unread badge in (scale 0.6 → 1 with `--ease-spring`).
    const home = listRow(page, 'Home');
    const chatId = (await home.getAttribute('data-chat-id'))!;
    await page.evaluate((req) => window.__fooTest!.cardSeed(req), { ...DRAFT, chatId });
    const badge = home.getByTestId(TID.chatlistRowUnread);
    await expect(badge).toHaveAttribute('data-pop', '');
    expect(await animationOf(badge)).toEqual({ name: expect.stringMatching(/pop/), ms: SPRING[level] });

    // Needs-you pill pulses once (≤ 4 %); back to working it rests.
    await jobState(page, refs.moneyJob!, 'needs_you');
    const pill = listRow(page, 'Money').locator('[data-pulse]');
    await expect(pill).toHaveCount(1);
    expect(await animationOf(pill)).toEqual({ name: expect.stringMatching(/pulse/), ms: SPRING[level] });
    await jobState(page, refs.moneyJob!, 'working');
    await expect(listRow(page, 'Money').locator('[data-pulse]')).toHaveCount(0);

    // A row turning to working shimmers its preview once (`--m-shimmer`, 0 at Basic and Off).
    await jobState(page, refs.tripsJob!, 'queued');
    await jobState(page, refs.tripsJob!, 'working');
    const shimmer = listRow(page, 'Trips').locator('[data-shimmer]');
    await expect(shimmer).toHaveCount(1);
    expect(await animationOf(shimmer)).toEqual({ name: expect.stringMatching(/shimmer-once/), ms: level === 'full' ? 1500 : 0 });
  }
  await app.close();
});

test('AT-323: muting fades the muted icon in, never pops it', async () => {
  const { app, page } = await startWorld();
  const chats: Record<Level, string> = { full: 'Trips', basic: 'Money', off: 'Home' };
  for (const level of LEVELS) {
    await setLevel(page, level);
    const row = listRow(page, chats[level]);
    await row.click({ button: 'right' });
    await page.getByTestId(TID.chatlistMenuMute).focus();
    await page.keyboard.press('ArrowRight');
    await page.getByTestId(TID.chatlistMenuMuteAlways).click();
    const icon = row.getByTestId(TID.chatlistRowMute);
    await expect(icon).toHaveAttribute('data-fade', '');
    expect(await animationOf(icon)).toEqual({
      name: expect.stringMatching(/fade/),
      ms: level === 'full' ? 250 : level === 'basic' ? 200 : 83,
    });
  }
  await app.close();
});

test('AT-323: a newly pinned chat moves up, dropping with the spring only when the overshoot stays within 2px', async () => {
  const { app, page } = await startWorld();
  await recordList(page);
  const chats: Record<Level, string> = { full: 'News & X', basic: 'Family group', off: 'Home' };
  for (const level of LEVELS) {
    await setLevel(page, level);
    const row = listRow(page, chats[level]);
    const id = (await row.getAttribute('data-chat-id'))!;
    await row.click({ button: 'right' });
    await page.getByTestId(TID.chatlistMenuPin).click();
    await expect(row.getByTestId(TID.chatlistRowPin)).toBeVisible();
    if (level === 'off') {
      await page.waitForTimeout(SPRING.full);
      expect(await takeRecord(page)).toEqual([]);
      continue;
    }
    let seen: string[] = [];
    await expect
      .poll(async () => {
        seen = seen.concat(await takeRecord(page));
        const started = seen.some((r) => r.startsWith('flip-y=') && r.endsWith(`|${id}`));
        const landed = seen.some((r) => /^data-flip=(drop|glide)\|/.test(r) && r.includes(id));
        return started && landed ? 'ok' : seen.join(' ; ');
      })
      .toBe('ok');
    // the pinned row starts at its old top; `--ease-spring` overshoots 2.6 % of that distance, so it drops only within
    // 76px (≤ 2px overshoot) and glides further; the rows it passes glide
    const start = Math.abs(parseFloat(seen.find((r) => r.startsWith('flip-y=') && r.endsWith(`|${id}`))!.slice(7)));
    const landed = seen.find((r) => /^data-flip=(drop|glide)\|/.test(r) && r.includes(id))!;
    expect(landed.startsWith(start <= 76 ? 'data-flip=drop' : 'data-flip=glide')).toBe(true);
    expect(seen.filter((r) => r.startsWith('data-flip=glide') && !r.includes(id)).length).toBeGreaterThan(0);
    expect(await move(page)).toBe(level === 'full' ? 1 : 0);
    await expect(row).not.toHaveAttribute('data-flip', /.*/, { timeout: 2000 });
  }
  await app.close();
});

test('AT-323: search widens 8px on focus and its results stagger 30ms; the filter highlight slides at Full only', async () => {
  const { app, page } = await startWorld();
  await recordList(page);
  const box = page.getByTestId(TID.sidebarSearchField);
  const input = box.locator('input');
  for (const level of LEVELS) {
    await setLevel(page, level);
    await page.getByTestId(TID.chatlistFilterAll).click();
    const rest = (await box.boundingBox())!.width;
    await input.focus();
    await expect.poll(async () => Math.round((await box.boundingBox())!.width - rest)).toBe(level === 'full' ? 8 : 0);

    await takeRecord(page);
    await input.fill('o');
    const results = await page.getByTestId(TID.chatlistRow).count();
    if (level === 'off') {
      await page.waitForTimeout(SPRING.full);
      expect((await takeRecord(page)).filter((r) => r.startsWith('data-arrive='))).toEqual([]);
    } else {
      // every result arrives, the n-th one 30ms × n later (index capped at 10)
      let arrive: string[] = [];
      await expect
        .poll(async () => {
          arrive = arrive.concat((await takeRecord(page)).filter((r) => r.startsWith('data-arrive=')));
          return arrive.length;
        })
        .toBe(results);
      const steps = arrive.map((r) => Number(r.split('|')[2])).sort((a, b) => a - b);
      expect(steps).toEqual(Array.from({ length: results }, (_, i) => Math.min(i, 10)));
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--m-stagger').trim())).toEqual(
        level === 'full' ? '30ms' : expect.stringMatching(/^0m?s$/),
      );
    }
    await input.fill('');
    const highlight = page.getByTestId(TID.chatlistFilters).locator('span[aria-hidden="true"]').first();
    // the click slides the fill to the chip at Full, run to the end, never cut short (none at Basic / Off: it is hidden)
    const slid = page.evaluate(
      (tid) =>
        new Promise<boolean>((done) => {
          const fill = document.querySelector(`[data-testid="${tid}"] > span[aria-hidden="true"]`)!;
          fill.addEventListener('transitionend', () => done(true), { once: true });
          fill.addEventListener('transitioncancel', () => done(false), { once: true });
          setTimeout(() => done(false), 1000);
        }),
      TID.chatlistFilters,
    );
    await page.getByTestId(TID.chatlistFilterNeedsYou).click();
    expect(await slid).toBe(level === 'full');
    const shown = await highlight.evaluate((n) => getComputedStyle(n).display);
    expect(shown).toBe(level === 'full' ? 'block' : 'none');
    if (level === 'full') {
      const chip = page.getByTestId(TID.chatlistFilterNeedsYou);
      await expect.poll(async () => Math.round((await highlight.boundingBox())!.x - (await chip.boundingBox())!.x)).toBe(0);
    }
  }
  await app.close();
});

test('AT-323: the footer "ready" dot breathes at Full and holds still at Basic and Off', async () => {
  const { app, page } = await startWorld();
  const dot = page.getByTestId(TID.sidebarFooterStatus).locator('[data-state="ready"]');
  await expect(dot).toHaveCount(1);
  for (const level of LEVELS) {
    await setLevel(page, level);
    expect(await animationOf(dot)).toEqual({ name: expect.stringMatching(/breathe/), ms: level === 'full' ? 2400 : 0 });
  }
  await app.close();
});

test("AT-323: a hovered row lifts 1px with a soft shadow at Full; Basic keeps it flat; Off keeps today's hover", async () => {
  const { app, page } = await startWorld();
  const row = listRow(page, 'Home');
  await row.hover();
  for (const level of LEVELS) {
    await setLevel(page, level);
    await expect
      .poll(() =>
        row.evaluate((n) => ({ y: new DOMMatrix(getComputedStyle(n).transform).m42, shadow: getComputedStyle(n).boxShadow !== 'none' })),
      )
      .toEqual({ y: level === 'full' ? -1 : 0, shadow: level !== 'off' });
  }
  await app.close();
});
