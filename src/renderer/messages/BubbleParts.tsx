// Spec: 04 §3 (meta inside the bubble: "Edited" + time + tick, tabular, full-date tooltip; tick glyphs and states), §4.2–§4.3
// (status badge: 24px circle bottom-left −8/−10, tooltip after 500 ms, 700 ms debounce, `failed` / `waiting` are buttons
// that reveal the related card), §4.1 rule 5 (foo's reaction in the badge slot), §8 (reaction chips: 24px, mine
// `--accent-soft` + `--accent` border, click toggles), §6.4 (reply quote: bar in the sender's colour, 2 lines, click jumps
// and highlights 1600 ms; deleted original not clickable), §7 (Not sent: ErrorCircle 8px left of the bubble, line "Not
// sent." + "Try again"), §10.1 (image grid 320 wide, 2px gaps; +{n}; loading and broken tiles), §10.2 (file chip 56 × 280,
// middle ellipsis keeping the extension, "{TYPE} · {size}", click opens, right-click Open / Show in folder), §10.4 (deleted
// state), §10.6 (link preview block), §12.5 (backup-AI mark). Meta strings are exempt from the ART-21a weekday rule
// (10-2 ART-21a "except bubble meta"); the meta carries `data-meta` so scans can tell.
// 02 §F7.1 "Chat" (CR-0021, X-179): ticks draw in when read, the picked reaction bounces once, images blur up, the retry spinner turns into ✓.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { BADGE_GLYPH } from '../../shared/badges';
import { t } from '../../shared/copy/t';
import { formatBytes, formatDate, formatTime } from '../../shared/format';
import { TID } from '../../shared/testids';
import type { Attachment, BadgeValue, MessageRow, TickState } from '../../shared/types';
import { invoke } from '../ipc/client';
import { Icon, type IconName } from '../ui/Icon';
import { TickSingle, TicksDouble } from '../ui/icons/Ticks';
import { Menu } from '../ui/Menu';
import { Spinner } from '../ui/Spinner';
import { Tooltip } from '../ui/Tooltip';
import { cx } from '../ui/cx';
import { BADGE_DEBOUNCE_MS, tickLabel, type BadgeSlot } from './bubbleState';
import { mediaUrl, useBubble } from './bubbleContext';
import { useOneShot } from './oneShot';
import type { RetryPhase } from './retry';
import { openUrl } from './linkActions';
import styles from './Bubble.module.css';
import { needsReadMore } from './textRules';

// ---------------------------------------------------------------- meta (§3)

export function Tick({ state, agentName }: { state: TickState; agentName: string }) {
  // §F7.1: the ticks draw in when they turn read in view (not when a read message mounts).
  const draw = useOneShot(`read:${useBubble().messageId}`, state === 'read');
  if (state === 'not_sent') return null;
  const glyph = state === 'waiting' ? <Icon name="Clock" size={16} /> : state === 'sent' ? <TickSingle /> : <TicksDouble />;
  return (
    <Tooltip text={tickLabel(state, agentName)} className={styles.tickTip}>
      <span className={styles.tick} data-testid={TID.bubbleTick} data-state={state} data-draw={draw || undefined} aria-hidden="true">
        {glyph}
      </span>
    </Tooltip>
  );
}

export interface MetaProps {
  at: number;
  timeZone: string;
  now: number;
  tick?: { state: TickState; agentName: string };
  edited?: boolean;
  /** Left of the time: the backup-AI mark (§12.5), an older answer's 👍/👎 (§17.1). */
  lead?: ReactNode;
  /** `float`: inside the bubble bottom-right; `row`: its own right-aligned line (a long lead); `below`: under an emoji-only
   * message; `media`: over the last image. */
  place?: 'float' | 'row' | 'below' | 'media';
}

export function Meta({ at, timeZone, now, tick, edited, lead, place = 'float' }: MetaProps) {
  return (
    <span className={cx(styles.meta, styles[`meta_${place}`])} data-testid={TID.bubbleMeta} data-meta="">
      {lead}
      {edited && <span>{t('bubble.meta.edited')}</span>}
      <Tooltip text={formatDate(at, 'full_seconds', { timeZone, now })} className={styles.tickTip}>
        <span className={styles.time}>{formatTime(at, { timeZone })}</span>
      </Tooltip>
      {tick && <Tick state={tick.state} agentName={tick.agentName} />}
    </span>
  );
}

/** §3.1: the invisible inline spacer that keeps room for the floating meta on the last line. */
export const MetaSpacer = ({ wide }: { wide: boolean }) => (
  <span className={cx(styles.metaSpacer, wide && styles.metaSpacerWide)} aria-hidden="true" />
);

