// Spec: 04 §13.5 (a kit surface drawn by foo in foo's look: the 15 standard A2UI parts of `foo.kit.v1` used as-is, Modal
// not used, plus the foo components; bound values re-checked after they resolve, a value that fails drops its component
// with the "Couldn't show part of this" caption; two-way controls write the surface's data model; user actions go
// renderer → main `kit:action` → engine `kit.action`; every TextField value passes the 04-2 §22.4 secret patterns before it
// leaves the renderer and a match is refused, Article 8; `Image` only `data:` images or a chat file, web images never
// load), 02 §F19.9 (charts), CR-0022 §(c) (catalog), AT-340, AT-353, AT-354, AT-355, AT-356, X-180. R1 T2. R1 T3: the
// places and time pieces MapStops, Timeline, WeekCalendar, ListPick, TimePick (AT-341, AT-344, AT-345, AT-349, AT-350).
// R1 T7: LiveStamp (AT-352), Keep under the surface (pick 9, AT-369) and `Image` from a chat file (`file:{fileId}`, 04 §13.5).
// Parts are drawn by plain functions, not components, so one render counts the parts it had to drop (the caption).
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { t } from '../../shared/copy/t';
import type { KitActionMessage, KitComponent } from '../../shared/kit/catalog';
import { surfaceBody, surfaceTitle } from '../../shared/kit/keep';
import { pickContext, type PickContext } from '../../shared/kit/pick';
import { checkSecret } from '../../shared/redactor';
import { absPath, boundPath, getPath, INVALID, resolveContext, resolveField, type Surface } from '../../shared/kit/surface';
import { TID } from '../../shared/testids';
import { invoke } from '../ipc/client';
import { KeepButton } from '../keep/KeepButton';
import { clockNow } from '../store/apply';
import { useStore } from '../store/index';
import { mediaUrl } from '../messages/bubbleContext';
import { attachmentKind } from '../messages/BubbleParts';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { ICONS } from '../ui/icons/registry';
import { cx } from '../ui/cx';
import { LineChart, type ChartSeries } from './LineChart';
import { LiveStamp } from './LiveStamp';
import { ListPick, useAnswered } from './ListPick';
import { MapStops } from './MapStops';
import { TimePick } from './TimePick';
import { Timeline } from './Timeline';
import { WeekCalendar, weekLayout } from './WeekCalendar';
import { editSurface, useSurfaceData } from './model';
import styles from './KitSurface.module.css';

/** Where the surface lives: a foo message or a `kit` card (KitActionMessage: one of the two). */
export type SurfaceHost = { chatId: string; messageId: string } | { chatId: string; cardId: string };

/** Deeper than this a tree is broken (or a cycle): the rest is dropped. */
const MAX_DEPTH = 12;
/** A template list draws at most this many items (the catalog caps static children at 50). */
const MAX_ITEMS = 50;

interface Ctx {
  surface: Surface;
  host: SurfaceHost;
  data: unknown;
  key: string;
  /** While the reply streams, a bound value may still be on its way: its component waits instead of being dropped. */
  streaming: boolean;
  tally: { dropped: number };
  /** R1 T7: an image file already in the chat (`file:{fileId}`), as its app://media URL; null when it is not there. */
  fileUrl(fileId: string): string | null;
  edit(path: string, value: unknown): void;
  act(c: Extract<KitComponent, { component: 'Button' }>, scope: string): void;
  /** R1 T3: a ListPick row or TimePick slot was picked; true once main took the action (05-1 §5.3.4). */
  pick(c: Extract<KitComponent, { component: 'ListPick' | 'TimePick' }>, scope: string, pick: PickContext): Promise<boolean>;
}

const isIcon = (name: string): name is IconName => Object.prototype.hasOwnProperty.call(ICONS, name);

function field<T>(ctx: Ctx, c: KitComponent, name: string, scope: string): T | typeof INVALID {
  return resolveField<T>(c, name, ctx.data, scope);
}

function kids(ctx: Ctx, children: Extract<KitComponent, { component: 'Row' }>['children'], scope: string, depth: number): ReactNode[] {
  if (Array.isArray(children)) return children.map((id) => node(ctx, id, scope, depth + 1));
  const base = absPath(children.path, scope);
  const list = getPath(ctx.data, base);
  if (!Array.isArray(list)) {
    if (!ctx.streaming) ctx.tally.dropped++;
    return [];
  }
  return list.slice(0, MAX_ITEMS).map((_, i) => node(ctx, children.componentId, `${base}/${i}`, depth + 1, `${base}/${i}`));
}

