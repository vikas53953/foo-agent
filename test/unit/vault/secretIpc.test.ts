// M5 T2 · the secret channels (08-1 §3.2 secret:save | list | delete, code:submit; G-M5-21 secret:offer), 05-2 §5.8.3
// card states, §5.8.6 activity rows, 06-3 §14 C-22 Remove, X-114 (a code lives 10 minutes in the registry).
import { describe, expect, it } from 'vitest';
import { applyDbOps } from '../../../src/main/engine-supervisor/engineHost';
import { OTP_TTL_MS } from '../../../src/main/vault/secretIpc';
import type { SecretPayload } from '../../../src/shared/types';
import { FAKE_KEY, NOW, vaultHarness } from './harness';

const val = <T>(r: { ok: true; value: T } | { ok: false; error: { kind: string } }): T => {
  if (!r.ok) throw new Error(r.error.kind);
  return r.value;
};
const err = (r: { ok: boolean; error?: { kind: string } }) => (r.ok ? 'ok' : r.error!.kind);

describe('secret:offer (Move to secret box, 04-2 §22.4)', () => {
  it('posts an asking Secret box card in the chat, named from the pattern, with no value', async () => {
    const t2 = vaultHarness();
    const card = val(await t2.h['secret:offer']({ chatId: 'c_1', slot: 'openai' }));
    expect(card).toMatchObject({ type: 'secret', state: 'asking', chatId: 'c_1' });
    expect(card.payload).toMatchObject({ secretKind: 'ai_key', name: 'OpenAI key' });
    const msg = t2.db.prepare('SELECT author_kind, kind, card_id FROM messages WHERE card_id = ?').get(card.id);
    expect(msg).toEqual({ author_kind: 'foo', kind: 'card', card_id: card.id });
    const cardBox = val(await t2.h['secret:offer']({ chatId: 'c_1', slot: 'card' }));
    expect((cardBox.payload as unknown as SecretPayload).fields.map((f) => f.key)).toEqual(['number', 'expiry', 'cvv', 'name']);
  });

  it('a code goes into the code box foo already asked with', async () => {
    const t2 = vaultHarness();
    const asked = val(await t2.h['secret:offer']({ chatId: 'c_1', slot: 'otp' }));
    expect(val(await t2.h['secret:offer']({ chatId: 'c_1', slot: 'otp' })).id).toBe(asked.id);
  });

  it('CR-0057: a password or unknown key gets a "Your key" box with a Name field above the masked value', async () => {
    const t2 = vaultHarness();
    const pw = val(await t2.h['secret:offer']({ chatId: 'c_1', slot: 'password' }));
    expect(pw.payload).toMatchObject({ secretKind: 'user_key', name: 'Password' });
    expect((pw.payload as unknown as SecretPayload).vaultName).toBeUndefined();
    const key = val(await t2.h['secret:offer']({ chatId: 'c_1', slot: 'key' })).payload as unknown as SecretPayload;
    expect(key).toMatchObject({ secretKind: 'user_key', name: 'Key' });
    expect(key.fields.map((f) => [f.key, f.masked])).toEqual([
      ['name', false],
      ['value', true],
    ]);
  });

  it('05-2 §5.8.6 Groups: never; and the box says up front when the vault cannot save (§5.8.3 Disabled)', async () => {
    const t2 = vaultHarness({ noKeyring: true });
    t2.db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_g', 'group', 'Trip', ?, ?)").run(NOW, NOW);
    expect(err(await t2.h['secret:offer']({ chatId: 'c_g', slot: 'openai' }))).toBe('VALIDATION');
    expect(t2.db.prepare("SELECT COUNT(*) AS n FROM cards WHERE chat_id = 'c_g'").get()).toEqual({ n: 0 });
    const box = val(await t2.h['secret:offer']({ chatId: 'c_1', slot: 'openai' }));
    expect(box.payload).toMatchObject({ vaultOff: 'keyring_unavailable' });
  });
});

