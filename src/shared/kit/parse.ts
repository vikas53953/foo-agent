// Spec: 04 §13.5 (kit surface streaming: each complete A2UI message renders at once, an incomplete one is held back, the
// same rule as 04 §14.4; an invalid or unknown component is dropped with a quiet "Couldn't show part of this" caption and
// the reply text still shows), 04 §13.6 (AI page: HTML only, ≤ 512 KB), CR-0022 AT-353, AT-354 (parser half), X-180.
// Pure: the bubble gives the body of an ```a2ui or ```page fence and whether the message is still streaming.
import { KitComponentSchema, KitMessageSchema, type KitComponent, type KitMessage } from './catalog';

export interface KitParse {
  /** Every complete, valid message in order (components already checked one by one). */
  messages: KitMessage[];
  /** Messages or components dropped as invalid or unknown: > 0 shows the "Couldn't show part of this" caption. */
  dropped: number;
  /** A trailing message is still arriving (held back, not counted as dropped while streaming). */
  pending: boolean;
}

/**
 * Splits the body into top-level JSON objects by bracket depth, outside strings. A2UI streams one message per line, but an
 * AI may pretty-print or wrap them in an array, so line breaks, commas and an outer `[ ]` are all accepted.
 */
function splitObjects(body: string): { objects: string[]; rest: string } {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  let junk = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      if (depth === 0) junk = true;
      inString = true;
    } else if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      if (depth > 0 && --depth === 0) {
        objects.push(body.slice(start, i + 1));
        start = -1;
      }
    } else if (depth === 0 && !/[\s,[\]]/.test(c)) junk = true;
  }
  return { objects: junk ? [...objects, '<junk>'] : objects, rest: depth > 0 ? body.slice(start) : '' };
}

/** One raw object → a checked message, the number of components dropped from it, or null when the message is unusable. */
function checkMessage(raw: string): { msg: KitMessage; dropped: number } | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = KitMessageSchema.safeParse(json);
  if (!parsed.success) return null;
  const m = parsed.data;
  if ('updateComponents' in m) {
    const components: KitComponent[] = [];
    for (const c of m.updateComponents.components) {
      const ok = KitComponentSchema.safeParse(c);
      if (ok.success) components.push(ok.data);
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
  const { objects, rest } = splitObjects(body);
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
  if (pending && !streaming) dropped++;
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
