// Spec: 10-acceptance-2 ART-08b (Article 8): the paste catcher triggers on every C8 pattern and not on 200 normal messages
// (phone numbers, prices, dates): 100 % caught, ≤ 1 false positive. Patterns P1–P17 and the NFKC / zero-width rule: 04-2
// §22.4; the one module is src/shared/redactor.ts (08-0 §G.6). spec/trace.csv routes ART-08b to this file (CR-0003).
import { describe, expect, it } from 'vitest';
import { checkSecret, entropy, findSecrets, isCardNumber, luhn, redactSecrets, suggestedNameSlot } from '../../src/shared/redactor';

/** One sample per pattern (and per alternative), each inside an ordinary sentence. */
const SECRETS: { id: string; text: string; secret: string; askedForCode?: boolean }[] = [
  { id: 'P1', text: 'here is my key sk-proj-7Hc2kLmN0pQrStUvWxYz12345678 ok', secret: 'sk-proj-7Hc2kLmN0pQrStUvWxYz12345678' },
  { id: 'P1', text: 'use sk-ant-api03-abcdefghijklmnopqrstuv for it', secret: 'sk-ant-api03-abcdefghijklmnopqrstuv' },
  { id: 'P1', text: 'sk-abcdefghijklmnopqrstuvwx', secret: 'sk-abcdefghijklmnopqrstuvwx' },
  { id: 'P2', text: 'maps key AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q', secret: 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q' },
  { id: 'P3', text: 'token ya29.a0AfH6SMBx1234567890abcdefGHIJ', secret: 'ya29.a0AfH6SMBx1234567890abcdefGHIJ' },
  { id: 'P4', text: 'gh: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789', secret: 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789' },
  { id: 'P4', text: 'github_pat_11ABCDEFG0123456789_abcdefghijklmnop', secret: 'github_pat_11ABCDEFG0123456789_abcdefghijklmnop' },
  { id: 'P5', text: 'slack xoxb-1234567890-abcdefghij', secret: 'xoxb-1234567890-abcdefghij' },
  { id: 'P6', text: 'stripe sk_live_4eC39HqLyjWDarjtT1zdp7dc', secret: 'sk_live_4eC39HqLyjWDarjtT1zdp7dc' },
  { id: 'P6', text: 'rk_test_abcdefghijklmnop1234 please', secret: 'rk_test_abcdefghijklmnop1234' },
  { id: 'P7', text: 'aws AKIAIOSFODNN7EXAMPLE now', secret: 'AKIAIOSFODNN7EXAMPLE' },
  { id: 'P8', text: 'hf hf_abcdefghijklmnopqrstuvwxyz123456', secret: 'hf_abcdefghijklmnopqrstuvwxyz123456' },
  { id: 'P8', text: `groq gsk_${'a1B2'.repeat(11)}`, secret: `gsk_${'a1B2'.repeat(11)}` },
  { id: 'P8', text: `grok xai-${'Zy9x'.repeat(11)}`, secret: `xai-${'Zy9x'.repeat(11)}` },
  {
    id: 'P9',
    text: 'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    secret: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  },
  { id: 'P10', text: '-----BEGIN RSA PRIVATE KEY-----', secret: '-----BEGIN RSA PRIVATE KEY-----' },
  { id: 'P10', text: 'paste: -----BEGIN PRIVATE KEY-----', secret: '-----BEGIN PRIVATE KEY-----' },
  { id: 'P11', text: 'my password is Hunter2024', secret: 'password is Hunter2024' },
  { id: 'P11', text: 'wifi Pass: tulsi@123', secret: 'Pass: tulsi@123' },
  { id: 'P11', text: 'पासवर्ड है Ganga@99', secret: 'पासवर्ड है Ganga@99' },
  { id: 'P11', text: 'ਪਾਸਵਰਡ: Amrit555', secret: 'ਪਾਸਵਰਡ: Amrit555' },
  { id: 'P12', text: 'card 4111 1111 1111 1111 exp 12/28', secret: '4111 1111 1111 1111' },
  { id: 'P12', text: 'use 5500-0000-0000-0004', secret: '5500-0000-0000-0004' },
  { id: 'P12', text: 'amex 378282246310005', secret: '378282246310005' },
  { id: 'P13', text: 'and the CVV is 123', secret: 'CVV is 123' },
  { id: 'P13', text: 'security code: 4321', secret: 'security code: 4321' },
  { id: 'P14', text: 'UPI PIN 482913', secret: 'UPI PIN 482913' },
  { id: 'P14', text: 'my atm pin is 1234', secret: 'atm pin is 1234' },
  { id: 'P15', text: 'OTP is 482913', secret: 'OTP is 482913' },
  { id: 'P15', text: 'the verification code: 99887', secret: 'verification code: 99887' },
  { id: 'P16', text: '482913', secret: '482913', askedForCode: true },
  { id: 'P16', text: ' 482 913 ', secret: '482 913', askedForCode: true },
  { id: 'P17', text: 'secret Zx9Qw3Er7Ty1Ui5Op2As6Df8Gh4Jk0LmNb', secret: 'Zx9Qw3Er7Ty1Ui5Op2As6Df8Gh4Jk0LmNb' },
];

/** 200 ordinary messages: phone numbers, prices, dates, times, PNRs, flights, order ids, pin codes, links. */
function normalMessages(): string[] {
  const phones = [
    '+91 98765 43210',
    '98765 43210',
    '022 2345 6789',
    '+91-80-4123-4567',
    '9988776655',
    '1800 209 1234',
    '011 2611 0000',
    '+1 415 555 0134',
  ];
  const prices = ['₹14,600', 'Rs 8,000', '₹1,25,000', 'INR 2,499.00', '₹499', '₹12.5 lakh', '3,200 rupees', '₹99/month'];
  const dates = ['16 Oct 2026', '2026-10-16', '16/10/2026', 'Fri 16 Oct', 'next Monday', '2 Nov', 'Diwali (1 Nov)', 'Oct 16'];
  const times = ['9:00 AM', '18:30', '7 pm', 'half past six', '10:45', '6.15 am', 'noon', '11:59 PM'];
  const extras = [
    'PNR 4512367890',
    'flight 6E 2134',
    'order #402-1234567-1234567',
    'parking slot B2',
    'pincode 110001',
    'room 1204',
    'https://www.makemytrip.com/hotels/hotel-details/?hotelId=201811221234567890',
    'invoice INV-2026-00042',
    'train 12951 Rajdhani',
    'seat 23B',
    'GSTIN 27AAPFU0939F1ZV',
    'call 112 if needed',
    'IFSC HDFC0000123',
    'Aadhaar 2345 6789 0123',
    'PAN ABCDE1234F',
    'meeting id 845 2311 9087',
  ];
  const templates = [
    (i: number) => `Call me on ${phones[i % 8]} after ${times[i % 8]}`,
    (i: number) => `Book the hotel under ${prices[i % 8]} a night for ${dates[i % 8]}`,
    (i: number) => `The bill is ${prices[(i + 3) % 8]}, due ${dates[(i + 2) % 8]}`,
    (i: number) => `Remind me at ${times[(i + 1) % 8]} on ${dates[(i + 5) % 8]}`,
    (i: number) => `My ${extras[Math.floor(i / 8) % 16]}, can you check it?`,
    (i: number) => `Ask Priya (${phones[(i + 2) % 8]}) about the ${prices[(i + 1) % 8]} gift`,
    (i: number) => `Flight lands ${times[(i + 4) % 8]}, ${extras[(Math.floor(i / 8) + 7) % 16]}`,
    (i: number) => `कल ${times[i % 8]} बजे ${prices[i % 8]} का रिचार्ज करना है`,
  ];
  const out: string[] = [];
  for (let i = 0; i < 199; i++) out.push(templates[i % templates.length]!(i));
  // A postal "PIN code" matches P14 as written (`pin` + up to 6 non-digits + 4–6 digits): the one false positive the
  // article allows. Logged for a CR (implementation-notes M2 builder B).
  out.push('Deliver to Indiranagar, pin code 560038');
  return out;
}

describe('ART-08b · paste catcher patterns (04-2 §22.4)', () => {
  it.each(SECRETS)('$id catches "$secret"', ({ text, secret, askedForCode }) => {
    const hits = findSecrets(text, { askedForCode });
    expect(hits).toHaveLength(1);
    expect(text.slice(hits[0]!.start, hits[0]!.end)).toBe(secret);
    expect(hits[0]!.mask).toBe('••••');
  });

  it('every pattern P1–P17 has a sample', () => {
    const ids = new Set(SECRETS.map((s) => s.id));
    for (let p = 1; p <= 17; p++) expect(ids.has(`P${p}`)).toBe(true);
  });

  it('200 normal messages give at most 1 false positive', () => {
    const msgs = normalMessages();
    expect(msgs).toHaveLength(200);
    const caught = msgs.filter((m) => checkSecret(m) !== null);
    expect(caught.length, caught.join('\n')).toBeLessThanOrEqual(1);
    expect(caught).toEqual(['Deliver to Indiranagar, pin code 560038']);
  });

  it('a lone code is a secret only after foo asked for one (P16)', () => {
    expect(checkSecret('482913')).toBeNull();
    expect(checkSecret('482913', { askedForCode: true })?.kind).toBe('otp');
    expect(checkSecret('482913 is the room', { askedForCode: true })).toBeNull();
  });

  it('checks after NFKC with zero-width characters removed, and maps back to what the user sees', () => {
    const text = 'key: s​k-proj-７Hc2kLmN0pQrStUvWxYz12345678';
    const hit = findSecrets(text)[0]!;
    expect(hit).toBeDefined();
    expect(hit.start).toBe(5);
    expect(hit.end).toBe(text.length);
  });

  it('cards need 13–19 digits, a first digit 2–6 and Luhn', () => {
    expect(luhn('4111111111111111')).toBe(true);
    expect(isCardNumber('4111 1111 1111 1112')).toBe(false);
    expect(isCardNumber('9111 1111 1111 1111')).toBe(false);
    expect(isCardNumber('411111111111')).toBe(false);
  });

  it('high-entropy strings need ≥ 4 bits per char, a digit and a letter, and never sit inside a URL', () => {
    expect(entropy('aaaa')).toBe(0);
    expect(checkSecret('a'.repeat(40))).toBeNull();
    expect(checkSecret('https://x.com/Zx9Qw3Er7Ty1Ui5Op2As6Df8Gh4Jk0LmNb')).toBeNull();
    expect(checkSecret('Zx9Qw3Er7Ty1Ui5Op2As6Df8Gh4Jk0LmNb', { knownRefs: ['Zx9Qw3Er7Ty1Ui5Op2As6Df8Gh4Jk0LmNb'] })).toBeNull();
  });

  it('pk_ keys count only from 24 characters', () => {
    expect(checkSecret('pk_test_abcdefghijklmnop')).not.toBeNull();
    expect(checkSecret('pk_test_abcdefghijklmno')).toBeNull();
  });

  it('redacts every hit with the mask, and names the Secret box from the pattern', () => {
    expect(redactSecrets('cvv 123 and OTP 4455').text).toBe('•••• and ••••');
    expect(suggestedNameSlot({ pattern: 'P1' })).toBe('openai');
    expect(suggestedNameSlot({ pattern: 'P2' })).toBe('google');
    expect(suggestedNameSlot({ pattern: 'P12' })).toBe('card');
    expect(suggestedNameSlot({ pattern: 'P11' })).toBe('password');
    expect(suggestedNameSlot({ pattern: 'P16' })).toBe('otp');
    expect(suggestedNameSlot({ pattern: 'P7' })).toBe('key');
  });
});
