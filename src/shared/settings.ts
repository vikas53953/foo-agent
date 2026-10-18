// Spec: 08-0 §A (settings.json schema, X-53), §A.1 (ranges), X-150 (appearance.animations).
// Holds the keys the milestones built so far read (M0: window shell; M1: setup, identity, user, locale, ai, money,
// notifications.mutedChats for the chat list, footer and banners); later milestones add their keys with their defaults.
import { z } from 'zod';

export const ZOOM_STEPS = [80, 90, 100, 110, 125, 150, 175, 200] as const;

export const PROVIDER_IDS = [
  'claude-cli',
  'codex-cli',
  'gemini-cli',
  'openai-key',
  'anthropic-key',
  'google-key',
  'ollama',
  'fake',
] as const;

const providerSchema = z.object({
  kind: z.enum(['plan', 'key', 'local']),
  lastVerifiedAt: z.number().optional(),
  lastVerifyOk: z.boolean().optional(),
  model: z.string().optional(),
  cheapModel: z.string().optional(),
});

export const settingsSchema = z.object({
  schemaVersion: z.literal(2),
  setup: z.object({
    complete: z.boolean(),
    step: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  }),
  identity: z.object({
    agentName: z.string().min(1).max(20),
  }),
  user: z.object({
    firstName: z.string().min(1).max(40).optional(),
  }),
  locale: z.object({
    timeZone: z.string().min(1),
    region: z.string().min(1),
    currency: z.literal('INR'),
  }),
  app: z.object({
    closeToTray: z.boolean(),
    hardwareAcceleration: z.boolean(),
    closeDialogShown: z.boolean(),
  }),
  zoom: z.union(ZOOM_STEPS.map((n) => z.literal(n)) as [z.ZodLiteral<80>, ...z.ZodLiteral<number>[]]),
  appearance: z.object({
    theme: z.enum(['system', 'light', 'dark']),
    useWindowsAccent: z.boolean(),
    animations: z.enum(['full', 'basic', 'off']),
  }),
  window: z.object({
    bounds: z
      .object({ x: z.number().int(), y: z.number().int(), width: z.number().int().positive(), height: z.number().int().positive() })
      .optional(),
    maximized: z.boolean(),
    displayId: z.string().optional(),
    sidebarWidth: z.number().int().min(300).max(460),
    rightShellOpen: z.boolean(),
    lastChatId: z.string().optional(),
  }),
  ai: z.object({
    primary: z.enum(PROVIDER_IDS).nullable(),
    backup: z.enum(PROVIDER_IDS).nullable(),
    providers: z.partialRecord(z.enum(PROVIDER_IDS), providerSchema),
    plainChatFallback: z.boolean(),
  }),
  money: z.object({
    purchaseCapPaise: z.number().int().min(0).max(100_000_000),
    aiCapPaise: z.number().int().min(10_000).max(10_000_000),
    warnAt80: z.boolean(),
    bigPaymentPaise: z.number().int().min(0).max(1_000_000),
  }),
  notifications: z.object({
    quiet: z
      .object({
        on: z.boolean(),
        from: z.string().regex(/^\d{2}:\d{2}$/),
        to: z.string().regex(/^\d{2}:\d{2}$/),
        days: z.array(z.number().int().min(0).max(6)).max(7),
      })
      .refine((q) => q.from !== q.to),
    mutedChats: z.record(z.string(), z.union([z.number().int(), z.literal('forever')])),
    /** CR-0015 (G-M11-13): the tray's one-off "Quiet until…" / "End quiet time" (09 §9.8.4); M7's isQuiet reads it. */
    quietOverride: z
      .object({ mode: z.enum(['quiet', 'awake']), until: z.number().int() })
      .strict()
      .nullable(),
  }),
  flags: z.object({
    screenHands: z.boolean(),
    hub: z.boolean(),
    outlook: z.boolean(),
    multiAccount: z.boolean(),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;

/** Paths `settings:set` accepts (08-0 §A): M1's shell paths, plus M4's AI cap from C-21 (06-3 §14). Later milestones extend the list. */
export const WRITABLE_PATHS = [
  'window.sidebarWidth',
  'window.rightShellOpen',
  'window.lastChatId',
  'money.warnAt80',
  'money.aiCapPaise',
] as const;
export type WritablePath = (typeof WRITABLE_PATHS)[number];
