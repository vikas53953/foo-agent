// Spec: 08-0 §A (settings.json schema, X-53), X-150 (appearance.animations).
// M0 holds the keys the window shell reads; later milestones add their keys here with their defaults.
import { z } from 'zod';

export const ZOOM_STEPS = [80, 90, 100, 110, 125, 150, 175, 200] as const;

export const settingsSchema = z.object({
  schemaVersion: z.literal(2),
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
  flags: z.object({
    screenHands: z.boolean(),
    hub: z.boolean(),
    outlook: z.boolean(),
    multiAccount: z.boolean(),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;