/**
 * §3.1 for a time-only meta (foo's and helpers' bubbles, §11 "same trailing-space rule"): "meta width + 8px", sized by the
 * meta's own time drawn invisibly as generated content (no text node, so copy and the ART-21a scan never see it), plus
 * the 16px 👍/👎 mark and its 4px gap when the meta carries one (§17.1).
 */
export const TimeSpacer = ({ at, timeZone, mark }: { at: number; timeZone: string; mark: boolean }) => (
  <span
    className={cx(styles.metaSpacerFit, mark && styles.metaSpacerMark)}
    data-reserve={formatTime(at, { timeZone })}
    aria-hidden="true"
  />
);

// ---------------------------------------------------------------- badge slot (§4)

/** §4.2: a value that would last < 700 ms is skipped; the first value shows at once. */
export function useDebounced<T>(value: T, ms = BADGE_DEBOUNCE_MS): T {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (Object.is(value, shown)) return;
    const id = setTimeout(() => setShown(value), ms);
    return () => clearTimeout(id);
  }, [value, shown, ms]);
  return shown;
}

export function BadgeSlotView({ slot, tooltip, onActivate }: { slot: Exclude<BadgeSlot, null>; tooltip: string; onActivate?: () => void }) {
  if (slot.kind === 'reaction')
    return (
      <Tooltip text={tooltip} className={styles.badgeTip}>
        <span className={styles.badge} data-testid={TID.bubbleReaction} aria-hidden="true">
          {slot.emoji}
        </span>
      </Tooltip>
    );
  const glyph = BADGE_GLYPH[slot.value as BadgeValue];
  return (
    <Tooltip text={tooltip} className={styles.badgeTip}>
      {onActivate ? (
        <button
          type="button"
          className={styles.badge}
          data-testid={TID.bubbleBadge}
          data-state={slot.value}
          aria-label={tooltip}
          onClick={onActivate}
        >
          {glyph}
        </button>
      ) : (
        <span className={styles.badge} data-testid={TID.bubbleBadge} data-state={slot.value} aria-hidden="true">
          {glyph}
        </span>
      )}
    </Tooltip>
  );
}

// ---------------------------------------------------------------- reaction chips (§8)

export function ReactionChips({
  reactions,
  shownAtMount,
  onToggle,
}: {
  reactions: MessageRow['reactions'];
  /** The emojis the bubble already carried when it mounted; only reactions added after that bounce (§F7.1). */
  shownAtMount: ReadonlySet<string>;
  onToggle: (emoji: string) => void;
}) {
  const groups: { emoji: string; count: number; mine: boolean }[] = [];
  for (const r of reactions) {
    const g = groups.find((x) => x.emoji === r.emoji);
    if (g) {
      g.count += 1;
      g.mine ||= r.by === 'me';
    } else groups.push({ emoji: r.emoji, count: 1, mine: r.by === 'me' });
  }
  if (!groups.length) return null;
  return (
    <span className={styles.chips}>
      {groups.map((g, i) => (
        <ReactionChip key={g.emoji} g={g} index={i} fresh={!shownAtMount.has(g.emoji)} onToggle={onToggle} />
      ))}
    </span>
  );
}

function ReactionChip({
  g,
  index,
  fresh,
  onToggle,
}: {
  g: { emoji: string; count: number; mine: boolean };
  index: number;
  fresh: boolean;
  onToggle: (emoji: string) => void;
}) {
  const pop = useOneShot(`react:${useBubble().messageId}:${g.emoji}`, true, fresh);
  return (
    <button
      type="button"
      className={cx(styles.chip, g.mine && styles.chipMine)}
      data-testid={TID.bubbleReaction}
      data-index={index}
      data-pop={pop || undefined}
      aria-pressed={g.mine}
      onClick={() => onToggle(g.emoji)}
    >
      <span className={styles.chipEmoji}>{g.emoji}</span>
      {g.count > 1 && <span className={styles.chipCount}>{g.count}</span>}
    </button>
  );
}

// ---------------------------------------------------------------- reply quote (§6.4)

export interface QuoteInfo {
  sender: string;
  /** A `--h-*` token, or 'foo' / 'me' for the bar colour. */
  color: string;
  text: string;
  deleted: boolean;
  thumb?: string | null;
}

