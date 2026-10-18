// M11 pack §4.1 / §4.7 (CR-0015, G-M11-01, G-M11-02): EngineToMain `proc.track {pid, purpose}`, `proc.kill {pid}` → ok
// `{native}`, `voice.synthesize {text, lang, outPath}` → ok | VOICE_UNAVAILABLE; installNative routes them to main's
// JobObjects and the addon's `synthesize`, and kills every tracked job when the engine exits (CR-0007 §(e)). Driven at
// EngineBridge.receive, the seam the engine port feeds.
import { describe, expect, it } from 'vitest';
import { EngineBridge } from '../../../src/main/engine-supervisor/EngineBridge';
import { FALLBACK, type FooNative, type LoadedNative } from '../../../src/main/native/fooNative';
import { installNative } from '../../../src/main/native/installNative';
import type { InstallDeps } from '../../../src/main/installDeps';
import { settingsDefaults } from '../../../src/shared/settingsDefaults';

function bridge(api: Partial<FooNative> = {}, available = true) {
  const calls: string[] = [];
  const native: LoadedNative = {
    available,
    api: {
      ...FALLBACK,
      assignToJobObject: (pid) => void calls.push(`assign ${pid}`),
      killJobObject: (pid) => void calls.push(`kill ${pid}`),
      ...api,
    },
  };
  const b = new EngineBridge({
    db: null as never,
    settings: { get: () => settingsDefaults, update: () => undefined },
    emit: () => undefined,
    emitMessage: () => undefined,
    emitChat: () => undefined,
  });
  installNative({ ctx: { engine: b }, native } as unknown as InstallDeps);
  const replies: unknown[] = [];
  b.postReply = (r) => void replies.push(r);
  return { b, calls, replies };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('installNative: engine ⇄ main process messages', () => {
  it('proc.track assigns a Job Object; proc.kill terminates it and answers {native:true}', () => {
    const { b, calls } = bridge();
    expect(b.receive({ id: 'e1', kind: 'proc.track', payload: { pid: 4242, purpose: 'ai_cli' } })).toEqual({
      re: 'e1',
      result: { ok: true, value: { native: true } },
    });
    expect(b.receive({ id: 'e2', kind: 'proc.kill', payload: { pid: 4242 } })).toEqual({
      re: 'e2',
      result: { ok: true, value: { native: true } },
    });
    expect(calls).toEqual(['assign 4242', 'kill 4242']);
  });

  it('proc.kill for an untracked pid, or with the addon missing, answers {native:false}', () => {
    expect(bridge().b.receive({ id: 'e2', kind: 'proc.kill', payload: { pid: 1 } })).toEqual({
      re: 'e2',
      result: { ok: true, value: { native: false } },
    });
    const missing = bridge({}, false);
    missing.b.receive({ id: 'e3', kind: 'proc.track', payload: { pid: 1, purpose: 'whisper' } });
    expect(missing.b.receive({ id: 'e4', kind: 'proc.kill', payload: { pid: 1 } })).toEqual({
      re: 'e4',
      result: { ok: true, value: { native: false } },
    });
    expect(missing.calls).toEqual([]);
  });

  it('engine exit kills every tracked job (CR-0007 §(e))', () => {
    const { b, calls } = bridge();
    b.receive({ id: 'e1', kind: 'proc.track', payload: { pid: 11, purpose: 'ai_cli' } });
    b.receive({ id: 'e2', kind: 'proc.track', payload: { pid: 12, purpose: 'whisper' } });
    b.engineExited();
    b.engineExited();
    expect(calls).toEqual(['assign 11', 'assign 12', 'kill 11', 'kill 12']);
  });

  it('voice.synthesize calls the addon and replies ok when the WAV is written', async () => {
    const seen: string[] = [];
    const { b, replies } = bridge({ synthesize: async (t, l, o) => void seen.push(`${t}|${l}|${o}`) });
    expect(b.receive({ id: 'e5', kind: 'voice.synthesize', payload: { text: 'Done.', lang: 'en-IN', outPath: 'v.wav' } })).toBeNull();
    await flush();
    expect(seen).toEqual(['Done.|en-IN|v.wav']);
    expect(replies).toEqual([{ re: 'e5', result: { ok: true, value: undefined } }]);
  });

  it('voice.synthesize → VOICE_UNAVAILABLE when the addon rejects (no voice, or no addon)', async () => {
    const { b, replies } = bridge();
    b.receive({ id: 'e6', kind: 'voice.synthesize', payload: { text: 'x', lang: 'hi-IN', outPath: 'v.wav' } });
    await flush();
    expect(replies).toEqual([{ re: 'e6', result: { ok: false, error: { kind: 'VOICE_UNAVAILABLE' } } }]);
  });
});
