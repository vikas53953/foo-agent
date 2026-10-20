// Spec: 04 §13.5 (a kit surface drawn by foo in foo's look: the 15 standard A2UI parts of `foo.kit.v1` used as-is, Modal
// not used, plus the foo components; bound values re-checked after they resolve, a value that fails drops its component
// with the "Couldn't show part of this" caption; two-way controls write the surface's data model; user actions go
// renderer → main `kit:action` → engine `kit.action`; every TextField value passes the 04-2 §22.4 secret patterns before it
// leaves the renderer and a match is refused, Article 8; `Image` only `data:` images or a chat file, web images never
// load), 02 §F19.9 (charts), CR-0022 §(c) (catalog), AT-340, AT-353, AT-354, AT-355, AT-356, X-180. R1 T2.
// R1 T4: Stepper, Compare, Calculator, GoalRing, TimedChecklist, ShortForm (AT-342, 343, 346, 347, 348, 351) and the
// Secret box offer after a refused value (AT-370).
// Parts are drawn by plain functions, not components, so one render counts the parts it had to drop (the caption).
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { t } from '../../shared/copy/t';
import type { KitActionMessage, KitComponent } from '../../shared/kit/catalog';
import { absPath, boundPath, getPath, INVALID, resolveContext, resolveField, type Surface } from '../../shared/kit/surface';
import { TID } from '../../shared/testids';
import { invoke } from '../ipc/client';
import { clockNow } from '../store/apply';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { ICONS } from '../ui/icons/registry';
import { cx } from '../ui/cx';
import { Calculator, type CalcInput } from './Calculator';
import { Compare } from './Compare';
import { GoalRing } from './GoalRing';
import { LineChart, type ChartSeries } from './LineChart';
import { firstSecret, SecretRefused, type SecretCatch } from './SecretRefused';
import { ShortForm, formValues } from './ShortForm';
import { Stepper } from './Stepper';
import { TimedChecklist } from './TimedChecklist';
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
  data: unknown;
  key: string;
  /** While the reply streams, a bound value may still be on its way: its component waits instead of being dropped. */
  streaming: boolean;
  tally: { dropped: number };
  edit(path: string, value: unknown): void;
  act(c: Extract<KitComponent, { component: 'Button' }>, scope: string): void;
  /** Sends one user action (R1 T4: a ShortForm submit); a secret-looking value is refused and `clear` drops it. */
  send(sourceId: string, name: string, context: Record<string, unknown>, clear: (caught: SecretCatch) => void): void;
  agentName: string;
}

/**
 * Where a piece keeps its own state in the surface's data model (R1 T4: ShortForm values, TimedChecklist ticks): under
 * `/_kit/{component id}` and the list item it is drawn for, so the AI's own paths are never touched.
 */
const ownPath = (c: KitComponent, scope: string) => `/_kit/${c.id}${scope}`;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A Calculator's inputs by name: the data model's number at the input's name (relative to the item), else its own value. */
function calcValues(ctx: Ctx, inputs: readonly CalcInput[], scope: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of inputs) {
    const v = getPath(ctx.data, absPath(i.name, scope));
    out[i.name] = isNumber(v) ? v : i.value;
  }
  return out;
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
      // 04 §13.5: a chat file (`file:{id}`) needs the chat's files list, which this renderer does not read yet (T7 Keep
      // brings it); until then its alt text stands in. `data:` images draw.
      if (!url.startsWith('data:')) return <p className={styles.text_caption}>{c.alt}</p>;
      return <img className={styles.image} src={url} alt={c.alt} />;
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
    case 'Stepper': {
      const value = field<number>(ctx, c, 'value', scope);
      if (value === INVALID || c.max <= c.min) return INVALID;
      const path = boundPath(c, 'value', scope);
      return (
        <Stepper label={c.label} value={value} min={c.min} max={c.max} step={c.step} onChange={path ? (v) => ctx.edit(path, v) : null} />
      );
    }
    case 'Compare':
      return <Compare columns={c.columns} highlight={c.highlight} why={c.why} />;
    case 'Calculator':
      return (
        <Calculator
          inputs={c.inputs}
          outputs={c.outputs}
          values={calcValues(ctx, c.inputs, scope)}
          onInput={(name, v) => ctx.edit(absPath(name, scope), v)}
        />
      );
    case 'GoalRing': {
      const value = field<number>(ctx, c, 'value', scope);
      if (value === INVALID) return INVALID;
      return <GoalRing value={value} target={c.target} label={c.label} />;
    }
    case 'TimedChecklist': {
      const path = `${ownPath(c, scope)}/ticks`;
      const saved = getPath(ctx.data, path);
      const ticks = Array.isArray(saved) ? saved.map((v) => v === true) : [];
      return (
        <TimedChecklist
          steps={c.steps}
          ticks={ticks}
          onTick={(i, on) => {
            const next = c.steps.map((_, k) => (k === i ? on : ticks[k] === true));
            ctx.edit(path, next);
          }}
        />
      );
    }
    case 'ShortForm': {
      const base = ownPath(c, scope);
      const values: Record<string, string> = {};
      for (const f of c.fields) {
        const v = getPath(ctx.data, `${base}/${f.name}`);
        if (typeof v === 'string') values[f.name] = v;
      }
      return (
        <ShortForm
          fields={c.fields}
          values={values}
          agentName={ctx.agentName}
          onChange={(name, v) => ctx.edit(`${base}/${name}`, v)}
          onSubmit={() =>
            ctx.send(
              c.id,
              c.action.event.name,
              { ...resolveContext(c.action.event.context, ctx.data, scope), ...formValues(c.fields, values) },
              (caught) => {
                for (const f of c.fields) {
                  const typed = (values[f.name] ?? '').trim();
                  if (typed === caught.text || String(Number(typed)) === caught.text) ctx.edit(`${base}/${f.name}`, caught.rest);
                }
              },
            )
          }
        />
      );
    }
    default:
      // The other foo components arrive with R1 T3 (places and time) and T7 (LiveStamp); a valid one draws nothing until
      // then and is not counted as dropped.
      return null;
  }
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

