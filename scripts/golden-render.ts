// Spec: 11-fidelity §11.2.2 (how reference images are produced), §11.2.5 (capture kinds), §11.2.6 (golden runner),
// FID-03 (re-render is byte-identical), FID-04 (runner identity). Renders references into golden/ref/{ux,bp}/ID.{light,dark}.png
// + ID.json and writes golden/runner.json.
// Usage: tsx scripts/golden-render.ts [--milestone M1] [--ids BP-APP-L,UX-08-01] [--family ux|bp]
//        [--engine electron|chromium] [--chromium-path <exe>] [--out golden/ref] [--determinism]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { Page } from '@playwright/test';
import { boxIn, openRefBrowser, setTheme, settle, textNodes, type Box, type Engine, type RefBrowser } from './golden/browser';
import { runnerIdentity } from './golden/runner-identity';
import { BP_FILE, readManifest, UX_FILE, type BpEntry, type GoldenManifest, type UxEntry } from './golden-manifest';

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
const SHOT = { animations: 'disabled', caret: 'hide', scale: 'css' } as const;

export interface RefJson {
  id: string;
  family: 'ux' | 'bp';
  selector: string;
  /** Measured box of the captured element in page CSS px (light run). */
  box: Box | null;
  files: Partial<Record<Theme, { png: string; sha256: string }>>;
  /** Normalised text nodes of the whole frame and of the hl element (R1). */
  texts: string[];
  hlTexts: string[];
  /** hl element box in frame pixels (R2 / R4). */
  hl: { id: string; box: Box | null } | null;
  capture: 'window' | 'native' | 'mixed' | null;
  milestone: string | null;
  spec?: string;
  size?: BpEntry['size'];
  ux?: Pick<UxEntry, 'chapter' | 'step' | 'anchor' | 'title' | 'part' | 'j' | 'r' | 'c' | 's' | 'f'> & {
    state: unknown;
    clockShown: string | null;
    superseded: string | null;
  };
  engine: string;
  chromium: string;
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export function select(manifest: GoldenManifest, opts: { ids?: string[]; milestone?: string; family?: string }) {
  const want = (id: string, milestone: string | null) =>
    (!opts.ids || opts.ids.includes(id)) && (!opts.milestone || milestone === opts.milestone);
  const bp = opts.family === 'ux' ? [] : manifest.bp.filter((e) => want(e.id, e.milestone));
  const ux = opts.family === 'bp' ? [] : manifest.ux.filter((e) => want(e.id, e.milestone));
  return { bp, ux };
}

async function renderUx(page: Page, e: UxEntry, out: string, browser: RefBrowser): Promise<RefJson> {
  const json: RefJson = {
    id: e.id,
    family: 'ux',
    selector: '#frame',
    box: null,
    files: {},
    texts: [],
    hlTexts: [],
    hl: e.hl ? { id: e.hl, box: null } : null,
    capture: null,
    milestone: e.milestone,
    engine: browser.engine,
    chromium: browser.chromiumVersion,
  };
  for (const theme of THEMES) {
    await setTheme(page, theme);
    const state = await page.evaluate((i) => {
      const w = window as unknown as { __go: (i: number) => void; __STEPS: { state: unknown }[] };
      w.__go(i);
      // §11.2.2 step 2: stage at scale 1, so #frame is exactly 1280×800 CSS px.
      const frame = document.getElementById('frame')!;
      const stage = document.getElementById('stage')!;
      frame.style.transform = 'none';
      stage.style.width = '1280px';
      stage.style.height = '800px';
      return w.__STEPS[i]!.state;
    }, e.index);
    await settle(page);
    const png = await page.locator('#frame').screenshot(SHOT);
    const name = `${e.id}.${theme}.png`;
    writeFileSync(join(out, name), png);
    json.files[theme] = { png: name, sha256: sha(png) };
    if (theme === 'light') {
      json.box = await boxIn(page, 'body', '#frame');
      json.texts = await textNodes(page, '#frame');
      if (e.hl) {
        json.hl = { id: e.hl, box: await boxIn(page, '#frame', `[data-hl="${e.hl}"]`) };
        json.hlTexts = await textNodes(page, `#frame .hl`);
      }
      const d = (state as { d?: { time?: string } }).d;
      json.ux = {
        chapter: e.chapter,
        step: e.step,
        anchor: e.anchor,
        title: e.title,
        part: e.part,
        j: e.j,
        r: e.r,
        c: e.c,
        s: e.s,
        f: e.f,
        state,
        clockShown: d?.time ?? null,
        superseded: e.superseded?.decision ?? null,
      };
    }
  }
  return json;
}

async function renderBp(page: Page, e: BpEntry, out: string, browser: RefBrowser): Promise<RefJson> {
  const json: RefJson = {
    id: e.id,
    family: 'bp',
    selector: e.selector,
    box: null,
    files: {},
    texts: [],
    hlTexts: [],
    hl: null,
    capture: 'window',
    milestone: e.milestone,
    spec: e.spec,
    size: e.size,
    engine: browser.engine,
    chromium: browser.chromiumVersion,
  };
  const el = page.locator(e.selector).first();
  if ((await el.count()) === 0) throw new Error(`${e.id}: selector ${e.selector} matches nothing in ${BP_FILE}`);
  json.box = await boxIn(page, 'body', e.selector);
  json.texts = await textNodes(page, e.selector);
  if (!e.drawn) return json; // diagram only: no pixels (manifest note)
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await el.scrollIntoViewIfNeeded();
    await settle(page);
    const png = await el.screenshot(SHOT);
    const name = `${e.id}.${theme}.png`;
    writeFileSync(join(out, name), png);
    json.files[theme] = { png: name, sha256: sha(png) };
  }
  return json;
}

