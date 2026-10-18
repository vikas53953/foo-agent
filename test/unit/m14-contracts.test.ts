// M14 T1 contracts (CR-0018): the installer / uninstaller switches of 09 §9.23.4 (X-124) and G-M14-14 / G-M14-15, routed by
// src/main/cli/argv.ts; the M14 copy keys of 09 §9.3.2, §9.23.2, 06-2 §6.6, 06-3 §14 C-16 (landed before their tickets,
// scripts/copy-pending.json); the M14 test ids (08-0 §C, G-M14-22).
import { afterEach, describe, expect, it } from 'vitest';
import {
  CLI_EXIT,
  clearCliHandlers,
  lockLostExitCode,
  parseCliArgv,
  refusedExitCode,
  registerCliHandler,
  routeArgv,
} from '../../src/main/cli/argv';
import { TID } from '../../src/shared/testids';
import copy from '../../src/shared/copy/en-IN.json';
import pending from '../../scripts/copy-pending.json';

const EXE = 'C:\\Users\\tester\\AppData\\Local\\Programs\\foo\\foo.exe';

afterEach(() => clearCliHandlers());

describe('installer switches (09 §9.23.4, CR-0018)', () => {
  it('a normal launch is not a switch', () => {
    expect(parseCliArgv([EXE])).toBeNull();
    expect(parseCliArgv([EXE, '--hidden'])).toBeNull();
    expect(parseCliArgv([EXE, 'foo://chat/c_1'])).toBeNull();
    expect(routeArgv([EXE, '--hidden'], 'primary')).toEqual({ kind: 'none' });
  });

  it('reads the command and its options in both --key=value and --key value forms', () => {
    expect(parseCliArgv([EXE, '--uninstall-cleanup', '--mode=delete', '--export-to', 'D:\\copies\\foo'])).toEqual({
      command: 'uninstall-cleanup',
      options: { mode: 'delete', 'export-to': 'D:\\copies\\foo' },
    });
    expect(parseCliArgv([EXE, '--install-readiness', '--start-with-windows=0'])).toEqual({
      command: 'install-readiness',
      options: { 'start-with-windows': '0' },
    });
    expect(parseCliArgv([EXE, '--uninstall-probe'])).toEqual({ command: 'uninstall-probe', options: {} });
  });

  it('dispatches --uninstall-probe to its handler when it reaches the running foo', async () => {
    const seen: unknown[] = [];
    registerCliHandler('uninstall-probe', (inv) => {
      seen.push(inv);
      return CLI_EXIT.ok;
    });
    const route = routeArgv([EXE, '--uninstall-probe'], 'second-instance');
    expect(route.kind).toBe('handled');
    if (route.kind === 'handled') expect(await route.done).toBe(CLI_EXIT.ok);
    expect(seen).toEqual([{ command: 'uninstall-probe', options: {} }]);
  });

  it('refuses --uninstall-probe and --uninstall-quit when no foo is running (this process got the lock)', () => {
    registerCliHandler('uninstall-probe', () => CLI_EXIT.ok);
    for (const sw of ['--uninstall-probe', '--uninstall-quit']) {
      const route = routeArgv([EXE, sw], 'primary');
      expect(route).toMatchObject({ kind: 'refused', reason: 'NO_RUNNING_INSTANCE' });
      if (route.kind === 'refused') expect(refusedExitCode(route)).toBe(CLI_EXIT.refused);
    }
  });

  it('refuses the helpers while another foo runs, without running them', () => {
    let ran = false;
    registerCliHandler('uninstall-cleanup', () => {
      ran = true;
      return CLI_EXIT.ok;
    });
    expect(routeArgv([EXE, '--uninstall-cleanup', '--mode=keep'], 'second-instance')).toMatchObject({
      kind: 'refused',
      reason: 'INSTANCE_RUNNING',
    });
    expect(routeArgv([EXE, '--install-readiness'], 'second-instance')).toMatchObject({ kind: 'refused', reason: 'INSTANCE_RUNNING' });
    expect(ran).toBe(false);
  });

  it('a switch with no handler yet exits with its own code; a handler that throws exits failed', async () => {
    const route = routeArgv([EXE, '--install-readiness'], 'primary');
    expect(route).toMatchObject({ kind: 'refused', reason: 'NO_HANDLER' });
    if (route.kind === 'refused') expect(refusedExitCode(route)).toBe(CLI_EXIT.noHandler);
    registerCliHandler('install-readiness', () => {
      throw new Error('disk probe failed');
    });
    const failed = routeArgv([EXE, '--install-readiness'], 'primary');
    if (failed.kind !== 'handled') throw new Error('expected handled');
    expect(await failed.done).toBe(CLI_EXIT.failed);
  });

  it('a process that loses the lock exits ok for a message it handed on, refused for a helper', () => {
    const inv = (sw: string) => parseCliArgv([EXE, sw])!;
    expect(lockLostExitCode(inv('--uninstall-probe'))).toBe(CLI_EXIT.ok);
    expect(lockLostExitCode(inv('--uninstall-quit'))).toBe(CLI_EXIT.ok);
    expect(lockLostExitCode(inv('--uninstall-cleanup'))).toBe(CLI_EXIT.refused);
    expect(lockLostExitCode(inv('--install-readiness'))).toBe(CLI_EXIT.refused);
  });

  it('refuses a second handler for the same switch', () => {
    registerCliHandler('uninstall-quit', () => CLI_EXIT.ok);
    expect(() => registerCliHandler('uninstall-quit', () => CLI_EXIT.ok)).toThrow(/already registered/);
  });
});

describe('M14 copy keys and test ids (CR-0018)', () => {
  const m14 = Object.keys(pending.keys).filter((k) => (pending.keys as Record<string, string>)[k]!.startsWith('M14-'));

  it('lands the installer, uninstaller, data row, C-16, wiping and About keys, each listed for the ticket that renders it', () => {
    for (const area of ['installer.', 'uninstaller.', 'settings.privacy.row.', 'dialog.c_16.', 'thread.wipe.', 'settings.about.'])
      expect(m14.some((k) => k.startsWith(area))).toBe(true);
    for (const k of m14) expect(copy).toHaveProperty([k]);
    expect(m14).toContain('screen.wiping.title');
    expect(m14).toContain('thread.welcome_back.line');
    expect(m14).toContain('errors.export_secret_found.line');
  });

  it('keeps the spec words, with the folder as a slot (G-M14-17) and curly apostrophes', () => {
    const c = copy as Record<string, string>;
    expect(c['uninstaller.done.body']).toBe('foo is removed. Your files in {folder} were kept. Your {AI} account is untouched.');
    expect(c['dialog.c_16.body']).toContain('Files in {folder} stay. This can’t be undone.');
    expect(c['installer.unsupported.body']).toBe('foo needs Windows 10 (22H2) or Windows 11. Your PC has {version}.');
    expect(c['settings.about.version_tester']).toBe('Version {version} · tester build');
    for (const k of m14) expect(c[k]).not.toMatch(/'/);
  });

  it('registers the M14 test ids', () => {
    expect(TID.dialogC16).toBe('dialog-c-16');
    expect(TID.settingsRowPrivacyExport).toBe('settings-row-privacy-export');
    expect(TID.settingsRowPrivacyDeleteAll).toBe('settings-row-privacy-delete-all');
    expect(TID.screenWiping).toBe('screen-wiping');
    expect(TID.screenWipingProgress).toBe('screen-wiping-progress');
  });
});
