// CR-0055 (X-212; 08-4 §25.3 `done.result` ≤ 4,000, AT-445): a job's finished answer can hold a comparison table (CR-0053).
// Real-AI run 3bfb97a R1: "Make a table comparing 3 budget phones" ran as a job whose answer, a table, was over the old
// 600-character cap, so the step failed its check, the repair turn failed too, and foo asked to "give you a shorter answer".
import { describe, expect, it } from 'vitest';
import { validateAct } from '../../src/engine/prompt/envelope';

const row = (name: string, price: string) =>
  `| ${name} | ${price} | 6.7" AMOLED, 120 Hz | 5,000 mAh, 45 W | 50 MP main, 8 MP ultra-wide | Snapdragon 6 Gen 1 |`;
const table = [
  'Here are 3 good phones under ₹20,000, checked on Amazon.in and Flipkart today:',
  '',
  '| Phone | Price | Screen | Battery | Camera | Chip |',
  '| --- | ---: | --- | --- | --- | --- |',
  row('Samsung Galaxy M35 5G', '₹16,999'),
  row('Redmi Note 13 5G', '₹17,499'),
  row('Motorola Edge 50 Fusion', '₹19,999'),
  '',
  'Best value: the Redmi, for the brightest screen at the price. Want me to compare cameras in more detail?',
].join('\n');

describe('CR-0055 a job answer can hold a table (AT-445)', () => {
  it('AT-445 a done result with a three-phone table passes the step check', () => {
    expect(table.length).toBeGreaterThan(600);
    const r = validateAct('step', { decision: { kind: 'done', result: table }, usedMemoryIds: [] });
    expect(r.ok).toBe(true);
  });

  it('AT-445 a done result over 4,000 characters still fails the check', () => {
    const r = validateAct('step', { decision: { kind: 'done', result: 'x'.repeat(4_001) }, usedMemoryIds: [] });
    expect(r.ok).toBe(false);
  });
});
