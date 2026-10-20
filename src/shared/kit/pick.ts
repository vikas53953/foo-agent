// Spec: 04 §13.5 (ListPick and TimePick actions go renderer → main `kit:action` → engine `kit.action`), 05-1 §5.3.4 (a
// ListPick answer counts like a Choice card answer: a tap, Enter or 1–9 on a row, or a keycap reaction on foo's message),
// CR-0022 §(c) (ListPick rows ≤ 10, TimePick date + slots), AT-349, AT-350, X-180. R1 T3.
// Shared by the renderer (draws the pick), main (turns a reaction into the same action) and the engine (the user's words).
import type { KitComponent } from './catalog';
import { resolveContext, type Surface } from './surface';

type ListPick = Extract<KitComponent, { component: 'ListPick' }>;
type TimePick = Extract<KitComponent, { component: 'TimePick' }>;

/** 1️⃣–9️⃣ then 🔟 (the variation selector is stripped first): row n of a ListPick. */
const KEYCAPS = ['1⃣', '2⃣', '3⃣', '4⃣', '5⃣', '6⃣', '7⃣', '8⃣', '9⃣', '🔟'];

/** The row a reaction picks (1-based), or null when the emoji is not a keycap. */
export function keycapRow(emoji: string): number | null {
  const n = KEYCAPS.indexOf(emoji.replace(/️/gu, '')) + 1;
  return n > 0 ? n : null;
}

/** The pick's own context, beside the context the AI gave the action: what was picked, and which row (ListPick). */
export interface PickContext {
  choice: string;
  row?: number;
  date?: string;
}

/** The context a pick sends: the action's resolved context with the pick on top (the pick wins a clash of names). */
export function pickContext(c: ListPick | TimePick, data: unknown, scope: string, pick: PickContext): Record<string, unknown> {
  return { ...resolveContext(c.action.event.context, data, scope), ...pick };
}

/** The choices a pick component offers, in order. */
export function choicesOf(c: KitComponent): string[] | null {
  if (c.component === 'ListPick') return c.rows.map((r) => r.title);
  if (c.component === 'TimePick') return c.slots;
  return null;
}

/**
 * The user's words for a pick ("Kothrud branch", "11:15"): the context's `choice` when it is one the component really
 * offers, else null (a forged choice never becomes the user's words).
 */
export function pickWords(s: Surface, sourceId: string, context: Record<string, unknown>): string | null {
  const c = s.components[sourceId];
  const choices = c ? choicesOf(c) : null;
  const choice = context.choice;
  return choices && typeof choice === 'string' && choices.includes(choice) ? choice : null;
}

/** The ListPick a reaction on foo's message answers: the first one the message's surfaces draw (05-1 §5.3.4). */
export function reactionListPick(surfaces: readonly Surface[]): { surface: Surface; pick: ListPick } | null {
  for (const surface of surfaces) {
    if (surface.deleted) continue;
    for (const c of Object.values(surface.components)) if (c.component === 'ListPick') return { surface, pick: c };
  }
  return null;
}
