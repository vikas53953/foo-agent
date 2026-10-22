// Spec: 04 §13.5 (kit surface streaming: each complete A2UI message renders at once, an incomplete one is held back, the
// same rule as 04 §14.4; an invalid or unknown component is dropped with a quiet "Couldn't show part of this" caption and
// the reply text still shows), 04 §13.6 (AI page: HTML only, ≤ 512 KB), CR-0022 AT-353, AT-354 (parser half), X-180.
// CR-0046 AT-441, X-204: before a component or message counts as invalid, the small slips a real AI makes that leave its
// meaning whole are mended (an unknown key or a null left out, a number written as text or the other way round, an
// over-long label cut with "…"); anything else is still dropped.
// Pure: the bubble gives the body of an ```a2ui or ```page fence and whether the message is still streaming.
import type { z } from 'zod';
import { KIT_BLOCK_MAX_BYTES, KitComponentSchema, KitMessageSchema, type KitComponent, type KitMessage } from './catalog';

export interface KitParse {
  /** Every complete, valid message in order (components already checked one by one). */
  messages: KitMessage[];
  /** Messages or components dropped as invalid or unknown: > 0 shows the "Couldn't show part of this" caption. */
  dropped: number;
  /** A trailing message is still arriving (held back, not counted as dropped while streaming). */
  pending: boolean;
}

/** A line that starts a new A2UI message: the message before it is over, whatever its brackets say (CR-0050). */
const MESSAGE_START = /^[ \t]*\{[ \t]*"(?:createSurface|updateComponents|updateDataModel|deleteSurface)"[ \t]*:[ \t]*\{/;

interface Split {
  objects: string[];
  /** The last object, still open at the end of the body (its brackets as read so far); '' when none. */
  rest: string;
  /** The closers `rest` still needs, innermost first. */
  restClosers: string;
  /** `rest` ends inside a text value, so it cannot be closed. */
  restInString: boolean;
}

/**
 * Splits the body into top-level JSON objects by bracket depth, outside strings. A2UI streams one message per line, but an
 * AI may pretty-print or wrap them in an array, so line breaks, commas and an outer `[ ]` are all accepted.
 * CR-0050: real AIs drop or swap a closing bracket when a component ends in a list (run 30: `}]}}]}` for `}]}]}}`; the map left two out). Inside
 * an object a closer is always read as the one that is due (`]` where `}` is due, and the other way round), and a line that
 * starts a new message ends the one before it. Valid JSON reads the same as before; the result is still checked by zod.
 */
function splitObjects(body: string): Split {
  const objects: string[] = [];
  const due: string[] = [];
  let buf = '';
  let inString = false;
  let escaped = false;
  let junk = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (due.length === 0) {
      // Between messages: only white space, commas, an outer [ ] and a surplus `}` (as before CR-0050) belong here.
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
      } else if (c === '"') {
        junk = true;
        inString = true;
      } else if (c === '{') {
        buf = '{';
        due.push('}');
      } else if (!/[\s,[\]}]/.test(c)) junk = true;
      continue;
    }
    if (inString) {
      buf += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '\n' && MESSAGE_START.test(body.slice(i + 1, i + 120))) {
      objects.push(buf + due.reverse().join(''));
      due.length = 0;
      buf = '';
      continue;
    }
    if (c === '"') inString = true;
    if (c === '{') due.push('}');
    if (c === '[') due.push(']');
    if (c === '}' || c === ']') {
      buf += due.pop()!;
      if (due.length === 0) {
        objects.push(buf);
        buf = '';
      }
      continue;
    }
    buf += c;
  }
  return {
    objects: junk ? [...objects, '<junk>'] : objects,
    rest: due.length > 0 ? buf : '',
    restClosers: [...due].reverse().join(''),
    restInString: inString,
  };
}

