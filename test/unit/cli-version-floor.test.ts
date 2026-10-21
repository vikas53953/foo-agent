// Spec: CR-0031 (X-189), 08-2 §6.5 (`--version` probe), §6.6 (verify), §6.7 (AI_CLI_INCOMPATIBLE), 06-1 §2.2 (finder row
// `needs_update`). Real PC 2026-10-21: Codex 0.144.4 was refused by its service and the finder said "slow to answer".
// Runs the fake CLI of test/fakes/fake-cli; never a real provider.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createCodexCli } from '../../src/engine/ai/codexCli';
import { belowKnownGood, compareVersions, KNOWN_GOOD_VERSION, parseVersion } from '../../src/engine/ai/probe';
import { FIX, makeDeps, cleanupTmp } from './m3-adapters-helpers';

afterAll(cleanupTmp);

/** A codex whose `--version` prints `version` and whose test run fails with no reason the classifier knows (exit 1). */
function codexAt(version: string) {
  const d = makeDeps(
    {},
    {
      FAKE_CLI_HELP: path.join(FIX, 'codex/help.txt'),
      FAKE_CLI_EXEC_HELP: path.join(FIX, 'codex/exec-help.txt'),
      FAKE_CLI_EXIT: '1',
    },
  );
  const v = path.join(d.root, 'version.txt');
  writeFileSync(v, `codex-cli ${version}\n`);
  d.env.FAKE_CLI_VERSION = v;
  const creds = path.join(d.home, '.codex/auth.json');
  mkdirSync(path.dirname(creds), { recursive: true });
  writeFileSync(creds, '{}');
  return createCodexCli(d);
}

describe('helper-app version floor (CR-0031)', () => {
  it('compares dotted versions by number, not as text', () => {
    expect(compareVersions('0.144.4', '0.156.1')).toBeLessThan(0);
    expect(compareVersions('0.156.1', '0.156.1')).toBe(0);
    expect(compareVersions('0.1000.0', '0.156.1')).toBeGreaterThan(0);
    expect(compareVersions('2.10.0', '2.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
  });

  it('the floors are the versions of the real 2026-10-18 captures', () => {
    expect(KNOWN_GOOD_VERSION['claude-cli']).toBe(parseVersion('2.1.282 (Claude Code)'));
    expect(KNOWN_GOOD_VERSION['codex-cli']).toBe(parseVersion('codex-cli 0.156.1'));
    expect(belowKnownGood('codex-cli', '0.144.4')).toBe(true);
    expect(belowKnownGood('codex-cli', null)).toBe(false);
    expect(belowKnownGood('gemini-cli', '0.0.1')).toBe(false);
  });

  it('an old codex whose test fails without a reason reads as needs an update', async () => {
    const r = await codexAt('0.144.4').verify(new AbortController().signal);
    expect(r).toMatchObject({ ok: false, kind: 'AI_CLI_INCOMPATIBLE' });
  });

  it('the same failure on a known-good codex stays UNKNOWN (no false "update" advice)', async () => {
    const r = await codexAt('0.156.1').verify(new AbortController().signal);
    expect(r).toMatchObject({ ok: false, kind: 'UNKNOWN' });
  });
});
