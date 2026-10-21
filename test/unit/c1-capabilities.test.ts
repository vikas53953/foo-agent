// Spec: 04 §13.7 (Capabilities card rows: at most 4, in the order email (always; hint by Gmail state), whatsapp (only when
// linked), price, compare, remind; icons from the 02 F6 list; footer = the safety line; `composer.fill` only on this card,
// never in the AI's catalogue), 08-4 §24.5, CR-0024 F3 and §(e) 1, 2, 4. C1 T2. The real-app check is
// test/e2e/c1-capabilities.spec.ts (AT-425, AT-426).
import { describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import { CAPABILITIES_APP, capabilitiesOf, capabilitiesSurface } from '../../src/shared/kit/capabilities';
import { COMPOSER_FILL, KitComponentSchema } from '../../src/shared/kit/catalog';
import { catalogText } from '../../src/shared/kit/prompt';

const keys = (s: { rows: { key: string }[] }) => s.rows.map((r) => r.key);

describe('Capabilities card rows (04 §13.7)', () => {
  it('Gmail off, WhatsApp not linked: email with "Connect Gmail to start", then price, compare, remind', () => {
    const s = capabilitiesSurface({ gmailConnected: false, whatsappLinked: false });
    expect(keys(s)).toEqual(['email', 'price', 'compare', 'remind']);
    expect(s.rows[0]).toEqual({
      key: 'email',
      icon: 'Mail',
      label: 'Catch up on email',
      hint: 'Connect Gmail to start',
      fill: 'Anything important in my email?',
    });
    expect(s.rows.map((r) => r.icon)).toEqual(['Mail', 'Money', 'Search', 'Clock']);
    expect(s.safety).toBe('I never send, book or pay until you tap Approve.');
  });

  it('Gmail connected: the email hint says so', () => {
    const s = capabilitiesSurface({ gmailConnected: true, whatsappLinked: false });
    expect(s.rows[0]!.hint).toBe('Gmail connected');
  });

  it('WhatsApp linked: the group row comes second and the card still stops at 4 rows (remind drops)', () => {
    const s = capabilitiesSurface({ gmailConnected: true, whatsappLinked: true });
    expect(keys(s)).toEqual(['email', 'whatsapp', 'price', 'compare']);
    expect(s.rows[1]).toMatchObject({ icon: 'People', label: 'Catch up on a group', hint: 'WhatsApp linked' });
  });

  it('the footer carries no ideas line while the Ideas page is a placeholder (CR-0024 §(e) 4)', () => {
    const s = capabilitiesSurface({ gmailConnected: false, whatsappLinked: false });
    expect(Object.keys(s).sort()).toEqual(['rows', 'safety']);
    expect(JSON.stringify(s)).not.toContain('foo://ideas');
  });

  it('a kit card payload is read as the Capabilities card only with app "capabilities" and a valid surface', () => {
    const capabilities = capabilitiesSurface({ gmailConnected: false, whatsappLinked: false });
    expect(capabilitiesOf({ app: CAPABILITIES_APP, capabilities })).toEqual(capabilities);
    expect(capabilitiesOf({ capabilities })).toBeNull();
    expect(capabilitiesOf({ body: '{}' })).toBeNull();
    expect(capabilitiesOf({ app: CAPABILITIES_APP, capabilities: { rows: [], safety: 'x' } })).toBeNull();
    expect(t('kit.capabilities.try')).toBe('Try it ›');
  });
});

describe('composer.fill stays app-only (04 §13.7, 08-4 §24.5)', () => {
  const button = (name: string) => ({ id: 'b', component: 'Button', child: 'l', action: { event: { name, context: { text: 'hi' } } } });

  it('an AI Button naming composer.fill is invalid (dropped); other action names still pass', () => {
    expect(KitComponentSchema.safeParse(button(COMPOSER_FILL)).success).toBe(false);
    expect(KitComponentSchema.safeParse(button('pick')).success).toBe(true);
  });

  it('the catalogue text the AI reads never offers composer.fill', () => {
    expect(catalogText()).not.toContain(COMPOSER_FILL);
  });
});
