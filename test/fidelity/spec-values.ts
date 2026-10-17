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

/** Elements for rows whose spec entry has no data-testid (SV-38 "base styles" = the body rule in global.css). */
export const SELECTORS: Record<string, string> = {
  'SV-38': 'body',
  // M1 left shell (03-shell-1 §3.4): measured with the list on screen and, for SV-23, a menu open.
  'SV-14': '[data-testid="chatlist-row"]:not([data-folded="true"]) [data-testid="chatlist-row-avatar"]',
  'SV-17': '[data-testid="sidebar"]',
  'SV-23': '[role="menuitem"]',
  'SV-24': '[data-testid="sidebar-search-field"]',
  'SV-25': '[data-testid="sidebar"] button, [data-testid="sidebar"] [role="radio"], [data-testid="chatlist-row"], [role="menuitem"]',
};

export function readRows(file = 'spec/spec-values.json'): SvRow[] {
  return (JSON.parse(readFileSync(file, 'utf8')) as { rows: SvRow[] }).rows;
}

export const liveRows = (rows = readRows()) => rows.filter((r) => !r.pending);

const pick = (v: Themed, theme: Theme) => (typeof v === 'string' ? v : v[theme]);

export function locator(row: SvRow): string | null {
  if (row.testid) return `[data-testid="${row.testid}"]`;
  return SELECTORS[row.id] ?? null;
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
