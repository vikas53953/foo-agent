// Spec: 02-2 §F15.9 living face (Direction A "Two eyes", X-35, X-38): §F15.9.1 disc, eyes, mood ring sizes and shapes,
// §F15.9.1a pose geometry (binding; % of the disc, the right eye mirrors the left), §F15.9.2 motion tokens, §F15.9.3 the 18
// moods, §F15.9.3d groups (`animate={false}`: static Resting, only the Working and Needs you rings), §F15.9.5 reduced
// motion, §F15.9.7 Narrator (`aria-hidden`) and forced colours, §F15.9.8 (inline SVG + CSS keyframes on transform / opacity;
// paused when hidden or scrolled away; blink randomised per face), §F15.9.9 component contract (`data-state` = the mood);
// CR-0021 picks 6–8 (X-179): decorative empty-state poses, the 2–6 s blink and 1px bob at 40px+, "Show foo's eyes".
import { memo, useEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { BLINK_MAX_MS, BLINK_MIN_MS, BOB_MIN_SIZE, BOB_PX, type FacePoseName, type FaceSize } from '../../shared/face';
import { motion } from '../../shared/tokens';
import type { FaceRef, Mood } from '../../shared/types';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { clockNow } from '../store/apply';
import { useStore, type RootState } from '../store/index';
import { selectOnceStart } from '../store/live';
import { cx } from './cx';
import styles from './Face.module.css';

// ---------------------------------------------------------------- pose geometry (§F15.9.1a, a 100-unit disc)

export type EyeShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r: number }
  | { kind: 'path'; d: string }
  /** An open stroke (the ^ arcs), eye colour, round caps. */
  | { kind: 'arc'; d: string; stroke: number };

export type RingShape = 'arc_turning' | 'arc_still' | 'full' | 'dashed' | 'full_fade';
export interface Ring {
  shape: RingShape;
  tone: 'accent' | 'warn' | 'ok';
}

export interface Pose {
  left: EyeShape;
  /** 'mirror': the left eye mirrored about x 50; otherwise its own shape (Wink). */
  right: EyeShape | 'mirror';
  ring: Ring | null;
  /** The motion the eyes play (§F15.9.2). */
  motion: 'blink' | 'blink_slow' | 'drift' | 'scan' | 'pop' | 'nod' | 'wake' | 'none';
  sparks?: boolean;
  bars?: boolean;
  z?: boolean;
  badge?: '👍' | '❤️';
  offline?: boolean;
}

/** A rounded rect eye of width w, height h, centred at (cx, cy) (§F15.9.1a "Base eye" and its resizes). */
const eye = (w: number, h: number, cx: number, cy: number, r = w / 2): EyeShape => ({
  kind: 'rect',
  x: cx - w / 2,
  y: cy - h / 2,
  w,
  h,
  r,
});

const BASE = eye(12, 24, 36, 48, 6);
/** "^": chord 16 wide, rise 7 (a quadratic's control sits at twice the rise), stroke 6, chord centre (cx, 47). */
const happyArc = (cx: number): EyeShape => ({ kind: 'arc', d: `M${cx - 8} 47 Q${cx} 33 ${cx + 8} 47`, stroke: 6 });
/** The Happy arc flipped (ends point up), chord centre y 50. */
const ASLEEP_ARC: EyeShape = { kind: 'arc', d: 'M28 50 Q36 64 44 50', stroke: 6 };
/** Bottom half of the base eye: 12 × 12, straight top, bottom corners radius 6, centre y 54. */
const HALF_LID: EyeShape = { kind: 'path', d: 'M30 48 L42 48 L42 54 A6 6 0 0 1 36 60 A6 6 0 0 1 30 54 Z' };
/** Base eye lowered to centre y 53, 18 high (y 44–62); its outer top corner cut by a 45° chamfer of 5. */
const SORRY: EyeShape = { kind: 'path', d: 'M30 49 L35 44 L36 44 A6 6 0 0 1 42 50 L42 56 A6 6 0 0 1 36 62 A6 6 0 0 1 30 56 Z' };
const STOPPED = eye(12, 3, 36, 48, 1.5);

