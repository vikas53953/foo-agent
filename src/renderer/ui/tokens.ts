// Spec: 02 F7 (durations are tokens; JS timers read the same values from the token file), Article 24 (no raw values).
/** A duration token in ms, read from :root (e.g. tokenMs('--delay-tooltip')). Falls back to `fallback` outside a page. */
export function tokenMs(name: string, fallback = 0): number {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^([\d.]+)(ms|s)$/.exec(raw);
  if (!m) return fallback;
  return m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1]);
}

/** A length token in px (e.g. tokenPx('--sidebar-w')). */
export function tokenPx(name: string, fallback = 0): number {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return raw.endsWith('rem') ? n * parseFloat(getComputedStyle(document.documentElement).fontSize) : n;
}

/** px → rem for inline styles (1rem = 16px at 100 % text size, 03-shell-1 §3.0.4). */
export const rem = (px: number) => `${px / 16}rem`;
