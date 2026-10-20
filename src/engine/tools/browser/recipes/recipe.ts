// Spec: 08-2 §8.3.11 (site recipes [X-46]: `site_recipes(domain, goal, url_pattern, steps_json /* [{instruction, role, name,
// fallbackSelector, variableName?}] */, success_count, last_ok_at, last_fail_at)`; saved after a job reaches DONE with proof;
// replay: each step runs only when the element matches by role + name on a matching URL, and the AI confirms each step in a
// light step turn; a miss → normal snapshot and AI choice, then the recipe updates; only variable names are stored, never
// values (names, dates, card data); commit steps (§8.2.1) are never replayed: the final pay, book or send click always goes
// through `browser.submit` with this job's own approval), AT-144, 08-1 §4.3.13 (`site_recipes`, UNIQUE (domain, goal)).
// The replay hint is the "light step turn": the step turn carries each saved step only where the engine found the same role
// and name on the page now, with the element's ref of this page; the AI still picks every act, so nothing runs unconfirmed.
import { classify } from '../clickClassifier';
import type { SnapElement } from '../snapshot';

/** What the AI did on the page, by element role and name; `variableName` is the field's name as a slot, never what was typed. */
export interface RecipeStep {
  instruction: 'click' | 'type' | 'select' | 'check';
  role: string;
  name: string;
  fallbackSelector: string;
  variableName?: string;
}

export interface RecipeDraft {
  urlPattern: string;
  steps: RecipeStep[];
}

const ACTED: Record<string, RecipeStep['instruction']> = {
  'browser.click': 'click',
  'browser.type': 'type',
  'browser.select': 'select',
  'browser.check': 'check',
};

/** The page address without query or fragment: the query carries this job's values (party size, dates). */
export function urlPattern(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? `${u.origin}${u.pathname}` : null;
  } catch {
    return null;
  }
}

/** "Party size" → "party_size": the slot a later job fills with its own value. */
export function variableNameOf(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '_')
      .replace(/^_+|_+$/gu, '')
      .slice(0, 40) || 'value'
  );
}

/** Per job: the last snapshot's elements and the steps acted on them (successful ones only). */
export class RecipeRecorder {
  private readonly seenEls = new Map<string, { url: string; byRef: Map<string, SnapElement> }>();
  private readonly acted = new Map<string, { pattern: string; steps: RecipeStep[] }>();

  seen(jobId: string, url: string, elements: readonly SnapElement[]): void {
    this.seenEls.set(jobId, { url, byRef: new Map(elements.map((e) => [e.ref, e])) });
  }

  /** After a click, type, select or check succeeded on `ref`. A commit control is never written down. */
  act(jobId: string, tool: string, ref: string): void {
    const instruction = ACTED[tool];
    const s = this.seenEls.get(jobId);
    const e = s?.byRef.get(ref);
    if (!instruction || !s || !e || e.masked || classify(e.facts) === 'commit') return;
    const pattern = urlPattern(s.url);
    if (!pattern) return;
    const log = this.acted.get(jobId) ?? { pattern, steps: [] };
    log.steps.push({
      instruction,
      role: e.role,
      name: e.name,
      fallbackSelector: `${e.facts.tag}${e.facts.type ? `[type="${e.facts.type}"]` : ''}`,
      ...(instruction === 'type' || instruction === 'select' ? { variableName: variableNameOf(e.name) } : {}),
    });
    this.acted.set(jobId, log);
  }

  draft(jobId: string): RecipeDraft | null {
    const a = this.acted.get(jobId);
    return a?.steps.length ? { urlPattern: a.pattern, steps: a.steps } : null;
  }

  /** The saved steps that match by role + name on a matching page now, with this page's refs (08-2 §8.3.11 replay). */
  match(jobId: string, recipe: { urlPattern: string; steps: readonly RecipeStep[] }): { step: RecipeStep; ref: string }[] {
    const s = this.seenEls.get(jobId);
    if (!s || urlPattern(s.url) !== recipe.urlPattern) return [];
    const out: { step: RecipeStep; ref: string }[] = [];
    for (const step of recipe.steps) {
      const e = [...s.byRef.values()].find((x) => x.role === step.role && x.name === step.name);
      // A commit control is never replayed, even if a saved step somehow names one.
      if (e && !e.masked && classify(e.facts) !== 'commit') out.push({ step, ref: e.ref });
    }
    return out;
  }

  forget(jobId: string): void {
    this.seenEls.delete(jobId);
    this.acted.delete(jobId);
  }
}

/** The step turn's lines for the matched steps (the AI confirms each by choosing it; a missing step is left to the AI). */
export function replayLines(matched: readonly { step: RecipeStep; ref: string }[]): string[] {
  if (!matched.length) return [];
  return [
    'Saved steps for this site (each matched on this page by role and name; check each before you act; the final book or pay is always request_approval):',
    ...matched.map(
      ({ step, ref }, i) =>
        `${i + 1}. ${step.instruction} [${ref}] ${step.role} "${step.name.replace(/"/g, "'")}"${step.variableName ? ` with this job's ${step.variableName}` : ''}`,
    ),
  ];
}

/** Steps as stored: only the known keys, so no value can ride along. */
export function stepsJson(steps: readonly RecipeStep[]): RecipeStep[] {
  return steps.map((s) => ({
    instruction: s.instruction,
    role: s.role,
    name: s.name,
    fallbackSelector: s.fallbackSelector,
    ...(s.variableName ? { variableName: s.variableName } : {}),
  }));
}