/** One component by id; null when it is missing (still streaming), broken or dropped. */
function node(ctx: Ctx, id: string, scope: string, depth: number, key: string = id): ReactNode {
  const c = ctx.surface.components[id];
  if (!c) return null;
  if (depth > MAX_DEPTH) {
    ctx.tally.dropped++;
    return null;
  }
  const out = part(ctx, c, scope, depth);
  if (out === INVALID) {
    if (!ctx.streaming) ctx.tally.dropped++;
    return null;
  }
  return (
    <div key={key} className={styles.slot} style={c.weight !== undefined ? { flexGrow: c.weight } : undefined} data-kit-id={c.id}>
      {out}
    </div>
  );
}

function part(ctx: Ctx, c: KitComponent, scope: string, depth: number): ReactNode | typeof INVALID {
  switch (c.component) {
    case 'Row':
      return <div className={cx(styles.row, c.justify && styles[`justify_${c.justify}`])}>{kids(ctx, c.children, scope, depth)}</div>;
    case 'Column':
      return <div className={cx(styles.column, c.align && styles[`align_${c.align}`])}>{kids(ctx, c.children, scope, depth)}</div>;
    case 'List':
      return (
        <div role="list" className={c.direction === 'horizontal' ? styles.row : styles.column}>
          {kids(ctx, c.children, scope, depth)}
        </div>
      );
    case 'Text': {
      const text = field<string>(ctx, c, 'text', scope);
      if (text === INVALID) return INVALID;
      const Tag = c.variant === 'title' ? 'h4' : 'p';
      return (
        <Tag className={styles[`text_${c.variant ?? 'body'}`]} data-copy="ai">
          {text}
        </Tag>
      );
    }
    case 'Image': {
      const url = field<string>(ctx, c, 'url', scope);
      if (url === INVALID) return INVALID;
      // 04 §13.5: `data:` images and image files already in the chat (`file:{fileId}`) draw; anything else (a web image)
      // never loads, and its alt text stands in.
      const src = url.startsWith('data:') ? url : url.startsWith('file:') ? ctx.fileUrl(url.slice('file:'.length)) : null;
      if (!src) return <p className={styles.text_caption}>{c.alt}</p>;
      return <img className={styles.image} src={src} alt={c.alt} />;
    }
    case 'Icon':
      return isIcon(c.name) ? <Icon name={c.name} size={20} /> : INVALID;
    case 'Divider':
      return <hr className={styles.divider} />;
    case 'Card':
      return <div className={styles.card}>{node(ctx, c.child, scope, depth + 1)}</div>;
    case 'Tabs':
      return <KitTabs tabs={c.tabs.map((tab) => ({ title: tab.title, body: node(ctx, tab.child, scope, depth + 1) }))} />;
    case 'Button':
      return (
        <Button
          variant={c.primary ? 'primary' : 'outline'}
          data-testid={TID.kitButton}
          data-kit-action={c.action.event.name}
          onClick={() => ctx.act(c, scope)}
        >
          {node(ctx, c.child, scope, depth + 1)}
        </Button>
      );
    case 'TextField': {
      const value = c.value === undefined ? '' : field<string>(ctx, c, 'value', scope);
      if (value === INVALID) return INVALID;
      const path = boundPath(c, 'value', scope);
      return (
        <KitTextField
          label={c.label}
          value={value}
          variant={c.variant ?? 'shortText'}
          readOnly={path === null}
          onChange={(v) => path && ctx.edit(path, v)}
        />
      );
    }
    case 'CheckBox': {
      const value = field<boolean>(ctx, c, 'value', scope);
      if (value === INVALID) return INVALID;
      const path = boundPath(c, 'value', scope);
      return (
        <label className={styles.check}>
          <input type="checkbox" checked={value} readOnly={!path} onChange={(e) => path && ctx.edit(path, e.target.checked)} />
          <span data-copy="ai">{c.label}</span>
        </label>
      );
    }
    case 'Slider': {
      const value = field<number>(ctx, c, 'value', scope);
      if (value === INVALID || c.max <= c.min) return INVALID;
      const path = boundPath(c, 'value', scope);
      return (
        <label className={styles.slider}>
          {c.label && <span data-copy="ai">{c.label}</span>}
          <input
            type="range"
            min={c.min}
            max={c.max}
            step={c.step ?? 1}
            value={Math.min(c.max, Math.max(c.min, value))}
            aria-label={c.label}
            disabled={!path}
            onChange={(e) => path && ctx.edit(path, Number(e.target.value))}
          />
        </label>
      );
    }
    case 'DateTimeInput': {
      const value = field<string>(ctx, c, 'value', scope);
      if (value === INVALID) return INVALID;
      const path = boundPath(c, 'value', scope);
      const type = c.enableDate === false ? 'time' : c.enableTime ? 'datetime-local' : 'date';
      return (
        <label className={styles.field}>
          {c.label && <span data-copy="ai">{c.label}</span>}
          <input
            className={styles.input}
            type={type}
            value={value}
            readOnly={!path}
            onChange={(e) => path && ctx.edit(path, e.target.value)}
          />
        </label>
      );
    }
    case 'ChoicePicker': {
      const value = field<string[]>(ctx, c, 'value', scope);
      if (value === INVALID) return INVALID;
      const path = boundPath(c, 'value', scope);
      const multi = c.variant === 'multipleSelection';
      return (
        <fieldset className={styles.choices}>
          {c.label && (
            <legend className={styles.text_caption} data-copy="ai">
              {c.label}
            </legend>
          )}
          {c.options.map((o) => (
            <label key={o.value} className={styles.check}>
              <input
                type={multi ? 'checkbox' : 'radio'}
                name={`${ctx.key}:${c.id}:${scope}`}
                checked={value.includes(o.value)}
                readOnly={!path}
                onChange={(e) =>
                  path && ctx.edit(path, multi ? (e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value)) : [o.value])
                }
              />
              <span data-copy="ai">{o.label}</span>
            </label>
          ))}
        </fieldset>
      );
    }
    case 'LineChart': {
      const series = field<ChartSeries[]>(ctx, c, 'series', scope);
      if (series === INVALID) return INVALID;
      return <LineChart variant={c.variant} series={series} title={c.title} unit={c.unit} />;
    }
    case 'MapStops':
      return <MapStops stops={c.stops} />;
    case 'Timeline':
      return <Timeline items={c.items} />;
    case 'WeekCalendar': {
      const layout = weekLayout(c.days, c.slots);
      return layout ? <WeekCalendar layout={layout} /> : INVALID;
    }
    case 'ListPick':
      return <KitListPick ctx={ctx} c={c} scope={scope} />;
    case 'TimePick':
      return <KitTimePick ctx={ctx} c={c} scope={scope} />;
    case 'LiveStamp':
      return <LiveStamp asOf={c.asOf} refreshable={c.refreshable} host={ctx.host} surfaceId={ctx.surface.id} />;
    default:
      // The other foo components arrive with R1 T4 (numbers and forms); a valid one draws nothing until then and is
      // not counted as dropped.
      return null;
  }
}

