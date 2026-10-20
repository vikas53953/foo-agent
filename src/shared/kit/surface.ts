// Spec: 04 §13.5 (a kit surface: A2UI v0.9.1 `createSurface` / `updateComponents` / `updateDataModel` / `deleteSurface`;
// bound values `{ "path": "/x" }` resolve into the surface's data model and are re-checked with the field's own schema; a
// value that fails is dropped like an invalid component), CR-0022 AT-353, AT-355 (a later reply updates the surface a
// Button action came from: A2UI surfaces live across server messages, so a later ```a2ui block that names the same
// surfaceId without `createSurface` updates the earlier surface), X-180. Pure, shared by the renderer (drawing), main
// (`kit:action` checks the surface exists) and the engine (the words of a tapped Button). R1 T2.
import { z } from 'zod';
import { FOO_PARTS, STANDARD_PARTS, type KitComponent, type KitComponentName, type KitMessage } from './catalog';
import { parseKitBlock } from './parse';

/** The same fence rule as the bubble's markdown parser (renderer/messages/markdownParse.ts `FENCE`). */
const FENCE = /^\s*```\s*([\w+#.-]*)\s*$/;
const CLOSE = /^\s*```\s*$/;

/** The ```a2ui fences of one foo message text, in order. */
export function kitFences(text: string): { body: string; closed: boolean }[] {
  const out: { body: string; closed: boolean }[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE.exec(lines[i]!);
    if (!m) continue;
    const body: string[] = [];
    i++;
    while (i < lines.length && !CLOSE.test(lines[i]!)) body.push(lines[i++]!);
    if ((m[1] ?? '').toLowerCase() === 'a2ui') out.push({ body: body.join('\n'), closed: i < lines.length });
  }
  return out;
}

/** Every checked message of a whole message text (all its ```a2ui fences), the way the bubble draws them. */
export function kitMessagesOf(text: string, streaming = false): { messages: KitMessage[]; dropped: number } {
  const messages: KitMessage[] = [];
  let dropped = 0;
  for (const f of kitFences(text)) {
    const p = parseKitBlock(f.body, streaming);
    messages.push(...p.messages);
    dropped += p.dropped;
  }
  return { messages, dropped };
}

export const surfaceOf = (m: KitMessage): string =>
  'createSurface' in m
    ? m.createSurface.surfaceId
    : 'updateComponents' in m
      ? m.updateComponents.surfaceId
      : 'updateDataModel' in m
        ? m.updateDataModel.surfaceId
        : m.deleteSurface.surfaceId;

export interface Surface {
  id: string;
  components: Record<string, KitComponent>;
  data: unknown;
  deleted: boolean;
}

export const emptySurface = (id: string): Surface => ({ id, components: {}, data: {}, deleted: false });

// ---- JSON Pointer (RFC 6901), the A2UI data-binding path ----

const tokens = (path: string): string[] | null => {
  if (path === '' || path === '/') return [];
  if (!path.startsWith('/')) return null;
  return path
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
};

const UNSAFE = new Set(['__proto__', 'prototype', 'constructor']);

export function getPath(data: unknown, path: string): unknown {
  const parts = tokens(path);
  if (!parts) return undefined;
  let cur: unknown = data;
  for (const k of parts) {
    if (cur === null || typeof cur !== 'object' || UNSAFE.has(k)) return undefined;
    cur = Object.prototype.hasOwnProperty.call(cur, k) ? (cur as Record<string, unknown>)[k] : undefined;
  }
  return cur;
}

/** A copy of `data` with `value` at `path` (a missing `value` removes the key). Containers on the way are created. */
export function setPath(data: unknown, path: string, value: unknown): unknown {
  const parts = tokens(path);
  if (!parts) return data;
  if (parts.length === 0) return value === undefined ? {} : value;
  if (parts.some((k) => UNSAFE.has(k))) return data;
  const root: unknown = Array.isArray(data) ? [...(data as unknown[])] : data && typeof data === 'object' ? { ...data } : {};
  let cur = root as Record<string, unknown>;
  parts.forEach((k, i) => {
    if (i === parts.length - 1) {
      if (value === undefined) delete cur[k];
      else cur[k] = value;
      return;
    }
    const next = cur[k];
    const copy: unknown = Array.isArray(next) ? [...(next as unknown[])] : next && typeof next === 'object' ? { ...next } : {};
    cur[k] = copy;
    cur = copy as Record<string, unknown>;
  });
  return root;
}

/** Applies one message to a surface (a copy). `createSurface` starts it over (A2UI: the id names a new surface). */
export function applyMessage(s: Surface, m: KitMessage): Surface {
  if ('createSurface' in m) return emptySurface(s.id);
  if ('deleteSurface' in m) return { ...s, deleted: true };
  if ('updateComponents' in m) {
    const components = { ...s.components };
    for (const c of m.updateComponents.components) components[c.id] = c;
    return { ...s, components };
  }
  return { ...s, data: setPath(s.data, m.updateDataModel.path ?? '/', m.updateDataModel.value) };
}