/** The pose for a mood. `animate={false}` (groups, picker, welcome) draws Resting still, with only the Working / Needs you ring. */
export function facePose(mood: Mood, animate = true): Pose {
  if (!animate) {
    const ring: Ring | null =
      mood === 'working' ? { shape: 'arc_turning', tone: 'accent' } : mood === 'needs_you' ? { shape: 'full', tone: 'warn' } : null;
    return { left: BASE, right: 'mirror', ring, motion: 'none' };
  }
  switch (mood) {
    case 'resting':
      return { left: BASE, right: 'mirror', ring: null, motion: 'blink' };
    case 'waking':
      return { left: BASE, right: 'mirror', ring: null, motion: 'wake' };
    case 'noticed':
      return { left: eye(13, 27, 36, 48, 6.5), right: 'mirror', ring: null, motion: 'pop' };
    case 'listening':
      return { left: eye(12, 24, 36, 55, 6), right: 'mirror', ring: null, motion: 'blink_slow' };
    case 'thinking':
      return { left: eye(12, 20, 36, 40, 6), right: 'mirror', ring: null, motion: 'drift' };
    case 'working':
      return { left: eye(12, 18, 36, 48, 6), right: 'mirror', ring: { shape: 'arc_turning', tone: 'accent' }, motion: 'none' };
    case 'stuck':
      return { left: BASE, right: 'mirror', ring: { shape: 'arc_still', tone: 'warn' }, motion: 'scan' };
    case 'needs_you':
      return { left: eye(13, 26, 36, 48, 6.5), right: 'mirror', ring: { shape: 'full', tone: 'warn' }, motion: 'nod' };
    case 'waiting':
      return { left: HALF_LID, right: 'mirror', ring: { shape: 'dashed', tone: 'warn' }, motion: 'blink_slow' };
    case 'happy':
      return { left: happyArc(36), right: 'mirror', ring: { shape: 'full_fade', tone: 'ok' }, motion: 'none' };
    case 'celebrating':
      return { left: happyArc(36), right: 'mirror', ring: { shape: 'full_fade', tone: 'ok' }, motion: 'none', sparks: true };
    case 'thumbs_up':
      return { left: BASE, right: happyArc(64), ring: null, motion: 'none', badge: '👍' };
    case 'heart':
      return { left: happyArc(36), right: 'mirror', ring: null, motion: 'none', badge: '❤️' };
    case 'speaking':
      return { left: eye(12, 24, 36, 43, 6), right: 'mirror', ring: null, motion: 'none', bars: true };
    case 'sorry':
      return { left: SORRY, right: 'mirror', ring: null, motion: 'none' };
    case 'stopped':
      return { left: STOPPED, right: 'mirror', ring: null, motion: 'none' };
    case 'offline':
      return { left: BASE, right: 'mirror', ring: null, motion: 'none', offline: true };
    case 'asleep':
      return { left: ASLEEP_ARC, right: 'mirror', ring: null, motion: 'none', z: true };
  }
}

/** §F15.9.1: ring stroke 2px for discs ≤ 48, 3px above; gap 1.5px at 26 (and the smaller raster sizes), 2px otherwise. */
export function ringMetrics(size: FaceSize): { stroke: number; gap: number } {
  return { stroke: size <= 48 ? 2 : 3, gap: size <= 26 ? 1.5 : 2 };
}

/** `--m-face-blink`: a random 2–6 s cycle per face (CR-0021 pick 7, AT-304; X-179 wins over §F15.9.2's 4–7 s), so a list
 * of faces never blinks in sync (§F15.9.8). */
export function blinkCycleMs(rand: () => number = Math.random): number {
  return Math.round(BLINK_MIN_MS + rand() * (BLINK_MAX_MS - BLINK_MIN_MS));
}

/** §F15.9.1a Speaking: 3 bars 4 wide at x 42 / 50 / 58, bottom edge y 78, height 4–14 from the 0–1 audio level. */
export function barHeights(level: number): [number, number, number] {
  const l = Math.min(1, Math.max(0, level));
  // The middle bar leads, the outer two follow at 70%, so the level reads as a small wave rather than one block.
  const h = (k: number) => 4 + 10 * l * k;
  return [h(0.7), h(1), h(0.7)];
}

