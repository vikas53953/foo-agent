// Spec: 11-fidelity §11.2.1 (UX and BP families, counts from window.__CH / window.__STEPS), §11.2.7 (superseded steps),
// §11.12 item 8 (which milestone brings which refs to Tier R). Writes golden/manifest.json.
// The UX list is read from the frozen walkthrough in a browser, never typed by hand. The BP list (selector → id) is fixed
// here at freeze for the ids the current milestones need; later milestones add their ids through a CR.
// Usage: tsx scripts/golden-manifest.ts [--engine electron|chromium] [--chromium-path <exe>] [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openRefBrowser, type Engine } from './golden/browser';

export const MANIFEST_PATH = 'golden/manifest.json';
export const UX_FILE = 'spec/refs/ux/foo-ux-walkthrough.html';
export const BP_FILE = 'spec/refs/bp/foo-blueprint-v2.html';

export interface BpEntry {
  id: string;
  /** CSS selector in the Blueprint; the first match is the mock. */
  selector: string;
  /** false: the Blueprint draws no mock for this id (only a diagram); Tier R uses R1/R2 against the spec text, no pixels. */
  drawn: boolean;
  /** Size the spec fixes for the drawn element (null where content decides). */
  size: { width: number | null; height: number | null };
  spec: string;
  milestone: string;
  note?: string;
}

export interface UxEntry {
  id: string;
  /** Index into window.__STEPS (window.__go(index)). */
  index: number;
  chapter: number;
  step: number;
  anchor: string;
  title: string;
  part: string;
  j: string;
  r: string;
  c: string;
  s: string;
  f: string;
  hl: string | null;
  milestone: string | null;
  superseded?: { decision: string };
}

/** BP ids for the M1 fidelity exit: BP-APP-L/M/R and BP-ANAT-* (shell frame, chat list, headers, right shell, widths L/M/S/XS). */
export const BP: BpEntry[] = [
  { id: 'BP-APP-L', selector: '#win .left', drawn: true, size: { width: 340, height: null }, spec: '03-shell-1 §3.4', milestone: 'M1' },
  {
    id: 'BP-APP-M',
    selector: '#win .mid',
    drawn: true,
    size: { width: 600, height: null },
    spec: '03-shell-1 §3.5; 03-shell-2 §3.6',
    milestone: 'M1',
    note: 'The column holds M2+ messages and cards: M1 compares the frame (header, column box, composer slot) by R2; pixels are Review until M2.',
  },
  { id: 'BP-APP-R', selector: '#win .right', drawn: true, size: { width: 340, height: null }, spec: '03-shell-2 §3.7', milestone: 'M1' },
  {
    id: 'BP-ANAT-L',
    selector: '#win',
    drawn: true,
    size: { width: 1280, height: 800 },
    spec: '03-shell-1 §3.1.3; 03-shell-2 §3.10.1',
    milestone: 'M1',
    note: 'The whole window at the default size (L, three columns).',
  },
  {
    id: 'BP-ANAT-M',
    selector: '#system .bp > div:nth-child(3)',
    drawn: false,
    size: { width: null, height: null },
    spec: '03-shell-1 §3.1.3; 03-shell-2 §3.10.2',
    milestone: 'M1',
    note: 'The Blueprint draws no window at M width, only the F11 breakpoint diagram: checked by R1/R2 against the §3.10.2 wireframe, no pixel compare.',
  },
  {
    id: 'BP-ANAT-S',
    selector: '#system .bp > div:nth-child(2)',
    drawn: false,
    size: { width: null, height: null },
    spec: '03-shell-1 §3.1.3; 03-shell-2 §3.10.3',
    milestone: 'M1',
    note: 'Diagram only (F11 tile): R1/R2 against the §3.10.3 wireframe, no pixel compare.',
  },
  {
    id: 'BP-ANAT-XS',
    selector: '#system .bp > div:nth-child(1)',
    drawn: false,
    size: { width: null, height: null },
    spec: '03-shell-1 §3.1.3; 03-shell-2 §3.10.4',
    milestone: 'M1',
    note: 'Diagram only (F11 tile): R1/R2 against the §3.10.4 wireframe, no pixel compare.',
  },
  { id: 'BP-ANAT-TBAR', selector: '#win .tbar', drawn: true, size: { width: null, height: 32 }, spec: '03-shell-1 §3.2', milestone: 'M1' },
  {
    id: 'BP-ANAT-LHEAD',
    selector: '#win .lhead',
    drawn: true,
    size: { width: null, height: 60 },
    spec: '03-shell-1 §3.4',
    milestone: 'M1',
  },
  {
    id: 'BP-ANAT-SEARCH',
    selector: '#win .search',
    drawn: true,
    size: { width: null, height: 36 },
    spec: '03-shell-1 §3.4',
    milestone: 'M1',
  },
  {
    id: 'BP-ANAT-CHIPS',
    selector: '#win .chips',
    drawn: true,
    size: { width: null, height: null },
    spec: '03-shell-1 §3.4',
    milestone: 'M1',
  },
  {
    id: 'BP-ANAT-LIST',
    selector: '#win .rows',
    drawn: true,
    size: { width: null, height: null },
    spec: '03-shell-1 §3.4',
    milestone: 'M1',
  },
  {
    id: 'BP-ANAT-ROW',
    selector: '#win .rows .row.sel',
    drawn: true,
    size: { width: null, height: 72 },
    spec: '03-shell-1 §3.4',
    milestone: 'M1',
    note: 'The selected foo row (first row).',
  },
  {
    id: 'BP-ANAT-LFOOT',
    selector: '#win .lfoot',
    drawn: true,
    size: { width: null, height: 64 },
    spec: '03-shell-1 §3.4',
    milestone: 'M1',
  },
  {
    id: 'BP-ANAT-MHEAD',
    selector: '#win .mhead',
    drawn: true,
    size: { width: null, height: 60 },
    spec: '03-shell-2 §3.6',
    milestone: 'M1',
  },
  {
    id: 'BP-ANAT-RHEAD',
    selector: '#win .rhead',
    drawn: true,
    size: { width: null, height: 60 },
    spec: '03-shell-2 §3.7',
    milestone: 'M1',
  },
  {
    id: 'BP-ANAT-DOING',
    selector: '#win .right .rsec:nth-child(2)',
    drawn: true,
    size: { width: null, height: null },
    spec: '03-shell-2 §3.7',
    milestone: 'M1',
  },
  {
    id: 'BP-ANAT-USING',
    selector: '#win .right .rsec:nth-child(3)',
    drawn: true,
    size: { width: null, height: null },
    spec: '03-shell-2 §3.7',
    milestone: 'M1',
  },
  {
    id: 'BP-ANAT-KNOW',
    selector: '#win .right .rsec:nth-child(4)',
    drawn: true,
    size: { width: null, height: null },
    spec: '03-shell-2 §3.7',
    milestone: 'M1',
  },
  {
    id: 'BP-ANAT-SPENT',
    selector: '#win .right .rsec:nth-child(5)',
    drawn: true,
    size: { width: null, height: null },
    spec: '03-shell-2 §3.7',
    milestone: 'M1',
  },
];

