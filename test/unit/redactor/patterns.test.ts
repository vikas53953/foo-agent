// Spec: 08-2 §11.4 item 2 (pattern scrub list; card numbers → "•••• {last4}", every other hit → [hidden]; 4–8 digits within
// 40 chars of an OTP word, never for confirmation/booking/reference/order/PNR/ticket/receipt/a bare "code"; 32+ char tokens
// with entropy ≥ 4.0 and no spaces), item 1 (registry scrub first, normalised forms, longest first). Test secrets are made up.
import { describe, expect, it } from 'vitest';
import { FakeClock, TEST_EPOCH_MS } from '../../../src/shared/clock';
import { HIDDEN, Redactor } from '../../../src/shared/redactor';

const r = () => new Redactor({ clock: new FakeClock(TEST_EPOCH_MS) });

const ROWS: { row: string; text: string; want: string }[] = [
  { row: 'sk-…', text: 'key sk-abcdefghijklmnopqrstuvwx ok', want: `key ${HIDDEN} ok` },
  { row: 'sk-proj-…', text: 'key sk-proj-FAKE0canary0value0000000000 ok', want: `key ${HIDDEN} ok` },
  { row: 'sk-ant-…', text: 'sk-ant-api03-FAKEfakeFAKEfakeFAKE00', want: HIDDEN },
  { row: 'AIza…', text: 'maps AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q', want: `maps ${HIDDEN}` },
  { row: 'ghp_…', text: 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789', want: HIDDEN },
  { row: 'github_pat_…', text: 'github_pat_11ABCDEFG0123456789_abcdefghijklmnop', want: HIDDEN },
  { row: 'xoxb-…', text: 'slack xoxb-1234567890-abcdefghij', want: `slack ${HIDDEN}` },
  { row: 'xoxp-…', text: 'xoxp-1234567890-abcdefghij', want: HIDDEN },
  { row: 'xai-…', text: `grok xai-${'Zy9x'.repeat(11)}`, want: `grok ${HIDDEN}` },
  { row: 'gsk_…', text: `gsk_${'a1B2'.repeat(11)}`, want: HIDDEN },
  { row: 'hf_…', text: 'hf_abcdefghijklmnopqrstuvwxyz123456', want: HIDDEN },
  { row: 'AKIA…', text: 'aws AKIAIOSFODNN7EXAMPLE now', want: `aws ${HIDDEN} now` },
  {
    row: 'JWT eyJ…',
    text: 'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    want: `jwt ${HIDDEN}`,
  },
  { row: 'Bearer …', text: 'Authorization: Bearer fake.token-123456', want: `Authorization: ${HIDDEN}` },
  {
    row: 'PEM block',
    text: 'key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu\n-----END RSA PRIVATE KEY-----\nthanks',
    want: `key:\n${HIDDEN}\nthanks`,
  },
  { row: 'PEM block cut short', text: 'x -----BEGIN PRIVATE KEY-----\nMIIBOgIBAAJBAKj34Gk', want: `x ${HIDDEN}` },
  { row: 'URL param token', text: 'https://a.in/x?token=abc123&y=1', want: `https://a.in/x?token=${HIDDEN}&y=1` },
  { row: 'URL param sig', text: 'https://a.in/x?a=1&sig=Zz9', want: `https://a.in/x?a=1&sig=${HIDDEN}` },
  {
    row: 'URL param password',
    text: 'https://a.in/?password=letmein',
    want: `https://a.in/?${HIDDEN}`,
  } /* the paste catcher's password row takes the whole pair */,
  { row: 'URL userinfo', text: 'ftp://user:fakepass@files.example.com/a', want: `ftp://${HIDDEN}@files.example.com/a` },
  { row: 'card spaced', text: 'card 4111 1111 1111 1111 exp', want: 'card •••• 1111 exp' },
  { row: 'card dashed', text: '5500-0000-0000-0004', want: '•••• 0004' },
  { row: 'card 15 digits', text: 'amex 378282246310005', want: 'amex •••• 0005' },
  { row: 'OTP word', text: 'Your OTP for the bank login: 482913', want: `Your OTP for the bank login: ${HIDDEN}` },
  { row: 'one-time', text: 'one-time password sent, it is 99887766', want: `one-time password sent, it is ${HIDDEN}` },
  { row: 'security code', text: 'security code 7351 for you', want: `${HIDDEN} for you` },
  { row: 'passcode', text: 'the passcode for entry is 2468', want: `the passcode for entry is ${HIDDEN}` },
  { row: 'Hindi OTP', text: 'ओटीपी 4821 है', want: `ओटीपी ${HIDDEN} है` },
  { row: 'Hindi passcode', text: 'पासकोड 55667', want: `पासकोड ${HIDDEN}` },
  { row: 'Punjabi OTP', text: 'ਓਟੀਪੀ: 77310', want: `ਓਟੀਪੀ: ${HIDDEN}` },
  { row: 'entropy token', text: 'token Zx9Qw3Er7Ty1Ui5Op2As6Df8Gh4Jk0LmNb end', want: `token ${HIDDEN} end` },
];

describe('08-2 §11.4 pattern scrub, row by row', () => {
  it.each(ROWS)('$row', ({ text, want }) => {
    expect(r().redact(text).text).toBe(want);
  });

  it.each([
    'Booking confirmation 482913',
    'Booking reference 482913',
    'Order 55120 is on its way',
    'PNR 4512367890',
    'ticket 77881234',
    'receipt 20261016',
    'the code 1234 is the room',
    'meet at 10:45 on 16 Oct 2026',
    'it costs ₹14,600',
  ])('not a secret: %s', (text) => {
    expect(r().redact(text).text).toBe(text);
  });

  it('a 4–8 digit number farther than 40 characters from the OTP word stays', () => {
    const text = `OTP sent. ${'x'.repeat(45)} room 4821`;
    expect(r().redact(text).text).toBe(text);
  });

  it('a long low-entropy run and a URL path are not tokens', () => {
    for (const t of ['a'.repeat(40), 'https://www.example.com/hotels/hotel-details/abcdefghijklmnopqrstuvwxyz0123456789'])
      expect(r().redact(t).text).toBe(t);
  });
});

describe('08-2 §11.4 registry scrub comes first', () => {
  it('a registered value and its normalised forms become [hidden], longest first', () => {
    const red = r();
    red.registry.add({ handle: 'card', value: '4111 1111 1111 1111' });
    red.registry.add({ handle: 'pw', value: 'swordfish99' });
    red.registry.add({ handle: 'pw2', value: 'swordfish99!x' });
    expect(red.redact('pay 4111111111111111 with swordfish99!x then swordfish99').text).toBe(`pay ${HIDDEN} with ${HIDDEN} then ${HIDDEN}`);
  });

  it('a value with line breaks is also found with them stripped', () => {
    const red = r();
    red.registry.add({ handle: 'k', value: 'abc\r\ndef-fake' });
    expect(red.redact('x abcdef-fake y').text).toBe(`x ${HIDDEN} y`);
  });

  it('a value that matches no pattern is still hidden once registered', () => {
    const red = r();
    expect(red.redact('my login is tulsi-garden').text).toBe('my login is tulsi-garden');
    red.registry.add({ handle: 'login', value: 'tulsi-garden' });
    expect(red.redact('my login is tulsi-garden').text).toBe(`my login is ${HIDDEN}`);
  });

  it('holds at most 256 values in RAM and drops the least recently used', () => {
    const clock = new FakeClock(TEST_EPOCH_MS);
    const red = new Redactor({ clock });
    for (let i = 0; i < 257; i++) {
      red.registry.add({ handle: `h${i}`, value: `fake-value-${i}-zz` });
      clock.advance(1);
    }
    expect(red.registry.size).toBe(256);
    expect(red.redact('fake-value-0-zz').text).toBe('fake-value-0-zz');
    expect(red.redact('fake-value-256-zz').text).toBe(HIDDEN);
  });
});