describe('secret:save', () => {
  it('05-2 §5.8.6 a login saved from the after-sign-in box logs saved_login (kind connected), the site only (CR-0030 pick 4)', async () => {
    const t2 = vaultHarness();
    const payload = { secretKind: 'login', name: 'example.com login', why: '', fields: [], vaultName: 'example.com', afterSignIn: true };
    const r = applyDbOps(
      t2.db,
      [
        {
          op: 'insert',
          table: 'messages',
          row: { id: 'm_login', chat_id: 'c_1', author_kind: 'foo', kind: 'card', card_id: 'k_login', status: 'complete', created_at: NOW },
        },
        {
          op: 'insert',
          table: 'cards',
          row: {
            id: 'k_login',
            chat_id: 'c_1',
            message_id: 'm_login',
            type: 'secret',
            state: 'asking',
            payload,
            nonce: 'n',
            created_at: NOW,
          },
        },
      ],
      { now: NOW },
    );
    expect(r.result.ok).toBe(true);
    const fields = { username: 'sandbox-user', password: 'sandbox-pass-0000' };
    val(await t2.h['secret:save']({ requestId: 'k_login', kind: 'login', name: 'example.com', fields }));
    expect(t2.db.prepare('SELECT kind, event, actor, summary FROM activity').all()).toEqual([
      { kind: 'connected', event: 'saved_login', actor: 'user', summary: 'Saved your login for example.com' },
    ]);
    expect(JSON.stringify(t2.db.prepare('SELECT * FROM activity').all())).not.toContain('sandbox-pass');
  });

  it('saves, moves the card to saved with the date and target, and logs secret_saved with the name only', async () => {
    const t2 = vaultHarness();
    const card = val(await t2.h['secret:offer']({ chatId: 'c_1', slot: 'openai' }));
    const r = val(await t2.h['secret:save']({ requestId: card.id, kind: 'ai_key', name: 'openai-key', fields: { value: FAKE_KEY } }));
    expect(r).toEqual({ target: 'foo/ai_key/openai-key', savedAt: NOW, label: 'OpenAI key' });
    const after = t2.cards.at(-1)!;
    expect(after.state).toBe('saved');
    expect(after.payload).toMatchObject({ savedAt: NOW, target: 'foo/ai_key/openai-key' });
    const act = t2.db.prepare('SELECT kind, event, actor, summary FROM activity').all();
    expect(act).toEqual([{ kind: 'changed', event: 'secret_saved', actor: 'user', summary: 'Saved your OpenAI key' }]);
    // Replace from the saved row: same card, new date, `secret_replaced`.
    t2.clock.advance(60_000);
    val(
      await t2.h['secret:save']({
        requestId: card.id,
        kind: 'ai_key',
        name: 'openai-key',
        fields: { value: 'sk-fake-replacement-0000000000' },
      }),
    );
    expect(t2.cards.at(-1)).toMatchObject({ id: card.id, state: 'saved', payload: { savedAt: NOW + 60_000 } });
    expect(t2.db.prepare("SELECT summary FROM activity WHERE event = 'secret_replaced'").get()).toEqual({
      summary: 'Replaced your OpenAI key',
    });
  });

  it('SECRET_EXISTS turns the card rejected and saves nothing (X-129)', async () => {
    const t2 = vaultHarness();
    const card = { number: '4242424242424242', expiry: '08/29', name: 'A' };
    val(await t2.h['secret:save']({ kind: 'card', name: '4242', fields: card }));
    const box = val(await t2.h['secret:offer']({ chatId: 'c_1', slot: 'card' }));
    expect(err(await t2.h['secret:save']({ requestId: box.id, kind: 'card', name: '4242', fields: card }))).toBe('SECRET_EXISTS');
    expect(t2.cards.at(-1)).toMatchObject({ id: box.id, state: 'rejected' });
  });

  it('secret:list returns names and hints, never a value or a target', async () => {
    const t2 = vaultHarness();
    val(await t2.h['secret:save']({ kind: 'ai_key', name: 'openai-key', fields: { value: FAKE_KEY } }));
    const rows = val(await t2.h['secret:list']({}));
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('target');
    expect(JSON.stringify(rows)).not.toContain(FAKE_KEY);
  });
});