/** Chapter anchor → the milestone that completes the chapter (11 §11.12 item 8: a chapter is owned by the milestone that completes it). */
export const CHAPTER_MILESTONE: Record<string, string | null> = {
  install: 'M14',
  ai: 'M12',
  name: 'M12',
  interview: 'M12',
  first: 'M12',
  helpers: 'M13',
  brief: 'M7',
  chat: 'M2',
  voice: 'M11',
  choice: 'M5',
  bills: 'M10',
  restaurant: 'M9',
  hotel: 'M10',
  signin: 'M9',
  live: 'M9',
  drafts: 'M8',
  routines: 'M7',
  memory: 'M6',
  groups: 'M13',
  search: 'M13',
  notify: 'M11',
  spend: 'M13',
  errors: null, // split over M4 (stuck, loop, offline, recovery) and M11 (crash, safe mode); no milestone takes "all"
  settings: 'M13',
  data: 'M14',
};

/** §11.2.7 known cases before freeze (decision ids as written there). */
export const SUPERSEDED: Record<string, string> = {
  'UX-24-10': 'X-41 (Outlook chip)',
  'UX-05-06': 'X-103 (reminder time 9:00 AM)',
  'UX-06-02': '06-1 §3 (chip "Blank")',
  'UX-06-07': '06-1 §4.1 (app toggles)',
  'UX-10-05': '05 §5.3.1 (no Next button)',
  'UX-13-03': 'X-04 ("Go")',
  'UX-22-07': 'X-04 ("Go")',
  'UX-13-16': '05 §5.6.3 (price-changed line + right label "Replaced")',
  'UX-14-02': 'X-66 (real Edge window + signin-banner.html)',
  'UX-14-03': 'X-66 (real Edge window + signin-banner.html)',
  'UX-14-04': 'X-66 (real Edge window + signin-banner.html)',
  'UX-15-01': '06 §0.11 (ArrowMaximize button)',
  'UX-16-06': 'X-79 ("Change")',
  'UX-18-04': '06-2 §7.3 (⋯ menu)',
  'UX-21-05': '05 §0.10 (toast without reply box)',
  'UX-22-04': 'X-15 (C-21 typed field)',
  'UX-24-09': '06-2 §6.2 ("Same as Windows · Light · Dark")',
};

