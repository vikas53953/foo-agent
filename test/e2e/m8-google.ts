// Shared start for the M8 T2 Google specs (m8-connectors e2e, BP-cards-m8, the foo-verify journey): a local fake Google token
// endpoint (FOO_TEST_GOOGLE_BASE), a fake client file (FOO_TEST_GOOGLE_OAUTH), the ux-world-m8-connect seed, and the browser
// played by the test: main's shell.openExternal is swapped in the test run so the sign-in link is captured instead of
// opened, and the test calls the loopback the way Google's redirect would. Fake accounts only (@example.com).
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SeedReply } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { windowSize } from '../fidelity/capture';
import { FAKE_CLIENT, startFakeGoogleServer, type FakeGoogleOptions } from '../fakes/connectors/google-oauth';

export async function googleEnv(opts: FakeGoogleOptions = {}) {
  const server = await startFakeGoogleServer(opts);
  const dir = mkdtempSync(join(tmpdir(), 'foo-google-'));
  const clientFile = join(dir, 'google-oauth.json');
  writeFileSync(clientFile, JSON.stringify(FAKE_CLIENT));
  return { server, env: { FOO_TEST_GOOGLE_BASE: server.base, FOO_TEST_GOOGLE_OAUTH: clientFile } };
}

/** Seeds the world with the Connect card and swaps shell.openExternal for a recorder in main. */
export async function openConnectWorld(app: ElectronApplication, page: Page, at = '2026-10-16T09:41:00+05:30') {
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const reply = (await page.evaluate(async (iso) => {
    await window.__fooTest!.clock.set(iso);
    return window.__fooTest!.seed('ux-world-m8-connect');
  }, at)) as SeedReply;
  await page.reload();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await windowSize(app, page, 1440, 900);
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __opened: string[] };
    g.__opened = [];
    shell.openExternal = async (url: string) => void g.__opened.push(url);
  });
  return reply.refs ?? {};
}

/** The sign-in link main opened last (it must be Google's). */
export async function lastOpened(app: ElectronApplication): Promise<URL> {
  const urls = await app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened);
  const last = urls.at(-1);
  if (!last) throw new Error('main opened no sign-in link');
  return new URL(last);
}

/** Plays Google's redirect: GET the loopback with the state from the link and a fake code. */
export function browserReturns(signIn: URL, query = 'code=fake-code'): Promise<{ status: number; body: string }> {
  const redirect = signIn.searchParams.get('redirect_uri')!;
  const state = signIn.searchParams.get('state')!;
  return new Promise((resolve, reject) => {
    const req = request(`${redirect}?state=${encodeURIComponent(state)}&${query}`, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => (body += c.toString('utf8')));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Settings → Connections the way a deep link would open it (main's `navigate` event, 08-1 §3.3). */
export async function openConnections(app: ElectronApplication, page: Page): Promise<void> {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.send('navigate', { view: { kind: 'settings', page: 'connections' } }),
  );
  await page.getByTestId(TID.settingsRowConnectionsGmail).waitFor();
}