describe('CR-0057 · a key the user names (foo/user_key/{name})', () => {
  it('AT-447 saves under the name the user typed, logs the name only, and keeps the value out of foo.db', async () => {
    const t2 = vaultHarness();
    const box = val(await t2.h['secret:offer']({ chatId: 'c_1', slot: 'key' }));
    const r = val(await t2.h['secret:save']({ requestId: box.id, kind: 'user_key', name: ' GitHub  key ', fields: { value: FAKE_KEY } }));
    expect(r).toEqual({ target: 'foo/user_key/github-key', savedAt: NOW, label: 'GitHub key' });
    expect(t2.keyring.entries.get('foo/user_key/github-key')).toBe(FAKE_KEY);
    expect(t2.cards.at(-1)).toMatchObject({
      id: box.id,
      state: 'saved',
      payload: { target: 'foo/user_key/github-key', label: 'GitHub key' },
    });
    expect(t2.db.prepare('SELECT kind, name, label FROM secrets_index').all()).toEqual([
      { kind: 'user_key', name: 'github-key', label: 'GitHub key' },
    ]);
    expect(t2.db.prepare('SELECT summary FROM activity').all()).toEqual([{ summary: 'Saved your GitHub key' }]);
    const dump = JSON.stringify([t2.db.prepare('SELECT * FROM cards').all(), t2.db.prepare('SELECT * FROM activity').all()]);
    expect(dump).not.toContain(FAKE_KEY);
    // The same name again replaces the value (X-129: only cards refuse).
    val(await t2.h['secret:save']({ kind: 'user_key', name: 'github key', fields: { value: 'sk-fake-second-000000000000' } }));
    expect(t2.keyring.entries.get('foo/user_key/github-key')).toBe('sk-fake-second-000000000000');
    expect(t2.db.prepare("SELECT summary FROM activity WHERE event = 'secret_replaced'").get()).toEqual({
      summary: 'Replaced your github key',
    });
  });

  it('a name that is empty, longer than 40 characters or only symbols is refused, and nothing is written', async () => {
    const t2 = vaultHarness();
    for (const name of ['', '   ', 'x'.repeat(41), '///', '..'])
      expect(err(await t2.h['secret:save']({ kind: 'user_key', name, fields: { value: FAKE_KEY } }))).toBe('VALIDATION');
    expect(t2.keyring.entries.size).toBe(0);
  });

  it('any name the box accepts has a vault name: Hindi, a leading symbol, a reserved Windows word', async () => {
    const t2 = vaultHarness();
    const saved = async (name: string) => val(await t2.h['secret:save']({ kind: 'user_key', name, fields: { value: FAKE_KEY } }));
    expect(await saved('मेरा पासवर्ड')).toMatchObject({ target: 'foo/user_key/मेरा-पासवर्ड', label: 'मेरा पासवर्ड' });
    expect(await saved('@work key')).toMatchObject({ target: 'foo/user_key/work-key', label: '@work key' });
    expect(await saved('CON')).toMatchObject({ target: 'foo/user_key/con', label: 'CON' });
    expect(await saved('Österreich key')).toMatchObject({ target: 'foo/user_key/österreich-key' });
  });

  it('the AI cannot read a user key: no purpose maps to user_key', async () => {
    const t2 = vaultHarness();
    val(await t2.h['secret:save']({ kind: 'user_key', name: 'GitHub key', fields: { value: FAKE_KEY } }));
    for (const purpose of ['fill_login', 'fill_card', 'ai_call', 'voice_call', 'connector_refresh', 'wa_session', 'web_tool', 'hub_call'])
      expect(t2.vault.use({ purpose, name: 'github-key' } as never).ok).toBe(false);
  });
});

describe('secret:delete (C-22)', () => {
  it('removes the entry, collapses the saved card to Removed and logs secret_removed', async () => {
    const t2 = vaultHarness();
    const card = val(await t2.h['secret:offer']({ chatId: 'c_1', slot: 'openai' }));
    val(await t2.h['secret:save']({ requestId: card.id, kind: 'ai_key', name: 'openai-key', fields: { value: FAKE_KEY } }));
    val(await t2.h['secret:delete']({ target: 'foo/ai_key/openai-key', confirm: true }));
    expect(t2.keyring.entries.size).toBe(0);
    expect(t2.cards.at(-1)).toMatchObject({ id: card.id, state: 'withdrawn', payload: { removedAt: NOW } });
    expect(t2.db.prepare("SELECT summary FROM activity WHERE event = 'secret_removed'").get()).toEqual({
      summary: 'Removed your OpenAI key',
    });
  });
});