/** Components, so the answer they read from the chat in the store is a hook (05-1 §5.3.5: a pick stays answered). */
function KitListPick({ ctx, c, scope }: { ctx: Ctx; c: Extract<KitComponent, { component: 'ListPick' }>; scope: string }) {
  const answered = useAnswered(ctx.host, ctx.surface.id, c.id);
  return <ListPick rows={c.rows} answered={answered} onPick={(row) => ctx.pick(c, scope, { choice: c.rows[row - 1]!.title, row })} />;
}

function KitTimePick({ ctx, c, scope }: { ctx: Ctx; c: Extract<KitComponent, { component: 'TimePick' }>; scope: string }) {
  const answered = useAnswered(ctx.host, ctx.surface.id, c.id);
  return (
    <TimePick date={c.date} slots={c.slots} answered={answered} onPick={(slot) => ctx.pick(c, scope, { choice: slot, date: c.date })} />
  );
}

/** Arrow keys, Home and End move the selection and focus with it (WAI-ARIA tabs, automatic activation). */
const TAB_KEYS: Record<string, (i: number, n: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

function KitTabs({ tabs }: { tabs: { title: string; body: ReactNode }[] }) {
  const [on, setOn] = useState(0);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const move = TAB_KEYS[e.key];
    if (!move) return;
    e.preventDefault();
    const next = move(on, tabs.length);
    setOn(next);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };
  return (
    <div className={styles.tabs}>
      <div role="tablist" className={styles.tablist} onKeyDown={onKey}>
        {tabs.map((tab, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === on}
            tabIndex={i === on ? 0 : -1}
            className={cx(styles.tab, i === on && styles.tabOn)}
            onClick={() => setOn(i)}
            data-copy="ai"
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tabs[on]?.body}</div>
    </div>
  );
}

function KitTextField({
  label,
  value,
  variant,
  readOnly,
  onChange,
}: {
  label: string;
  value: string;
  variant: 'shortText' | 'longText' | 'number' | 'date';
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span data-copy="ai">{label}</span>
      {variant === 'longText' ? (
        <textarea
          className={cx(styles.input, styles.long)}
          data-testid={TID.kitTextField}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={styles.input}
          data-testid={TID.kitTextField}
          type={variant === 'number' ? 'number' : variant === 'date' ? 'date' : 'text'}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

/** Every string value that would leave the renderer with an action (context values and the surface's TextField values). */
function outgoingText(context: Record<string, unknown>): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(context);
  return out;
}

export function KitSurface({
  surface,
  host,
  agentName,
  streaming = false,
  blockDropped,
  keep,
}: {
  surface: Surface;
  host: SurfaceHost;
  agentName: string;
  streaming?: boolean;
  /** R1 T7: shows Keep under the surface once it is drawn (absent in a kept copy). `kept`: its card is kept already. */
  keep?: { kept: boolean };
  /** Messages or components the block's parse dropped; the last surface of a block carries them, so one caption shows. */
  blockDropped: number;
}) {
  const key = `${'messageId' in host ? host.messageId : host.cardId}:${surface.id}`;
  const data = useSurfaceData(key, surface.data);
  const [sent, setSent] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const chatMessages = useStore((st) => st.messages.byChat[host.chatId]);
  const send = (c: KitComponent, name: string, context: Record<string, unknown>): Promise<boolean> => {
    const msg: KitActionMessage = {
      ...host,
      surfaceId: surface.id,
      name,
      sourceComponentId: c.id,
      context,
      timestamp: new Date(clockNow()).toISOString(),
    };
    return invoke('kit:action', msg).then(
      (r) => r.ok,
      () => false,
    );
  };
  const ctx: Ctx = {
    surface,
    host,
    data,
    key,
    streaming,
    tally: { dropped: 0 },
    fileUrl: (fileId) => {
      for (const id of chatMessages?.ids ?? []) {
        const a = chatMessages!.byId[id]?.attachments?.find((x) => x.id === fileId);
        if (a) return attachmentKind(a) === 'image' ? mediaUrl(a.path) : null;
      }
      return null;
    },
    edit: (path, value) => editSurface(key, surface.data, path, value),
    act: (c, scope) => {
      const context = resolveContext(c.action.event.context, data, scope);
      // Article 8 / 04-2 §22.4: a value that looks like a password, code or card number never leaves the renderer.
      if (outgoingText(context).some((s) => checkSecret(s) !== null)) {
        setRefused(c.id);
        setSent(null);
        return;
      }
      setRefused(null);
      void send(c, c.action.event.name, context).then((ok) => setSent(ok ? c.id : null));
    },
    pick: (c, scope, p) => {
      const context = pickContext(c, data, scope, p);
      if (outgoingText(context).some((s) => checkSecret(s) !== null)) {
        setRefused(c.id);
        return Promise.resolve(false);
      }
      setRefused(null);
      return send(c, c.action.event.name, context);
    },
  };
  const root = node(ctx, 'root', '', 0);
  const dropped = blockDropped + ctx.tally.dropped;
  return (
    <div
      ref={box}
      className={styles.surface}
      role="group"
      aria-label={t('kit.surface.accessible_name', { agentName })}
      data-testid={TID.kitSurface}
      data-surface-id={surface.id}
    >
      {root}
      {sent && (
        <p className={styles.text_caption} role="status">
          {t('kit.action.sent', { agentName })}
        </p>
      )}
      {refused && (
        <p className={styles.text_caption} role="alert">
          {t('kit.form.secret_refused')}
        </p>
      )}
      {dropped > 0 && <KitDropped />}
      {keep && !streaming && (
        <div className={styles.keep}>
          <KeepButton
            keepKey={key}
            kept={keep.kept}
            target={box}
            request={() => ({
              ...host,
              kind: 'kit',
              title: surfaceTitle(surface) ?? t('kit.surface.accessible_name', { agentName }),
              body: surfaceBody(surface, data),
            })}
          />
        </div>
      )}
    </div>
  );
}

/** 04 §13.5: the quiet caption under a surface that had to drop a part. */
export function KitDropped() {
  return (
    <p className={styles.dropped} data-testid={TID.kitDropped}>
      {t('kit.surface.dropped')}
    </p>
  );
}
