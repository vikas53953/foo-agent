// Spec: 08-0 §A `connections.web` (`refused.{p}` true on CLOUD_AUTH from the key check or a later call, cleared on the next
// HTTP 200 and on Remove key; a saved key writes `search` / `read` / `cloudBrowser`, the last saved search key wins), 08-1 §3.2
// `secret:save` web_key row (save → `webkey.check` → `connections.web`), `secret:delete` resets the field (X-127), 08-1 §2.4.
// Keys here are fake (public repo).
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EngineBridge } from '../../../src/main/engine-supervisor/EngineBridge';
import { migrate, type Db } from '../../../src/main/store/db';
import { memoryKeyring, memorySafeStore } from '../../../src/main/vault/keyring';
import { secretHandlers } from '../../../src/main/vault/secretIpc';
import { SecretVault } from '../../../src/main/vault/SecretVault';
import { FakeClock } from '../../../src/shared/clock';
import { settingsSchema, type Settings } from '../../../src/shared/settings';
import { settingsDefaults } from '../../../src/shared/settingsDefaults';

const NOW = Date.UTC(2026, 9, 20, 3, 30);

function settingsStore() {
  let s: Settings = structuredClone(settingsDefaults);
  return {
    get: () => s,
    update: (fn: (x: Settings) => Settings) => void (s = settingsSchema.parse(fn(s))),
  };
}

function rig(check: Record<string, 'ok' | 'refused' | 'unknown'>, live = true) {
  const db: Db = new Database(':memory:');
  migrate(db, 'src/main/store/migrations');
  const clock = new FakeClock(NOW);
  const vault = new SecretVault({
    db,
    keyring: memoryKeyring(),
    safe: memorySafeStore(),
    blobDir: join(mkdtempSync(join(tmpdir(), 'foo-t4-')), 'vault'),
    clock,
    register: () => 'h',
    findOpenApproval: () => null,
  });
  const settings = settingsStore();
  const asked: unknown[] = [];
  let emitted = 0;
  const h = secretHandlers({
    db,
    vault,
    register: () => 'h',
    engine: {
      live,
      send: () => true,
      request: (async (kind: string, payload: { provider: string }) => {
        asked.push({ kind, payload });
        return { ok: true, value: { result: check[payload.provider] ?? 'unknown' } };
      }) as never,
    },
    now: () => clock.now(),
    emitCard: () => undefined,
    emitMessage: () => undefined,
    emitChat: () => undefined,
    settings,
    emitSettings: () => void emitted++,
  });
  const save = (name: string) => h['secret:save']({ kind: 'web_key', name, fields: { value: `fake-${name}-key` } });
  return { h, settings, asked, save, web: () => settings.get().connections.web, emitted: () => emitted };
}

describe('web key save, check and remove write connections.web (X-127)', () => {
  it('a refused key check sets refused; a re-saved key that checks ok clears it', async () => {
    const r = rig({ exa: 'refused' });
    expect((await r.save('exa')).ok).toBe(true);
    expect(r.asked).toEqual([{ kind: 'webkey.check', payload: { provider: 'exa' } }]);
    expect(r.web()).toMatchObject({ search: 'exa', refused: { exa: true } });
    expect(r.emitted()).toBe(1);
    const ok = rig({ exa: 'ok' });
    ok.settings.update((s) => ({ ...s, connections: { ...s.connections, web: { ...r.web() } } }));
    await ok.save('exa');
    expect(ok.web()).toMatchObject({ search: 'exa', refused: { exa: false } });
  });

  it('each provider writes its own field; the last saved search key is search; Remove resets that field only', async () => {
    const r = rig({ exa: 'ok', tavily: 'unknown', firecrawl: 'ok', browseruse: 'ok' });
    for (const p of ['exa', 'firecrawl', 'browseruse', 'tavily']) await r.save(p);
    expect(r.web()).toEqual({
      search: 'tavily',
      read: 'firecrawl',
      cloudBrowser: true,
      refused: { exa: false, tavily: false, firecrawl: false, browseruse: false },
    });
    // Removing the other search key keeps the one in use.
    await r.h['secret:delete']({ target: 'foo/web_key/exa', confirm: true });
    expect(r.web().search).toBe('tavily');
    await r.h['secret:delete']({ target: 'foo/web_key/tavily', confirm: true });
    await r.h['secret:delete']({ target: 'foo/web_key/firecrawl', confirm: true });
    await r.h['secret:delete']({ target: 'foo/web_key/browseruse', confirm: true });
    expect(r.web()).toEqual(settingsDefaults.connections.web);
  });

  it('with no engine running the key is saved and the row shows unknown (not refused)', async () => {
    const r = rig({ exa: 'refused' }, false);
    expect((await r.save('exa')).ok).toBe(true);
    expect(r.asked).toEqual([]);
    expect(r.web()).toMatchObject({ search: 'exa', refused: { exa: false } });
  });

  it('a refused key removed is no longer refused', async () => {
    const r = rig({ firecrawl: 'refused' });
    await r.save('firecrawl');
    expect(r.web().refused.firecrawl).toBe(true);
    await r.h['secret:delete']({ target: 'foo/web_key/firecrawl', confirm: true });
    expect(r.web()).toMatchObject({ read: 'this_pc', refused: { firecrawl: false } });
  });

  it("the engine's web.refused (CLOUD_AUTH on a call) sets refused.{p} once and tells the renderer", () => {
    const settings = settingsStore();
    const events: string[] = [];
    const bridge = new EngineBridge({
      db: new Database(':memory:'),
      settings,
      emit: (e) => void events.push(e),
      emitMessage: () => undefined,
      emitChat: () => undefined,
    });
    expect(bridge.receive({ id: 'e1', kind: 'web.refused', payload: { provider: 'tavily' } })).toBeNull();
    expect(settings.get().connections.web.refused).toEqual({ exa: false, tavily: true, firecrawl: false, browseruse: false });
    bridge.receive({ id: 'e2', kind: 'web.refused', payload: { provider: 'tavily' } });
    expect(events).toEqual(['settings:changed']);
  });
});
