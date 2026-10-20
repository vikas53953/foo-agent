// Spec: 04 §13.5 (kit MapStops in foo's look), CR-0022 §(c) and pick 4 (v1 draws no basemap: numbered stops placed to scale
// on a plain panel with a dashed route, the stops list beside it, and an "Open in Maps" action chip; no network request
// leaves the PC while it draws: no tiles, no images, no fonts, only SVG), AT-341, 04 §16.1 / 05-3 place card ("Open in Maps"
// opens Google Maps in the default browser through main, disabled offline), X-180. R1 T3.
import { useId } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { openUrl } from '../messages/linkActions';
import { selectConnection } from '../store/live';
import { useStore } from '../store/index';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import styles from './MapStops.module.css';

export interface Stop {
  name: string;
  lat: number;
  lng: number;
  note?: string | undefined;
}

/** The panel in viewBox units; the SVG scales to its column and keeps this shape. */
export const PANEL = { w: 320, h: 200, pad: 24 } as const;

/**
 * Each stop's point on the panel, to scale: longitude shrinks by cos(latitude) (equirectangular, fine for a town or a
 * city's errands), one scale for both axes so distances stay true, the whole route centred. One stop sits in the middle.
 */
export function placeStops(stops: readonly Stop[]): { x: number; y: number }[] {
  const k = Math.cos((stops.reduce((s, p) => s + p.lat, 0) / Math.max(stops.length, 1)) * (Math.PI / 180));
  const raw = stops.map((p) => ({ x: p.lng * k, y: -p.lat }));
  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const spanX = x1 - x0;
  const spanY = y1 - y0;
  const room = { w: PANEL.w - 2 * PANEL.pad, h: PANEL.h - 2 * PANEL.pad };
  const scale = spanX === 0 && spanY === 0 ? 0 : Math.min(spanX ? room.w / spanX : Infinity, spanY ? room.h / spanY : Infinity);
  return raw.map((p) => ({
    x: PANEL.w / 2 + (p.x - (x0 + x1) / 2) * scale,
    y: PANEL.h / 2 + (p.y - (y0 + y1) / 2) * scale,
  }));
}

const at = (p: Stop) => `${p.lat},${p.lng}`;

/** Google Maps in the browser: a search for one stop, directions through every stop in order for more. */
export function mapsLink(stops: readonly Stop[]): string {
  const first = stops[0]!;
  if (stops.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(at(first))}`;
  const last = stops[stops.length - 1]!;
  const via = stops.slice(1, -1).map(at).join('|');
  return (
    `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(at(first))}&destination=${encodeURIComponent(at(last))}` +
    (via ? `&waypoints=${encodeURIComponent(via)}` : '')
  );
}

export function MapStops({ stops }: { stops: readonly Stop[] }) {
  const offline = useStore(selectConnection) === 'offline';
  const points = placeStops(stops);
  const descId = useId();
  const route = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <figure className={styles.map} data-testid={TID.kitMapStops} data-stops={stops.length}>
      <div className={styles.body}>
        <svg
          className={styles.panel}
          viewBox={`0 0 ${PANEL.w} ${PANEL.h}`}
          role="img"
          aria-label={t('kit.map.accessible_name', { n: stops.length })}
          aria-describedby={descId}
        >
          <desc id={descId} data-copy="ai">
            {stops.map((s, i) => `${i + 1}. ${s.name}`).join(', ')}
          </desc>
          {points.length > 1 && <path className={styles.route} d={route} />}
          {points.map((p, i) => (
            <g key={i} className={styles.stop}>
              <circle cx={p.x} cy={p.y} r={10} />
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">
                {i + 1}
              </text>
            </g>
          ))}
        </svg>
        <ol className={styles.list}>
          {stops.map((s, i) => (
            <li key={i} className={styles.item}>
              <span className={styles.num} aria-hidden="true">
                {i + 1}
              </span>
              <span className={styles.words}>
                <span className={styles.name} data-copy="ai">
                  {s.name}
                </span>
                {s.note && (
                  <span className={styles.note} data-copy="ai">
                    {s.note}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <Chip className={styles.open} disabled={offline} data-testid={TID.kitMapOpen} onClick={() => openUrl(mapsLink(stops))}>
        <Icon name="Location" size={16} />
        {t('kit.map.open')}
      </Chip>
    </figure>
  );
}
