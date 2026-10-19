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

  it('a password or unknown key gets its box too, titled from the pattern, with no vault name to save under', async () => {
    const t2 = vaultHarness();
    const pw = val(await t2.h['secret:offer']({ chatId: 'c_1', slot: 'password' }));
    expect(pw.payload).toMatchObject({ name: 'Password' });
    expect((pw.payload as unknown as SecretPayload).vaultName).toBeUndefined();
    expect(val(await t2.h['secret:offer']({ chatId: 'c_1', slot: 'key' })).payload).toMatchObject({ name: 'Key' });
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
