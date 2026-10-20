// Shared world for the M9 T8 booking tests: the T2 sandbox sites over HTTPS (test/sites, 08-3 §22.5) and foo's real browser
// tools (createBrowserTools) in a headless Chromium that maps the sandbox `.test` names onto 127.0.0.1 and trusts only the
// sandbox key (08-4 §27.6), plugged into the M4 job harness beside the fake tools, so a fake AI books through the real engine.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { Redactor } from '../../../src/engine/redact/Redactor';
import { createBrowserTools, type BrowserRuntime } from '../../../src/engine/tools/browser/tools';
import type { ToolRegistry } from '../../../src/engine/tools/ToolLayer';
import { FakeClock } from '../../../src/shared/clock';
import { settingsDefaults } from '../../../src/shared/settingsDefaults';
import { control, setToggles, type ControlState } from '../../sites/client';
import type { SiteName } from '../../sites/hosts';
import { startSandbox, type Sandbox } from '../../sites/server';

export interface BookingWorld {
  sb: Sandbox;
  browser: { registry: ToolRegistry; runtime: BrowserRuntime };
  dataDir: string;
  control(site?: SiteName): Promise<ControlState>;
  toggles(patch: Record<string, unknown>, site?: SiteName): Promise<void>;
  close(): Promise<void>;
}

export async function bookingWorld(o: { submit?: { maxMs?: number; pollMs?: number; waitMaxMs?: number } } = {}): Promise<BookingWorld> {
  const sb = await startSandbox();
  const dataDir = mkdtempSync(join(tmpdir(), 'foo-booking-'));
  const redactor = new Redactor({ clock: new FakeClock(), log: () => undefined });
  const settings = structuredClone(settingsDefaults);
  const browser = createBrowserTools({
    dataDir,
    resourcesDir: resolve(__dirname, '../../../resources'),
    platform: process.platform,
    env: { FOO_TEST_ALLOW_HOSTS: sb.allowHosts },
    testRun: true,
    scrub: (t) => redactor.scrub(t).text,
    registryHit: (t) => redactor.registry.forms().some((f) => t.includes(f.form)),
    settings: () => settings,
    now: () => Date.now(),
    log: () => undefined,
    headless: true,
    launch: (dir, options) =>
      chromium.launchPersistentContext(dir, {
        ...options,
        args: [
          ...options.args,
          '--no-proxy-server',
          `--host-resolver-rules=${sb.resolverRules}`,
          `--ignore-certificate-errors-spki-list=${sb.cert.spkiSha256}`,
        ],
      }),
    timing: { idleMs: 150, settleMaxMs: 5_000, actionableMs: 2_000 },
    submitTiming: { maxMs: 1_500, pollMs: 100, waitMaxMs: 1_500, ...o.submit },
  });
  return {
    sb,
    browser,
    dataDir,
    control: (site = 'restaurant') => control(sb, site),
    toggles: async (patch, site = 'restaurant') => {
      const r = await setToggles(sb, site, patch);
      if (r.status !== 200) throw new Error(`toggles ${site}: ${r.status} ${r.text}`);
    },
    async close() {
      await browser.runtime.browser.shutdown();
      await sb.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
