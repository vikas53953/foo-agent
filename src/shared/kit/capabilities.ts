// Spec: 04 §13.7 (Capabilities card: the engine builds it from the app's own state, the AI writes none of it; at most 4
// rows in the order email (always; hint says whether Gmail is connected), whatsapp (only when linked), price, compare,
// remind; "Try it ›" is the Button action `composer.fill` { text }; footer = the safety line, and the ideas link line only
// once the Ideas page is built), 08-4 §25.2 (intake tag `intent_capabilities`), CR-0024 F3 and §(e) 1, 2, 4, X-182.
// Pure: connection state in, the card's words out. The words are resolved when the card is posted, so an older card keeps
// its rows when the state changes (04 §13.7 "Repeats").
import { z } from 'zod';
import { t } from '../copy/t';
import { COMPOSER_FILL } from './catalog';

export { COMPOSER_FILL };

/** The kit card payload's `app` for the engine-built Capabilities card (05 §0.1 type `kit`). */
export const CAPABILITIES_APP = 'capabilities';

/** At most this many rows (04 §13.7). */
export const CAPABILITIES_MAX_ROWS = 4;

export type CapabilityKey = 'email' | 'whatsapp' | 'price' | 'compare' | 'remind';
/** The 02 F6 icons the rows use (04 §13.7 "Row look"). */
export type CapabilityIcon = 'Mail' | 'People' | 'Money' | 'Search' | 'Clock';

/** What the card reads of the app's state. */
export interface CapabilityState {
  gmailConnected: boolean;
  whatsappLinked: boolean;
}

const RowSchema = z
  .object({
    key: z.enum(['email', 'whatsapp', 'price', 'compare', 'remind']),
    icon: z.enum(['Mail', 'People', 'Money', 'Search', 'Clock']),
    label: z.string().min(1).max(80),
    hint: z.string().max(120),
    fill: z.string().min(1).max(200),
  })
  .strict();

/** The `capabilities` field of the kit card payload. */
export const CapabilitiesSurfaceSchema = z
  .object({
    rows: z.array(RowSchema).min(1).max(CAPABILITIES_MAX_ROWS),
    safety: z.string().min(1).max(200),
  })
  .strict();
export type CapabilityRow = z.infer<typeof RowSchema>;
export type CapabilitiesSurface = z.infer<typeof CapabilitiesSurfaceSchema>;

/** Every row in 04 §13.7 order, with the condition that keeps it. */
const ROWS: {
  key: CapabilityKey;
  icon: CapabilityIcon;
  shown(s: CapabilityState): boolean;
  row(s: CapabilityState): Omit<CapabilityRow, 'key' | 'icon'>;
}[] = [
  {
    key: 'email',
    icon: 'Mail',
    shown: () => true,
    row: (s) => ({
      label: t('kit.capabilities.email.label'),
      hint: s.gmailConnected ? t('kit.capabilities.email.hint') : t('kit.capabilities.email.hint_off'),
      fill: t('kit.capabilities.email.fill'),
    }),
  },
  {
    key: 'whatsapp',
    icon: 'People',
    shown: (s) => s.whatsappLinked,
    row: () => ({
      label: t('kit.capabilities.whatsapp.label'),
      hint: t('kit.capabilities.whatsapp.hint'),
      fill: t('kit.capabilities.whatsapp.fill'),
    }),
  },
  {
    key: 'price',
    icon: 'Money',
    shown: () => true,
    row: () => ({
      label: t('kit.capabilities.price.label'),
      hint: t('kit.capabilities.price.hint'),
      fill: t('kit.capabilities.price.fill'),
    }),
  },
  {
    key: 'compare',
    icon: 'Search',
    shown: () => true,
    row: () => ({
      label: t('kit.capabilities.compare.label'),
      hint: t('kit.capabilities.compare.hint'),
      fill: t('kit.capabilities.compare.fill'),
    }),
  },
  {
    key: 'remind',
    icon: 'Clock',
    shown: () => true,
    row: () => ({
      label: t('kit.capabilities.remind.label'),
      hint: t('kit.capabilities.remind.hint'),
      fill: t('kit.capabilities.remind.fill'),
    }),
  },
];

/** The card for this state: the rows that apply, first 4 in order, and the footer's safety line. */
export function capabilitiesSurface(s: CapabilityState): CapabilitiesSurface {
  const rows = ROWS.filter((r) => r.shown(s))
    .slice(0, CAPABILITIES_MAX_ROWS)
    .map((r) => ({ key: r.key, icon: r.icon, ...r.row(s) }));
  return { rows, safety: t('kit.capabilities.safety') };
}

/** The card's surface from a kit card payload, or null when the payload is not an engine-built Capabilities card. */
export function capabilitiesOf(payload: Record<string, unknown>): CapabilitiesSurface | null {
  if (payload.app !== CAPABILITIES_APP) return null;
  const r = CapabilitiesSurfaceSchema.safeParse(payload.capabilities);
  return r.success ? r.data : null;
}