// ---------------------------------------------------------------- the speaking level (§F15.9.2 `--m-face-level`)

let level = 0;
const levelListeners = new Set<() => void>();

/** The voice player reports the playing note's audio level (0–1, every 100 ms); only one note plays at a time (04 §18). */
export function setSpeakingLevel(next: number): void {
  if (next === level) return;
  level = next;
  for (const l of levelListeners) l();
}

function useSpeakingLevel(on: boolean): number {
  return useSyncExternalStore(
    (cb) => {
      if (!on) return () => undefined;
      levelListeners.add(cb);
      return () => levelListeners.delete(cb);
    },
    () => (on ? level : 0),
    () => 0,
  );
}

// ---------------------------------------------------------------- off-screen pause (§F15.9.8)

let observer: IntersectionObserver | null = null;
function watchVisibility(el: Element): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => undefined;
  observer ??= new IntersectionObserver((entries) => {
    for (const e of entries) (e.target as HTMLElement).toggleAttribute('data-offscreen', !e.isIntersecting);
  });
  observer.observe(el);
  return () => observer?.unobserve(el);
}

/**
 * The blink of Resting, Listening and Waiting on you (§F15.9.2): one blink every cycle, as a one-off animation (`data-blinking`, cleared when it ends), so an
 * idle face draws no frames between blinks. No blink while off screen or while the window is hidden (§F15.9.8).
 */
function blinkEvery(el: HTMLElement, cycleMs: number): () => void {
  const timer = setInterval(() => {
    if (document.hidden || el.hasAttribute('data-offscreen')) return;
    el.setAttribute('data-blinking', '');
  }, cycleMs);
  const done = (e: AnimationEvent) => {
    if (/blink/.test(e.animationName)) el.removeAttribute('data-blinking');
  };
  el.addEventListener('animationend', done);
  el.addEventListener('animationcancel', done);
  return () => {
    clearInterval(timer);
    el.removeEventListener('animationend', done);
    el.removeEventListener('animationcancel', done);
    el.removeAttribute('data-blinking');
  };
}

/** Animations "Basic" (`<html data-motion="basic">`, 02 §F7): faces cross-fade between static poses, like reduced motion. */
function motionBasic(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.motion === 'basic';
}

function watchMotionKey(cb: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined;
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  return () => mo.disconnect();
}

/** The §F15.9.5 reduced column: the OS setting or Animations "Off" (`useReducedMotion`), or Animations "Basic". */
function useFaceReduced(): boolean {
  const reduced = useReducedMotion();
  const basic = useSyncExternalStore(watchMotionKey, motionBasic, () => false);
  return reduced || basic;
}

// ---------------------------------------------------------------- component

export interface FaceProps {
  faceRef: FaceRef;
  size: FaceSize;
  mood?: Mood;
  /** Draw the mood ring (§F15.9.9 default true; picker tiles and the welcome card pass false). */
  ring?: boolean;
  /** §F15.9.9 default true; groups pass false (§F15.9.3d). */
  animate?: boolean;
  /** foo's disc (`--fg-1`, eyes `--bg-app`) or a helper's (`--h-*`, eyes `--on-helper`). */
  tone?: 'foo' | 'helper';
  /** A helper's `--h-*` token name. */
  color?: string | null;
  className?: string;
  'data-testid'?: string;
}

const TONE: Record<Ring['tone'], string> = { accent: 'var(--accent)', warn: 'var(--warn)', ok: 'var(--ok)' };
const Z_GLYPH = 'z';

function Eye({ shape, className }: { shape: EyeShape; className?: string }) {
  if (shape.kind === 'rect')
    return <rect className={className} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.r} ry={shape.r} />;
  if (shape.kind === 'path') return <path className={className} d={shape.d} />;
  return <path className={cx(className, styles.arc)} d={shape.d} strokeWidth={shape.stroke} />;
}

