// M3 engine Redactor (08-2 §11.4): SecretRegistry (normalised forms, TTL, LRU ≤ 256), scrub, finalGate (REDACTION_LATE_HIT).
import { describe, expect, it } from 'vitest';
import { normalisedForms, Redactor } from '../../src/engine/redact/Redactor';
import { FakeClock } from '../../src/shared/clock';

function setup(max?: number) {
  const clock = new FakeClock();
  const logs: { kind: string; detail?: Record<string, unknown> }[] = [];
  const r = new Redactor({ clock, log: (kind, detail) => logs.push({ kind, detail }), ...(max ? { maxValues: max } : {}) });
  return { clock, logs, r };
}

describe('m3 Redactor', () => {
  it('normalised forms: CR/LF stripped, card digits and 4-4-4-4 groups', () => {
    expect(normalisedForms('ab\r\ncd')).toEqual(['abcd']);
    expect(normalisedForms('4111 1111 1111 1111')).toEqual(expect.arrayContaining(['4111111111111111', '4111-1111-1111-1111']));
  });

  it('scrub: registry exact and normalised hits, longest first, then patterns', () => {
    const { r } = setup();
    r.registry.add({ handle: 'card', value: '4111 1111 1111 1111' });
    r.registry.add({ handle: 'pw', value: 'swordfish99' });
    const out = r.scrub('card 4111-1111-1111-1111, pw swordfish99, key sk-ant-abcdefghijklmnopqrstuvwxyz012345');
    expect(out.text).toBe('card [hidden], pw [hidden], key [hidden]');
    expect(out.hits).toBe(3);
  });

  it('card numbers from patterns become •••• last4', () => {
    expect(setup().r.scrub('pay with 4111 1111 1111 1111 today').text).toBe('pay with •••• 1111 today');
  });

  it('TTL expiry and remove', () => {
    const { r, clock } = setup();
    r.registry.add({ handle: 'otp', value: '482913', ttlMs: 60_000 });
    expect(r.scrub('code 482913').text).toBe('code [hidden]');
    clock.advance(60_000);
    expect(r.registry.size).toBe(0);
    r.registry.add({ handle: 'x', value: 'abcxyz' });
    r.registry.remove(['x']);
    expect(r.scrub('abcxyz').text).toBe('abcxyz');
  });

  it('LRU: at most maxValues, the least recently used goes', () => {
    const { r, clock } = setup(2);
    r.registry.add({ handle: 'a', value: 'alpha-value' });
    clock.advance(1);
    r.registry.add({ handle: 'b', value: 'bravo-value' });
    clock.advance(1);
    r.scrub('alpha-value');
    clock.advance(1);
    r.registry.add({ handle: 'c', value: 'charlie-value' });
    expect(r.registry.size).toBe(2);
    expect(r.scrub('bravo-value').text).toBe('bravo-value');
    expect(r.scrub('alpha-value').text).toBe('[hidden]');
  });

  it('finalGate blanks a registry hit and logs the part, never the value', () => {
    const { r, logs } = setup();
    r.registry.add({ handle: 'v', value: 'TopSecret123' });
    expect(r.finalGate('say TopSecret123 now', 7)).toBe('say  now');
    expect(logs).toEqual([{ kind: 'REDACTION_LATE_HIT', detail: { part: '7', hits: 1 } }]);
    expect(r.finalGate('nothing here', 2)).toBe('nothing here');
    expect(logs).toHaveLength(1);
  });
});
