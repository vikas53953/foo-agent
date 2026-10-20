// Spec: 02-2 §F19.9 "Line, area and bar chart (kit `LineChart`, 04 §13.5)": ≤ 3 series; axes with one-line labels
// (`--t-caption` `--fg-3`), numbers and money by the 02 rules (§F19.1 `en-IN` grouping, U+2212 minus, ≤ 1 decimal; §F19.2
// rough form for rupee axis values, "80%"); line 2px, area fill `--accent-soft`, bars `--r-xs`; drawn as SVG by foo, no
// chart library (CR-0022 pick 10); one hue: a second and third series use `--accent` at lower opacity with a different
// dash, never helper colours; a legend only with 2 or more series; forced colours draw in `CanvasText` / `Highlight`.
// CR-0022 AT-340 (the three variants from one series and from 3), X-180. R1 T2.
import { t } from '../../shared/copy/t';
import { formatInrWords } from '../../shared/format';
import { TID } from '../../shared/testids';
import styles from './LineChart.module.css';

export type ChartVariant = 'line' | 'area' | 'bar';
export type ChartUnit = 'number' | 'rupees' | 'percent';
export interface ChartSeries {
  label: string;
  points: { x: string | number; y: number }[];
}

/** The plot box in viewBox units; the SVG scales to the surface width and keeps this shape. */
export const VIEW = { w: 400, h: 200, left: 56, right: 8, top: 8, bottom: 24 } as const;

/** F19.9: series 2 and 3 are the same hue, fainter, with their own dash. */
export const SERIES_LOOK = [
  { opacity: 1, dash: undefined },
  { opacity: 0.6, dash: '6 4' },
  { opacity: 0.4, dash: '2 3' },
] as const;

const MINUS = '−';

/** F19.1 / F19.2: one axis or value label. */
export function formatValue(v: number, unit: ChartUnit = 'number'): string {
  const rounded = Math.round(v * 10) / 10;
  if (unit === 'rupees') return formatInrWords(Math.round(v * 100)).replace('-', MINUS);
  const s = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(Math.abs(rounded));
  return `${rounded < 0 ? MINUS : ''}${s}${unit === 'percent' ? '%' : ''}`;
}

/** Round axis bounds that hold every value and zero (bars always start at zero; lines start at zero when values are ≥ 0). */
export function axisRange(values: number[]): { min: number; max: number } {
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (min === max) max = min + 1;
  const step = 10 ** Math.floor(Math.log10(max - min));
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  return { min, max };
}

export interface Geometry {
  categories: string[];
  range: { min: number; max: number };
  x(i: number): number;
  y(v: number): number;
  /** Bar width and the offset of series `s` inside a category (bars only). */
  bar: { w: number; offset(s: number): number };
}

/** The x categories (first appearance across series) and the scales of the plot box. */
export function geometry(series: ChartSeries[], variant: ChartVariant): Geometry {
  const categories: string[] = [];
  for (const s of series) for (const p of s.points) if (!categories.includes(String(p.x))) categories.push(String(p.x));
  const range = axisRange(series.flatMap((s) => s.points.map((p) => p.y)));
  const plotW = VIEW.w - VIEW.left - VIEW.right;
  const plotH = VIEW.h - VIEW.top - VIEW.bottom;
  const n = categories.length;
  const band = plotW / Math.max(n, 1);
  const x = variant === 'bar' || n === 1 ? (i: number) => VIEW.left + band * (i + 0.5) : (i: number) => VIEW.left + (plotW * i) / (n - 1);
  const y = (v: number) => VIEW.top + plotH * (1 - (v - range.min) / (range.max - range.min));
  const barW = (band * 0.7) / Math.max(series.length, 1);
  return { categories, range, x, y, bar: { w: barW, offset: (s) => (s - (series.length - 1) / 2) * barW } };
}

/** At most this many x labels, every k-th category from the first, evenly spaced (one-line labels must not collide). */
const MAX_X_LABELS = 6;
export function xLabelIndexes(n: number): number[] {
  const step = Math.ceil(n / MAX_X_LABELS);
  return Array.from({ length: n }, (_, i) => i).filter((i) => i % step === 0);
}

export function LineChart({
  variant,
  series,
  title,
  unit,
}: {
  variant: ChartVariant;
  series: ChartSeries[];
  title?: string | undefined;
  unit?: ChartUnit | undefined;
}) {
  const g = geometry(series, variant);
  const index = new Map(g.categories.map((c, i) => [c, i]));
  const base = g.y(Math.max(g.range.min, 0));
  const ticks = [g.range.min, (g.range.min + g.range.max) / 2, g.range.max];
  const name = t('kit.chart.accessible_name', { title: title ?? series[0]?.label ?? '', n: series.length });
  return (
    <figure className={styles.chart} data-testid={TID.kitLineChart} data-variant={variant} data-series={series.length}>
      {title && (
        <figcaption className={styles.title} data-copy="ai">
          {title}
        </figcaption>
      )}
      <svg className={styles.svg} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label={name}>
        <g className={styles.axis} aria-hidden="true">
          {ticks.map((v) => (
            <g key={v}>
              <line className={styles.grid} x1={VIEW.left} x2={VIEW.w - VIEW.right} y1={g.y(v)} y2={g.y(v)} />
              <text className={styles.label} x={VIEW.left - 6} y={g.y(v)} textAnchor="end" dominantBaseline="middle">
                {formatValue(v, unit)}
              </text>
            </g>
          ))}
          {xLabelIndexes(g.categories.length).map((i) => (
            <text key={i} className={styles.label} x={g.x(i)} y={VIEW.h - 6} textAnchor="middle">
              {g.categories[i]}
            </text>
          ))}
        </g>
        {series.map((s, si) => {
          const look = SERIES_LOOK[si] ?? SERIES_LOOK[2];
          const pts = s.points.map((p) => ({ x: g.x(index.get(String(p.x))!), y: g.y(p.y), v: p.y }));
          if (variant === 'bar')
            return (
              <g key={si} className={styles.bars} opacity={look.opacity} data-series-index={si}>
                {pts.map((p, i) => (
                  <rect
                    key={i}
                    className={styles.bar}
                    x={p.x + g.bar.offset(si) - g.bar.w / 2}
                    y={Math.min(p.y, base)}
                    width={g.bar.w}
                    height={Math.max(Math.abs(base - p.y), 1)}
                    strokeDasharray={look.dash}
                  />
                ))}
              </g>
            );
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
          const last = pts[pts.length - 1]!;
          return (
            <g key={si} opacity={look.opacity} data-series-index={si}>
              {variant === 'area' && (
                <path
                  className={styles.area}
                  d={`${d} L${last.x.toFixed(1)},${base.toFixed(1)} L${pts[0]!.x.toFixed(1)},${base.toFixed(1)} Z`}
                />
              )}
              <path className={styles.line} d={d} strokeDasharray={look.dash} />
              {pts.length === 1 && <circle className={styles.dot} cx={last.x} cy={last.y} r={3} />}
            </g>
          );
        })}
      </svg>
      {series.length >= 2 && (
        <ul className={styles.legend} aria-label={t('kit.chart.legend')}>
          {series.map((s, si) => {
            const look = SERIES_LOOK[si] ?? SERIES_LOOK[2];
            return (
              <li key={si} className={styles.key}>
                <svg className={styles.swatch} viewBox="0 0 16 8" aria-hidden="true" opacity={look.opacity}>
                  <line className={styles.line} x1={0} x2={16} y1={4} y2={4} strokeDasharray={look.dash} />
                </svg>
                <span data-copy="ai">{s.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}