function RingMark({ ring, size }: { ring: Ring; size: FaceSize }) {
  const { stroke, gap } = ringMetrics(size);
  const unit = 100 / size;
  const r = 50 + (gap + stroke / 2) * unit;
  const dash = ring.shape === 'arc_turning' || ring.shape === 'arc_still' ? '28 72' : ring.shape === 'dashed' ? '5 3.3' : undefined;
  return (
    <circle
      className={cx(styles.ring, styles[`ring_${ring.shape}`])}
      data-ring={ring.shape}
      cx={50}
      cy={50}
      r={r}
      pathLength={100}
      strokeDasharray={dash}
      strokeWidth={stroke * unit}
      stroke={TONE[ring.tone]}
    />
  );
}

/** A 4-point star 10 × 10 centred at (x, y) (§F15.9.1a sparks). */
const spark = (x: number, y: number) =>
  `M${x} ${y - 5} Q${x} ${y} ${x + 5} ${y} Q${x} ${y} ${x} ${y + 5} Q${x} ${y} ${x - 5} ${y} Q${x} ${y} ${x} ${y - 5} Z`;
const SPARKS: [number, number, Ring['tone']][] = [
  [20, 22, 'accent'],
  [82, 16, 'ok'],
  [78, 80, 'accent'],
];

/** CR-0021 pick 8: "Show foo's eyes" off holds every living face still (as reduced motion does); rings still show. */
const selectFaceMotion = (s: RootState) => s.settings.value?.appearance.faceMotion ?? true;

interface ArtProps {
  pose: Pose;
  size: FaceSize;
  /** The mood shown (rings and moods), or null for a decorative pose (CR-0021 pick 6). */
  mood: Mood | null;
  ring: boolean;
  /** Reduced motion or "Show foo's eyes" off: the §F15.9.5 reduced column. */
  reduced: boolean;
  /** `animate={false}` (groups): static Resting, only the Working ring turns (§F15.9.3d). */
  still: boolean;
  tone: 'foo' | 'helper';
  color?: string | null | undefined;
  className?: string | undefined;
  /** When the one-time mood shown began (`selectOnceStart`). */
  onceStart?: number | undefined;
  rest: Record<string, unknown>;
}

/** Two frames: every one-time motion ends this much before its mood does (`ONE_TIME_MS`), so it finishes, never cut. */
const ONCE_LEAD_MS = 34;

