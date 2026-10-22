// Spec: 10-2 §E.1–§E.2 and 09-windows §9.8/§9.9. Regression coverage for strict soak heartbeat and fixture-work evidence.
import { describe, expect, it } from 'vitest';
import {
  HEARTBEAT_GRACE_MS,
  JOB_COMPLETION_TIMEOUT_MS,
  jobCompletionFailure,
  findNewMatchingIntakeTurn,
  PRODUCER_PROCESS_OWNER,
  validateHeartbeat,
  type SoakHeartbeat,
} from './lane-e-soak-contract';

const NOW = Date.parse('2026-10-22T12:00:00.000Z');

function heartbeat(overrides: Partial<SoakHeartbeat> = {}): SoakHeartbeat {
  return {
    at: new Date(NOW).toISOString(),
    processOwner: PRODUCER_PROCESS_OWNER,
    processPid: 4242,
    processExecutablePath: 'C:\\Foo\\electron.exe',
    processHandleCount: 17,
    processWorkingSetBytes: 4096,
    processResponding: true,
    ...overrides,
  };
}

describe('Lane E soak contract', () => {
  it('requires distinct matched intake evidence for the first and second submissions', () => {
    const first = {
      turnId: 't-1',
      purpose: 'intake',
      prompt: 'Conversation: Lane E live fixture job #1',
      matchedLine: 2,
    };
    const second = {
      turnId: 't-2',
      purpose: 'intake',
      prompt: 'Conversation: Lane E live fixture job #2',
      matchedLine: 2,
    };
    const noMatch = { ...second, turnId: 't-no-match', matchedLine: null, noMatch: true as const };
    const known = new Set<string>();

    expect(findNewMatchingIntakeTurn([first, second], known, 'Lane E live fixture job #1')).toEqual(first);
    known.add(first.turnId);
    expect(findNewMatchingIntakeTurn([first, second], known, 'Lane E live fixture job #2')).toEqual(second);
    known.add(second.turnId);
    expect(findNewMatchingIntakeTurn([noMatch], known, 'Lane E live fixture job #2')).toBeUndefined();
  });

  it('accepts only the expected unverified fixture completion', () => {
    expect(jobCompletionFailure('done_unverified', 1_000)).toBeUndefined();
    expect(jobCompletionFailure('done', 1_000)).toMatch(/unexpected terminal/u);
  });

  it.each(['failed', 'cancelled', 'needs_you', 'waiting'])('rejects %s fixture work', (state) => {
    expect(jobCompletionFailure(state, 1_000)).toMatch(new RegExp(`disallowed state ${state}`, 'u'));
  });

  it('rejects queued or working work after the completion timeout', () => {
    expect(jobCompletionFailure('working', JOB_COMPLETION_TIMEOUT_MS)).toMatch(/timed out/u);
  });

  it('rejects stale, invalid, and future heartbeat timestamps', () => {
    expect(validateHeartbeat(heartbeat({ at: new Date(NOW - HEARTBEAT_GRACE_MS - 1).toISOString() }), NOW).failure).toMatch(/stale/u);
    expect(validateHeartbeat(heartbeat({ at: 'not-a-date' }), NOW).failure).toMatch(/invalid/u);
    expect(validateHeartbeat(heartbeat({ at: new Date(NOW + 1).toISOString() }), NOW).failure).toMatch(/future/u);
  });

  it('pins the producer PID and executable path', () => {
    const first = validateHeartbeat(heartbeat(), NOW);
    expect(first.value?.identity).toEqual({ pid: 4242, executablePath: 'C:\\Foo\\electron.exe' });
    expect(validateHeartbeat(heartbeat({ processPid: 4243 }), NOW, NOW, first.value!.identity).failure).toMatch(/PID changed/u);
    expect(validateHeartbeat(heartbeat({ processOwner: 'unrelated-process' as SoakHeartbeat['processOwner'] }), NOW).failure).toMatch(
      /owner/u,
    );
    expect(validateHeartbeat(heartbeat({ processExecutablePath: undefined }), NOW).failure).toMatch(/path is missing/u);
    expect(
      validateHeartbeat(heartbeat({ processExecutablePath: 'C:\\Other\\electron.exe' }), NOW, NOW, first.value!.identity).failure,
    ).toMatch(/path changed/u);
  });

  it('fails a nonresponsive producer sample', () => {
    const result = validateHeartbeat(heartbeat({ processResponding: false }), NOW);
    expect(result.value?.responding).toBe(false);
    expect(result.failure).toMatch(/not responding/u);
  });
});