// ---- bound values: re-checked with the field's own schema after they resolve (catalog.ts `bound()`) ----

const PARTS = new Map<string, z.ZodObject>(
  [...STANDARD_PARTS, ...FOO_PARTS].map((p) => [p.shape.component.value, p as unknown as z.ZodObject]),
);

/** The literal schema of a `bound(t)` field (`t`), or the field's own schema when it is not bound. */
function literalSchema(component: KitComponentName, field: string): z.ZodType | null {
  let s = PARTS.get(component)?.shape[field] as z.ZodType | undefined;
  if (!s) return null;
  if (s instanceof z.ZodOptional) s = s.unwrap() as z.ZodType;
  if (s instanceof z.ZodUnion) {
    const [lit, path] = s.options as readonly z.ZodType[];
    if (path instanceof z.ZodObject && 'path' in path.shape && lit) return lit;
  }
  return s;
}

export const INVALID = Symbol('invalid');
export type Resolved<T> = T | typeof INVALID;

/** A2UI template children: a path without a leading `/` is relative to the list item it is drawn for (`/items/2`). */
export const absPath = (path: string, scope: string): string => (path.startsWith('/') ? path : `${scope}/${path}`);

const isPathRef = (v: unknown): v is { path: string } =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof (v as { path?: unknown }).path === 'string';

/**
 * A field's value: a literal as the catalog already checked it, or the data-model value at its path re-checked with the
 * field's schema. A missing path or a value that fails gives INVALID (the component is dropped, 04 §13.5).
 */
export function resolveField<T>(c: KitComponent, field: string, data: unknown, scope = ''): Resolved<T> {
  const raw = (c as unknown as Record<string, unknown>)[field];
  if (!isPathRef(raw)) return raw as T;
  const schema = literalSchema(c.component, field);
  const ok = schema?.safeParse(getPath(data, absPath(raw.path, scope)));
  return ok?.success ? (ok.data as T) : INVALID;
}

/** The path a two-way control writes to, or null when its value is a literal (A2UI: literals are read-only). */
export const boundPath = (c: KitComponent, field: string, scope = ''): string | null => {
  const raw = (c as unknown as Record<string, unknown>)[field];
  return isPathRef(raw) ? absPath(raw.path, scope) : null;
};

/** A2UI action context values may bind too: `{ "path": "/x" }` resolves into the data model when the action is sent. */
export function resolveContext(context: Record<string, unknown> | undefined, data: unknown, scope = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context ?? {})) out[k] = isPathRef(v) ? (getPath(data, absPath(v.path, scope)) ?? null) : v;
  return out;
}

/** The words a Button shows: its child Text (directly, or inside a Row / Column), resolved against the data model. */
export function buttonWords(s: Surface, buttonId: string): string | null {
  const b = s.components[buttonId];
  if (!b || b.component !== 'Button') return null;
  const seen = new Set<string>();
  const walk = (id: string): string[] => {
    const c = s.components[id];
    if (!c || seen.has(id)) return [];
    seen.add(id);
    if (c.component === 'Text') {
      const v = resolveField<string>(c, 'text', s.data);
      return v === INVALID ? [] : [v];
    }
    if ((c.component === 'Row' || c.component === 'Column') && Array.isArray(c.children)) return c.children.flatMap(walk);
    return [];
  };
  const words = walk(b.child).join(' ').trim();
  return words || null;
}

/**
 * The surfaces one ```a2ui fence draws: those it creates, with the messages of every later fence in the chat for the same
 * surfaceId applied in order, until a later fence creates that surfaceId again (the newer one draws from then on). A
 * message for a surface no fence so far created is dropped (caption); one for a surface an earlier fence created is
 * drawn there, not here. `fences` holds every fence of the chat's foo messages in chat order; `at` is this fence.
 */
export function foldFence(fences: readonly (readonly KitMessage[])[], at: number): { surfaces: Surface[]; dropped: number } {
  const mine = fences[at] ?? [];
  const order: string[] = [];
  const byId = new Map<string, Surface>();
  let dropped = 0;
  const createdBefore = (id: string) => fences.slice(0, at).some((f) => f.some((m) => 'createSurface' in m && surfaceOf(m) === id));
  for (const m of mine) {
    const id = surfaceOf(m);
    if ('createSurface' in m) {
      if (!byId.has(id)) order.push(id);
      byId.set(id, applyMessage(emptySurface(id), m));
      continue;
    }
    const s = byId.get(id);
    if (s) byId.set(id, applyMessage(s, m));
    else if (!createdBefore(id)) dropped++;
  }
  for (const id of order) {
    let s = byId.get(id)!;
    later: for (const f of fences.slice(at + 1)) {
      for (const m of f) {
        if (surfaceOf(m) !== id) continue;
        if ('createSurface' in m) break later;
        s = applyMessage(s, m);
      }
    }
    byId.set(id, s);
  }
  return { surfaces: order.map((id) => byId.get(id)!).filter((s) => !s.deleted), dropped };
}
