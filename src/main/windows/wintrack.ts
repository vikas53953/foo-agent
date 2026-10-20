// Spec: 09 §9.27.3 (the banner follows Edge on every move, resize, minimise and restore; with `foo-native` `trackWindow`
// within one frame, and without the addon "the banner re-reads the bounds through CDP every 500 ms"), 08-0 §E.2 (every
// native export has a JS fallback). This is that fallback: a poll of the job window's bounds. The addon's `trackWindow`
// replaces it when `native/foo-native` lands (wintrack.cc).

/** Edge's outer window rectangle, the height of its own toolbar (outerHeight − innerHeight), and whether it is minimised. */
export interface EdgeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  chromeTop: number;
  minimised: boolean;
}

/** Reads the job window's bounds (CDP `Browser.getWindowForTarget` + `Runtime.evaluate`); null when the window is gone. */
export type ReadBounds = () => Promise<EdgeBounds | null>;

export const WINTRACK_POLL_MS = 500;

const same = (a: EdgeBounds, b: EdgeBounds) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.chromeTop === b.chromeTop && a.minimised === b.minimised;

/**
 * Calls `onChange` with the first bounds, then on every change; once with null when the window is gone (then stops).
 * A failed read counts as gone. Returns the stop function.
 */
export function trackWindow(read: ReadBounds, onChange: (b: EdgeBounds | null) => void, everyMs = WINTRACK_POLL_MS): () => void {
  let last: EdgeBounds | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    let b: EdgeBounds | null;
    try {
      b = await read();
    } catch {
      b = null;
    }
    if (stopped) return;
    if (!b) {
      stopped = true;
      onChange(null);
      return;
    }
    if (!last || !same(last, b)) onChange(b);
    last = b;
    timer = setTimeout(() => void tick(), everyMs);
  };
  timer = setTimeout(() => void tick(), 0);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
