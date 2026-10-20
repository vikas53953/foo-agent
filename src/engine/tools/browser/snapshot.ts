// Spec: 08-2 §8.3.4 (`browser.snapshot`: ≤ 300 interactive elements and ≤ 8,000 chars of visible text, one line per element
// `[{ref}] {role} "{accessible name}" {value-or-state}`, refs are `data-foo-ref`; masked fields read [hidden] at source; then the
// Redactor runs (§11.4 R5); text wrapped as untrusted (§7.2 part 9, 08-4 §24.14); cross-origin iframes included by routing each
// ref to the frame that owns it; after the first snapshot in a step only a diff (changed / unchanged refs) is sent; a masked
// screenshot is added only when the tree has < 5 interactive elements or a canvas fills the main area), §8.3.3 (no snapshot
// while a sign-in page is in front: the CaptureGuard), §8.2 `browser.snapshot { scope?: "page" | "form" }`.
// The element list comes from the page walker alone (walker.ts: DOM roles, accessible names, open shadow roots, every frame);
// Playwright's AI snapshot is not merged in because it prints field values before any masking (see implementation-notes).
import type { Frame, Page } from 'playwright-core';
import { PromptBuilder } from '../../prompt/PromptBuilder';
import { walkerCall, type WalkResult, type WalkedElement } from './walker';

export const MAX_ELEMENTS = 300;
export const MAX_TEXT_CHARS = 8_000;
export const FEW_ELEMENTS = 5;

export interface SnapElement extends WalkedElement {
  frame: string;
}
export interface Snapshot {
  url: string;
  title: string;
  elements: SnapElement[];
  text: string;
  interactive: number;
  canvasFillsMain: boolean;
  noCapture: boolean;
}

export function formatLine(e: Pick<WalkedElement, 'ref' | 'role' | 'name' | 'value'>): string {
  return `[${e.ref}] ${e.role} "${e.name.replace(/"/g, "'")}"${e.value ? ` ${e.value}` : ''}`;
}

/** §8.3.4: a masked screenshot is added only for a thin tree or a canvas page (seat and berth maps). */
export function needsScreenshot(s: Pick<Snapshot, 'interactive' | 'canvasFillsMain'>): boolean {
  return s.interactive < FEW_ELEMENTS || s.canvasFillsMain;
}

/** Which frame owns which ref prefix: the main frame has none, child frames `f1`, `f2`… for the life of the page. */
export class RefRouter {
  private readonly prefixes = new WeakMap<Page, Map<Frame, string>>();
  private readonly counters = new WeakMap<Page, number>();

  prefixOf(page: Page, frame: Frame): string {
    if (frame === page.mainFrame()) return '';
    let m = this.prefixes.get(page);
    if (!m) this.prefixes.set(page, (m = new Map()));
    let p = m.get(frame);
    if (p === undefined) {
      const n = (this.counters.get(page) ?? 0) + 1;
      this.counters.set(page, n);
      p = `f${n}`;
      m.set(frame, p);
    }
    return p;
  }

  /** The frame that owns `ref`, or null when the ref is malformed or its frame is gone. */
  frameOf(page: Page, ref: string): Frame | null {
    const m = /^(f\d+)?e\d+$/.exec(ref);
    if (!m) return null;
    if (!m[1]) return page.mainFrame();
    for (const [f, p] of this.prefixes.get(page) ?? []) if (p === m[1] && !f.isDetached()) return f;
    return null;
  }
}

/** Walks every frame of the page, main frame first, sharing the 300-element and 8,000-char budgets. */
export async function takeSnapshot(page: Page, router: RefRouter): Promise<Snapshot> {
  const elements: SnapElement[] = [];
  const texts: string[] = [];
  let textLeft = MAX_TEXT_CHARS;
  let interactive = 0;
  let canvas = false;
  let noCapture = false;
  const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];
  for (const frame of frames) {
    if (frame.isDetached()) continue;
    const prefix = router.prefixOf(page, frame);
    let r: WalkResult | null;
    try {
      r = (await frame.evaluate(
        walkerCall({ cmd: 'walk', prefix, maxElements: Math.max(0, MAX_ELEMENTS - elements.length), maxText: Math.max(0, textLeft) }),
      )) as WalkResult;
    } catch {
      r = null;
    }
    if (!r) continue;
    elements.push(...r.elements.map((e) => ({ ...e, frame: prefix })));
    if (r.text) {
      const t = r.text.slice(0, textLeft);
      texts.push(t);
      textLeft -= t.length + 1;
    }
    interactive += r.interactive;
    canvas ||= r.canvasFillsMain;
    noCapture ||= r.noCapture;
  }
  return {
    url: page.url(),
    title: await page.title().catch(() => ''),
    elements: elements.slice(0, MAX_ELEMENTS),
    text: texts.join('\n').slice(0, MAX_TEXT_CHARS),
    interactive,
    canvasFillsMain: canvas,
    noCapture,
  };
}

export type SnapshotView = { mode: 'full'; lines: string[] } | { mode: 'diff'; changed: string[]; removed: string[]; unchanged: number };

/** §8.3.4: the first snapshot in a step (or on a new address) is sent whole; later ones as a diff by ref. */
export class SnapshotDiffer {
  private readonly prev = new Map<string, { url: string; lines: Map<string, string> }>();

  /** Called when a step starts (the runner) and when the job ends. */
  reset(jobId: string): void {
    this.prev.delete(jobId);
  }

  view(jobId: string, s: Pick<Snapshot, 'url' | 'elements'>): SnapshotView {
    const lines = new Map(s.elements.map((e) => [e.ref, formatLine(e)]));
    const before = this.prev.get(jobId);
    this.prev.set(jobId, { url: s.url, lines });
    if (!before || before.url !== s.url) return { mode: 'full', lines: [...lines.values()] };
    const changed = [...lines].filter(([ref, l]) => before.lines.get(ref) !== l).map(([, l]) => l);
    const removed = [...before.lines.keys()].filter((ref) => !lines.has(ref));
    return { mode: 'diff', changed, removed, unchanged: lines.size - changed.length };
  }
}

/**
 * The text the AI reads (R5): element lines (or the diff) and the visible text, through the engine Redactor, wrapped untrusted.
 * `scope: 'form'` keeps only the elements inside forms and drops the page text.
 */
export function snapshotText(
  s: Snapshot,
  view: SnapshotView,
  o: { scrub(text: string): string; ref: string; scope?: 'page' | 'form' },
): string {
  const keep = o.scope === 'form' ? new Set(s.elements.filter((e) => e.facts.inForm).map((e) => e.ref)) : null;
  const pick = (lines: string[]) => (keep ? lines.filter((l) => keep.has(/^\[([^\]]+)\]/.exec(l)?.[1] ?? '')) : lines);
  const head = [`Page: ${s.title}`, `Address: ${s.url}`];
  const body =
    view.mode === 'full'
      ? ['Controls:', ...pick(view.lines)]
      : [
          `Changed controls (${view.unchanged} unchanged):`,
          ...pick(view.changed),
          ...(view.removed.length ? [`Gone: ${view.removed.join(', ')}`] : []),
        ];
  const text = keep ? [] : ['Text:', s.text];
  return PromptBuilder.untrusted('web', o.ref, o.scrub([...head, ...body, ...text].join('\n')));
}
