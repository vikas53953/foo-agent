// Spec: 10-acceptance-2 §D ART-08a (Article 8: "Seed unique canaries as AI key, site password, card number, CVV, OTP"),
// 01-articles Art. 8, 08-2 §11.4 (the Redactor's normalised forms: a value hides however it is spaced). Every value is made
// up for this public repo; none is a real key, password, card or code. Reused by every milestone that adds a secret path.

export type CanaryKind = 'ai_key' | 'site_password' | 'card_number' | 'cvv' | 'otp';

export interface Canary {
  kind: CanaryKind;
  value: string;
  /**
   * Short digit values (CVV, OTP) are matched as whole tokens only: a 4-digit run inside a longer number, an id or a hex
   * string is not the canary. Long values are matched anywhere.
   */
  token: boolean;
}

/** The five ART-08a canaries. The card number passes Luhn (the Secret box refuses one that does not, 05-2 §5.8.4). */
export const CANARIES = {
  aiKey: { kind: 'ai_key', value: 'sk-proj-FAKE0canary0ART08a0aikey0000000', token: false },
  sitePassword: { kind: 'site_password', value: 'Canary-ART08a-site-pass-77', token: false },
  cardNumber: { kind: 'card_number', value: '4929381706524182', token: false },
  cvv: { kind: 'cvv', value: '0583', token: true },
  otp: { kind: 'otp', value: '40917286', token: true },
} as const satisfies Record<string, Canary>;

export const ALL_CANARIES: readonly Canary[] = Object.values(CANARIES);

/** The card number as a user types it and as the Secret box groups it ("4929 3817 0652 4182"). */
export const groupedCard = (n: string, sep = ' '): string => (n.match(/.{1,4}/g) ?? []).join(sep);

/** Every written form a canary can leak in: as typed, and for a card number grouped by spaces or dashes. */
export function forms(c: Canary): string[] {
  if (c.kind !== 'card_number') return [c.value];
  return [c.value, groupedCard(c.value, ' '), groupedCard(c.value, '-')];
}