/** Words a person reads, so an over-long one can be cut with "…" without changing what the piece does. */
const CUTTABLE = new Set(['label', 'title', 'text', 'sub', 'note', 'why', 'alt']);
/** Keys that name or wire things (ids, input names, formulas, sources, bindings): a number there is never read as text. */
const NOT_WORDS = new Set(['id', 'component', 'child', 'children', 'componentId', 'name', 'formula', 'url', 'path', 'action']);
/** A number written as text: digits, one optional point and sign. "50,00,000" or "8.5%" stays text (and fails). */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
/** Each round mends every issue zod reports; mending can uncover a deeper one, so a few rounds, never a loop. */
const MEND_ROUNDS = 4;

type Obj = Record<string | number, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null;
const own = (o: Obj, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k);

function at(root: unknown, path: readonly PropertyKey[]): unknown {
  let cur = root;
  for (const k of path) {
    if (!isObj(cur) || !own(cur, k)) return undefined;
    cur = cur[k as string];
  }
  return cur;
}

/** Mends one zod issue in place; false when the issue is not one of the CR-0046 slips. */
function mendIssue(root: unknown, issue: z.core.$ZodIssue): boolean {
  // A bound value or child list is a union (catalog.ts `bound()`): mend the first way of reading it that a mend fits.
  if (issue.code === 'invalid_union') {
    return issue.errors.some((branch) => {
      let changed = false;
      for (const inner of branch)
        changed = mendIssue(root, { ...inner, path: [...issue.path, ...inner.path] } as z.core.$ZodIssue) || changed;
      return changed;
    });
  }
  if (issue.code === 'unrecognized_keys') {
    const o = at(root, issue.path);
    if (!isObj(o)) return false;
    for (const k of issue.keys) delete o[k];
    return issue.keys.length > 0;
  }
  const key = issue.path[issue.path.length - 1];
  const parent = at(root, issue.path.slice(0, -1));
  if (key === undefined || !isObj(parent) || !own(parent, key)) return false;
  const v = parent[key as string];
  if (v === null && !Array.isArray(parent)) {
    delete parent[key as string];
    return true;
  }
  const words = !issue.path.some((k) => NOT_WORDS.has(String(k)));
  if (issue.code === 'invalid_type' && issue.expected === 'string' && words && typeof v === 'number' && Number.isFinite(v)) {
    parent[key as string] = String(v);
    return true;
  }
  if (issue.code === 'invalid_type' && issue.expected === 'number' && typeof v === 'string' && PLAIN_NUMBER.test(v)) {
    parent[key as string] = Number(v);
    return true;
  }
  if (issue.code === 'too_big' && issue.origin === 'string' && typeof v === 'string' && CUTTABLE.has(String(key))) {
    // zod counts code points, so the cut does too (an emoji is never split into half a pair).
    parent[key as string] = `${[...v].slice(0, Number(issue.maximum) - 1).join('')}…`;
    return true;
  }
  return false;
}

/** `raw` checked by `schema` after the CR-0046 mends, or null when it is still invalid. `raw` itself is never changed. */
function mended<T>(schema: z.ZodType<T>, raw: unknown): T | null {
  let v: unknown;
  try {
    v = JSON.parse(JSON.stringify(raw)) as unknown;
  } catch {
    return null;
  }
  for (let round = 0; ; round++) {
    const r = schema.safeParse(v);
    if (r.success) return r.data;
    if (round === MEND_ROUNDS) return null;
    let changed = false;
    for (const issue of r.error.issues) changed = mendIssue(v, issue) || changed;
    if (!changed) return null;
  }
}

/** CR-0046: one raw component, checked after the small slips are mended; null when it is still invalid (dropped). */
export function mendComponent(raw: unknown): KitComponent | null {
  return mended(KitComponentSchema, raw);
}

/** The keys each A2UI message may carry (KitMessageSchema); a union reports no per-key issue, so they are kept here. */
const MESSAGE_KEYS: Record<string, readonly string[]> = {
  createSurface: ['surfaceId', 'catalogId'],
  updateComponents: ['surfaceId', 'components'],
  updateDataModel: ['surfaceId', 'path', 'value'],
  deleteSurface: ['surfaceId'],
};