export function Quote({ q, onJump }: { q: QuoteInfo; onJump: () => void }) {
  const bar = q.color === 'foo' ? 'var(--on-bubble-me)' : q.color === 'me' ? 'var(--on-bubble-me-2)' : `var(${q.color})`;
  const body = (
    <>
      <span className={styles.quoteBar} style={{ background: bar }} />
      <span className={styles.quoteText}>
        <span className={styles.quoteSender}>{q.sender}</span>
        <span className={styles.quoteLine}>{q.deleted ? t('bubble.quote.deleted') : q.text}</span>
      </span>
      {q.thumb && !q.deleted && <img className={styles.quoteThumb} src={q.thumb} alt="" />}
    </>
  );
  return q.deleted ? (
    <span className={styles.quote} data-testid={TID.bubbleQuote}>
      {body}
    </span>
  ) : (
    <button type="button" className={styles.quote} data-testid={TID.bubbleQuote} onClick={onJump}>
      {body}
    </button>
  );
}

// ---------------------------------------------------------------- Not sent (§7)

// GAP: GAPS.md 2026-10-17 "Not sent reasons have no field"
export function NotSentLine({ phase, onRetry }: { phase: RetryPhase; onRetry: () => void }) {
  return (
    <div className={styles.notSent} data-testid={TID.bubbleNotSent} data-retry={phase}>
      <span>{t('bubble.not_sent.text')}</span>
      <RetryControl phase={phase} label={t('bubble.not_sent.retry')} tid="bubbleNotSentRetry" onRetry={onRetry} />
    </div>
  );
}

/** §F7.1: "Try again", then a spinner while it runs, then ✓ when it went through (`retry.ts` keeps the phase). */
export function RetryControl({
  phase,
  label,
  tid,
  onRetry,
}: {
  phase: RetryPhase;
  label: string;
  tid: 'bubbleNotSentRetry' | 'bubbleErrorRetry';
  onRetry: () => void;
}) {
  if (phase === 'idle')
    return (
      <button type="button" className={styles.linkButton} data-testid={TID[tid]} onClick={onRetry}>
        {label}
      </button>
    );
  return (
    <span className={styles.retryState} data-testid={TID[tid]} data-state={phase} role="status" aria-label={label}>
      {phase === 'busy' ? <Spinner size={16} /> : <Icon name="Checkmark" size={16} className={styles.retryDone} />}
    </span>
  );
}

export function NotSentIcon() {
  return (
    <Tooltip text={t('bubble.tick.not_sent')} className={styles.notSentIcon}>
      <span data-testid={TID.bubbleTick} data-state="not_sent" aria-hidden="true">
        <Icon name="ErrorCircle" size={20} />
      </span>
    </Tooltip>
  );
}

// ---------------------------------------------------------------- attachments (§10.1, §10.2)

