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

/** 08-2 §11.2 / 08-0 §E.8: the providers whose key lives in the vault as `foo/ai_key/{providerId}` (M6 T9: the one list). */
export const KEY_PROVIDER_IDS = ['openai-key', 'anthropic-key', 'google-key'] as const;
export type KeyProviderId = (typeof KEY_PROVIDER_IDS)[number];
/** The one check for an `ai_key` vault name: a key provider, never a CLI, local or fake provider (which have no key). */
export const isKeyProviderId = (n: string): n is KeyProviderId => (KEY_PROVIDER_IDS as readonly string[]).includes(n);

const providerSchema = z.object({
  kind: z.enum(['plan', 'key', 'local']),
  lastVerifiedAt: z.number().optional(),
  lastVerifyOk: z.boolean().optional(),
  model: z.string().optional(),
  cheapModel: z.string().optional(),
});

// M5 (CR-0009): 08-0 §A `Tri` and 08-5 §3.3 `Rule`.
const TRI = z.enum(['always', 'ask', 'never']);
const RULE = z
  .object({
    id: z.string().min(1),
    verb: z.enum(['use_app', 'calendar_write', 'mail_organise']),
    match: z
      .object({
        app: z.enum(['gmail', 'calendar', 'contacts', 'whatsapp', 'browser', 'outlook']).optional(),
        calendarId: z.literal('primary').optional(),
        labelOrFolder: z.string().optional(),
      })
      .strict(),
    text: z.string(),
    helperId: z.string().optional(),
    createdAt: z.number(),
    source: z.literal('card'),
  })
  .strict();

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
  // M5 (CR-0009; 08-0 §A, §A.2, §G.3): the permission rows and the rules the Approval card's scope writes (08-2 §9.5).
  permissions: z.object({
    actions: z.object({
      read: TRI,
      drafts: TRI,
      calendar: TRI,
      send: TRI,
      book: TRI,
      pay: TRI,
      post: TRI,
      delete: TRI,
      share: TRI,
    }),
    apps: z.object({ gmail: TRI, calendar: TRI, contacts: TRI, whatsapp: TRI, browser: TRI, outlook: TRI }),
    folders: z.array(z.object({ path: z.string().min(1), mode: TRI })),
  }),
  rules: z.array(RULE),
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
    /** M6 (08-0 §A.1, Art. 19): the unprompted budget the memory conflict card counts against (0–3). */
    unpromptedPerDay: z.number().int().min(0).max(3),
  }),
  /** M6 (08-0 §A.1): memory switches (06-2 §6.6 rows mem-on, mem-learn, mem-ask). */
  privacy: z.object({
    rememberOn: z.boolean(),
    learnFromChats: z.boolean(),
    askBeforeRemembering: z.boolean(),
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
  // M5 (CR-0009): the Permissions rows (the page is M13; AT-280 checks the locks through settings:set now).
  'permissions.actions.read',
  'permissions.actions.drafts',
  'permissions.actions.calendar',
  'permissions.actions.send',
  'permissions.actions.book',
  'permissions.actions.pay',
  'permissions.actions.post',
  'permissions.actions.delete',
  'permissions.actions.share',
  'permissions.apps.gmail',
  'permissions.apps.calendar',
  'permissions.apps.contacts',
  'permissions.apps.whatsapp',
  'permissions.apps.browser',
  'permissions.apps.outlook',
  // M6: the Memory page banner's "Turn back on" (06-2 §7.5); the Privacy rows arrive with M13.
  'privacy.rememberOn',
] as const;
export type WritablePath = (typeof WRITABLE_PATHS)[number];

// M5 (CR-0009)
/** 08-0 §A.2 lock 1: these action rows take only ask | never (an approval is always a card, Art. 5). */
export const ASK_OR_NEVER = ['send', 'book', 'pay', 'delete', 'share'] as const;

/**
 * 08-0 §A.2 locks 1–5 (`SETTING_LOCKED`, checked after the zod check): send/book/pay/delete/share never `always`, `post`
 * stays `never` in v1, the big-payment and AI-cap ranges. The renderer reads the same function to disable locked choices.
 */
export function settingLocked(path: string, value: unknown): boolean {
  const action = /^permissions\.actions\.(\w+)$/.exec(path)?.[1];
  if (action === 'post') return value !== 'never';
  if (action && (ASK_OR_NEVER as readonly string[]).includes(action)) return value === 'always';
  if (path === 'money.bigPaymentPaise') return typeof value === 'number' && (value < 0 || value > 1_000_000);
  if (path === 'money.aiCapPaise') return typeof value === 'number' && value < 10_000;
  return false;
}
