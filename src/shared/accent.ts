// Spec: 02-3 §F28.3 ("Use my Windows accent colour": `deriveAccent` is a pure OKLCH function, no DOM, no Electron; main
// applies it), §F2 (tick-read swap), F0 (brand indigo is the fallback). CR-0021 pick 22 (P1 T9 builds it).

type AccentSet = { accent: string; hover: string; pressed: string; soft: string; tickRead: string; tickReadOnMe: string };
type Lch = { l: number; c: number; h: number };

const WHITE = '#FFFFFF';
const LIGHT_SIDEBAR = '#F5F5F8';
const DARK_INK = '#0D0D11';
const DARK_SIDEBAR = '#131318';
const MIN_RATIO = 4.5;
const STEP = 0.01;

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255) as [number, number, number];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb
    .map((x) =>
      Math.round(Math.min(1, Math.max(0, x)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}

function toOklch([r, g, b]: [number, number, number]): Lch {
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
}

/** Linear-light sRGB of an OKLCH colour (may be outside 0..1 when out of gamut). */
function toLinear({ l, c, h }: Lch): [number, number, number] {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const EPS = 1e-6;
const inGamut = (lin: [number, number, number]) => lin.every((v) => v >= -EPS && v <= 1 + EPS);

/** §F28.3 step 2: an out-of-sRGB colour loses chroma in 5 % steps until it fits. */
function fit(lch: Lch): string {
  let c = lch.c;
  let lin = toLinear({ ...lch, c });
  while (!inGamut(lin) && c > EPS) {
    c *= 0.95;
    lin = toLinear({ ...lch, c });
  }
  return toHex(lin.map(linearToSrgb) as [number, number, number]);
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex)!.map(srgbToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio of two hex colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const clampL = (l: number) => Math.min(1, Math.max(0, l));

function lightSet(base: Lch): Omit<AccentSet, 'tickRead' | 'tickReadOnMe'> {
  const soft = fit({ l: 0.95, c: Math.min(base.c, 0.04), h: base.h });
  let l = Math.min(base.l, 0.55);
  let accent = fit({ ...base, l });
  while (
    l > 0 &&
    (contrast(WHITE, accent) < MIN_RATIO || contrast(accent, LIGHT_SIDEBAR) < MIN_RATIO || contrast(accent, soft) < MIN_RATIO)
  ) {
    l -= STEP;
    accent = fit({ ...base, l });
  }
  return {
    accent,
    hover: fit({ ...base, l: clampL(l - 0.06) }),
    pressed: fit({ ...base, l: clampL(l - 0.12) }),
    soft,
  };
}

function darkSet(base: Lch): Omit<AccentSet, 'tickRead' | 'tickReadOnMe'> {
  let l = Math.max(base.l, 0.72);
  let accent = fit({ ...base, l });
  while (l < 1 && (contrast(DARK_INK, accent) < MIN_RATIO || contrast(accent, DARK_SIDEBAR) < MIN_RATIO)) {
    l += STEP;
    accent = fit({ ...base, l });
  }
  return {
    accent,
    hover: fit({ ...base, l: Math.min(l + 0.06, 0.98) }),
    pressed: fit({ ...base, l: clampL(l - 0.06) }),
    soft: fit({ l: 0.3, c: Math.min(base.c, 0.08), h: base.h }),
  };
}

/**
 * §F28.3: the light and dark accent families derived from a Windows accent (`RRGGBB` or `RRGGBBAA`, with or without
 * `#`). Returns null when the input is not a colour, so the caller keeps the brand indigo (step 7).
 */
export function deriveAccent(hex: string): { light: AccentSet; dark: AccentSet } | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const base = toOklch(rgb);
  const light = lightSet(base);
  const dark = darkSet(base);
  // Step 6: tick-read = accent; tick-read-on-me = the other theme's accent (the F2 swap).
  return {
    light: { ...light, tickRead: light.accent, tickReadOnMe: dark.accent },
    dark: { ...dark, tickRead: dark.accent, tickReadOnMe: light.accent },
  };
}

const VARS: [keyof AccentSet, string][] = [
  ['accent', '--accent'],
  ['hover', '--accent-hover'],
  ['pressed', '--accent-pressed'],
  ['soft', '--accent-soft'],
  ['tickRead', '--tick-read'],
  ['tickReadOnMe', '--tick-read-on-me'],
];

const block = (sel: string, set: AccentSet) => `${sel} { ${VARS.map(([k, v]) => `${v}: ${set[k]};`).join(' ')} }`;

/**
 * The sheet main inserts into every foo window (§F28.3): light values on `:root`, dark under `[data-theme="dark"]`.
 * Forced colours ignore it (§F25.5), so the high-contrast system colours in tokens.css still win.
 */
export function accentCss(derived: { light: AccentSet; dark: AccentSet }): string {
  return `@media not (forced-colors: active) {\n${block(':root', derived.light)}\n${block(':root[data-theme="dark"]', derived.dark)}\n}`;
}
