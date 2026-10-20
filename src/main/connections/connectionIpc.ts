// Spec: 08-1 §3.2 rows `connection:list`, `connection:connect` (returns at once; outlook only while flags.outlook, X-41),
// `connection:disconnect` (Google: revoke + three rows + contacts_index), §3.3 `connection:upsert`, §2.4 `connection.cmd`,
// app:openExternal `google_signin` rule (a URL main built, host accounts.google.com); 08-3 §16.1, §16.1.1 (client file),
// §16.1.2 (Turn off / on writes activity), C-10 (revoke now, or when back online). Main owns the sign-in and the rows.
// M8 T6: the Google refresh token lives in M5's vault (`foo/conn_token/google`, 08-2 §11.2; connTokenVault.ts).
import { shell } from 'electron';
import { ok } from '../../shared/errors';
import type { Settings } from '../../shared/settings';
import { googleEndpoints, AUTH_URL } from '../../engine/tools/connectors/google';
import type { HttpFetch } from '../../engine/tools/connectors/types';
import { resourcesDir } from '../engine-supervisor/EngineSupervisor';
import { deps } from '../deps';
import { emit, handle, type AppContext } from '../ipc/IpcRouter';
import { VaultConnTokenStore } from '../vault/connTokenVault';
import { vaultRuntime } from '../vault/vaultRuntime';
import { openLoopback } from '../windows/oauthLoopback';
import { GoogleConnections } from './GoogleConnections';
import { googleClientPath, loadGoogleClient } from './googleClient';

const httpFetch: HttpFetch = async (url, init) => {
  const res = await fetch(url, { method: init?.method ?? 'GET', headers: init?.headers, body: init?.body });
  return { status: res.status, json: () => res.json(), text: () => res.text() };
};

let service: GoogleConnections | null = null;

/** The one Google connections service of this run (T4's connectors take `google().access()`). */
export const google = (): GoogleConnections | null => service;

export function registerConnectionIpc(ctx: AppContext): void {
  const env = process.env;
  const client = loadGoogleClient(googleClientPath(resourcesDir(), env));
  const svc = new GoogleConnections({
    db: ctx.db,
    now: () => deps.clock.now(),
    http: httpFetch,
    endpoints: googleEndpoints(env),
    tokens: new VaultConnTokenStore(
      () => vaultRuntime()?.vault ?? null,
      (v) => void vaultRuntime()?.register(v, { kind: 'conn_token' }),
    ),
    client: () => client,
    online: () => !ctx.net.offline,
    openLoopback: (state) => openLoopback({ state, log: (evt) => console.warn(evt) }),
    openExternal: async (url) => {
      // app:openExternal `google_signin`: only the URL main just built for accounts.google.com.
      if (!url.startsWith(`${AUTH_URL}?`)) return;
      await shell.openExternal(url);
    },
    emit: (row) => emit('connection:upsert', row),
    engineCmd: (cmd) => void ctx.engine?.send('connection.cmd', cmd),
    // M8 T5
    engineState: (state) => void ctx.engine?.send('connection.state', state),
    dataDir: ctx.dataDir,
    log: (evt, kind) => console.warn(evt, kind ?? ''),
  });
  svc.startup();
  service = svc;

  let prev: Settings = ctx.settings.get();
  ctx.settings.onChange((next) => {
    svc.settingsChanged(prev, next);
    prev = next;
  });
  ctx.net.onChange((online) => {
    if (online) void svc.onOnline();
  });

  handle('connection:list', () => ok(svc.list()));
  handle('connection:connect', ({ scopes }) => svc.connect(scopes));
  handle('connection:disconnect', ({ connectionId }) => svc.disconnect(connectionId));
  handle('connection:googleInfo', () => ok({ available: svc.available(), routines: svc.routinesUsingGoogle() }));
}