/** Keys a control inside the surface uses for itself (a Slider, Stepper, field or picker); they must not reach the
 * message list, which moves focus between rows on the arrow keys (04 §1.8). R1 T4. */
const CONTROL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
function keepControlKeys(e: KeyboardEvent<HTMLDivElement>) {
  const el = e.target as HTMLElement;
  if (CONTROL_KEYS.has(e.key) && el !== e.currentTarget && el.matches('input, select, textarea, [role="spinbutton"], [role="tab"]'))
    e.stopPropagation();
}

/** Every string value that would leave the renderer with an action (context values and the surface's TextField values). */
function outgoingText(context: Record<string, unknown>): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    // A card number typed into a number field travels as a number (R1 T4: ShortForm); it is checked as its digits.
    else if (typeof v === 'number') out.push(String(v));
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
}: {
  surface: Surface;
  host: SurfaceHost;
  agentName: string;
  streaming?: boolean;
  /** Messages or components the block's parse dropped; the last surface of a block carries them, so one caption shows. */
  blockDropped: number;
}) {
  const key = `${'messageId' in host ? host.messageId : host.cardId}:${surface.id}`;
  const data = useSurfaceData(key, surface.data);
  const [sent, setSent] = useState<string | null>(null);
  const [refused, setRefused] = useState<{ caught: SecretCatch; clear: (caught: SecretCatch) => void } | null>(null);
  const send: Ctx['send'] = (sourceId, name, context, clear) => {
    // Article 8 / 04-2 §22.4: a value that looks like a password, code or card number never leaves the renderer; the
    // Secret box is offered for it instead (R1 T4).
    const caught = firstSecret(outgoingText(context));
    if (caught) {
      setRefused({ caught, clear });
      setSent(null);
      return;
    }
    setRefused(null);
    const msg: KitActionMessage = {
      ...host,
      surfaceId: surface.id,
      name,
      sourceComponentId: sourceId,
      context,
      timestamp: new Date(clockNow()).toISOString(),
    };
    void invoke('kit:action', msg).then(
      (r) => setSent(r.ok ? sourceId : null),
      () => setSent(null),
    );
  };
  const ctx: Ctx = {
    surface,
    data,
    key,
    streaming,
    tally: { dropped: 0 },
    edit: (path, value) => editSurface(key, surface.data, path, value),
    act: (c, scope) =>
      send(c.id, c.action.event.name, resolveContext(c.action.event.context, data, scope), (caught) => {
        // The secret leaves the TextField it was typed in (04-2 §22.4: the span is removed from the field).
        for (const f of Object.values(surface.components)) {
          if (f.component !== 'TextField') continue;
          const path = boundPath(f, 'value', scope) ?? boundPath(f, 'value');
          if (path && getPath(data, path) === caught.text) editSurface(key, surface.data, path, caught.rest);
        }
      }),
    send,
    agentName,
  };
  const root = node(ctx, 'root', '', 0);
  const dropped = blockDropped + ctx.tally.dropped;
  return (
    <div
      className={styles.surface}
      role="group"
      aria-label={t('kit.surface.accessible_name', { agentName })}
      data-testid={TID.kitSurface}
      data-surface-id={surface.id}
      onKeyDown={keepControlKeys}
    >
      {root}
      {sent && (
        <p className={styles.text_caption} role="status">
          {t('kit.action.sent', { agentName })}
        </p>
      )}
      {refused && (
        <SecretRefused
          chatId={host.chatId}
          caught={refused.caught}
          onMoved={() => {
            refused.clear(refused.caught);
            setRefused(null);
          }}
        />
      )}
      {dropped > 0 && <KitDropped />}
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
