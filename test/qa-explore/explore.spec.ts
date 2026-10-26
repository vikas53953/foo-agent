// Spec: CR-0054 (batch 1); 11-fidelity §11.2 (evidence beside every result); Vikas 2026-10-26 "discover every screen and
// control of the running app, exercise it, and keep a feature registry". The crawler: on the real app it opens each place a
// user can reach (chat, every Settings page, every menu), lists every visible control, then hovers and clicks each one,
// recording what visibly changed, a screenshot, and the spatial invariants (test/qa-explore/inpage.js). It writes
// registry.json for scripts/qa-explore.ts. A control that does nothing visible, or that breaks an invariant, is a finding;
// the crawl itself only fails when the app cannot be driven at all, so one dead button never hides the rest.
import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TID } from '../../src/shared/testids';
import { finishSetup, inject, open, say, send, turns, type World } from './world';

const OUT = process.env.QA_EXPLORE_DIR ?? join('qa-explore-report', 'latest');
const SHOTS = join(OUT, 'shots');

interface Entry {
  id: string;
  place: string;
  tid: string;
  role: string;
  name: string;
  disabled: boolean;
  box: number[];
  hasAccessibleName: boolean;
  tooltip: string[];
  action: 'clicked' | 'skipped';
  skipReason?: string;
  effect: string[];
  issues: Record<string, unknown>[];
  shot?: string;
  status: 'pass' | 'fail' | 'not-tested';
}

// Clicking these would end the run or destroy the test chat before the rest is explored; they get their own journeys.
const SKIP: Record<string, string> = {
  [TID.sidebarMenuQuit]: 'quits the app (covered by the restart journey)',
  [TID.composerField]: 'typing is covered by the chat journeys',
  [TID.threadLog]: 'container, not a control',
  [TID.sidebarResize]: 'drag handle (covered by the resize journey)',
};

async function signature(page: Page) {
  return page.evaluate(() => ({
    overlays: window.__qa
      .overlays()
      .filter((o) => o.role !== 'listbox')
      .map((o) => `${o.role}:${o.text.slice(0, 40)}`),
    screens: [...document.querySelectorAll('[data-testid^="screen-"]')].map((e) => (e as HTMLElement).dataset.testid ?? ''),
    emptyScreens: [...document.querySelectorAll('[data-testid^="screen-"][data-page]')]
      .filter((e) => (e as HTMLElement).innerText.trim().length < 20)
      .map((e) => (e as HTMLElement).dataset.testid ?? ''),
    focus: (document.activeElement as HTMLElement | null)?.dataset?.testid ?? document.activeElement?.tagName ?? '',
    theme: document.documentElement.dataset.theme ?? '',
    textLen: document.body.innerText.length,
    text: document.body.innerText,
    pressed: [...document.querySelectorAll('[aria-pressed="true"],[aria-checked="true"],[aria-selected="true"]')]
      .map((e) => `${(e as HTMLElement).dataset.testid ?? ''}:${e.getAttribute('aria-label') ?? (e as HTMLElement).innerText.slice(0, 20)}`)
      .join('|'),
  }));
}

function describe(before: Awaited<ReturnType<typeof signature>>, after: Awaited<ReturnType<typeof signature>>): string[] {
  const fx: string[] = [];
  const opened = after.overlays.filter((o) => !before.overlays.includes(o));
  if (opened.length) fx.push(`opened ${opened.join(' | ')}`);
  if (after.screens.join() !== before.screens.join()) fx.push(`screen → ${after.screens.join(',') || 'chat'}`);
  for (const s of after.emptyScreens) if (!before.emptyScreens.includes(s)) fx.push(`EMPTY SCREEN ${s}`);
  if (after.theme !== before.theme) fx.push(`theme → ${after.theme}`);
  if (after.pressed !== before.pressed) fx.push('pressed/selected state changed');
  if (after.text !== before.text) {
    const was = new Set(before.text.split('\n'));
    const added = after.text.split('\n').filter((l) => l.trim() && !was.has(l));
    fx.push(
      `content changed${added.length ? `: "${added.slice(0, 2).join(' / ').slice(0, 60)}"` : ` (${before.textLen}→${after.textLen} chars)`}`,
    );
  }
  return fx;
}

