// Spec: 11-fidelity §11.2.1 (UX and BP families, counts from window.__CH / window.__STEPS), §11.2.7 (superseded steps),
// §11.12 item 8 (which milestone brings which refs to Tier R). Writes golden/manifest.json.
// The UX list is read from the frozen walkthrough in a browser, never typed by hand. The BP list (selector → id) is fixed
// here at freeze for the ids the current milestones need; later milestones add their ids through a CR (M2: CR-0003).
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
  /** §11.2.5 masks by name (caption-buttons: the native min/max/close area, 03-shell-1 §3.2 reserved width 144 × 32). */
  masks?: 'caption-buttons'[];
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
  /**
   * The milestone that first runs this step in Tier R before its chapter's owner completes it (11 §11.12 item 8: "earlier
   * milestones test the steps they can"). Set only by CR (EARLY_STEPS).
   */
  firstTested?: string;
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
    masks: ['caption-buttons'],
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
  {
    id: 'BP-ANAT-TBAR',
    selector: '#win .tbar',
    drawn: true,
    size: { width: null, height: 32 },
    spec: '03-shell-1 §3.2',
    milestone: 'M1',
    masks: ['caption-buttons'],
  },
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

/**
 * CR-0003: the M2 Blueprint refs (11 §11.12 item 8 "BP-MSG-*, BP-COMP-*"). BP-MSG-01…04 are the four `#messages` mini mocks
 * and BP-COMP-01…09 the nine `#compstates` mocks, in the order the Blueprint shows them. Each id names the `.mini` drawing
 * inside its panel (the panel's title, caption, table and source line are notes about the drawing, not the drawing). The
 * minis are drawn in 350px panels, not at the app's size, so no size is fixed here; `milestone` is the milestone whose app
 * can show the state (BP-MSG-02's status line and typing dots, and BP-COMP-03's Stop, need the engine's reply stream, M3).
 */
export const BP_M2: BpEntry[] = [
  {
    id: 'BP-MSG-01',
    selector: '#messages .grid2 > .panel:nth-child(1) > .mini',
    drawn: true,
    size: { width: null, height: null },
    spec: '04 §2–§10',
    milestone: 'M2',
    note: 'Your message (input): a run of two user bubbles with ticks and the 🛠 badge. App: the seeded user bubble with the working badge (foo chat, UX-08-06).',
  },
  {
    id: 'BP-MSG-02',
    selector: '#messages .grid2 > .panel:nth-child(2) > .mini',
    drawn: true,
    size: { width: null, height: null },
    spec: '04 §11–§19',
    milestone: 'M3',
    note: 'foo\'s message (output): the status line "Checking your calendar…", two foo bubbles, the action row and typing dots. The status line and typing dots exist only while the engine streams a reply: capturable from M3.',
  },
  {
    id: 'BP-MSG-03',
    selector: '#messages .grid2 > .panel:nth-child(3) > .mini',
    drawn: true,
    size: { width: null, height: null },
    spec: '04 §12–§13',
    milestone: 'M2',
    note: 'Rich answer (tables, code, sources). App: the seeded rich answer "Goa flights, Sat 12 Dec" (foo chat, UX-08-07).',
  },
  {
    id: 'BP-MSG-04',
    selector: '#messages .grid2 > .panel:nth-child(4) > .mini',
    drawn: true,
    size: { width: null, height: null },
    spec: '04 §15–§19; 05 §5.18, §5.25',
    milestone: 'M2',
    note: 'Around the messages: date chip, handoff line, an unprompted foo bubble with "Why am I getting this?", a voice note. App: the seeded unprompted answer with its why footer (Trips gallery).',
  },
  ...(
    [
      ['BP-COMP-01', 'Rest', 'M2'],
      ['BP-COMP-02', 'Typing', 'M2'],
      ['BP-COMP-03', 'foo is replying (Stop)', 'M3'],
      ['BP-COMP-04', 'Recording', 'M2'],
      ['BP-COMP-05', 'With a photo', 'M2'],
      ['BP-COMP-06', 'Secret caught (paste catcher)', 'M2'],
      ['BP-COMP-07', 'Card waiting above (pending-card strip)', 'M2'],
      ['BP-COMP-08', 'Offline', 'M2'],
      ['BP-COMP-09', 'Not set up', 'M2'],
    ] as const
  ).map(([id, state, milestone], i): BpEntry => ({
    id,
    selector: `#compstates > .panel:nth-child(${i + 1}) > .mini`,
    drawn: true,
    size: { width: null, height: null },
    spec: '04-2 §20–§23',
    milestone,
    note:
      milestone === 'M2'
        ? `Composer: ${state}. App: the composer bar (\`composer\`) in that state.`
        : `Composer: ${state}. The round button is Stop only while the engine streams a reply: capturable from M3.`,
  })),
];

