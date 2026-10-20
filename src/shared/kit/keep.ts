// Spec: CR-0022 pick 9 (Keep: a kept kit surface is stored as its A2UI JSON plus a PNG snapshot; an AI page as a
// `.foopage` blob plus a PNG; no plain `.html` file is ever written), 04 §13.5 (A2UI v0.9.1 messages), 08-1 §3.2
// `keep:save` / `keep:open`, AT-369, X-180. R1 T7. Pure: the renderer writes a kept surface's body, main checks it.
import { CATALOG_ID, type KitComponent } from './catalog';
import { parseKitBlock } from './parse';
import type { Surface } from './surface';

/** The catalog takes at most this many components in one `updateComponents`. */
const COMPONENTS_PER_MESSAGE = 100;

/** A surface as it is drawn now (its data with the user's edits), written back as the A2UI lines that rebuild it. */
export function surfaceBody(surface: Surface, data: unknown): string {
  const surfaceId = surface.id;
  const components: KitComponent[] = Object.values(surface.components);
  const lines: unknown[] = [{ version: 'v0.9.1', createSurface: { surfaceId, catalogId: CATALOG_ID } }];
  for (let i = 0; i < components.length; i += COMPONENTS_PER_MESSAGE)
    lines.push({ updateComponents: { surfaceId, components: components.slice(i, i + COMPONENTS_PER_MESSAGE) } });
  lines.push({ updateDataModel: { surfaceId, path: '/', value: data } });
  return lines.map((l) => JSON.stringify(l)).join('\n');
}

/** The one surface id a kept body creates, or null when the body is not one clean kit surface. */
export function keptSurfaceId(body: string): string | null {
  const p = parseKitBlock(body, false);
  if (p.dropped > 0 || p.messages.length === 0) return null;
  const ids = new Set(p.messages.map((m) => ('createSurface' in m ? m.createSurface.surfaceId : null)).filter((x) => x !== null));
  const first = p.messages[0]!;
  return ids.size === 1 && 'createSurface' in first ? first.createSurface.surfaceId : null;
}

/** The kept body's file extension under {DATA}: never `.html`, so Windows never opens a kept page in a browser. */
export const KEPT_EXT = { kit: 'json', page: 'foopage' } as const;

/** A kept item's name: the surface's first literal title (a piece's `title`, or a title Text), at most 80 characters. */
export function surfaceTitle(surface: Surface): string | null {
  for (const c of Object.values(surface.components) as Record<string, unknown>[]) {
    const title = c.component === 'Text' && c.variant === 'title' ? c.text : c.title;
    if (typeof title === 'string' && title.trim()) return title.trim().slice(0, 80);
  }
  return null;
}

/** A kept page's name: its own `<title>`, at most 80 characters. */
export function pageTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html);
  const title = m?.[1]?.replace(/\s+/g, ' ').trim();
  return title ? title.slice(0, 80) : null;
}
