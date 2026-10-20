// Spec: 08-1 §3.2 (signin:done / signin:skip → engine `signin.done` / `signin.skip`; job:takeOver → `job.takeOver { on: true }`;
// job:handBack → `job.handBack { jobId }`, JOB_GONE), X-124 (one IPC call = exactly one engine message), X-135 (hand back
// has one meaning), 05-3 §5.10.4 (requested, took over, handed back, skipped are tech-log lines).
import { describe, expect, it, vi } from 'vitest';
import { signinHandlers } from '../../src/main/jobs/signinIpc';
import type { EngineBridge } from '../../src/main/engine-supervisor/EngineBridge';

vi.mock('electron', () => ({ BrowserWindow: class {}, globalShortcut: {}, nativeTheme: {} }));

type Sent = { kind: string; payload: unknown };

function world(o: { live?: boolean; jobState?: string | null; cardState?: string | null } = {}) {
  const sent: Sent[] = [];
  const logs: string[] = [];
  const jobState = o.jobState === undefined ? 'needs_you' : o.jobState;
  const cardState = o.cardState === undefined ? 'waiting' : o.cardState;
  const h = signinHandlers({
    jobState: (id) => (id === 'j_1' ? jobState : null),
    signinCardState: (id) => (id === 'j_1' ? cardState : null),
    engine: () =>
      ({
        send: (kind: string, payload: unknown) => {
          if (o.live === false) return false;
          sent.push({ kind, payload });
          return true;
        },
      }) as unknown as Pick<EngineBridge, 'send'>,
    log: (line) => logs.push(line),
  });
  return { h, sent, logs };
}

describe('sign-in IPC → engine (X-124)', () => {
  it('signin:done sends exactly one signin.done', () => {
    const { h, sent, logs } = world();
    expect(h['signin:done']({ jobId: 'j_1' })).toEqual({ ok: true, value: undefined });
    expect(sent).toEqual([{ kind: 'signin.done', payload: { jobId: 'j_1' } }]);
    expect(logs).toEqual(['signin: signin.done j_1']);
  });

  it('signin:skip sends exactly one signin.skip', () => {
    const { h, sent } = world({ cardState: 'live' });
    expect(h['signin:skip']({ jobId: 'j_1' }).ok).toBe(true);
    expect(sent).toEqual([{ kind: 'signin.skip', payload: { jobId: 'j_1' } }]);
  });

  it('job:takeOver sends one job.takeOver { on: true }', () => {
    const { h, sent } = world({ cardState: null });
    expect(h['job:takeOver']({ jobId: 'j_1' }).ok).toBe(true);
    expect(sent).toEqual([{ kind: 'job.takeOver', payload: { jobId: 'j_1', on: true } }]);
  });

  it('job:handBack sends one job.handBack { jobId } (no mode, X-135)', () => {
    const { h, sent } = world({ jobState: 'working', cardState: 'handed_back' });
    expect(h['job:handBack']({ jobId: 'j_1' }).ok).toBe(true);
    expect(sent).toEqual([{ kind: 'job.handBack', payload: { jobId: 'j_1' } }]);
  });

  it('a job that is gone or finished is JOB_GONE and nothing is sent', () => {
    for (const jobState of [null, 'done', 'failed', 'cancelled', 'done_unverified']) {
      const { h, sent } = world({ jobState });
      for (const c of ['signin:done', 'signin:skip', 'job:takeOver', 'job:handBack'] as const)
        expect(h[c]({ jobId: 'j_1' })).toEqual({ ok: false, error: { kind: 'JOB_GONE' } });
      expect(sent).toEqual([]);
    }
  });

  it('I’m done / Skip on a sign-in card that is no longer open is JOB_GONE', () => {
    for (const cardState of [null, 'signed_in', 'skipped', 'timed_out', 'withdrawn']) {
      const { h, sent } = world({ cardState });
      expect(h['signin:done']({ jobId: 'j_1' }).ok).toBe(false);
      expect(h['signin:skip']({ jobId: 'j_1' }).ok).toBe(false);
      expect(sent).toEqual([]);
    }
  });

  it('no engine running: the call fails and says so (nothing is pretended)', () => {
    const { h } = world({ live: false });
    expect(h['signin:done']({ jobId: 'j_1' })).toEqual({ ok: false, error: { kind: 'UNKNOWN', message: 'engine not running' } });
  });
});
