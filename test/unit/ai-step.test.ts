// CR-0020 (the AI step): 06-1 §2.2 finder rules (fixed row order, `fake` never a row, a key row only when found, error kinds →
// row states, the choice block: 2+ work → "many", 1 → "one", only AI on this PC → its question, only plan-limited → "plan
// limited", else nothing; backup = the next working AI), 06-2 §6.1 "Using" status line and "Backup AI" choices, AT-155a (the
// maker pages are exactly claude-cli, codex-cli, gemini-cli plus ollama's link-out; any other provider opens nothing), and the
// engine's key and stand-in home helpers (08-2 §6.3.1, CR-0020 (b) pick 8).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeAiFs } from '../../src/engine/ai/index';
import { testHomeEnv, testHomeWhich, vaultKeyReader } from '../../src/engine/ai/vaultKeys';
import { loadMakerPages, makerPageUrl } from '../../src/main/setup/aiFinder';
import {
  backupFor,
  choiceBlock,
  initialRows,
  rowAction,
  rowsFromDetect,
  stateAfterVerify,
  upsertRow,
  type FinderRow,
} from '../../src/renderer/cards/setup/aiFinderModel';
import { agoOf, backupChoices, lineTone, usingLine } from '../../src/renderer/screens/settings/aiRows';
import { ok } from '../../src/shared/errors';
import type { AiStatus, DetectRow } from '../../src/shared/types';

const ids = (rows: FinderRow[]) => rows.map((r) => r.id);
const works = (id: FinderRow['id']): FinderRow => ({ id, state: 'works', found: true });
const none = (id: FinderRow['id']): FinderRow => ({ id, state: 'not_found', found: false });

describe('06-1 §2.2 finder rows', () => {
  it('five rows, all Looking, in fixed order', () => {
    const rows = initialRows();
    expect(ids(rows)).toEqual(['claude-cli', 'codex-cli', 'gemini-cli', 'own-key', 'ollama']);
    expect(rows.every((r) => r.state === 'looking')).toBe(true);
  });

  it('detection keeps the order, shows a key row only when found, and never shows the fake AI', () => {
    const detect: DetectRow[] = [
      { providerId: 'fake', found: true, state: 'testing' },
      { providerId: 'ollama', found: false, state: 'not_found' },
      { providerId: 'openai-key', found: true, state: 'testing' },
      { providerId: 'anthropic-key', found: false, state: 'not_found' },
      { providerId: 'codex-cli', found: true, signedIn: false, state: 'not_signed_in' },
      { providerId: 'claude-cli', found: true, signedIn: true, state: 'testing' },
    ];
    const rows = rowsFromDetect(detect);
    expect(ids(rows)).toEqual(['claude-cli', 'codex-cli', 'gemini-cli', 'openai-key', 'own-key', 'ollama']);
    expect(rows.find((r) => r.id === 'codex-cli')).toMatchObject({ state: 'not_signed_in', signedIn: false });
    expect(rowAction(rows.find((r) => r.id === 'codex-cli')!)).toBe('sign_in');
    expect(rowAction(rows.find((r) => r.id === 'own-key')!)).toBe('add_key');
  });

  it('a key found only in the environment offers "Add in secret box" and is not tested (08-2 §6.6)', () => {
    const [, , , key] = rowsFromDetect([{ providerId: 'google-key', found: true, signedIn: false, state: 'not_signed_in' }]);
    expect(key).toMatchObject({ id: 'google-key', envKey: true });
    expect(rowAction(key!)).toBe('add_key');
  });

  it('08-2 §6.7 error kinds → row states; anything else reads as slow with Test again', () => {
    expect(stateAfterVerify({ ok: false, providerId: 'openai-key', kind: 'AI_KEY_INVALID' })).toEqual({ state: 'key_failed' });
    expect(stateAfterVerify({ ok: false, providerId: 'claude-cli', kind: 'AI_LIMIT', resetAt: 5 })).toEqual({
      state: 'plan_limit',
      resetAt: 5,
    });
    expect(stateAfterVerify({ ok: false, providerId: 'claude-cli', kind: 'AI_SIGNED_OUT' })).toEqual({ state: 'not_signed_in' });
    expect(stateAfterVerify({ ok: false, providerId: 'claude-cli', kind: 'NET_OFFLINE' })).toEqual({ state: 'offline' });
    expect(stateAfterVerify({ ok: false, providerId: 'claude-cli', kind: 'AI_TIMEOUT' })).toEqual({ state: 'slow' });
    expect(rowAction({ id: 'claude-cli', state: 'slow', found: true })).toBe('test_again');
    // CR-0025: a helper its maker refuses as out of date says so, with [ Test again ] for after the update.
    expect(stateAfterVerify({ ok: false, providerId: 'codex-cli', kind: 'AI_CLI_INCOMPATIBLE' })).toEqual({ state: 'needs_update' });
    expect(rowAction({ id: 'codex-cli', state: 'needs_update', found: true })).toBe('test_again');
    expect(rowAction({ id: 'openai-key', state: 'key_failed', found: true })).toBe('replace_key');
  });

  it('a newly saved key row lands before "Your own key", keys in ladder order', () => {
    let rows = initialRows();
    rows = upsertRow(rows, works('google-key'));
    rows = upsertRow(rows, works('openai-key'));
    expect(ids(rows)).toEqual(['claude-cli', 'codex-cli', 'gemini-cli', 'openai-key', 'google-key', 'own-key', 'ollama']);
  });
});

