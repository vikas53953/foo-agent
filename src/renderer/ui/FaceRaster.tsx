// Spec: 02-2 §F15.9.9 Rasters (X-124, X-135): the renderer owns one hidden `<FaceRaster>`; on identity / helper changes and
// on every chat `Mood` change, debounced 1 s, it draws the face at 48 with its ring and at 16 / 20 / 24 / 32 without, to
// PNG (`canvas.toBlob`, the one canvas exception to §F15.9.8; it never animates), and sends
// `face:raster { faceRef, size, mood, png }` through `window.foo.send` (08-1 §3.3.1). Main writes the files and never draws
// a face. The frames are the §F15.9.1a poses held still (sparks at full size, the Happy ring shown, bars at rest).
// It also keeps the face clock (one-time moods and Listening end on time) and pauses face motion while the window is
// hidden (§F15.9.8).
import { useEffect } from 'react';
import { RASTER_SIZES, type RasterSize } from '../../shared/face';
import type { FaceRef, Mood } from '../../shared/types';
import { sendFooEvent } from '../ipc/client';
import { clockNow } from '../store/apply';
import { update, useStore, type RootState } from '../store/index';
import { nextFaceDue, selectChatMood } from '../store/live';
import { facePose, ringMetrics, type EyeShape, type Ring } from './Face';

export interface RasterColors {
  disc: string;
  eye: string;
  accent: string;
  warn: string;
  ok: string;
  /** `--font-ui`, for the Asleep "z". */
  font: string;
}

export const RASTER_DEBOUNCE_MS = 1000;

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

function eyeSvg(shape: EyeShape, fill: string): string {
  if (shape.kind === 'rect')
    return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.r}" fill="${fill}"/>`;
  if (shape.kind === 'path') return `<path d="${shape.d}" fill="${fill}"/>`;
  return `<path d="${shape.d}" fill="none" stroke="${fill}" stroke-width="${shape.stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function ringSvg(ring: Ring, size: RasterSize, c: RasterColors): string {
  const { stroke, gap } = ringMetrics(size);
  const unit = 100 / size;
  const r = 50 + (gap + stroke / 2) * unit;
  const dash = ring.shape === 'arc_turning' || ring.shape === 'arc_still' ? '28 72' : ring.shape === 'dashed' ? '5 3.3' : null;
  return `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${c[ring.tone]}" stroke-width="${stroke * unit}" pathLength="100"${
    dash ? ` stroke-dasharray="${dash}"` : ''
  } stroke-linecap="round" transform="rotate(-90 50 50)"/>`;
}

/**
 * One still frame of a face as a standalone SVG (no stylesheet reaches an image, so colours are resolved values). The
 * view box grows to keep the ring inside the picture; without the ring the disc fills it.
 */
export function faceSvg(mood: Mood, size: RasterSize, colors: RasterColors, ring: boolean): string {
  const pose = facePose(mood);
  const pad = ring && pose.ring ? (ringMetrics(size).gap + ringMetrics(size).stroke) * (100 / size) : 0;
  const vb = `${-pad} ${-pad} ${100 + 2 * pad} ${100 + 2 * pad}`;
  const unit = 100 / size;
  const parts: string[] = [];
  if (ring && pose.ring) parts.push(ringSvg(pose.ring, size, colors));
  const eyeFill = pose.offline ? 'none' : colors.eye;
  if (pose.offline)
    parts.push(
      `<circle cx="50" cy="50" r="50" fill="${colors.disc}" stroke="${colors.eye}" stroke-width="${1.5 * unit}" pathLength="100" stroke-dasharray="5 3.3"/>`,
    );
  else parts.push(`<circle cx="50" cy="50" r="50" fill="${colors.disc}"/>`);
  const eyes = (s: EyeShape) =>
    pose.offline
      ? eyeSvg(s, 'none').replace('fill="none"', `fill="none" stroke="${colors.eye}" stroke-width="${1.5 * unit}"`)
      : eyeSvg(s, eyeFill);
  parts.push(eyes(pose.left));
  parts.push(pose.right === 'mirror' ? `<g transform="translate(100 0) scale(-1 1)">${eyes(pose.left)}</g>` : eyes(pose.right));
  if (pose.bars) for (const x of [42, 50, 58]) parts.push(`<rect x="${x - 2}" y="74" width="4" height="4" rx="2" fill="${colors.eye}"/>`);
  if (pose.sparks)
    for (const [x, y, t] of [
      [20, 22, 'accent'],
      [82, 16, 'ok'],
      [78, 80, 'accent'],
    ] as const)
      parts.push(
        `<path d="M${x} ${y - 5} Q${x} ${y} ${x + 5} ${y} Q${x} ${y} ${x} ${y + 5} Q${x} ${y} ${x - 5} ${y} Q${x} ${y} ${x} ${y - 5} Z" fill="${colors[t]}"/>`,
      );
  if (pose.z && size >= 40)
    parts.push(
      `<text x="74" y="42" text-anchor="end" font-size="22" font-weight="600" font-family="${esc(colors.font)}" fill="${colors.eye}" fill-opacity="0.55">z</text>`,
    );
  if (pose.badge) parts.push(`<text x="96" y="98" text-anchor="end" font-size="36">${esc(pose.badge)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}">${parts.join('')}</svg>`;
}

