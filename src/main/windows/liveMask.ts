// Spec: 06-3 §11.2 Picture ("masked in main before they reach the renderer: password, card and code fields, and
// `no-capture-hosts.json` sites, are blanked"; fields are masked at source by the engine, 08-2 §8.3.6), 08-4 §27.5 (the
// no-capture host list, `createNoCapture`), 08-1 §3.3 (`live:frame` payload). A frame whose page cannot be told is blanked.
import type { EventPayload } from '../../shared/ipc';
import type { HostMatcher } from '../../shared/handback';

export type RendererFrame = EventPayload['live:frame'];
export type EngineFrame = RendererFrame & { pageUrl?: string };

const BLANK = new ArrayBuffer(0);

function readable(url: string | undefined): url is string {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/** The frame the live window may see: the engine-only page URL removed; an empty picture on no-capture or unknown pages. */
export function maskFrame(frame: EngineFrame, noCapture: HostMatcher): RendererFrame {
  const { pageUrl, ...rest } = frame;
  const blank = !readable(pageUrl) || noCapture.check(pageUrl);
  return { ...rest, jpeg: blank ? BLANK : rest.jpeg, masked: true };
}
