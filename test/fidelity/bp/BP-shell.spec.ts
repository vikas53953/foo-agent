// Spec: 11-fidelity §11.2.4 (Tier R app side: the step's test writes { id, theme, png, texts, hlTexts, hl, anchors } with boxes
// in frame pixels and anchors keyed like the reference JSON), §11.10 M1 fidelity exit (BP-APP-L/M/R and the drawn BP-ANAT-*
// refs), 11-fidelity §11.2.3 data rule (the Blueprint's state comes from the ux-world seed, never hand-typed). The Blueprint
// window is the foo chat at 1280 × 800 with the right shell open, Fri 16 Oct 9:41 AM. Captures land in golden/out/app, where
// the golden lane's Tier R step compares them with golden/ref/bp.
import { test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TID } from '../../../src/shared/testids';
import { launch } from '../../e2e/launch';

const OUT = join('golden', 'out', 'app');
const byTid = (id: string) => `[data-testid="${id}"]`;
const SHOT = { animations: 'disabled', caret: 'hide', scale: 'css' } as const;

/** Blueprint selector (golden/manifest.json) → the same surface in the app, by test id (08-0 §C). `null` = the whole window. */
export const BP_TO_APP: Record<string, string | null> = {
  'BP-ANAT-L': null,
  'BP-ANAT-TBAR': byTid(TID.titlebarStrip),
  'BP-APP-L': byTid(TID.sidebar),
  'BP-APP-M': byTid(TID.thread),
  'BP-APP-R': byTid(TID.appPanel),
  'BP-ANAT-LHEAD': `${byTid(TID.sidebar)} > div:first-child`,
  'BP-ANAT-SEARCH': byTid(TID.sidebarSearchField),
  'BP-ANAT-CHIPS': byTid(TID.chatlistFilters),
  'BP-ANAT-LIST': byTid(TID.chatlist),
  'BP-ANAT-ROW': `${byTid(TID.chatlistRow)}[aria-selected="true"]`,
  'BP-ANAT-LFOOT': `div:has(> ${byTid(TID.sidebarFooterStatus)})`,
  'BP-ANAT-MHEAD': byTid(TID.chatHeader),
  'BP-ANAT-RHEAD': `${byTid(TID.appPanel)} header`,
  'BP-ANAT-DOING': byTid(TID.appPanelDoing),
  'BP-ANAT-USING': byTid(TID.appPanelUsing),
  'BP-ANAT-KNOW': byTid(TID.appPanelKnow),
  'BP-ANAT-SPENT': byTid(TID.appPanelSpent),
};

interface ManifestBp {
  id: string;
  drawn: boolean;
  milestone: string;
}

/** Normalised text nodes under the element (same rule as the reference side, scripts/golden/browser.ts textNodes). */
async function texts(page: Page, sel: string | null): Promise<string[]> {
  return page.evaluate((s) => {
    const root = s ? document.querySelector(s) : document.body;
    if (!root) return [];
    const out: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (el && getComputedStyle(el).display === 'none') continue;
      const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    }
    return out;
  }, sel);
}

const settle = (page: Page) =>
  page.evaluate(() =>
    document.fonts.ready.then(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))),
  );

test('M1 Blueprint captures for Tier R (BP-APP-L/M/R, drawn BP-ANAT-*), light and dark', async () => {
  const manifest = JSON.parse(readFileSync(join('golden', 'manifest.json'), 'utf8')) as { bp: ManifestBp[] };
  const ids = manifest.bp.filter((b) => b.milestone === 'M1' && b.drawn).map((b) => b.id);
  const unmapped = ids.filter((id) => !(id in BP_TO_APP));
  if (unmapped.length) throw new Error(`no app surface mapped for ${unmapped.join(', ')}`);

  const app = await launch();
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await page.evaluate(async () => {
    const t = (window as unknown as { __fooTest: { clock: { set(iso: string): Promise<unknown> }; seed(s: string): Promise<unknown> } })
      .__fooTest;
    await t.clock.set('2026-10-16T09:41:00+05:30');
    await t.seed('ux-world');
  });
  await page.reload();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800));
  await page.waitForFunction(() => window.innerWidth === 1280 && window.innerHeight === 800);
  await page.locator(byTid(TID.chatlistRow)).filter({ hasText: 'foo' }).first().click();
  await page.getByTestId(TID.appPanel).waitFor();
  // No hover or focus ring in the picture: the Blueprint draws the resting state.
  await page.mouse.move(640, 16);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  mkdirSync(OUT, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((th) => (window as unknown as { __fooTest: { theme(t: string): Promise<unknown> } }).__fooTest.theme(th), theme);
    await page.waitForFunction(
      (th) => document.documentElement.dataset.theme === th || matchMedia(`(prefers-color-scheme: ${th})`).matches,
      theme,
    );
    await settle(page);
    for (const id of ids) {
      const sel = BP_TO_APP[id]!;
      const loc = sel ? page.locator(sel).first() : null;
      const b = loc ? await loc.boundingBox() : { x: 0, y: 0, width: 1280, height: 800 };
      if (!b) throw new Error(`${id}: ${sel} is not on screen`);
      const png = loc ? await loc.screenshot(SHOT) : await page.screenshot(SHOT);
      const name = `${id}.${theme}`;
      writeFileSync(join(OUT, `${name}.png`), png);
      const capture = {
        id,
        theme,
        png: `${name}.png`,
        texts: await texts(page, sel),
        hlTexts: [],
        hl: null,
        anchors: { [id]: { x: 0, y: 0, width: b.width, height: b.height } },
      };
      writeFileSync(join(OUT, `${name}.json`), JSON.stringify(capture, null, 2) + '\n');
    }
  }
  await app.close();
});
