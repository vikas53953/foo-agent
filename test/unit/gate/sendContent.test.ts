// Spec: 08-2 §9.2 `send` row hard-limit column (address/phone/bank details/attachments from Documents/agrees to pay), §9.4
// (`isHardLimit`). M5 T8 (T7 review hand-off). Made-up names, numbers and example.com addresses only.
import { describe, expect, it } from 'vitest';
import { isHardLimit } from '../../../src/engine/gate/classes';
import { sendContentMarks } from '../../../src/engine/gate/sendContent';
import type { ApprovalFields } from '../../../src/shared/types';

const NOW = Date.UTC(2026, 9, 19);
const known: ApprovalFields = {
  verb: 'send',
  recipients: [{ name: 'Asha', address: 'asha@example.com', isNew: false, isGroup: false }],
  irreversible: true,
};

describe('send hard limit: what the message carries (08-2 §9.2)', () => {
  it.each([
    ['an IFSC code', 'Send it to IFSC ABCD0123456 please'],
    ['an account number', 'My account no: 1234 5678 9012'],
    ['a UPI id', 'Pay me at asha.k@okaxis'],
  ])('bank details: %s', (_n, text) => {
    expect(sendContentMarks({ text }).bankDetails).toBe(true);
    expect(isHardLimit('send', known, NOW, { text })).toBe(true);
  });

  it.each([
    ['English', 'Sounds good, I will pay the deposit tomorrow.'],
    ['agree', 'Yes, happy to pay ₹2,000 for it.'],
    ['Hindi', 'ठीक है, मैं कल भुगतान कर दूंगा'],
  ])('agrees to pay: %s', (_n, text) => {
    expect(sendContentMarks({ text }).agreesToPay).toBe(true);
    expect(isHardLimit('send', known, NOW, { text })).toBe(true);
  });

  it('an attachment from a Documents folder', () => {
    const c = { text: 'Here you go', attachments: ['C:\\Users\\Asha\\Documents\\lease.pdf'] };
    expect(sendContentMarks(c).documentsAttachment).toBe(true);
    expect(isHardLimit('send', known, NOW, c)).toBe(true);
    expect(isHardLimit('send', known, NOW, { text: 'Here you go', attachments: ['C:\\Users\\Asha\\Pictures\\cat.png'] })).toBe(false);
  });

  it('an ordinary message to a known person is not a hard limit', () => {
    for (const text of ['See you at 7 tomorrow?', 'The bill was ₹1,200 last month.', 'Call me at the office, not home.']) {
      expect(isHardLimit('send', known, NOW, { text }), text).toBe(false);
    }
    expect(isHardLimit('send', known, NOW)).toBe(false);
  });
});