/** Draws one pose; the living face and the empty-state poses share it. */
function FaceArt({ pose, size, mood, ring, reduced, still, tone, color, className, onceStart, rest }: ArtProps) {
  const lvl = useSpeakingLevel(pose.bars === true);
  const blink = useMemo(() => blinkCycleMs(), []);
  // A one-time mood's motion starts where the mood is now and ends just before it does (ONCE_LEAD_MS), so it is never cut.
  const onceAt = useMemo(() => (onceStart == null ? undefined : Math.min(0, onceStart - clockNow()) - ONCE_LEAD_MS), [onceStart]);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => (root.current ? watchVisibility(root.current) : undefined), []);
  const cycle = reduced || still ? null : pose.motion === 'blink' ? blink : pose.motion === 'blink_slow' ? motion['face-blink-slow'] : null;
  useEffect(() => (cycle && root.current ? blinkEvery(root.current, cycle) : undefined), [cycle]);

  const unit = 100 / size;
  const helperFill = tone === 'helper' && color && /^--h-[a-z]+$/.test(color) ? `var(${color})` : undefined;
  const style = {
    '--face-blink': `${blink}ms`,
    '--face-disc': helperFill,
    '--face-bob': `${BOB_PX}px`,
    '--face-once-at': `${onceAt ?? 0}ms`,
  } as CSSProperties;
  const eyeClass = cx(styles.eye, pose.offline && styles.eyeOffline);
  const bars = pose.bars ? barHeights(lvl) : null;
  const key = mood ?? 'pose';

  return (
    <span
      ref={root}
      className={cx(styles.face, styles[tone], reduced && styles.reduced, still && styles.still, className)}
      style={style}
      data-state={mood ?? undefined}
      data-mood={mood ?? undefined}
      data-size={size}
      data-motion-face={reduced || still ? 'off' : 'on'}
      aria-hidden="true"
      {...rest}
    >
      {/* The ring and the body are separate layers, so the bob moves the body on the compositor and the ring stays put. */}
      {ring && pose.ring && (
        <svg className={cx(styles.svg, styles.ringLayer)} viewBox="0 0 100 100" width={size} height={size} overflow="visible">
          <g key={key} className={styles.fade}>
            <RingMark ring={pose.ring} size={size} />
          </g>
        </svg>
      )}
      <svg
        className={cx(styles.svg, styles.body, mood === 'resting' && size >= BOB_MIN_SIZE && !still && styles.bob)}
        data-part="body"
        viewBox="0 0 100 100"
        width={size}
        height={size}
        overflow="visible"
      >
        <circle
          className={cx(styles.disc, pose.offline && styles.discOffline)}
          cx={50}
          cy={50}
          r={50}
          pathLength={pose.offline ? 100 : undefined}
          strokeWidth={pose.offline ? 1.5 * unit : undefined}
        />
        {/* §F15.9.2 --m-face-cross: a mood change cross-fades the eyes; the disc stays put. */}
        <g key={key} className={styles.fade}>
          <g data-part="eyes" className={cx(styles.eyes, styles[`m_${pose.motion}`])} strokeWidth={pose.offline ? 1.5 * unit : undefined}>
            <Eye shape={pose.left} className={eyeClass} />
            {pose.right === 'mirror' ? (
              <g transform="translate(100 0) scale(-1 1)">
                <Eye shape={pose.left} className={eyeClass} />
              </g>
            ) : (
              <Eye shape={pose.right} className={eyeClass} />
            )}
          </g>
          {bars && (
            <g className={styles.bars} data-part="bars">
              {[42, 50, 58].map((x, i) => (
                <rect key={x} className={styles.eye} x={x - 2} y={78 - bars[i]!} width={4} height={bars[i]} rx={2} />
              ))}
            </g>
          )}
          {pose.sparks && (
            <g data-part="sparks">
              {SPARKS.map(([x, y, t], i) => (
                <path key={i} className={cx(styles.spark, styles[`spark${i}`])} d={spark(x, y)} fill={TONE[t]} />
              ))}
            </g>
          )}
          {pose.z && size >= 40 && (
            <text className={styles.z} data-part="z" x={74} y={42} textAnchor="end" fontSize={22}>
              {Z_GLYPH}
            </text>
          )}
        </g>
      </svg>
      {pose.badge && (
        <span className={styles.badge} data-part="badge" style={{ fontSize: size * 0.3 }}>
          {pose.badge}
        </span>
      )}
    </span>
  );
}

/**
 * The living face (§F15.9.9): the only place a mood is drawn. Memoised: a chat row or header that re-renders per keystroke
 * (its draft line) does not redraw the face (PERF-02).
 */
export const Face = memo(function Face({
  faceRef,
  size,
  mood = 'resting',
  ring = true,
  animate = true,
  tone = 'foo',
  color,
  className,
  ...rest
}: FaceProps) {
  const reduced = useFaceReduced();
  const faceMotion = useStore(selectFaceMotion);
  const onceStart = useStore(selectOnceStart(mood));
  return (
    <FaceArt
      pose={facePose(mood, animate)}
      onceStart={onceStart}
      size={size}
      mood={mood}
      ring={ring}
      reduced={reduced || !faceMotion}
      still={!animate}
      tone={tone}
      color={color}
      className={className}
      rest={{ ...rest, 'data-face': faceRef }}
    />
  );
});

/** CR-0021 pick 6: the decorative poses (eyes only, no ring, never a mood). */
export function emptyPose(name: FacePoseName): Pose {
  switch (name) {
    case 'scan':
      return { left: BASE, right: 'mirror', ring: null, motion: 'scan' };
    case 'resting':
      return { left: BASE, right: 'mirror', ring: null, motion: 'blink_slow' };
    case 'noticed':
      return { left: eye(13, 27, 36, 48, 6.5), right: 'mirror', ring: null, motion: 'none' };
  }
}