export async function render(opts: {
  manifest: GoldenManifest;
  ids?: string[];
  milestone?: string;
  family?: string;
  engine: Engine;
  chromiumPath?: string;
  out: string;
}): Promise<{ rendered: RefJson[]; chromium: string; electron: string | null }> {
  const { bp, ux } = select(opts.manifest, opts);
  const browser = await openRefBrowser(opts.engine, opts.chromiumPath);
  const rendered: RefJson[] = [];
  try {
    if (ux.length) {
      const dir = join(opts.out, 'ux');
      mkdirSync(dir, { recursive: true });
      const page = await browser.open(UX_FILE);
      await page.waitForFunction(() => typeof (window as unknown as { __go?: unknown }).__go === 'function');
      for (const e of ux) rendered.push(await renderUx(page, e, dir, browser));
    }
    if (bp.length) {
      const dir = join(opts.out, 'bp');
      mkdirSync(dir, { recursive: true });
      const page = await browser.open(BP_FILE);
      for (const e of bp) rendered.push(await renderBp(page, e, dir, browser));
    }
  } finally {
    await browser.close();
  }
  for (const r of rendered) writeFileSync(join(opts.out, r.family, `${r.id}.json`), JSON.stringify(r, null, 2) + '\n');
  return { rendered, chromium: browser.chromiumVersion, electron: browser.electronVersion };
}

/** FID-03: two renders of the same spec version give byte-identical PNGs. */
export function compareRenders(a: RefJson[], b: RefJson[]): string[] {
  const byId = new Map(b.map((r) => [r.id, r]));
  const diffs: string[] = [];
  for (const r of a) {
    const o = byId.get(r.id);
    for (const theme of THEMES) {
      const x = r.files[theme]?.sha256;
      const y = o?.files[theme]?.sha256;
      if (x !== y) diffs.push(`${r.id}.${theme}`);
    }
  }
  return diffs;
}

async function main() {
  const { values } = parseArgs({
    options: {
      ids: { type: 'string' },
      milestone: { type: 'string' },
      family: { type: 'string' },
      engine: { type: 'string', default: 'electron' },
      'chromium-path': { type: 'string' },
      out: { type: 'string', default: join('golden', 'ref') },
      determinism: { type: 'boolean' },
    },
  });
  const manifest = readManifest();
  const opts = {
    manifest,
    ids: values.ids?.split(',').map((s) => s.trim()),
    milestone: values.milestone,
    family: values.family,
    engine: values.engine as Engine,
    chromiumPath: values['chromium-path'],
    out: values.out!,
  };
  const first = await render(opts);
  const identity = runnerIdentity(opts.engine, first.chromium, first.electron);
  mkdirSync('golden', { recursive: true });
  writeFileSync(join('golden', 'runner.json'), JSON.stringify(identity, null, 2) + '\n');
  const pngs = first.rendered.reduce((n, r) => n + Object.keys(r.files).length, 0);
  console.log(`rendered ${first.rendered.length} refs (${pngs} PNGs) with ${opts.engine} Chromium ${first.chromium}`);
  if (values.determinism) {
    const again = join(tmpdir(), `foo-golden-det-${process.pid}`);
    const second = await render({ ...opts, out: again });
    const diffs = compareRenders(first.rendered, second.rendered);
    rmSync(again, { recursive: true, force: true });
    const result = { fid: 'FID-03', compared: pngs, identical: pngs - diffs.length, differing: diffs, engine: opts.engine };
    writeFileSync(join(opts.out, 'determinism.json'), JSON.stringify(result, null, 2) + '\n');
    if (diffs.length) {
      console.error(`FID-03: ${diffs.length} reference PNGs differ between two renders: ${diffs.join(', ')}`);
      process.exit(1);
    }
    console.log(`FID-03: ${pngs} PNGs byte-identical across two renders`);
  }
  // Read back once so a truncated write fails here, not in Tier R.
  for (const r of first.rendered) JSON.parse(readFileSync(join(opts.out, r.family, `${r.id}.json`), 'utf8'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