/**
 * CR-0008: the M4 card refs (00-common "Proposed Blueprint ids"): the `.mini` of the card gallery panels the M4 cards draw —
 * Checklist (2), Plan (12), Proof (15), Stuck (18), Error (19), Spend cap (20). The minis are drawn in 350px panels, so the R2
 * boxes are disputed by construction (CR-0003 §b); no size is fixed here.
 */
export const BP_M4: BpEntry[] = (
  [
    ['BP-CARD-02', 2, 'Checklist', '05-1 §5.2'],
    ['BP-CARD-12', 12, 'Plan', '05-3 §5.12'],
    ['BP-CARD-15', 15, 'Proof', '05-3 §5.15–§5.16'],
    ['BP-CARD-18', 18, 'Stuck', '05-3 §5.19'],
    ['BP-CARD-19', 19, 'Error', '05-3 §5.20'],
    ['BP-CARD-20', 20, 'Spend cap', '05-3 §5.21'],
  ] as const
).map(([id, n, name, spec]): BpEntry => ({
  id,
  selector: `#cardgal > .panel:nth-child(${n}) > .mini`,
  drawn: true,
  size: { width: null, height: null },
  spec,
  milestone: 'M4',
  note: `Card gallery: ${name}. App: the ${name.toLowerCase()} card in the thread, from seeded card rows.`,
}));

/**
 * CR-0013: the M9 refs (00-common "Proposed Blueprint ids"): card gallery Sign in here (10) and Handoff (17), screen gallery
 * Watch live (13) and Sign-in window (14). Card minis are drawn in 350px panels (R2 disputed by construction, CR-0003 §b);
 * the Sign-in window panel is checked against X-66 (real Edge + docked banner) before it is blessed.
 */
export const BP_M9: BpEntry[] = [
  ...(
    [
      ['BP-CARD-10', 10, 'Sign in here', '05-3 §5.10'],
      ['BP-CARD-17', 17, 'Handoff', '05-3 §5.18'],
    ] as const
  ).map(([id, n, name, spec]): BpEntry => ({
    id,
    selector: `#cardgal > .panel:nth-child(${n}) > .mini`,
    drawn: true,
    size: { width: null, height: null },
    spec,
    milestone: 'M9',
    note: `Card gallery: ${name}. App: the ${name.toLowerCase()} card in the thread, from seeded card rows.`,
  })),
  ...(
    [
      ['BP-SCR-13', 13, 'Watch live', '06-3 §11.1–§11.2', 'the live window (live.html) with masked frames'],
      ['BP-SCR-14', 14, 'Sign-in window', '06-3 §11.3', 'the docked sign-in banner over Edge (X-66)'],
    ] as const
  ).map(([id, n, name, spec, app]): BpEntry => ({
    id,
    selector: `#scrgal > .scr:nth-child(${n}) > .body`,
    drawn: true,
    size: { width: null, height: null },
    spec,
    milestone: 'M9',
    note: `Screen gallery: ${name}. App: ${app}.`,
  })),
];

/**
 * CR-0003: UX steps an earlier milestone runs before the chapter's owner (11 §11.12 M2 "UX-09 steps not needing
 * transcription"). UX-09-01 (the recording bar) and UX-09-08 (Windows blocks the microphone) need no speech-to-text; the
 * other UX-09 steps show transcripts or foo's voice replies (M11).
 */
export const EARLY_STEPS: Record<string, string> = {
  'UX-09-01': 'M2',
  'UX-09-08': 'M2',
  // CR-0008 (G-PREP-02): the UX-23 steps the M4 job runner shows with fakes (offline strip, typed text kept, the error that edits
  // itself, AI not answering, plan limit, stuck with cost, recovery card, one line one button) and the UX-05 job steps (👀, the
  // checklist within 2 s, the result with its Proof chip) sent as a typed request. UX-23-07/-08 are M10, UX-23-10 is M11.
  ...Object.fromEntries(['01', '02', '03', '04', '05', '06', '09', '11'].map((s) => [`UX-23-${s}`, 'M4'])),
  ...Object.fromEntries(['02', '03', '04'].map((s) => [`UX-05-${s}`, 'M4'])),
  // CR-0013 (G-M9-03): the 7-day replay is 06-3 §13 Replay mode in the attachment viewer (X-128), built by M13.
  'UX-15-10': 'M13',
};

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
  'UX-15-02': 'X-95 (no in-panel live view; Watch live opens live.html, CR-0013 G-M9-02)',
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
    if (EARLY_STEPS[id]) entry.firstTested = EARLY_STEPS[id];
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
    counts: {
      uxChapters: chapters.length,
      uxSteps: ux.length,
      uxFrames: ux.length * 2,
      bp: BP.length + BP_M2.length + BP_M4.length + BP_M9.length,
    },
    bp: [...BP, ...BP_M2, ...BP_M4, ...BP_M9],
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
  console.log(
    `golden manifest: ${chapters.length} chapters, ${ux.length} UX steps, ${BP.length + BP_M2.length + BP_M4.length + BP_M9.length} BP ids`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
