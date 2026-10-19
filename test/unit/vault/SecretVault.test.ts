// M5 T2 · SecretVault (08-2 §11.2, §11.3, §11.7; 09 §9.18; 08-0 §E.8; G-M5-16) against the in-memory keyring.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREDMAN_MAX_BYTES } from '../../../src/main/vault/keyring';
import { FAKE_KEY, vaultHarness } from './harness';

describe('SecretVault.save', () => {
  it('writes foo/ai_key/openai-key to Credential Manager and only names to secrets_index', () => {
    const { vault, keyring, db } = vaultHarness();
    const r = vault.save('ai_key', 'openai-key', { value: FAKE_KEY });
    expect(r.ok && r.value.target).toBe('foo/ai_key/openai-key');
    expect(r.ok && r.value.label).toBe('OpenAI key');
    expect(keyring.entries.get('foo/ai_key/openai-key')).toBe(FAKE_KEY);
    const rows = db.prepare('SELECT * FROM secrets_index').all();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(FAKE_KEY);
    expect(rows[0]).toMatchObject({ kind: 'ai_key', name: 'openai-key', storage: 'credman', label: 'OpenAI key' });
  });

  it('stores logins and cards in the 08-2 §11.2 JSON shapes; the CVV is never saved', () => {
    const { vault, keyring } = vaultHarness();
    expect(vault.save('login', 'irctc.co.in', { username: 'asha.example', password: 'pw-fake-123' }).ok).toBe(true);
    expect(JSON.parse(keyring.entries.get('foo/login/irctc.co.in')!)).toEqual({ u: 'asha.example', p: 'pw-fake-123' });
    const c = vault.save('card', '4242', { number: '4242 4242 4242 4242', expiry: '08/29', cvv: '123', name: 'A Example' });
    expect(c.ok && c.value.label).toBe('Visa ••4242');
    const stored = keyring.entries.get('foo/card/4242')!;
    expect(JSON.parse(stored)).toEqual({ number: '4242424242424242', expMonth: 8, expYear: 2029, name: 'A Example' });
    expect(stored).not.toContain('123"');
  });

  it('G-M5-16: refuses a name outside its kind with VALIDATION and writes nothing', () => {
    const { vault, keyring } = vaultHarness();
    for (const [kind, name] of [
      ['ai_key', 'OpenAI key'],
      ['web_key', 'bing'],
      ['conn_token', 'gmail'],
      ['hub_key', 'zapier'],
      ['login', 'IRCTC.co.in'],
      ['wa_session', 'wa'],
    ] as const) {
      const r = vault.save(kind, name, { value: 'x', username: 'u', password: 'p', refresh_token: 't', key: 'k' });
      expect(r.ok ? 'ok' : r.error.kind).toBe('VALIDATION');
    }
    // A card is named by its own last 4.
    expect(vault.save('card', '1111', { number: '4242424242424242', expiry: '08/29', name: 'A' }).ok).toBe(false);
    expect(keyring.entries.size).toBe(0);
  });

  it('X-129: a second card with the same last 4 is SECRET_EXISTS; other kinds replace', () => {
    const { vault, keyring } = vaultHarness();
    const card = { number: '4242424242424242', expiry: '08/29', name: 'A' };
    expect(vault.save('card', '4242', card).ok).toBe(true);
    const again = vault.save('card', '4242', { ...card, expiry: '09/30' });
    expect(again.ok ? 'ok' : again.error.kind).toBe('SECRET_EXISTS');
    expect(JSON.parse(keyring.entries.get('foo/card/4242')!).expMonth).toBe(8);
    vault.save('ai_key', 'openai-key', { value: 'sk-old-fake-value-000000000000' });
    const r = vault.save('ai_key', 'openai-key', { value: FAKE_KEY });
    expect(r.ok && r.value.replaced).toBe(true);
    expect(keyring.entries.get('foo/ai_key/openai-key')).toBe(FAKE_KEY);
  });

  it('09 §9.18: a value over 2,560 bytes goes to a safeStorage blob, never in plain text', () => {
    const { vault, keyring, blobDir } = vaultHarness();
    const big = 'x'.repeat(CREDMAN_MAX_BYTES); // 5,120 bytes as UTF-16
    const r = vault.save('conn_token', 'google', { refresh_token: big, scope: 'mail' });
    expect(r.ok && r.value.row.storage).toBe('blob');
    expect(keyring.entries.size).toBe(0);
    const file = join(blobDir, 'google.bin');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file).toString('utf8')).not.toContain('xxxx');
    expect(vault.save('wa_session', 'whatsapp', { value: '{"creds":1}' }).ok).toBe(true);
    expect(readdirSync(blobDir).sort()).toEqual(['google.bin', 'wa-session.bin']);
  });

  it('09 §9.18: refuses to save when encryption is unavailable or Credential Manager cannot load (no plaintext fallback)', () => {
    const h = vaultHarness();
    h.safe.available = false;
    const r = h.vault.save('ai_key', 'openai-key', { value: FAKE_KEY });
    expect(r.ok ? 'ok' : r.error).toEqual({ kind: 'VAULT_WRITE_FAILED', message: 'encryption_unavailable' });
    expect(h.keyring.entries.size).toBe(0);
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM secrets_index').get()).toEqual({ n: 0 });
    const noCredman = vaultHarness({ noKeyring: true });
    const r2 = noCredman.vault.save('ai_key', 'openai-key', { value: FAKE_KEY });
    expect(r2.ok ? 'ok' : r2.error).toEqual({ kind: 'VAULT_WRITE_FAILED', message: 'keyring_unavailable' });
    expect(noCredman.vault.off()).toBe('keyring_unavailable');
  });

  it('a failed keyring write is VAULT_WRITE_FAILED and leaves no index row', () => {
    const h = vaultHarness();
    h.keyring.failNext = true;
    const r = h.vault.save('ai_key', 'openai-key', { value: FAKE_KEY });
    expect(r.ok ? 'ok' : r.error.kind).toBe('VAULT_WRITE_FAILED');
    expect(h.vault.list()).toEqual([]);
  });
});

