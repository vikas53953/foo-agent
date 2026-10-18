import { describe, expect, it } from 'vitest';
import { FakeClock, TEST_EPOCH_MS } from '../../src/shared/clock';
import { Redactor } from '../../src/engine/redact/Redactor';

const r = new Redactor({ clock: new FakeClock(TEST_EPOCH_MS), log: () => {} });

describe('08-2 §11.4 pattern rows beyond the paste catcher', () => {
  it('hides Bearer tokens, secret URL params and URL userinfo', () => {
    expect(r.scrub('Authorization: Bearer abc.def-123456').text).toBe('Authorization: [hidden]');
    expect(r.scrub('open https://x.in/cb?code=9f8e7d&state=ok').text).toBe('open https://x.in/cb?code=[hidden]&state=ok');
    expect(r.scrub('https://vikas:hunter22@example.com/a').text).toBe('https://[hidden]@example.com/a');
  });
  it('hides a 4–8 digit number within 40 characters of an OTP word, in English, Hindi and Punjabi', () => {
    expect(r.scrub('Your OTP for login is 482913.').text).toBe('Your OTP for login is [hidden].');
    expect(r.scrub('ओटीपी 4821 है').text).toBe('ओटीपी [hidden] है');
    expect(r.scrub('ਓਟੀਪੀ: 77310').text).toBe('ਓਟੀਪੀ: [hidden]');
  });
  it('leaves booking, order and bare code numbers alone', () => {
    for (const s of ['Booking reference 482913', 'Order 55120 is on its way', 'PNR 4512367890', 'the code 1234 is the room'])
      expect(r.scrub(s).text).toBe(s);
  });
});
