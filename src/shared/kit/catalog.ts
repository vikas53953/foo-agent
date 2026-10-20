// Spec: 04 §13.5 (kit surface: A2UI v0.9.1 messages restricted to foo's catalog; `Image` sources only `data:` URIs or a
// file already in the chat's files; every TextField / ShortForm value passes the 04-2 §22.4 patterns), CR-0022 §(c) (the
// catalog `foo.kit.v1`: 15 standard A2UI parts used as-is, Modal not used, plus 13 foo components), pick 2 (zod schemas
// here are the one source of truth: they validate every message and generate the AI prompt section), pick 5 (Calculator
// formulas are text for shared/kit/evaluate.ts, never code), X-180.
import { z } from 'zod';

export const CATALOG_ID = 'foo.kit.v1';
export const A2UI_VERSIONS = ['v0.9', 'v0.9.1'] as const;

const id = z.string().min(1).max(64);
const short = z.string().max(200);
const label = z.string().min(1).max(80);

/** A2UI dynamic value: a literal, or a JSON Pointer into the surface's data model (`{ "path": "/x" }`). */
export const bound = <T extends z.ZodType>(t: T) => z.union([t, z.object({ path: z.string().min(1).max(200) }).strict()]);

/** Static child ids, or a template that repeats `componentId` for every item of the list at `path`. */
const children = z.union([z.array(id).max(50), z.object({ path: z.string().min(1).max(200), componentId: id }).strict()]);

