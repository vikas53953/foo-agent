// Spec: 02-2 §F15.1 the foo mark (X-143): the two-eyes face in its static Resting pose, master
// `foo/look-book/assets/logo-face.svg` (viewBox 100: disc r 50; eyes 12 × 24, rx 6, at x 30 and 58, y 36); light disc
// `--fg-1` with `--bg-app` eyes (dark follows the theme); 16 and 20px redraw the eyes on whole pixels (at 16: 2 × 5 at
// x 5 and 9, y 4). Never a mood, ring, lid or animation; the retired letter mark is never drawn. 02-3 §F32.4 file name.

export interface FooMarkProps {
  /** Rendered size in px (minimum 16, §F15.1). */
  size: number;
  className?: string;
}

/** The still logo face (§F15.1). Decorative: the product name always sits beside it or in the window title. */
export function FooMark({ size, className }: FooMarkProps) {
  if (size <= 20) {
    // §F15.1 small sizes: a 16-unit grid with whole-pixel eyes.
    return (
      <svg className={className} viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" data-mark="foo">
        <circle cx={8} cy={8} r={8} fill="var(--fg-1)" />
        <rect x={5} y={4} width={2} height={5} rx={1} fill="var(--bg-app)" />
        <rect x={9} y={4} width={2} height={5} rx={1} fill="var(--bg-app)" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" data-mark="foo">
      <circle cx={50} cy={50} r={50} fill="var(--fg-1)" />
      <rect x={30} y={36} width={12} height={24} rx={6} fill="var(--bg-app)" />
      <rect x={58} y={36} width={12} height={24} rx={6} fill="var(--bg-app)" />
    </svg>
  );
}
