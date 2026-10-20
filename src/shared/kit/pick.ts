// Spec: 04 §13.5 (ListPick and TimePick actions go renderer → main `kit:action` → engine `kit.action`), 05-1 §5.3.4 (a
// ListPick answer counts like a Choice card answer: a tap, Enter or 1–9 on a row, or a keycap reaction on foo's message),
// CR-0022 §(c) (ListPick rows ≤ 10, TimePick date + slots), AT-349, AT-350, X-180. R1 T3.
// Shared by the renderer (draws the pick), main (turns a reaction into the same action) and the engine (the user's words).
// A pick stays answered like a Choice card (05-1 §5.3.5): the user message a pick makes carries, in its AI text, the line
// `actionLine` writes; `kitPickOf` reads it back (MessageRow.kitPick), and `answeredChoice` finds the answer in the chat.
import type { KitActionMessage, KitComponent } from './catalog';
import { foldFence, kitMessagesOf, resolveContext, type Surface } from './surface';

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

/**
 * The context a pick sends: the pick first (so `choice` opens the context line and survives its cut), then the action's
 * resolved context; the pick wins a clash of names.
 */
export function pickContext(c: ListPick | TimePick, data: unknown, scope: string, pick: PickContext): Record<string, unknown> {
  return { ...pick, ...resolveContext(c.action.event.context, data, scope), ...pick };
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
  if (!c || !choices || typeof choice !== 'string' || !choices.includes(choice)) return null;
  // A time reads with its day: "11:15, Thursday 23 Oct".
  return c.component === 'TimePick' ? `${choice}, ${c.date}` : choice;
}

/** True for the components whose action is an answer that can be given once (ListPick, TimePick). */
export const isPick = (c: KitComponent | undefined): c is ListPick | TimePick => c?.component === 'ListPick' || c?.component === 'TimePick';

// ---- the answer, stored in the user message's AI text and read back ----

/** A pick a user message made: which surface and component, and what was picked (MessageRow.kitPick). */
export interface KitPick {
  surfaceId: string;
  componentId: string;
  choice: string;
}

const JSON_STR = '"(?:[^"\\\\]|\\\\.)*"';
const LINE = new RegExp(`^\\(I tapped ".*" in your surface (${JSON_STR}), component (${JSON_STR}): action \\S+, context (.*)$`);
const CHOICE = new RegExp(`^\\{"choice":(${JSON_STR})`);

/** The second line of a tap's AI text (08-4 §24 conversation line); `context` is the JSON, already cut to the budget. */
export function actionLine(words: string, a: KitActionMessage, context: string): string {
  return `(I tapped "${words}" in your surface ${JSON.stringify(a.surfaceId)}, component ${JSON.stringify(a.sourceComponentId)}: action ${a.name}, context ${context}.`;
}

/** The pick a user message's AI text records, or null (a typed message, a Button tap, or a context without a choice). */
export function kitPickOf(textForAi: string | null | undefined): KitPick | null {
  const line = textForAi?.split('\n')[1];
  const m = line ? LINE.exec(line) : null;
  const c = m ? CHOICE.exec(m[3]!) : null;
  if (!m || !c) return null;
  try {
    return { surfaceId: JSON.parse(m[1]!) as string, componentId: JSON.parse(m[2]!) as string, choice: JSON.parse(c[1]!) as string };
  } catch {
    return null;
  }
}

/** A chat message as the answer search reads it. */
export interface PickScanRow {
  authorKind: string;
  text: string;
  kitPick: KitPick | null;
}

/**
 * The choice already given for this pick: the first user message after the host whose kitPick names the same surface and
 * component, before a later foo message creates that surface again (it is a new surface from then on). `after` holds the
 * chat's messages after the host message, in chat order.
 */
export function answeredChoice(after: readonly PickScanRow[], surfaceId: string, componentId: string): string | null {
  for (const m of after) {
    if (m.authorKind === 'user' && m.kitPick?.surfaceId === surfaceId && m.kitPick.componentId === componentId) return m.kitPick.choice;
    if (m.authorKind === 'foo' && m.text.includes('```')) {
      const again = kitMessagesOf(m.text).messages.some((k) => 'createSurface' in k && k.createSurface.surfaceId === surfaceId);
      if (again) return null;
    }
  }
  return null;
}

/** The host message's surfaces with the chat's later foo fences folded in (renderer/kit/model.ts folds the same way). */
export function hostSurfaces(hostText: string, after: readonly PickScanRow[]): Surface[] {
  const fences = [hostText, ...after.filter((m) => m.authorKind === 'foo' && m.text.includes('```')).map((m) => m.text)];
  return foldFence(
    fences.map((t) => kitMessagesOf(t).messages),
    0,
  ).surfaces;
}

/** The ListPick a reaction on foo's message answers: the first one the message's surfaces draw (05-1 §5.3.4). */
export function reactionListPick(surfaces: readonly Surface[]): { surface: Surface; pick: ListPick } | null {
  for (const surface of surfaces) {
    if (surface.deleted) continue;
    for (const c of Object.values(surface.components)) if (c.component === 'ListPick') return { surface, pick: c };
  }
  return null;
}
