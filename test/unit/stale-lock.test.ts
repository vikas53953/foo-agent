// Spec: 09-windows §9.5 single instance, CR-0036 / X-194 (a lock left by a crashed foo is taken over; a live foo's lock
// still makes the new start quit at once).
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../../src/main/settings/Settings';
import { STALE_LOCK_WAIT_MS, takeLock, type LockSeams } from '../../src/main/windows/staleLock';

function seams(o: { freeAfter?: number; owner?: number | null; alive?: boolean; winnerAt?: number }) {
  let now = 0;
  let asks = 0;
  const events: string[] = [];
  const ended: number[] = [];
  const written: number[] = [];
  const s: LockSeams = {
    request: () => {
      asks += 1;
      return o.freeAfter !== undefined && now >= o.freeAfter;
    },
    // `winnerAt`: another start took the dead foo's lock at that time and wrote its own pid.
    readOwner: () => (o.winnerAt !== undefined && now >= o.winnerAt ? 5151 : o.owner === undefined ? 4242 : o.owner),
    writeOwner: (pid) => written.push(pid),
    alive: (pid) => (pid === 5151 ? true : (o.alive ?? false)),
    endChildren: async (pid) => {
      ended.push(pid);
    },
    sleep: async (ms) => {
      now += ms;
    },
    now: () => now,
    log: (evt) => events.push(evt),
  };
  return { s, events, ended, written, asks: () => asks };
}

describe('J19 crash reopen · the single-instance lock (CR-0036)', () => {
  it('a free lock is ours at once and records this pid as its owner', async () => {
    const w = seams({ freeAfter: 0 });
    expect(await takeLock(w.s)).toBe('ours');
    expect(w.written).toEqual([process.pid]);
    expect(w.asks()).toBe(1);
  });

  it('a live foo holds it: quit at once, nothing is ended, no waiting', async () => {
    const w = seams({ alive: true });
    expect(await takeLock(w.s)).toBe('running');
    expect(w.ended).toEqual([]);
    expect(w.asks()).toBe(1);
  });

  it('no owner on record: the plain §9.5 rule (quit at once)', async () => {
    const w = seams({ owner: null });
    expect(await takeLock(w.s)).toBe('running');
    expect(w.ended).toEqual([]);
  });

  it('the owner crashed: its helpers are ended and the lock is taken over when it frees', async () => {
    const w = seams({ freeAfter: 1_000 });
    expect(await takeLock(w.s)).toBe('ours');
    expect(w.ended).toEqual([4242]);
    expect(w.written).toEqual([process.pid]);
    expect(w.events).toEqual(['LOCK_STALE', 'LOCK_TAKEN_OVER']);
  });

  it('still held after the wait: `held`, so the start says why instead of quitting in silence', async () => {
    const w = seams({});
    expect(await takeLock(w.s)).toBe('held');
    expect(w.events.at(-1)).toBe('LOCK_STALE_HELD');
    expect(w.asks()).toBeGreaterThan(STALE_LOCK_WAIT_MS / 1_000);
  });

  it('two double-clicks after a crash: the start that lost sees the new live owner and quits at once, no error box', async () => {
    const w = seams({ winnerAt: 500 });
    expect(await takeLock(w.s)).toBe('running');
    expect(w.written).toEqual([]);
    expect(w.events).toEqual(['LOCK_STALE', 'LOCK_REFUSED']);
    expect(w.asks()).toBeLessThan(5);
  });

  it('a start that may not own the lock reads settings and writes nothing (a live foo keeps its file)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'foo-peek-'));
    const missing = join(dir, 'none.json');
    expect(SettingsStore.peek(missing).app.hardwareAcceleration).toBe(true);
    expect(existsSync(missing)).toBe(false);
    const bad = join(dir, 'settings.json');
    writeFileSync(bad, '{"zoom":105,"app":{"hardwareAcceleration":false}}');
    expect(SettingsStore.peek(bad).app.hardwareAcceleration).toBe(false);
    expect(readFileSync(bad, 'utf8')).toBe('{"zoom":105,"app":{"hardwareAcceleration":false}}');
  });
});