export const pad2 = (n: number) => String(n).padStart(2, '0');

interface RawStep {
  ci: number;
  si: number;
  c: string;
  s: string;
  f: string;
  hl: string | null;
}
interface RawChapter {
  id: string;
  t: string;
  j: string;
  r: string;
  part: string;
  n: number;
}

export async function readWalkthrough(engine: Engine, chromiumPath?: string): Promise<{ chapters: RawChapter[]; steps: RawStep[] }> {
  const browser = await openRefBrowser(engine, chromiumPath);
  try {
    const page = await browser.open(UX_FILE);
    await page.waitForFunction(() => Array.isArray((window as unknown as { __STEPS?: unknown[] }).__STEPS));
    return await page.evaluate(() => {
      const w = window as unknown as {
        __CH: { id: string; t: string; j: string; r: string; part: string; steps: unknown[] }[];
        __STEPS: { ci: number; si: number; st: { c: string; s: string; f: string; hl?: string } }[];
      };
      return {
        chapters: w.__CH.map((c) => ({ id: c.id, t: c.t, j: c.j, r: c.r, part: c.part, n: c.steps.length })),
        steps: w.__STEPS.map((S) => ({ ci: S.ci, si: S.si, c: S.st.c, s: S.st.s, f: S.st.f, hl: S.st.hl ?? null })),
      };
    });
  } finally {
    await browser.close();
  }
}

export function buildUx(chapters: RawChapter[], steps: RawStep[]): UxEntry[] {
  return steps.map((S, index) => {
    const ch = chapters[S.ci]!;
    const id = `UX-${pad2(S.ci + 1)}-${pad2(S.si + 1)}`;
    const entry: UxEntry = {
      id,
      index,
      chapter: S.ci + 1,
      step: S.si + 1,
      anchor: `${ch.id}-${S.si + 1}`,
      title: ch.t,
      part: ch.part,
      j: ch.j,
      r: ch.r,
      c: S.c,
      s: S.s,
      f: S.f,
      hl: S.hl,
      milestone: CHAPTER_MILESTONE[ch.id] ?? null,
    };
    if (SUPERSEDED[id]) entry.superseded = { decision: SUPERSEDED[id] };
    return entry;
  });
}

export interface GoldenManifest {
  version: string;
  generatedBy: string;
  sources: { ux: string; bp: string };
  counts: { uxChapters: number; uxSteps: number; uxFrames: number; bp: number };
  bp: BpEntry[];
  ux: UxEntry[];
  superseded: { id: string; decision: string }[];
}

export function readManifest(): GoldenManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as GoldenManifest;
}

async function main() {
  const { values } = parseArgs({
    options: { engine: { type: 'string', default: 'electron' }, 'chromium-path': { type: 'string' }, check: { type: 'boolean' } },
  });
  const { chapters, steps } = await readWalkthrough(values.engine as Engine, values['chromium-path']);
  const ux = buildUx(chapters, steps);
  const manifest: GoldenManifest = {
    version: 'spec-v1.0',
    generatedBy: 'scripts/golden-manifest.ts',
    sources: { ux: UX_FILE, bp: BP_FILE },
    counts: { uxChapters: chapters.length, uxSteps: ux.length, uxFrames: ux.length * 2, bp: BP.length },
    bp: BP,
    ux,
    superseded: Object.entries(SUPERSEDED).map(([id, decision]) => ({ id, decision })),
  };
  const text = JSON.stringify(manifest, null, 2) + '\n';
  if (values.check) {
    if (readFileSync(MANIFEST_PATH, 'utf8') !== text) {
      console.error(`${MANIFEST_PATH} is stale: run tsx scripts/golden-manifest.ts`);
      process.exit(1);
    }
    console.log('golden manifest fresh');
    return;
  }
  writeFileSync(MANIFEST_PATH, text);
  console.log(`golden manifest: ${chapters.length} chapters, ${ux.length} UX steps, ${BP.length} BP ids`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