describe('SecretVault.delete / wipeAll', () => {
  it('removes the value and the index row', () => {
    const { vault, keyring } = vaultHarness();
    vault.save('ai_key', 'openai-key', { value: FAKE_KEY });
    const r = vault.delete('foo/ai_key/openai-key');
    expect(r.ok && r.value.removed?.label).toBe('OpenAI key');
    expect(keyring.entries.size).toBe(0);
    expect(vault.list()).toEqual([]);
  });

  it('wipeAll empties both stores', () => {
    const { vault, keyring, blobDir } = vaultHarness();
    vault.save('ai_key', 'openai-key', { value: FAKE_KEY });
    vault.save('wa_session', 'whatsapp', { value: 'session' });
    expect(vault.wipeAll()).toEqual({ failed: [] });
    expect(keyring.entries.size).toBe(0);
    expect(readdirSync(blobDir)).toEqual([]);
  });
});

describe('SecretVault.use (08-2 §11.3)', () => {
  it('returns the value only after registering it (mirrored to the engine)', () => {
    const { vault, sent, registry } = vaultHarness();
    vault.save('ai_key', 'openai-key', { value: FAKE_KEY });
    const r = vault.use({ purpose: 'ai_call', name: 'openai-key' });
    expect(r.ok && r.value).toBe(FAKE_KEY);
    expect(registry.forms().some((f) => f.form === FAKE_KEY)).toBe(true);
    expect(sent.map((s) => s.kind)).toEqual(['registry:add']);
    expect(sent[0]!.payload).toMatchObject({ value: FAKE_KEY, len: FAKE_KEY.length, ttlMs: 0 });
  });

  it('VAULT_MISSING when nothing is saved; VAULT_PURPOSE_DENIED for a purpose that cannot read that kind', () => {
    const { vault } = vaultHarness();
    const miss = vault.use({ purpose: 'web_tool', name: 'exa' });
    expect(miss.ok ? 'ok' : miss.error.kind).toBe('VAULT_MISSING');
    vault.save('ai_key', 'openai-key', { value: FAKE_KEY });
    for (const req of [
      { purpose: 'web_tool', name: 'openai-key' },
      { purpose: 'voice_call', name: 'anthropic-key' },
      { purpose: 'fill_login', name: 'openai-key' },
    ] as const) {
      const r = vault.use(req);
      expect(r.ok ? 'ok' : r.error.kind).toBe('VAULT_PURPOSE_DENIED');
    }
    expect(vault.use({ purpose: 'voice_call', name: 'openai-key' }).ok).toBe(true);
  });

  it('fill_card needs an APPROVED or RUNNING pay approval of the job', () => {
    let state = 'PENDING';
    const { vault } = vaultHarness({ findOpenApproval: (jobId) => (jobId === 'j_1' ? { id: 'ap_1', state } : null) });
    vault.save('card', '4242', { number: '4242424242424242', expiry: '08/29', name: 'A' });
    const deny = (req: Parameters<typeof vault.use>[0]) => {
      const r = vault.use(req);
      return r.ok ? 'ok' : r.error.kind;
    };
    expect(deny({ purpose: 'fill_card', name: '4242' })).toBe('VAULT_PURPOSE_DENIED');
    expect(deny({ purpose: 'fill_card', name: '4242', jobId: 'j_1' })).toBe('VAULT_PURPOSE_DENIED');
    state = 'APPROVED';
    expect(deny({ purpose: 'fill_card', name: '4242', jobId: 'j_1', approvalId: 'ap_other' })).toBe('VAULT_PURPOSE_DENIED');
    expect(deny({ purpose: 'fill_card', name: '4242', jobId: 'j_1' })).toBe('ok');
    state = 'RUNNING';
    expect(deny({ purpose: 'fill_card', name: '4242', jobId: 'j_1', approvalId: 'ap_1' })).toBe('ok');
  });

  it('fill_login needs a working job on the login domain (jobs.site_domain)', () => {
    const { vault, db } = vaultHarness();
    vault.save('login', 'irctc.co.in', { username: 'u', password: 'p' });
    db.prepare(
      "INSERT INTO jobs (id, chat_id, origin_chat_id, owner_kind, title, origin, intent, state, site_domain, created_at) VALUES ('j_1','c_1','c_1','foo','Train','user','do','working',?,1)",
    ).run('example.com');
    const use = () => vault.use({ purpose: 'fill_login', name: 'irctc.co.in', jobId: 'j_1' });
    expect(use().ok).toBe(false);
    db.prepare("UPDATE jobs SET site_domain = 'irctc.co.in' WHERE id = 'j_1'").run();
    expect(use().ok).toBe(true);
    db.prepare("UPDATE jobs SET state = 'needs_you' WHERE id = 'j_1'").run();
    expect(use().ok).toBe(false);
  });
});