export function attachmentKind(a: Attachment): 'image' | 'pdf' | 'doc' | 'other' {
  if (a.kind) return a.kind;
  if (a.mime.startsWith('image/')) return 'image';
  if (a.mime === 'application/pdf') return 'pdf';
  if (/word|excel|sheet|presentation|powerpoint|text\//.test(a.mime)) return 'doc';
  return 'other';
}

/** "Goa trip plan.pdf" → the type label "PDF" (§10.2 "{TYPE} · {size}"); no extension → the MIME subtype. */
export function typeLabel(name: string, mime = ''): string {
  const ext = /\.([A-Za-z0-9]{1,6})$/.exec(name)?.[1];
  return (ext ?? mime.split('/')[1] ?? '').toUpperCase();
}

/** §10.2: one line, ellipsis in the middle, the extension kept. */
export function MiddleName({ name, className }: { name: string; className?: string }) {
  const dot = name.lastIndexOf('.');
  const tailLen = dot > 0 && name.length - dot <= 8 ? name.length - dot + 4 : Math.min(8, name.length);
  const head = name.slice(0, Math.max(0, name.length - tailLen));
  const tail = name.slice(name.length - tailLen);
  return (
    <span className={cx(styles.middle, className)} title={name}>
      <span className={styles.middleHead}>{head}</span>
      <span className={styles.middleTail}>{tail}</span>
    </span>
  );
}

function fileIcon(a: Attachment): IconName {
  if (a.mime.startsWith('audio/')) return 'Mic';
  if (a.mime.startsWith('video/') || a.mime.startsWith('image/')) return 'Image';
  return 'Document';
}

export function FileChip({ a, index, onSide }: { a: Attachment; index: number; onSide: 'me' | 'foo' }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const open = () => void invoke('files:open', { path: a.path });
  return (
    <>
      <button
        type="button"
        className={cx(styles.file, onSide === 'foo' && styles.fileFoo)}
        data-testid={TID.bubbleFile}
        data-index={index}
        onClick={open}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <span className={styles.fileTile}>
          <Icon name={fileIcon(a)} size={20} />
        </span>
        <span className={styles.fileText}>
          <MiddleName name={a.name} className={styles.fileName} />
          <span className={styles.fileMeta}>{t('bubble.file.meta', { type: typeLabel(a.name, a.mime), size: formatBytes(a.bytes) })}</span>
        </span>
      </button>
      {menu && (
        <Menu
          anchor={menu}
          onClose={() => setMenu(null)}
          entries={[
            { kind: 'item', id: 'open', label: t('bubble.file.menu.open'), onSelect: open },
            {
              kind: 'item',
              id: 'show',
              label: t('bubble.file.menu.show_in_folder'),
              onSelect: () => void invoke('files:showInFolder', { path: a.path }),
            },
          ]}
        />
      )}
    </>
  );
}

function ImageTile({ a, i, n, more, cls }: { a: Attachment; i: number; n: number; more: number; cls: string }) {
  const url = mediaUrl(a.path);
  const [state, setState] = useState<'loading' | 'ready' | 'broken'>(url ? 'loading' : 'broken');
  // §F7.1 blur-up plays while a picture loads; one the page already has (scroll-back) shows at once.
  const cached = (img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setState('ready');
  };
  return (
    <button
      type="button"
      className={cx(styles.tile, cls)}
      data-testid={TID.bubbleImage}
      data-index={i}
      data-state={state}
      aria-label={t('bubble.image.accessible_name', { i: i + 1, n, name: a.name })}
      onClick={() => void invoke('files:open', { path: a.path })}
    >
      {url && state !== 'broken' && (
        <img ref={cached} src={url} alt="" className={styles.tileImg} onLoad={() => setState('ready')} onError={() => setState('broken')} />
      )}
      {state === 'loading' && (
        <span className={styles.tileCover}>
          <Spinner size={24} />
        </span>
      )}
      {state === 'broken' && (
        <span className={cx(styles.tileCover, styles.tileBroken)}>
          <Icon name="Image" size={24} />
          <span>{t('bubble.image.broken')}</span>
        </span>
      )}
      {more > 0 && <span className={styles.tileMore}>{t('bubble.image.more_count', { n: more })}</span>}
    </button>
  );
}

/** §10.1 grid: 1 → 320 wide; 2 → 159 × 200 each; 3 → 320 × 200 + two 159; 4–6 → 2 × 2 with "+{n}" on the 4th. */
export function ImageGrid({ images, children }: { images: Attachment[]; children?: ReactNode }) {
  const n = images.length;
  const shown = images.slice(0, 4);
  const more = n > 4 ? n - 4 : 0;
  const cls = (i: number) =>
    n === 1 ? styles.tileOne : n === 2 ? styles.tileTall : n === 3 && i === 0 ? styles.tileWide : styles.tileSquare;
  return (
    <div className={cx(styles.grid, n === 1 && styles.gridOne)} data-count={Math.min(n, 4)}>
      {shown.map((a, i) => (
        <ImageTile key={a.id} a={a} i={i} n={n} more={i === 3 ? more : 0} cls={cls(i) ?? ''} />
      ))}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- link preview (§10.6)

export interface PreviewData {
  url: string;
  title: string;
  description?: string;
  domain: string;
  image?: string | null;
}

// GAP: GAPS.md 2026-10-17 "the user's link preview has no data source"
export function LinkPreviewBlock({ p }: { p: PreviewData }) {
  return (
    <button type="button" className={styles.preview} data-testid={TID.bubbleLinkPreview} onClick={() => openUrl(p.url)}>
      {p.image && <img className={styles.previewImg} src={p.image} alt="" />}
      <span className={styles.previewText}>
        <span className={styles.previewTitle}>{p.title}</span>
        {p.description && <span className={styles.previewDesc}>{p.description}</span>}
        <span className={styles.previewDomain}>{p.domain}</span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- read more (§10.5)

export function useReadMore(expanded: boolean): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [clamp, setClamp] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) {
      setClamp(false);
      return;
    }
    // Measured when the shared observer reports the box (after layout), never by reading layout while rows mount: a
    // synchronous scrollHeight read per mounted bubble forced a layout in every scrolled frame (PERF-04).
    return observeText(el, (height) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
      setClamp(needsReadMore(height, lh));
    });
  }, [expanded]);
  return [ref, clamp];
}

const textWatchers = new Map<Element, (height: number) => void>();
let textObserver: ResizeObserver | null = null;

/** One ResizeObserver for every bubble text (not one per row); the callback runs with layout already done. */
function observeText(el: HTMLElement, cb: (height: number) => void): () => void {
  textObserver ??= new ResizeObserver((entries) => {
    for (const e of entries) textWatchers.get(e.target)?.((e.target as HTMLElement).scrollHeight);
  });
  textWatchers.set(el, cb);
  textObserver.observe(el);
  return () => {
    textWatchers.delete(el);
    textObserver?.unobserve(el);
  };
}