describe('06-1 §2.2 step 3: the choice block', () => {
  it('waits while rows are still Looking or Testing, unless time is up', () => {
    expect(choiceBlock(initialRows(), false)).toEqual({ kind: 'pending' });
    expect(choiceBlock(initialRows(), true)).toEqual({ kind: 'nothing' });
  });

  it('CR-0025: after 25 s, "nothing found" waits while a helper is still being tested; a working AI is offered at once', () => {
    const testing: FinderRow = { id: 'claude-cli', state: 'testing', found: true };
    expect(choiceBlock([testing, none('codex-cli'), none('gemini-cli'), none('own-key'), none('ollama')], true)).toEqual({
      kind: 'pending',
    });
    expect(choiceBlock([works('claude-cli'), { ...testing, id: 'codex-cli' }, none('own-key'), none('ollama')], true)).toEqual({
      kind: 'one',
      pick: 'claude-cli',
    });
  });

  it('Claude and ChatGPT work → Claude is the pick and ChatGPT the backup', () => {
    const rows = [works('claude-cli'), works('codex-cli'), none('gemini-cli'), none('own-key'), none('ollama')];
    expect(choiceBlock(rows, false)).toEqual({ kind: 'many', pick: 'claude-cli', working: ['claude-cli', 'codex-cli'] });
    expect(backupFor('claude-cli', rows)).toBe('codex-cli');
  });

  it('one AI works → "one"; only AI on this PC → its question; only plan-limited → the limited line', () => {
    expect(choiceBlock([works('codex-cli'), none('ollama')], false)).toEqual({ kind: 'one', pick: 'codex-cli' });
    expect(choiceBlock([none('claude-cli'), works('ollama')], false)).toEqual({ kind: 'local' });
    expect(choiceBlock([{ id: 'claude-cli', state: 'plan_limit', found: true, resetAt: 9 }], false)).toEqual({
      kind: 'plan_limited',
      pick: 'claude-cli',
      resetAt: 9,
    });
    expect(backupFor('codex-cli', [works('codex-cli')])).toBeNull();
  });
});

