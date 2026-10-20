// FID-14 runner (11-fidelity §11.4.4): checks every non-pending row of spec/spec-values.json on a live page with
// getComputedStyle (exact) and getBoundingClientRect (±0.5 px). Rows name an element by data-testid; rows the spec gives no
// test id for are located through SELECTORS below (added by the milestone that builds the component). Window rows need the
// ElectronApplication.
import type { ElectronApplication, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

export type Theme = 'light' | 'dark';
type Themed = string | { light: string; dark: string };

export type Expect =
  | { kind: 'css'; props: Record<string, Themed>; themed?: boolean }
  | { kind: 'box'; width?: number; height?: number }
  | { kind: 'min-box'; width: number; height: number }
  | { kind: 'window-content'; width: number; height: number; smallAreaShare: number; fitsMargin: number };

export interface SvRow {
  id: string;
  component: string;
  testid: string | null;
  property: string;
  expected: string;
  source: string;
  pending?: string;
  expect: Expect | null;
}

export interface SvResult {
  id: string;
  ok: boolean;
  expected: string;
  measured: string;
  note?: string;
}

export const BOX_TOLERANCE = 0.5;

/**
 * Elements for rows whose spec entry has no data-testid (SV-38 "base styles" = the body rule in global.css; M1 builder B:
 * SV-18 right shell = `app-panel`, SV-29 main shell = `thread`, 03-shell-2 §3.9.5), and for rows whose test id names more
 * than the row measures (M2 builder C, CR-0003): SV-02 "last of a run" narrows `bubble-me` to `data-pos="last"`; SV-10 and
 * SV-11 measure the pill box, which in the app wraps `composer-field` (the contenteditable sits inside the pill with the
 * chips and strips, 04-2 §20.3; GAPS.md). An entry here wins over the row's test id.
 */
// GAP: GAPS.md 2026-10-17 "composer-field is on the inner contenteditable"
export const SELECTORS: Record<string, string> = {
  'SV-38': 'body',
  // M5 T2: the Secret box field's edge (05-2 §5.8.1, a Text field).
  'SV-27': '[data-testid="card-secret"] :has(> [data-testid="card-secret-field"])',
  // M1 left shell (03-shell-1 §3.4): measured with the list on screen and, for SV-23, a menu open.
  'SV-14': '[data-testid="chatlist-row"]:not([data-folded="true"]) [data-testid="chatlist-row-avatar"]',
  'SV-17': '[data-testid="sidebar"]',
  'SV-23': '[role="menuitem"]',
  'SV-24': '[data-testid="sidebar-search-field"]',
  'SV-25': '[data-testid="sidebar"] button, [data-testid="sidebar"] [role="radio"], [data-testid="chatlist-row"], [role="menuitem"]',
  'SV-18': '[data-testid="app-panel"]',
  'SV-29': '[data-testid="thread"]',
  // M2 messages (04 §1–§2, §11): measured in foo's chat on the ux-world seed (the chapter 8 scene) and Trips' gallery.
  'SV-02': '[data-testid="bubble-me"][data-pos="last"]',
  'SV-03': '[data-testid="bubble-foo"][data-pos="last"]',
  'SV-05': '[data-testid="bubble-foo"]',
  'SV-06':
    '[data-testid="bubble-me"]:not([lang]) > [data-copy], [data-testid="bubble-foo"]:not([lang]) > [data-copy], [data-testid="bubble-helper"]:not([lang]) > [data-copy]',
  'SV-07': '[data-testid^="bubble-"][lang="pa"] > [data-copy], [data-testid^="bubble-"][lang="hi"] > [data-copy]',
  'SV-09': '[data-testid="thread-log"] [role="list"]',
  // M2 composer (04-2 §20–§21).
  'SV-10': '[data-testid="composer"] div:has(> div > [data-testid="composer-field"])',
  'SV-11': '[data-testid="composer"] div:has(> div > [data-testid="composer-field"])',
  'SV-12': '[data-testid="composer-attach"], [data-testid="composer-send"]',
  // SV-26 "timestamp, placeholder": foo's bubble times (the user's sit on the dark bubble in --on-bubble-me-2, 04 §3.1) and
  // the composer placeholder (the field's aria-hidden twin).
  'SV-26': '[data-testid="bubble-foo"] [data-testid="bubble-meta"], [data-testid="composer"] span[aria-hidden="true"][id]',
  // M4 cards (05-1 §0.1, §0.8; T5): the card frames that carry a card row; the Job link card is one whole-surface button
  // with its own hover motion (05-3 §5.18.2), so SV-31's --m-card state motion is measured on the framed cards.
  'SV-20': '[data-card-type]',
  'SV-31': '[data-card-type]:not([data-testid="card-job-link"])',
  // M5 (T5): SV-21 "every text button" and SV-22 "primary button in cards" are checked in M5 on the Choice card's Primary
  // "Done" (`card-choice-done`, 05-1 §5.3.1 multi-select) only; the other text buttons join as their milestones add them.
  'SV-21': '[data-testid="card-choice-done"]',
  'SV-22': '[data-testid="card-choice-done"]',
};

export function readRows(file = 'spec/spec-values.json'): SvRow[] {
  return (JSON.parse(readFileSync(file, 'utf8')) as { rows: SvRow[] }).rows;
}

export const liveRows = (rows = readRows()) => rows.filter((r) => !r.pending);

const pick = (v: Themed, theme: Theme) => (typeof v === 'string' ? v : v[theme]);

export function locator(row: SvRow): string | null {
  if (SELECTORS[row.id]) return SELECTORS[row.id]!;
  return row.testid ? `[data-testid="${row.testid}"]` : null;
}

/** Pure comparison, unit-tested: CSS values exact, boxes within ±0.5 px, min-boxes at least the size. */
export function compareCss(row: SvRow & { expect: { kind: 'css' } }, measured: Record<string, string>[], theme: Theme): SvResult {
  const want = Object.entries(row.expect.props).map(([p, v]) => [p, pick(v, theme)] as const);
  const bad = measured.flatMap((m, i) => want.filter(([p, v]) => m[p] !== v).map(([p, v]) => `#${i} ${p}: ${m[p]} ≠ ${v}`));
  return {
    id: row.id,
    ok: measured.length > 0 && bad.length === 0,
    expected: want.map(([p, v]) => `${p}: ${v}`).join('; '),
    measured: measured.length ? (bad.length ? bad.join('; ') : 'all equal') : 'element not found',
  };
}

export function compareBox(row: SvRow & { expect: { kind: 'box' | 'min-box' } }, boxes: { width: number; height: number }[]): SvResult {
  const e = row.expect;
  const fail = (b: { width: number; height: number }) =>
    e.kind === 'box'
      ? (e.width !== undefined && Math.abs(b.width - e.width) > BOX_TOLERANCE) ||
        (e.height !== undefined && Math.abs(b.height - e.height) > BOX_TOLERANCE)
      : b.width < e.width - BOX_TOLERANCE || b.height < e.height - BOX_TOLERANCE;
  const bad = boxes.filter(fail);
  const want = [e.width !== undefined ? `width ${e.width}` : '', e.height !== undefined ? `height ${e.height}` : '']
    .filter(Boolean)
    .join(' × ');
  return {
    id: row.id,
    ok: boxes.length > 0 && bad.length === 0,
    expected: `${e.kind === 'min-box' ? '≥ ' : ''}${want} (±${BOX_TOLERANCE})`,
    measured: boxes.length ? boxes.map((b) => `${b.width}×${b.height}`).join(', ') : 'element not found',
  };
}

/** SV-37 (X-14, 03-shell-1 §3.1.1): 1280×800, or 90 % of the work area when it is smaller than 1280×800 + 5 %. */
export function expectedWindow(e: Expect & { kind: 'window-content' }, area: { width: number; height: number }) {
  const fits = area.width >= e.width * e.fitsMargin && area.height >= e.height * e.fitsMargin;
  return fits
    ? { width: e.width, height: e.height }
    : { width: Math.round(area.width * e.smallAreaShare), height: Math.round(area.height * e.smallAreaShare) };
}

export async function checkSpecValues(page: Page, opts: { theme: Theme; app?: ElectronApplication; rows?: SvRow[] }): Promise<SvResult[]> {
  const out: SvResult[] = [];
  for (const row of opts.rows ?? liveRows()) {
    const e = row.expect;
    if (!e) {
      out.push({
        id: row.id,
        ok: false,
        expected: row.expected,
        measured: 'no machine form',
        note: 'prose-only row: measure it by hand-written code',
      });
      continue;
    }
    if (e.kind === 'window-content') {
      if (!opts.app) {
        out.push({ id: row.id, ok: false, expected: row.expected, measured: 'not measured', note: 'needs the ElectronApplication' });
        continue;
      }
      const m = await opts.app.evaluate(({ BrowserWindow, screen }) => {
        const w = BrowserWindow.getAllWindows()[0]!;
        const [width, height] = w.getContentSize();
        return { content: { width: width!, height: height! }, area: screen.getPrimaryDisplay().workArea };
      });
      const want = expectedWindow(e, m.area);
      const ok = Math.abs(m.content.width - want.width) <= BOX_TOLERANCE && Math.abs(m.content.height - want.height) <= BOX_TOLERANCE;
      out.push({
        id: row.id,
        ok,
        expected: `${want.width}×${want.height} (work area ${m.area.width}×${m.area.height})`,
        measured: `${m.content.width}×${m.content.height}`,
      });
      continue;
    }
    const sel = locator(row);
    if (!sel) {
      out.push({
        id: row.id,
        ok: false,
        expected: row.expected,
        measured: 'not located',
        note: 'no data-testid and no entry in SELECTORS',
      });
      continue;
    }
    if (e.kind === 'css') {
      const props = Object.keys(e.props);
      const measured = await page.evaluate(
        ([s, ps]) =>
          Array.from(document.querySelectorAll(s as string)).map((el) => {
            const cs = getComputedStyle(el);
            return Object.fromEntries((ps as string[]).map((p) => [p, cs.getPropertyValue(p)]));
          }),
        [sel, props] as const,
      );
      out.push(compareCss(row as SvRow & { expect: { kind: 'css' } }, measured, opts.theme));
    } else {
      const boxes = await page.evaluate(
        (s) =>
          Array.from(document.querySelectorAll(s)).map((el) => {
            const r = el.getBoundingClientRect();
            return { width: r.width, height: r.height };
          }),
        sel,
      );
      out.push(compareBox(row as SvRow & { expect: { kind: 'box' | 'min-box' } }, boxes));
    }
  }
  return out;
}
