// Spec: 08-1 §3.1.1 (a payload that fails zod is IPC_REJECTED), §3.2 rows of the M13 screens (helper:*, group:*, chat:delete,
// files:list, files:pickFolder, activity:*, spend:month, search:*, settings:undo, data:deleteOlderThan; X-124), 08-0 §B.2
// `SearchFilter` + 'settings' and `search:query { helperId? }` (G-M13-16, CR-0017); M7's suggestions:* / routine:pauseAll
// rows until M7 merges. Limits: helper name ≤ 20, job and good result ≤ 120, group name ≤ 30 with 2–6 members (06-1 §3, §5).
import { z } from 'zod';
import type { InvokeIn } from '../../shared/ipc';
import type { ActivityKind, HelperApp, SearchFilter } from '../../shared/types';

export const M13_CHANNELS = [
  'helper:create',
  'helper:update',
  'helper:delete',
  'group:create',
  'group:update',
  'group:delete',
  'chat:delete',
  'files:list',
  'files:pickFolder',
  'activity:list',
  'activity:saveCsv',
  'spend:month',
  'search:query',
  'search:recent',
  'search:clearRecent',
  'search:ask',
  'settings:undo',
  'data:deleteOlderThan',
  'suggestions:listDismissed',
  'suggestions:restoreDismissed',
  'routine:pauseAll',
  'routine:resumeAll',
] as const;
export type M13Channel = (typeof M13_CHANNELS)[number];

const id = z.string().min(1).max(80);
const empty = z.object({}).strict() as z.ZodType<Record<string, never>>;
const HELPER_APPS = [
  'gmail',
  'gcal',
  'contacts',
  'whatsapp',
  'x',
  'outlook',
  'browser',
  'payments',
] as const satisfies readonly HelperApp[];
const ACTIVITY_KINDS = ['sent', 'paid', 'booked', 'deleted', 'connected', 'stopped', 'changed'] as const satisfies readonly ActivityKind[];
const SEARCH_FILTERS = ['all', 'messages', 'files', 'jobs', 'routines', 'memory', 'settings'] as const satisfies readonly SearchFilter[];

const helperForm = z
  .object({
    name: z.string().trim().min(1).max(20),
    jobText: z.string().trim().min(1).max(120),
    goodResult: z.string().max(120).optional(),
    faceRef: z.string().min(1).max(300),
    colorToken: z.string().regex(/^--h-[a-z]+$/),
    allowedApps: z.object(Object.fromEntries(HELPER_APPS.map((a) => [a, z.boolean()])) as Record<HelperApp, z.ZodBoolean>).strict(),
    template: z.enum(['trips', 'money', 'home', 'family']).optional(),
  })
  .strict();

const activityFilter = z
  .object({
    kind: z.enum(ACTIVITY_KINDS).optional(),
    actor: z.string().max(80).optional(),
    chatId: id.optional(),
    jobId: id.optional(),
    from: z.number().int(),
    to: z.number().int(),
    q: z.string().max(200).optional(),
  })
  .strict();

const hours = z
  .object({
    hours: z
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .optional(),
  })
  .strict();

/** One zod schema per M13 channel; IpcRouter's SCHEMAS spreads these in. */
export const M13_SCHEMAS: { [C in M13Channel]: z.ZodType<InvokeIn[C]> } = {
  'helper:create': helperForm as z.ZodType<InvokeIn['helper:create']>,
  'helper:update': z.object({ helperId: id, patch: helperForm.partial() }).strict() as z.ZodType<InvokeIn['helper:update']>,
  'helper:delete': z.object({ helperId: id, confirm: z.literal(true), stopJobs: z.boolean() }).strict(),
  'group:create': z.object({ name: z.string().trim().min(1).max(30), helperIds: z.array(id).min(2).max(6) }).strict(),
  'group:update': z
    .object({ chatId: id, name: z.string().trim().min(1).max(30).optional(), helperIds: z.array(id).min(2).max(6).optional() })
    .strict() as z.ZodType<InvokeIn['group:update']>,
  'group:delete': z.object({ chatId: id, confirm: z.literal(true) }).strict(),
  'chat:delete': z.object({ chatId: id, confirm: z.literal(true) }).strict(),
  'files:list': z
    .object({
      helperId: id.optional(),
      chatId: id.optional(),
      jobId: id.optional(),
      kinds: z.array(z.enum(['made', 'received', 'downloaded', 'screenshot'])).optional(),
      limit: z.number().int().min(1).max(200),
    })
    .strict() as z.ZodType<InvokeIn['files:list']>,
  'files:pickFolder': z.object({ purpose: z.enum(['output', 'grant', 'export', 'avatar']) }).strict(),
  'activity:list': activityFilter
    .extend({ beforeAt: z.number().int().optional(), limit: z.number().int().min(1).max(200) })
    .strict() as z.ZodType<InvokeIn['activity:list']>,
  'activity:saveCsv': z
    .object({ folder: z.string().min(1).max(1024), fileName: z.string().min(1).max(255), filter: activityFilter })
    .strict() as z.ZodType<InvokeIn['activity:saveCsv']>,
  'spend:month': z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict(),
  'search:query': z
    .object({
      q: z.string().max(200),
      filter: z.enum(SEARCH_FILTERS),
      limit: z.number().int().min(1).max(200).optional(),
      helperId: id.optional(),
    })
    .strict() as z.ZodType<InvokeIn['search:query']>,
  'search:recent': empty,
  'search:clearRecent': empty,
  'search:ask': z.object({ q: z.string().min(1).max(200) }).strict(),
  'settings:undo': z.object({ changeId: id }).strict(),
  'data:deleteOlderThan': z
    .object({
      days: z.union([z.literal(0), z.literal(30), z.literal(90), z.literal(365)]),
      chatId: id.optional(),
      confirm: z.literal(true),
      dryRun: z.literal(true).optional(),
    })
    .strict()
    .refine((r) => r.days !== 0 || r.chatId !== undefined) as z.ZodType<InvokeIn['data:deleteOlderThan']>,
  'suggestions:listDismissed': empty,
  'suggestions:restoreDismissed': z.object({ key: z.string().min(1).max(200).optional() }).strict() as z.ZodType<
    InvokeIn['suggestions:restoreDismissed']
  >,
  'routine:pauseAll': hours as z.ZodType<InvokeIn['routine:pauseAll']>,
  'routine:resumeAll': hours as z.ZodType<InvokeIn['routine:resumeAll']>,
};