/** Puts the app back where `place` starts: no menus, the right screen. */
async function reset(page: Page, goto: () => Promise<void>) {
  // Esc until no menu or dialog is left (a long dialog can still be opening on the first press).
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    if (!(await page.locator('[role=dialog],[role=alertdialog],[role=menu]').count())) break;
  }
  const stuck = await page.evaluate(() =>
    [...document.querySelectorAll('[role=dialog],[role=alertdialog],[role=menu]')].map(
      (d) => `${d.getAttribute('role')} "${(d.textContent ?? '').slice(0, 40)}" focus=${document.activeElement?.outerHTML.slice(0, 80)}`,
    ),
  );
  if (stuck.length) console.log('QAX-STUCK after Esc:', stuck.join(' | '));
  const back = page.getByTestId(TID.screenBack);
  if (await back.count()) await back.click().catch(() => {});
  await goto();
  await page.waitForTimeout(300);
}

async function crawl(w: World, place: string, goto: () => Promise<void>, filter: (tid: string) => boolean, out: Entry[]) {
  const { page } = w;
  await reset(page, goto);
  const controls = (await page.evaluate(() => window.__qa.controls())).filter((c) =>
    c.tid ? filter(c.tid) : c.name !== '' && filter(`${c.role}:${c.name}`),
  );
  const seen = new Set<string>();
  for (const c of controls) {
    const key = `${c.tid}|${c.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = c.tid || `${c.role}:${c.name.slice(0, 30)}`;
    const id = `${place}/${label}${c.tid && controls.filter((x) => x.tid === c.tid).length > 1 ? `#${c.name.slice(0, 20)}` : ''}`;
    const e: Entry = { id, place, ...c, tooltip: [], action: 'clicked', effect: [], issues: [], status: 'not-tested' };
    out.push(e);
    if (SKIP[c.tid]) {
      e.action = 'skipped';
      e.skipReason = SKIP[c.tid];
      continue;
    }
    if (
      /radio|checkbox|switch|tab/.test(c.role) &&
      (await page.evaluate((b) => {
        const el = document.elementFromPoint(b[0]! + b[2]! / 2, b[1]! + b[3]! / 2)?.closest('[role]');
        return el?.getAttribute('aria-checked') === 'true' || el?.getAttribute('aria-selected') === 'true';
      }, c.box))
    ) {
      e.action = 'skipped';
      e.skipReason = 'already selected';
      continue;
    }
    if (c.tid === TID.composerSend) {
      e.action = 'skipped';
      e.skipReason = 'empty box: sending nothing is correct (send is covered by the chat journeys)';
      continue;
    }
    if (c.disabled) {
      e.action = 'skipped';
      e.skipReason = 'disabled here';
      continue;
    }
    await reset(page, goto);
    let loc;
    if (c.tid) {
      const target = page.locator(`[data-testid="${c.tid}"]`).filter({ hasText: c.name.length < 40 ? c.name : '' });
      loc = (await target.count()) ? target.first() : page.getByTestId(c.tid).first();
    } else {
      loc = page.getByRole(c.role as Parameters<Page['getByRole']>[0], { name: c.name, exact: true }).first();
    }
    const before = await signature(page);
    try {
      await loc.hover({ timeout: 2_000 });
      await page.waitForTimeout(700);
      e.tooltip = await page.evaluate(() =>
        [...document.querySelectorAll('[role=tooltip]')].filter((t) => window.__qa.visible(t)).map((t) => (t as HTMLElement).innerText),
      );
      await loc.click({ timeout: 2_000 });
    } catch (err) {
      e.effect.push(`could not click: ${(err as Error).message.split('\n')[0]}`);
    }
    await page.waitForTimeout(800);
    let after = await signature(page);
    if (!describe(before, after).length) {
      // Some things answer slowly (a test of your AI); give it 4 s more before calling it dead.
      await page.waitForTimeout(4_000);
      after = await signature(page);
    }
    e.effect.push(...describe(before, after));
    e.issues = await page.evaluate(() => window.__qa.invariants());
    const file = `${id.replace(/[^a-z0-9-]+/gi, '_')}.png`;
    await page.screenshot({ path: join(SHOTS, file) });
    e.shot = `shots/${file}`;
    if (e.effect.some((x) => x.startsWith('could not'))) e.status = 'not-tested';
    else if (!e.effect.length) {
      e.effect.push('NO VISIBLE EFFECT');
      e.status = 'fail';
    } else e.status = e.effect.some((x) => x.startsWith('EMPTY')) || e.issues.length ? 'fail' : 'pass';
  }
}

test('QA-X explore · every reachable control in batch 1 is exercised and recorded', async () => {
  test.setTimeout(900_000);
  mkdirSync(SHOTS, { recursive: true });
  const w = await open(
    [say('QAX-LONG', `Here is a long answer. ${'Delhi mein aaj mausam accha hai aur shaam ko baarish ho sakti hai. '.repeat(10)}`)],
    { firstRun: true },
  );
  const out: Entry[] = [];
  try {
    await finishSetup(w.page, { name: 'Asha', face: 3, vibe: 2 });
    await send(w.page, 'QAX-HELLO hi foo, kaise ho?');
    await send(w.page, 'QAX-LONG give me a long answer');
    await inject(w.page);
    const chat = async () => {
      if (!(await w.page.getByTestId(TID.threadLog).count())) await w.page.getByTestId(TID.chatlistRow).first().click();
    };
    const chrome = (tid: string) => !/^(bubble|card|setup)-/.test(tid) && !tid.includes(':') && tid !== TID.chatlistRow;
    await crawl(w, 'chat', chat, chrome, out);
    // Every message action of the newest answer, reached by hover like a user.
    const hoverLast = async () => {
      await chat();
      const b = await w.page.getByTestId(TID.bubbleFoo).last().boundingBox();
      if (b) await w.page.mouse.move(b.x + 30, b.y + 15);
      await w.page.waitForTimeout(400);
    };
    await crawl(w, 'answer', hoverLast, (tid) => /^bubble-(actions|toolbar)-/.test(tid), out);
    // The newest answer's Try again must ask the AI again (a new request), not only take focus.
    const asked = turns(w).length;
    await hoverLast();
    await w.page.getByTestId(TID.bubbleActionsRetry).last().click();
    await w.page.waitForTimeout(3_000);
    const retry = out.find((x) => x.id === 'answer/bubble-actions-retry');
    if (retry) {
      const more = turns(w).length - asked;
      retry.effect.push(more > 0 ? `asked the AI again (${more} request)` : 'NO NEW AI REQUEST');
      if (!more) retry.status = 'fail';
    }
    // Copy has no lasting on-screen effect; what it must do is put the answer on the clipboard.
    const copy = out.find((x) => x.id === 'answer/bubble-actions-copy');
    if (copy) {
      await w.app.evaluate(({ clipboard }) => clipboard.writeText('QAX-SENTINEL'));
      await hoverLast();
      await w.page.getByTestId(TID.bubbleActionsCopy).last().click();
      await w.page.waitForTimeout(500);
      const clip = await w.app.evaluate(({ clipboard }) => clipboard.readText());
      const copied = clip !== 'QAX-SENTINEL' && clip.trim().length > 0;
      copy.effect.push(copied ? `clipboard holds the answer (${clip.length} chars)` : 'NOTHING COPIED');
      copy.status = copied && !copy.issues.length ? 'pass' : 'fail';
    }
    for (const nav of [TID.settingsNavAccount, TID.settingsNavAppearance, TID.settingsNavShortcuts, TID.settingsNavAbout]) {
      const go = async () => {
        if (!(await w.page.getByTestId(TID.screenSettings).count())) await w.page.getByTestId(TID.sidebarFooterSettings).click();
        await w.page.getByTestId(nav).click();
      };
      await crawl(
        w,
        `settings/${nav.replace('settings-nav-', '')}`,
        go,
        (tid) => !/^(sidebar|chatlist|settings-nav)-/.test(tid) && tid !== TID.screenBack && !/^searchbox:/.test(tid),
        out,
      );
      // An empty Settings page is a finding by itself. Reset first: the last control may have left a dialog open.
      await reset(w.page, go);
      const body = await w.page.getByTestId(TID.screenSettings).innerText();
      const navText = await w.page.locator('[data-testid^="settings-nav-"]').allInnerTexts();
      const rest = navText
        .reduce((s, t) => s.replace(t, ''), body)
        .replace(/Settings/g, '')
        .trim();
      out.push({
        id: `settings/${nav.replace('settings-nav-', '')}/content`,
        place: 'settings',
        tid: nav,
        role: 'page',
        name: 'page has content',
        disabled: false,
        box: [],
        hasAccessibleName: true,
        tooltip: [],
        action: 'clicked',
        effect: [rest.length > 40 ? `content (${rest.length} chars)` : `EMPTY PAGE: "${rest}"`],
        issues: [],
        status: rest.length > 40 ? 'pass' : 'fail',
      });
    }
  } finally {
    writeFileSync(join(OUT, 'registry.json'), JSON.stringify(out, null, 2));
    await w.stop();
  }
});
