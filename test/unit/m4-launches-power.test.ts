// Spec: 08-1 §4.1.3 + 08-0 §G.14 / X-77 (launches.json: last 10, `clean`; safe mode at 3 unclean launches in 10 min or 3
// engine crashes in one launch), §2.2 step 1, §2.3 step 4 (clean only after the engine acked jobs.pauseAll), 09 §9.22
// (powerSaveBlocker only while a job is WORKING; power events forwarded; shutdown never delayed), CR-0008 G-M4-04, G-M4-13.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LaunchLog, type LaunchRecord } from '../../src/main/store/launches';
import { PowerService, type PowerEvent } from '../../src/main/power/PowerService';
import { engineHello } from '../../src/main/engine-supervisor/hello';
import { settingsDefaults } from '../../src/shared/settingsDefaults';

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});
const file = () => {
  dir ??= mkdtempSync(path.join(os.tmpdir(), 'foo-launch-'));
  return path.join(dir, 'launches.json');
};
const NOW = 1_800_000_000_000;
const MIN = 60_000;
const seed = (f: string, launches: Partial<LaunchRecord>[]) =>
  writeFileSync(f, JSON.stringify({ launches: launches.map((l) => ({ version: '0.0.1', engineCrashes: 0, clean: true, at: 0, ...l })) }));
const records = (f: string) => (JSON.parse(readFileSync(f, 'utf8')) as { launches: LaunchRecord[] }).launches;

describe('launches.json (08-1 §4.1.3)', () => {
  it('appends this launch unclean, keeps the last 10, newest last', () => {
    const f = file();
    seed(
      f,
      Array.from({ length: 10 }, (_, i) => ({ at: NOW - (20 - i) * MIN })),
    );
    LaunchLog.start(f, NOW, '0.0.1');
    const r = records(f);
    expect(r).toHaveLength(10);
    expect(r.at(-1)).toEqual({ at: NOW, clean: false, version: '0.0.1', engineCrashes: 0 });
  });

  it('a missing or broken file is no history', () => {
    const f = file();
    writeFileSync(f, '{not json');
    const log = LaunchLog.start(f, NOW, '0.0.1');
    expect(log.safeMode()).toBe(false);
    expect(log.previousClean).toBe(true);
  });

  it('3 unclean launches within 10 min → safe mode; older ones do not count', () => {
    const f = file();
    seed(f, [
      { at: NOW - 9 * MIN, clean: false },
      { at: NOW - 5 * MIN, clean: false },
      { at: NOW - MIN, clean: false },
    ]);
    expect(LaunchLog.start(f, NOW, '0.0.1').safeMode()).toBe(true);
    const g = path.join(dir!, 'b.json');
    seed(g, [
      { at: NOW - 11 * MIN, clean: false },
      { at: NOW - 5 * MIN, clean: false },
      { at: NOW - MIN, clean: false },
    ]);
    expect(LaunchLog.start(g, NOW, '0.0.1').safeMode()).toBe(false);
  });

  it('3 engine crashes in this launch → safe mode for the next engine start (counted in the file)', () => {
    const f = file();
    const log = LaunchLog.start(f, NOW, '0.0.1');
    expect(log.nextEngineStart()).toEqual({ safeMode: false, cleanStart: true });
    log.engineCrashed();
    log.engineCrashed();
    expect(log.nextEngineStart()).toEqual({ safeMode: false, cleanStart: false });
    log.engineCrashed();
    expect(log.nextEngineStart()).toEqual({ safeMode: true, cleanStart: false });
    expect(records(f).at(-1)!.engineCrashes).toBe(3);
  });

  it('cleanStart follows the previous launch; markClean sets clean: true', () => {
    const f = file();
    seed(f, [{ at: NOW - MIN, clean: false }]);
    const log = LaunchLog.start(f, NOW, '0.0.1');
    expect(log.nextEngineStart().cleanStart).toBe(false);
    log.markClean();
    expect(records(f).at(-1)!.clean).toBe(true);
  });

  it('the engine hears the decision on its first settings.changed (G-M4-13)', () => {
    const sent: { kind: string; payload: unknown }[] = [];
    engineHello((kind, payload) => (sent.push({ kind, payload }), true), {
      settings: () => settingsDefaults,
      online: () => true,
      testClock: null,
      launch: () => ({ safeMode: true, cleanStart: false }),
    });
    expect(sent[0]).toEqual({
      kind: 'settings.changed',
      payload: { paths: [], settings: settingsDefaults, launch: { safeMode: true, cleanStart: false } },
    });
  });
});

function power(o: { ack?: 'ok' | 'fail' | 'never' } = {}) {
  const calls: string[] = [];
  let id = 0;
  const sent: unknown[] = [];
  const handlers = new Map<PowerEvent, () => void>();
  const svc = new PowerService({
    blocker: {
      start: (type) => (calls.push(`start:${type}`), ++id),
      stop: (n) => calls.push(`stop:${n}`),
    },
    send: (_kind, payload) => sent.push(payload),
    pauseAll: () =>
      o.ack === 'never'
        ? new Promise(() => {})
        : o.ack === 'fail'
          ? Promise.reject(new Error('no engine'))
          : Promise.resolve({ paused: [] }),
    markClean: () => calls.push('clean'),
    quitAckMs: 20,
  });
  svc.attach({ on: (ev, fn) => handlers.set(ev, fn) });
  return { svc, calls, sent, handlers };
}

describe('PowerService (09 §9.22)', () => {
  it('holds prevent-app-suspension only while a job is WORKING, once', () => {
    const { svc, calls } = power();
    svc.keepAwake(true, 1);
    svc.keepAwake(true, 2);
    expect(svc.keepingAwake).toBe(true);
    svc.keepAwake(false, 0);
    expect(calls).toEqual(['start:prevent-app-suspension', 'stop:1']);
    expect(svc.keepingAwake).toBe(false);
  });

  it('forwards suspend / resume / shutdown to the engine; session end is a shutdown', () => {
    const { svc, sent, handlers } = power();
    handlers.get('suspend')!();
    handlers.get('resume')!();
    handlers.get('shutdown')!();
    handlers.get('lock-screen')!();
    svc.sessionEnding();
    expect(sent).toEqual([{ event: 'suspend' }, { event: 'resume' }, { event: 'shutdown' }, { event: 'lock' }, { event: 'shutdown' }]);
  });

  it('quit: clean only after the engine acked jobs.pauseAll; the blocker is released', async () => {
    for (const [ack, clean] of [
      ['ok', true],
      ['fail', false],
      ['never', false],
    ] as const) {
      const { svc, calls } = power({ ack });
      svc.keepAwake(true, 1);
      await svc.beforeQuit();
      await svc.beforeQuit();
      expect(calls.includes('clean')).toBe(clean);
      expect(calls.filter((c) => c === 'clean').length).toBeLessThanOrEqual(1);
      expect(svc.keepingAwake).toBe(false);
    }
  });
});