/** A2UI `action.event`: the name and context sent back as the client `action` message (08-1 §2.4 `kit_action`). */
export const KitActionSchema = z
  .object({
    event: z
      .object({
        name: z.string().min(1).max(60),
        context: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();

/** 04 §13.5: an Image shows only a `data:` image or a file already in this chat's files (`file:{fileId}`). */
export const KitImageSrcSchema = z.string().regex(/^(data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+|file:[\w-]{1,80})$/);

const base = { id, weight: z.number().min(0).max(10).optional() };
const part = <N extends string, S extends z.ZodRawShape>(name: N, shape: S, about: string) =>
  z
    .object({ ...base, component: z.literal(name), ...shape })
    .strict()
    .describe(about);

const point = z.object({ x: z.union([z.string().max(40), z.number()]), y: z.number() }).strict();

/** The 15 standard A2UI parts foo draws (CR-0022 §(c); Modal is not used). */
export const STANDARD_PARTS = [
  part('Row', { children, justify: z.enum(['start', 'center', 'end', 'spaceBetween']).optional() }, 'items side by side'),
  part('Column', { children, align: z.enum(['start', 'center', 'end', 'stretch']).optional() }, 'items stacked'),
  part('List', { children, direction: z.enum(['vertical', 'horizontal']).optional() }, 'a list of items'),
  part('Text', { text: bound(z.string().max(2000)), variant: z.enum(['title', 'body', 'caption']).optional() }, 'words'),
  part('Image', { url: bound(KitImageSrcSchema), alt: short }, 'a picture (data: or a chat file only)'),
  part('Icon', { name: z.string().min(1).max(40) }, 'a small Fluent icon by name'),
  part('Divider', {}, 'a thin line'),
  part('Button', { child: id, primary: z.boolean().optional(), action: KitActionSchema }, 'a button; sends its action'),
  part(
    'TextField',
    { label, value: bound(z.string().max(2000)).optional(), variant: z.enum(['shortText', 'longText', 'number', 'date']).optional() },
    'a text box (never for passwords, codes or card numbers)',
  ),
  part('CheckBox', { label, value: bound(z.boolean()) }, 'a tick box'),
  part(
    'Slider',
    { label: label.optional(), value: bound(z.number()), min: z.number(), max: z.number(), step: z.number().positive().optional() },
    'a slider',
  ),
  part(
    'DateTimeInput',
    { label: label.optional(), value: bound(z.string().max(40)), enableDate: z.boolean().optional(), enableTime: z.boolean().optional() },
    'a date or time picker',
  ),
  part(
    'ChoicePicker',
    {
      label: label.optional(),
      options: z
        .array(z.object({ label, value: z.string().min(1).max(80) }).strict())
        .min(2)
        .max(10),
      value: bound(z.array(z.string().max(80))),
      variant: z.enum(['mutuallyExclusive', 'multipleSelection']).optional(),
    },
    'pick one or more options',
  ),
  part('Card', { child: id }, 'a framed group'),
  part(
    'Tabs',
    {
      tabs: z
        .array(z.object({ title: label, child: id }).strict())
        .min(2)
        .max(6),
    },
    'tabs',
  ),
] as const;

/** foo's 13 components (CR-0022 §(c)): 12 pieces plus LiveStamp. */
export const FOO_PARTS = [
  part(
    'LineChart',
    {
      variant: z.enum(['line', 'area', 'bar']),
      title: label.optional(),
      unit: z.enum(['number', 'rupees', 'percent']).optional(),
      series: bound(
        z
          .array(z.object({ label, points: z.array(point).min(1).max(60) }).strict())
          .min(1)
          .max(3),
      ),
    },
    'a chart; one hue, at most 3 series',
  ),
  part(
    'MapStops',
    {
      stops: z
        .array(
          z.object({ name: label, lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), note: short.optional() }).strict(),
        )
        .min(1)
        .max(10),
    },
    'numbered stops on a plain panel (no map tiles)',
  ),
  part(
    'Stepper',
    { label, value: bound(z.number()), min: z.number(), max: z.number(), step: z.number().positive().optional() },
    'a number with + and -',
  ),
  part(
    'Compare',
    {
      columns: z
        .array(
          z
            .object({
              title: label,
              rows: z
                .array(z.object({ label, value: short }).strict())
                .min(1)
                .max(12),
            })
            .strict(),
        )
        .min(2)
        .max(3),
      highlight: z.number().int().min(0).max(2).optional(),
      why: short.optional(),
    },
    'options side by side; highlight is the best column and why says why in one line',
  ),
  part(
    'Timeline',
    {
      items: z
        .array(z.object({ date: z.string().max(40), title: label, amount: z.number().optional() }).strict())
        .min(1)
        .max(20),
    },
    'events in date order',
  ),
  part(
    'WeekCalendar',
    {
      days: z.array(z.string().max(40)).min(1).max(7),
      slots: z
        .array(
          z.object({ day: z.number().int().min(0).max(6), start: z.string().max(5), end: z.string().max(5), busy: z.boolean() }).strict(),
        )
        .max(70),
    },
    'a week with busy and free slots',
  ),
  part(
    'TimedChecklist',
    {
      steps: z
        .array(z.object({ title: label, seconds: z.number().int().min(1).max(86_400).optional() }).strict())
        .min(1)
        .max(20),
    },
    'steps to tick, some with a timer',
  ),
  part(
    'Calculator',
    {
      inputs: z
        .array(z.object({ name: z.string().regex(/^[a-z][a-zA-Z0-9]{0,23}$/), label, value: z.number() }).strict())
        .min(1)
        .max(8),
      outputs: z
        .array(z.object({ label, formula: z.string().min(1).max(200), unit: z.enum(['number', 'rupees', 'percent']).optional() }).strict())
        .min(1)
        .max(6),
    },
    'inputs and results; formulas use + - * / ^ ( ), min, max, round, pmt and input names only',
  ),
  part('GoalRing', { value: bound(z.number()), target: z.number().positive(), label }, 'progress to a goal'),
  part(
    'ListPick',
    {
      rows: z
        .array(z.object({ title: label, sub: short.optional() }).strict())
        .min(2)
        .max(10),
      action: KitActionSchema,
    },
    'pick one row; the answer counts like a Choice card answer',
  ),
  part(
    'TimePick',
    { date: z.string().max(40), slots: z.array(z.string().max(20)).min(1).max(24), action: KitActionSchema },
    'pick a time slot',
  ),
  part(
    'ShortForm',
    {
      fields: z
        .array(
          z
            .object({
              name: z.string().regex(/^[a-z][a-zA-Z0-9]{0,23}$/),
              label,
              type: z.enum(['text', 'number', 'date', 'choice']),
              options: z.array(z.string().max(80)).max(10).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(6),
      action: KitActionSchema,
    },
    'up to 6 fields and a submit; never asks for passwords, card numbers, codes or keys',
  ),
  part('LiveStamp', { asOf: z.number().int().positive(), refreshable: z.boolean() }, 'shows when the data was fetched, with Refresh'),
] as const;

const ALL_PARTS = [...STANDARD_PARTS, ...FOO_PARTS] as const;
export const KitComponentSchema = z.discriminatedUnion('component', ALL_PARTS);
export type KitComponent = z.infer<typeof KitComponentSchema>;
export type KitComponentName = KitComponent['component'];
export const KIT_COMPONENT_NAMES: readonly KitComponentName[] = ALL_PARTS.map((p) => p.shape.component.value);
export const FOO_COMPONENT_NAMES: readonly KitComponentName[] = FOO_PARTS.map((p) => p.shape.component.value);

const surfaceId = z.string().min(1).max(64);

/**
 * One A2UI server message (v0.9.1: exactly one of the four keys). `updateComponents` keeps its components as raw objects:
 * each is checked on its own by `KitComponentSchema`, so one bad component is dropped and the rest still draw (04 §13.5).
 */
export const KitMessageSchema = z.union([
  z
    .object({
      version: z.enum(A2UI_VERSIONS).optional(),
      createSurface: z.object({ surfaceId, catalogId: z.literal(CATALOG_ID) }).strict(),
    })
    .strict(),
  z
    .object({
      version: z.enum(A2UI_VERSIONS).optional(),
      updateComponents: z
        .object({
          surfaceId,
          components: z
            .array(z.object({ id, component: z.string().min(1).max(40) }).loose())
            .min(1)
            .max(100),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      version: z.enum(A2UI_VERSIONS).optional(),
      updateDataModel: z.object({ surfaceId, path: z.string().max(200).optional(), value: z.unknown().optional() }).strict(),
    })
    .strict(),
  z.object({ version: z.enum(A2UI_VERSIONS).optional(), deleteSurface: z.object({ surfaceId }).strict() }).strict(),
]);

/** A message after the per-component check: `updateComponents` holds only valid components. */
export type KitMessage =
  | { createSurface: { surfaceId: string; catalogId: typeof CATALOG_ID } }
  | { updateComponents: { surfaceId: string; components: KitComponent[] } }
  | { updateDataModel: { surfaceId: string; path?: string; value?: unknown } }
  | { deleteSurface: { surfaceId: string } };

/** 08-1 §2.4 `kit_action` payload: the A2UI client `action` message plus where the surface lives. */
export const KitActionMessageSchema = z
  .object({
    chatId: z.string().min(1).max(80),
    messageId: z.string().min(1).max(80).optional(),
    cardId: z.string().min(1).max(80).optional(),
    surfaceId,
    name: z.string().min(1).max(60),
    sourceComponentId: id,
    context: z.record(z.string(), z.unknown()),
    timestamp: z.string().max(40),
  })
  .strict()
  .refine((m) => (m.messageId === undefined) !== (m.cardId === undefined), { message: 'messageId or cardId, not both' });
export type KitActionMessage = z.infer<typeof KitActionMessageSchema>;