async function toPng(svg: string, size: number): Promise<ArrayBuffer | null> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? blob.arrayBuffer() : null;
}

export interface RasterTarget {
  faceRef: FaceRef;
  tone: 'foo' | 'helper';
  color: string | null;
  mood: Mood;
}

/** The living faces of foo's and each helper's chat, with the mood each shows now. */
export function rasterTargets(s: RootState): RasterTarget[] {
  const out: RasterTarget[] = [];
  for (const id of s.chats.order) {
    const c = s.chats.byId[id];
    if (!c || (c.kind !== 'foo' && c.kind !== 'helper') || !c.face.startsWith('living:')) continue;
    out.push({ faceRef: c.face, tone: c.kind, color: c.colorToken, mood: selectChatMood(id)(s) });
  }
  return out;
}

function resolveColors(t: RasterTarget): RasterColors {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const helper = t.tone === 'helper' && t.color && /^--h-[a-z]+$/.test(t.color);
  return {
    disc: helper ? v(t.color!) : v('--fg-1'),
    eye: helper ? v('--on-helper') : v('--bg-app'),
    accent: v('--accent'),
    warn: v('--warn'),
    ok: v('--ok'),
    font: v('--font-ui'),
  };
}

const sent = new Set<string>();

async function draw(t: RasterTarget): Promise<void> {
  const colors = resolveColors(t);
  const key = `${t.faceRef}|${t.mood}|${colors.disc}|${colors.eye}`;
  if (sent.has(key)) return;
  sent.add(key);
  for (const size of RASTER_SIZES) {
    const png = await toPng(faceSvg(t.mood, size, colors, size === 48), size).catch(() => null);
    if (png) sendFooEvent('face:raster', { faceRef: t.faceRef, size, mood: t.mood, png });
  }
}

/** The hidden raster writer (§F15.9.9). Mounted once, beside the shell. */
export function FaceRaster() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = '';
    const schedule = (s: RootState) => {
      const targets = rasterTargets(s);
      const sig = JSON.stringify(targets);
      if (sig === last) return;
      last = sig;
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const t of targets) void draw(t);
      }, RASTER_DEBOUNCE_MS);
    };

    // The face clock: tick `now` when the next one-time mood or Listening ends.
    let tickTimer: ReturnType<typeof setTimeout> | undefined;
    let tickAt: number | null = null;
    const clock = (s: RootState) => {
      const due = nextFaceDue(s);
      if (due === tickAt) return;
      clearTimeout(tickTimer);
      tickAt = due;
      if (due == null) return;
      tickTimer = setTimeout(
        () => {
          tickAt = null;
          update((d) => {
            d.live.now = clockNow();
          });
        },
        Math.max(0, due - clockNow()),
      );
    };

    const onVisibility = () => document.documentElement.toggleAttribute('data-face-paused', document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    const unsub = useStore.subscribe((s) => {
      schedule(s);
      clock(s);
    });
    schedule(useStore.getState());
    return () => {
      unsub();
      clearTimeout(timer);
      clearTimeout(tickTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return null;
}
