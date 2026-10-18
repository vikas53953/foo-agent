// Spec: 08-4 §26.2 (the engine builds jobs.title, ≤ 40 chars; the AI's title is only a hint; item 0 the show-before step on
// every plan and replan, X-131; items 1–4), §26.1 (slot rule), 07-2 §4 + AT-120 + CR-0008 G-M4-01 (a retry is a new job titled
// "Trying again: {title}"). Titles are stored data the engine builds from the phrase catalogue, not UI copy keys.
import { phraseText, resolvePhrase, SLOT_RE, type PhraseKey } from '../../shared/phrases';
import type { PlanStep } from '../../shared/schemas';

export const TITLE_MAX = 40;
export const PLAN_MAX = 12;

/** Acting keys that get a show-before step, with the -ing form for its `acting` slot (item 0). */
const ACTING: Record<string, string> = {
  book: 'booking',
  pay: 'paying',
  send: 'sending',
  post: 'posting',
  buy: 'buying',
  book_calendar: 'booking',
};
const DO_TITLE_KEYS: readonly string[] = ['book_calendar', 'book', 'pay', 'send', 'draft', 'make_file', 'add_calendar'];
const READ_TITLE_KEYS: readonly string[] = [
  'look_for',
  'compare',
  'check_sites',
  'check_site',
  'read_app',
  'read_email',
  'check_calendar',
  'look_web',
];

/** Item 4: longer than 40 chars → cut at the last space before char 39 and add "…". */
export function cutTitle(text: string): string {
  const t = text.trim();
  if (t.length <= TITLE_MAX) return t;
  const head = t.slice(0, TITLE_MAX - 1);
  const space = head.lastIndexOf(' ');
  return `${(space > 0 ? head.slice(0, space) : head).trimEnd()}…`;
}

/** Item 0: the show-before step before the first acting step (once); a plan over 12 steps drops its last non-acting step. */
export function insertShowBefore(plan: readonly PlanStep[]): PlanStep[] {
  const out = [...plan];
  const at = out.findIndex((s) => s.phraseKey in ACTING);
  if (at === -1 || out.slice(0, at).some((s) => s.phraseKey === 'show_before')) return out;
  const acting = out[at]!;
  out.splice(at, 0, { phraseKey: 'show_before', slots: { acting: ACTING[acting.phraseKey]! }, route: acting.route });
  while (out.length > PLAN_MAX) {
    let drop = -1;
    for (let i = out.length - 1; i >= 0; i--)
      if (!(out[i]!.phraseKey in ACTING) && out[i]!.phraseKey !== 'show_before') {
        drop = i;
        break;
      }
    if (drop === -1) break;
    out.splice(drop, 1);
  }
  return out;
}

function runningOf(plan: readonly PlanStep[], keys: readonly string[], isBanned: (t: string) => boolean): string | null {
  const s = plan.find((p) => keys.includes(p.phraseKey));
  if (!s) return null;
  const r = resolvePhrase(s.phraseKey, s.slots, { isBanned });
  return phraseText(r.key as PhraseKey, 'running', r.slots);
}

/** Items 1–4. */
export function buildTitle(o: {
  intent: 'do' | 'read_only';
  plan: readonly PlanStep[];
  hint: string;
  isBanned: (text: string) => boolean;
}): string {
  const fromPlan = runningOf(o.plan, o.intent === 'do' ? DO_TITLE_KEYS : READ_TITLE_KEYS, o.isBanned);
  if (fromPlan) return cutTitle(fromPlan);
  const hint = o.hint.trim();
  if (hint && SLOT_RE.test(hint) && !o.isBanned(hint)) return cutTitle(hint);
  return phraseText('generic_working', 'running')!;
}

/** AT-120 / G-M4-01. */
export function retryTitle(title: string): string {
  return cutTitle(`Trying again: ${title}`);
}