/**
 * CR-0046: a message with an extra key (`type`, a `catalogId` on an update) or a null `version` keeps only its own keys. A
 * `null` inside the message stays (an `updateDataModel` with `path: null` is still refused, never read as the root).
 */
function tidyMessage(json: unknown): unknown {
  if (!isObj(json) || Array.isArray(json)) return json;
  const kinds = Object.keys(MESSAGE_KEYS).filter((k) => own(json, k));
  if (kinds.length !== 1) return json;
  const kind = kinds[0]!;
  const out: Obj = {};
  if (json.version !== undefined && json.version !== null) out.version = json.version;
  const body = json[kind];
  if (!isObj(body) || Array.isArray(body)) return json;
  // createSurface's own extra keys (`theme`, `sendDataModel`) are already ignored by its schema (04 §13.5).
  out[kind] =
    kind === 'createSurface' ? body : Object.fromEntries(MESSAGE_KEYS[kind]!.filter((k) => own(body, k)).map((k) => [k, body[k]]));
  return out;
}

/** One raw object → a checked message, the number of components dropped from it, or null when the message is unusable. */
function checkMessage(raw: string): { msg: KitMessage; dropped: number } | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = KitMessageSchema.safeParse(tidyMessage(json));
  if (!parsed.success) return null;
  const m = parsed.data;
  if ('updateComponents' in m) {
    const components: KitComponent[] = [];
    for (const c of m.updateComponents.components) {
      const ok = mendComponent(c);
      if (ok) components.push(ok);
    }
    const dropped = m.updateComponents.components.length - components.length;
    return { msg: { updateComponents: { surfaceId: m.updateComponents.surfaceId, components } }, dropped };
  }
  if ('createSurface' in m) return { msg: { createSurface: m.createSurface }, dropped: 0 };
  if ('updateDataModel' in m) return { msg: { updateDataModel: m.updateDataModel }, dropped: 0 };
  return { msg: { deleteSurface: m.deleteSurface }, dropped: 0 };
}

/** 04 §13.5: the messages of an ```a2ui block. `streaming` holds an unfinished last message back instead of dropping it. */
export function parseKitBlock(body: string, streaming: boolean): KitParse {
  // Over the block cap nothing draws; the words of the reply still show with the caption.
  if (new TextEncoder().encode(body).length > KIT_BLOCK_MAX_BYTES) return { messages: [], dropped: 1, pending: false };
  const { objects, rest, restClosers, restInString } = splitObjects(body);
  const messages: KitMessage[] = [];
  let dropped = 0;
  for (const raw of objects) {
    const checked = raw === '<junk>' ? null : checkMessage(raw);
    if (!checked) {
      dropped++;
      continue;
    }
    messages.push(checked.msg);
    dropped += checked.dropped;
  }
  const pending = rest.trim() !== '';
  if (pending && !streaming) {
    // CR-0050: the reply ended with the last message still open. Closed as written (never inside a text value), it is
    // checked like any other message; otherwise it is dropped.
    const closed = restInString ? null : checkMessage(rest + restClosers);
    if (closed) {
      messages.push(closed.msg);
      dropped += closed.dropped;
    } else dropped++;
  }
  return { messages, dropped, pending: pending && streaming };
}

/** 04 §13.6: the size cap of one AI page. */
export const PAGE_MAX_BYTES = 512 * 1024;

export interface PageParse {
  html: string;
  bytes: number;
  /** Over 512 KB: the page is refused and the frame shows "failed". */
  tooLarge: boolean;
  /** The fence is closed and the message done: only then is the page served (the frame shows "building" before). */
  complete: boolean;
}

/** 04 §13.6: the HTML of a ```page block. */
export function parsePageBlock(body: string, closed: boolean, streaming: boolean): PageParse {
  const bytes = new TextEncoder().encode(body).length;
  return { html: body, bytes, tooLarge: bytes > PAGE_MAX_BYTES, complete: closed && !streaming };
}