/** foo's face in an empty state's icon slot (§F16.2 Block face, `--face-pose` 64px): decorative, `aria-hidden`, no ring. */
export function FacePose({ pose, className, ...rest }: { pose: FacePoseName; className?: string; 'data-testid'?: string }) {
  const reduced = useFaceReduced();
  const faceMotion = useStore(selectFaceMotion);
  return (
    <FaceArt
      pose={emptyPose(pose)}
      size={64}
      mood={null}
      ring={false}
      reduced={reduced || !faceMotion}
      still={false}
      tone="foo"
      className={className}
      rest={{ ...rest, 'data-pose': pose }}
    />
  );
}

// ---------------------------------------------------------------- picture, glyph and emoji faces (§F15.9.4)

type OtherRingShape = 'arc_turning' | 'arc_still' | 'full' | 'dashed' | 'full_fade' | 'soft' | 'dotted' | 'flash';
export interface OtherMood {
  ring: { shape: OtherRingShape; tone: string } | null;
  badge?: '👍' | '❤️';
  /** Offline: 60% greyscale. */
  grey?: boolean;
  /** Asleep: 55% opacity and the "z". */
  dim?: boolean;
}

/**
 * §F15.9.4: a face the user picked is never altered; its mood shows only as the §F15.9.1 ring, an `--accent` ring for
 * Listening (55%, still) and Thinking (dotted, turning), a `--bad` flash for Sorry, dashed `--fg-3` + greyscale for
 * Offline, 55% opacity + "z" for Asleep, and the 👍 / ❤️ badge. Stopped shows nothing.
 */
export function otherMood(mood: Mood): OtherMood {
  switch (mood) {
    case 'listening':
      return { ring: { shape: 'soft', tone: TONE.accent } };
    case 'thinking':
      return { ring: { shape: 'dotted', tone: TONE.accent } };
    case 'sorry':
      return { ring: { shape: 'flash', tone: 'var(--bad)' } };
    case 'offline':
      return { ring: { shape: 'dashed', tone: 'var(--fg-3)' }, grey: true };
    case 'asleep':
      return { ring: null, dim: true };
    case 'thumbs_up':
    case 'heart': {
      const badge = facePose(mood).badge;
      return badge ? { ring: null, badge } : { ring: null };
    }
    default: {
      const r = facePose(mood).ring;
      return { ring: r ? { shape: r.shape, tone: TONE[r.tone] } : null };
    }
  }
}

/** The mood overlay drawn around a picture, glyph or emoji face (the face itself stays untouched). */
export function OtherFaceMood({ mood, size }: { mood: Mood; size: FaceSize }) {
  const m = otherMood(mood);
  const { stroke, gap } = ringMetrics(size);
  const unit = 100 / size;
  const r = 50 + (gap + stroke / 2) * unit;
  const dash =
    m.ring?.shape === 'arc_turning' || m.ring?.shape === 'arc_still'
      ? '28 72'
      : m.ring?.shape === 'dashed'
        ? '5 3.3'
        : m.ring?.shape === 'dotted'
          ? '0.5 4'
          : undefined;
  return (
    <>
      {m.ring && (
        <svg className={styles.overlay} viewBox="0 0 100 100" overflow="visible" aria-hidden="true">
          <circle
            className={cx(styles.ring, styles[`ring_${m.ring.shape}`])}
            data-ring={m.ring.shape}
            cx={50}
            cy={50}
            r={r}
            pathLength={100}
            strokeDasharray={dash}
            strokeWidth={stroke * unit}
            stroke={m.ring.tone}
          />
        </svg>
      )}
      {m.dim && size >= 40 && (
        <span className={styles.overlayZ} data-part="z" aria-hidden="true">
          {Z_GLYPH}
        </span>
      )}
      {m.badge && (
        <span className={styles.badge} data-part="badge" style={{ fontSize: size * 0.3 }} aria-hidden="true">
          {m.badge}
        </span>
      )}
    </>
  );
}
