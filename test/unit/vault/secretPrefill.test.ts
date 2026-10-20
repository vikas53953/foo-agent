// M5 T2 · the composer → Secret box hand-over (04-2 §22.4 "the real value is not kept anywhere"): a moved value waits for
// its card in memory only, and is dropped after a minute or when the composer leaves the chat. Fake values only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSecretPrefill,
  listenSecretPrefill,
  peekSecretPrefill,
  prefillSecret,
  PREFILL_TTL_MS,
} from '../../../src/renderer/cards/secretPrefill';

afterEach(() => {
  clearSecretPrefill();
  vi.useRealTimers();
});

describe('secretPrefill', () => {
  it('hands a value to a card that mounts later, once', () => {
    prefillSecret('k_1', 'FAKEvalue1');
    expect(peekSecretPrefill('k_1')).toBe('FAKEvalue1');
    const stop = listenSecretPrefill('k_1', () => undefined);
    expect(peekSecretPrefill('k_1')).toBeNull();
    stop();
  });

  it('hands a value straight to a card already listening', () => {
    const got: string[] = [];
    const stop = listenSecretPrefill('k_2', (v) => got.push(v));
    prefillSecret('k_2', 'FAKEvalue2');
    expect(got).toEqual(['FAKEvalue2']);
    expect(peekSecretPrefill('k_2')).toBeNull();
    stop();
  });

  it('drops a value no card took after the TTL, and on a chat switch', () => {
    vi.useFakeTimers();
    prefillSecret('k_3', 'FAKEvalue3');
    vi.advanceTimersByTime(PREFILL_TTL_MS);
    expect(peekSecretPrefill('k_3')).toBeNull();
    prefillSecret('k_4', 'FAKEvalue4');
    clearSecretPrefill();
    expect(peekSecretPrefill('k_4')).toBeNull();
  });
});