describe('06-2 §6.1 Your AI rows', () => {
  const status = (s: Partial<AiStatus>): AiStatus => ({
    primary: 'claude-cli',
    backup: null,
    displayName: 'Claude',
    billing: 'plan',
    state: 'ok',
    usingBackup: false,
    ...s,
  });

  it('the Using line follows the AI state; a test in flight and being offline come first', () => {
    expect(usingLine(status({ lastVerifiedAt: 7 }), false, false)).toEqual({ kind: 'works', at: 7 });
    expect(usingLine(status({}), true, false)).toEqual({ kind: 'testing' });
    expect(usingLine(status({}), false, true)).toEqual({ kind: 'offline' });
    expect(usingLine(status({ state: 'limit', resetAt: 3 }), false, false)).toEqual({ kind: 'limit', resetAt: 3 });
    expect(usingLine(status({ state: 'key_invalid' }), false, false)).toEqual({ kind: 'key_failed' });
    expect(usingLine(status({ primary: null }), false, false)).toEqual({ kind: 'none' });
    expect(lineTone({ kind: 'signed_out' })).toBe('bad');
    expect(lineTone({ kind: 'limit', resetAt: null })).toBe('warn');
  });

  it('"checked {2 min ago}"', () => {
    expect(agoOf(0, 30_000)).toEqual({ unit: 'now' });
    expect(agoOf(0, 2 * 60_000)).toEqual({ unit: 'min', n: 2 });
    expect(agoOf(0, 3 * 3_600_000)).toEqual({ unit: 'hour', n: 3 });
    expect(agoOf(0, 50 * 3_600_000)).toEqual({ unit: 'day', n: 2 });
  });

  it('Backup AI offers every other AI whose last test passed, never the fake', () => {
    const providers = {
      'claude-cli': { kind: 'plan' as const, lastVerifyOk: true },
      'codex-cli': { kind: 'plan' as const, lastVerifyOk: true },
      'gemini-cli': { kind: 'plan' as const, lastVerifyOk: false },
      fake: { kind: 'plan' as const, lastVerifyOk: true },
    };
    expect(backupChoices(providers, 'claude-cli')).toEqual(['codex-cli']);
  });
});

describe('AT-155a: maker pages', () => {
  const pages = loadMakerPages(join(__dirname, '..', '..', 'resources'));

  it('lists exactly the three helpers and the local AI link-out, each on its maker’s own site', () => {
    expect(Object.keys(pages).sort()).toEqual(['claude-cli', 'codex-cli', 'gemini-cli', 'ollama']);
    expect(makerPageUrl(pages, 'codex-cli')).toBe('https://developers.openai.com/codex/cli');
    for (const id of Object.keys(pages)) expect(makerPageUrl(pages, id)).toMatch(/^https:\/\//);
  });

  it('any other provider opens nothing', () => {
    for (const id of ['openai-key', 'fake', 'constructor', '__proto__', undefined]) expect(makerPageUrl(pages, id)).toBeNull();
  });
});

describe('08-2 §6.3.1 keys and the stand-in home', () => {
  it('reads only AI keys, by name, through vault.use', async () => {
    const asked: unknown[] = [];
    const read = vaultKeyReader({
      request: async <T>(type: string, payload: unknown) => {
        asked.push([type, payload]);
        return ok('sk-FAKE' as T);
      },
    } as never);
    expect(await read('openai-key')).toBe('sk-FAKE');
    expect(await read('claude-cli')).toBeNull();
    expect(asked).toEqual([['vault.use', { purpose: 'ai_call', name: 'openai-key' }]]);
  });

  it('a stand-in home hides real keys and finds helpers only in {home}/bin', async () => {
    const home = mkdtempSync(join(tmpdir(), 'foo-home-'));
    mkdirSync(join(home, 'bin'));
    writeFileSync(join(home, 'bin', 'claude'), '');
    const env = testHomeEnv({ OPENAI_API_KEY: 'sk-real', HOME: '/home/real', PATH: '/usr/bin' }, home);
    expect(env).toMatchObject({ HOME: home, USERPROFILE: home, PATH: '/usr/bin' });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    const which = testHomeWhich(home, nodeAiFs);
    expect(await which('claude')).toBe(join(home, 'bin', 'claude'));
    expect(await which('codex')).toBeNull();
  });
});