describe('code:submit (X-114)', () => {
  const askCode = (t2: ReturnType<typeof vaultHarness>) => {
    const r = applyDbOps(
      t2.db,
      [
        {
          op: 'insert',
          table: 'messages',
          row: { id: 'm_k1', chat_id: 'c_1', author_kind: 'foo', kind: 'card', card_id: 'k_1', status: 'complete', created_at: NOW },
        },
        {
          op: 'insert',
          table: 'cards',
          row: {
            id: 'k_1',
            chat_id: 'c_1',
            message_id: 'm_k1',
            type: 'secret',
            state: 'asking',
            payload: { secretKind: 'otp', name: 'One-time code', why: '', fields: [], requestId: 'rq_1' },
            nonce: 'n',
            created_at: NOW,
          },
        },
      ],
      { now: NOW },
    );
    if (!r.result.ok) throw new Error(r.result.error.kind);
  };

  it('registers the code for 10 minutes, sends the engine a handle (never the code) and closes the box', async () => {
    const t2 = vaultHarness();
    askCode(t2);
    val(await t2.h['code:submit']({ requestId: 'rq_1', code: '482 913' }));
    const add = t2.sent.find((s) => s.kind === 'registry:add')!;
    expect(add.payload).toMatchObject({ value: '482913', ttlMs: OTP_TTL_MS });
    const submit = t2.sent.find((s) => s.kind === 'code.submit')!;
    expect(submit.payload).toEqual({ requestId: 'rq_1', codeRef: add.payload.handle });
    expect(JSON.stringify(t2.db.prepare('SELECT * FROM cards').all())).not.toContain('482913');
    expect(t2.cards.at(-1)).toMatchObject({ id: 'k_1', state: 'saved' });
    t2.clock.advance(OTP_TTL_MS);
    expect(t2.mirror.handles()).toEqual([]);
  });

  it('a code box the Move posts carries its own requestId, so its code reaches the engine', async () => {
    const t2 = vaultHarness();
    const box = val(await t2.h['secret:offer']({ chatId: 'c_1', slot: 'otp' }));
    expect(box.payload).toMatchObject({ secretKind: 'otp', requestId: box.id });
    val(await t2.h['code:submit']({ requestId: box.id, code: '482913' }));
    expect(t2.sent.find((s) => s.kind === 'code.submit')!.payload).toMatchObject({ requestId: box.id });
    expect(t2.cards.at(-1)).toMatchObject({ id: box.id, state: 'saved' });
  });

  it('a code box whose payload is not a Secret box payload is refused, never misread', async () => {
    const t2 = vaultHarness();
    askCode(t2);
    t2.db.prepare("UPDATE cards SET payload = json_remove(payload, '$.fields') WHERE id = 'k_1'").run();
    expect(err(await t2.h['code:submit']({ requestId: 'rq_1', code: '123456' }))).toBe('REQUEST_GONE');
    expect(t2.sent.some((s) => s.kind === 'code.submit')).toBe(false);
  });

  it('REQUEST_GONE when no box asked, or the engine is gone', async () => {
    const t2 = vaultHarness();
    expect(err(await t2.h['code:submit']({ requestId: 'rq_1', code: '123456' }))).toBe('REQUEST_GONE');
    askCode(t2);
    t2.setLive(false);
    expect(err(await t2.h['code:submit']({ requestId: 'rq_1', code: '123456' }))).toBe('REQUEST_GONE');
  });
});

describe('registry mirror', () => {
  it('replays live values to a restarted engine and forwards removes', () => {
    const t2 = vaultHarness();
    const a = t2.mirror.register('value-one-fake', { kind: 'pasted' });
    t2.mirror.register('value-two-fake', { kind: 'otp', ttlMs: 1_000 });
    t2.clock.advance(2_000);
    t2.sent.length = 0;
    t2.mirror.replay();
    expect(t2.sent.map((s) => s.payload.handle)).toEqual([a]);
    t2.mirror.remove([a]);
    expect(t2.sent.at(-1)).toEqual({ kind: 'registry:remove', payload: { handles: [a] } });
    expect(t2.registry.forms()).toEqual([]);
  });
});
