// M11 pack §4.1 / §4.7 (CR-0015, G-M11-01, G-M11-02): EngineToMain `proc.track {pid, purpose}` (fire and forget),
// `proc.kill {pid}` → ok `{native}`, `voice.synthesize {text, lang, outPath}` → ok | VOICE_UNAVAILABLE; main routes them
// to JobObjects and the addon's `synthesize`. Driven at EngineBridge.receive, the seam the engine port feeds.
import { describe, expect, it } from 'vitest';
import { engineToMainSchema } from '../../../src/engine/protocol';
import { EngineBridge, type BridgeContext } from '../../../src/main/engine-supervisor/EngineBridge';
import { JobObjects } from '../../../src/main/proc/JobObjects';
import { settingsDefaults } from '../../../src/shared/settingsDefaults';

function bridge(over: Partial<BridgeContext> = {}) {
  const calls: string[] = [];
  const jobs = new JobObjects({
    available: true,
    assignToJobObject: (pid) => void calls.push(`assign ${pid}`),
    killJobObject: (pid) => void calls.push(`kill ${pid}`),
  });
  const b = new EngineBridge({
    db: null as never,
    settings: { get: () => settingsDefaults, update: () => undefined },
    emit: () => undefined,
    emitMessage: () => undefined,
    emitChat: () => undefined,
    proc: jobs,
    ...over,
  });
  const replies: unknown[] = [];
  b.reply = (r) => void replies.push(r);
  return { b, calls, jobs, replies };
}

describe('engine ⇄ main process messages', () => {
  it('the schema accepts the three new kinds and rejects a bad purpose', () => {
    expect(engineToMainSchema.safeParse({ id: 'e1', kind: 'proc.track', payload: { pid: 10, purpose: 'ai_cli' } }).success).toBe(true);
    expect(engineToMainSchema.safeParse({ id: 'e1', kind: 'proc.track', payload: { pid: 10, purpose: 'shell' } }).success).toBe(false);
    expect(engineToMainSchema.safeParse({ id: 'e2', kind: 'proc.kill', payload: { pid: 10 } }).success).toBe(true);
    expect(engineToMainSchema.safeParse({ id: 'e2', kind: 'proc.kill', payload: { pid: -1 } }).success).toBe(false);
    expect(
      engineToMainSchema.safeParse({ id: 'e3', kind: 'voice.synthesize', payload: { text: 'hi', lang: 'en-IN', outPath: 'a.wav' } })
        .success,
    ).toBe(true);
  });

  it('proc.track assigns a Job Object and sends no reply; proc.kill answers {native:true}', () => {
    const { b, calls } = bridge();
    expect(b.receive({ id: 'e1', kind: 'proc.track', payload: { pid: 4242, purpose: 'ai_cli' } })).toBeNull();
    expect(b.receive({ id: 'e2', kind: 'proc.kill', payload: { pid: 4242 } })).toEqual({
      re: 'e2',
      result: { ok: true, value: { native: true } },
    });
    expect(calls).toEqual(['assign 4242', 'kill 4242']);
  });

  it('proc.kill for an untracked pid, or with no JobObjects, answers {native:false}', () => {
    expect(bridge().b.receive({ id: 'e2', kind: 'proc.kill', payload: { pid: 1 } })).toEqual({
      re: 'e2',
      result: { ok: true, value: { native: false } },
    });
    expect(bridge({ proc: undefined }).b.receive({ id: 'e3', kind: 'proc.kill', payload: { pid: 1 } })).toEqual({
      re: 'e3',
      result: { ok: true, value: { native: false } },
    });
  });

  it('voice.synthesize calls the addon and replies ok when the WAV is written', async () => {
    const seen: string[] = [];
    const { b, replies } = bridge({ synthesize: async (t, l, o) => void seen.push(`${t}|${l}|${o}`) });
    expect(b.receive({ id: 'e5', kind: 'voice.synthesize', payload: { text: 'Done.', lang: 'en-IN', outPath: 'v.wav' } })).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(['Done.|en-IN|v.wav']);
    expect(replies).toEqual([{ re: 'e5', result: { ok: true, value: null } }]);
  });

  it('voice.synthesize → VOICE_UNAVAILABLE when the addon rejects or is missing', async () => {
    const a = bridge({
      synthesize: () => Promise.reject(Object.assign(new Error('VOICE_UNAVAILABLE'), { code: 'VOICE_UNAVAILABLE' })),
    });
    a.b.receive({ id: 'e6', kind: 'voice.synthesize', payload: { text: 'x', lang: 'hi-IN', outPath: 'v.wav' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(a.replies).toEqual([{ re: 'e6', result: { ok: false, error: { kind: 'VOICE_UNAVAILABLE' } } }]);
    const m = bridge();
    m.b.receive({ id: 'e7', kind: 'voice.synthesize', payload: { text: 'x', lang: 'hi-IN', outPath: 'v.wav' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(m.replies).toEqual([{ re: 'e7', result: { ok: false, error: { kind: 'VOICE_UNAVAILABLE' } } }]);
  });
});
