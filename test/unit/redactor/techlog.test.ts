// Spec: 08-3 §19.1 (tech log line shape; no message text, page or prompt text, emails, phones or secret values; debug only
// in a debug session; 10 MB/day cap, oldest lines dropped), 08-2 §11.4 R7, 08-0 §G.6 (`registry:add` payloads never logged).
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { logEvent, setAppTechLog, TechLog, techLogLine, type TechLogEntry } from '../../../src/main/log/techLog';
import { FakeClock, TEST_EPOCH_MS } from '../../../src/shared/clock';
import { Redactor } from '../../../src/shared/redactor';

const CANARY = 'sk-proj-FAKE0canary0T3redaction00000000';
const redactor = new Redactor({ clock: new FakeClock(TEST_EPOCH_MS) });
const line = (e: Record<string, unknown>, debug = false) =>
  techLogLine(e as unknown as TechLogEntry, { now: TEST_EPOCH_MS, debug, redactor });

describe('R7 tech log filter', () => {
  it('keeps only t, lvl, mod, evt, ids, kind, ms; message text and payloads are dropped', () => {
    const out = line({
      lvl: 'warn',
      mod: 'ipc',
      evt: 'message.send',
      ids: { chatId: 'c_1', jobId: 'j_1', extra: 'x' },
      kind: 'SECRET_SUSPECTED',
      ms: 12.4,
      text: `hello ${CANARY}`,
      payload: { body: 'call me' },
    });
    expect(JSON.parse(out!)).toEqual({
      t: TEST_EPOCH_MS,
      lvl: 'warn',
      mod: 'ipc',
      evt: 'message.send',
      ids: { chatId: 'c_1', jobId: 'j_1' },
      kind: 'SECRET_SUSPECTED',
      ms: 12,
    });
  });

  it('secrets, emails and phones inside the allowed strings are masked', () => {
    const out = line({ lvl: 'error', mod: 'net', evt: `fetch https://a.in/?token=${CANARY}`, kind: 'riya.test@gmail.com 9876543210' })!;
    expect(out).not.toContain(CANARY);
    expect(out).not.toContain('riya.test');
    expect(out).toContain('r***@gmail.com 98••• ••210');
  });

  it('an id that is not an id (it carries text) is dropped', () => {
    expect(JSON.parse(line({ lvl: 'info', mod: 'm', evt: 'e', ids: { chatId: 'call mom at 5' } })!)).not.toHaveProperty('ids');
  });

  it('registry:add and registry:remove are logged by name only, never with their value or forms', () => {
    const out = line({
      lvl: 'info',
      mod: 'engine',
      evt: 'registry:add',
      kind: 'ai_key',
      value: CANARY,
      normalised: [CANARY],
      ids: { chatId: 'c_1' },
    })!;
    expect(JSON.parse(out)).toEqual({ t: TEST_EPOCH_MS, lvl: 'info', mod: 'engine', evt: 'registry:add' });
  });

  it('debug lines only in a debug session', () => {
    expect(line({ lvl: 'debug', mod: 'm', evt: 'e' })).toBeNull();
    expect(line({ lvl: 'debug', mod: 'm', evt: 'e' }, true)).not.toBeNull();
  });

  it('writes logs/app-{date}.log and drops the oldest lines past the daily cap', () => {
    const dir = mkdtempSync(join(tmpdir(), 'foo-log-'));
    const log = new TechLog({ dir, clock: new FakeClock(TEST_EPOCH_MS), capBytes: 2_000, redactor });
    for (let i = 0; i < 60; i++) log.write({ lvl: 'info', mod: 'm', evt: `e${i}` });
    expect(readdirSync(dir)).toEqual(['app-2026-10-16.log']);
    const file = join(dir, 'app-2026-10-16.log');
    expect(statSync(file).size).toBeLessThanOrEqual(2_000);
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(JSON.parse(lines.at(-1)!).evt).toBe('e59');
    expect(lines.some((l) => JSON.parse(l).evt === 'e0')).toBe(false);
  });
});

describe('R7: main logs through one sink', () => {
  it('logEvent writes the filtered line to the app log; before the log opens it goes to the console, still filtered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setAppTechLog(null);
    logEvent({ lvl: 'warn', mod: 'ipc', evt: 'IPC_REJECTED', kind: `message:send ${CANARY}`, text: CANARY } as TechLogEntry);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).not.toContain(CANARY);
    warn.mockRestore();

    const dir = mkdtempSync(join(tmpdir(), 'foo-applog-'));
    setAppTechLog(new TechLog({ dir, clock: new FakeClock(TEST_EPOCH_MS) }));
    logEvent({ lvl: 'error', mod: 'ipc', evt: 'IPC_FAILED', kind: `message:send TypeError ${CANARY}` });
    setAppTechLog(null);
    const [file] = readdirSync(dir);
    const text = readFileSync(join(dir, file!), 'utf8');
    expect(text).toContain('"IPC_FAILED"');
    expect(text).not.toContain(CANARY);
  });

  it('a log that cannot be written never throws into the caller', () => {
    setAppTechLog({
      write: () => {
        throw new Error('disk full');
      },
    } as unknown as TechLog);
    expect(() => logEvent({ lvl: 'info', mod: 'main', evt: 'APP_STARTED' })).not.toThrow();
    setAppTechLog(null);
  });
});
