// Spec: 08-2 §10.4 (after the one click: success → COMPLETED; the site's explicit refusal → FAILED; a timeout, a cancel or
// anything unclear → CHECKING, never re-submitted), 08-4 §28.1 item 8; pre-click refusals (the call never ran) → FAILED.
import { describe, expect, it } from 'vitest';
import { outcomeState } from '../../../src/engine/gate/runnerGate';

describe('outcomeState (08-2 §10.4)', () => {
  it('only success, a pre-click refusal or the site’s explicit refusal are final; the rest is CHECKING', () => {
    expect(outcomeState({ outcome: 'ok', result: { done: true } })).toBe('COMPLETED');
    for (const k of ['IDEMPOTENT_REPEAT', 'VALIDATION', 'USE_SUBMIT', 'URL_NOT_ALLOWED'] as const)
      expect(outcomeState({ outcome: 'error', errorKind: k, result: null }), k).toBe('FAILED');
    expect(outcomeState({ outcome: 'error', errorKind: 'UNKNOWN', result: { refused: true } })).toBe('FAILED');
    expect(outcomeState({ outcome: 'error', errorKind: 'UNKNOWN', result: null })).toBe('CHECKING');
    expect(outcomeState({ outcome: 'error', errorKind: 'NET_OFFLINE', result: null })).toBe('CHECKING');
    expect(outcomeState({ outcome: 'cancelled', result: null })).toBe('CHECKING');
  });
});
