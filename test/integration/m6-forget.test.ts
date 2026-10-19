// AT-073 (engine part; 10-acceptance-1 §B, 08-3 §12.6, 06-3 §14 C-3): "Forget everything from Gmail" deletes every
// `origin_kind='gmail'` fact from disk and index, the Gmail connection stays; forgetAll keeps identity.md and empties helpers'
// notes. The C-3 dialog half is T6's e2e.
import { describe, expect, it } from 'vitest';
import { DAY, fid, storeHarness } from './m6-store-harness';

function world() {
  const h = storeHarness();
  h.put(
    'memory/about-you.md',
    [
      '# About you',
      `- Lives in Pune  {I guessed · 2026-10-01 · Gmail · from 3 emails · ${fid(1)}}`,
      `- Vegetarian on Tuesdays  {you said · 2026-10-02 · chat · ${fid(2)}}`,
      `- Flies IndiGo  {I guessed · 2026-10-03 · Gmail · from 2 bookings · ${fid(3)}}`,
      '',
    ].join('\n'),
  );
  h.put('memory/people/meera.md', `- Meera’s birthday is 2 Feb  {I guessed · 2026-10-04 · Gmail · from 2 emails · ${fid(4)}}\n`);
  h.put('memory/identity.md', `- foo’s name is foo  {you said · 2026-10-01 · setup · ${fid(5)}}\n`);
  h.put('helpers/h_trips/notes.md', `- Goa trip Sat 12 to Mon 14 Dec  {you said · 2026-10-05 · a task · ${fid(6)}}\n`);
  h.db
    .prepare(
      `INSERT INTO connections (id, app, account_label, account_hash, granted, status, vault_name, connected_at)
       VALUES ('cn_1', 'gmail', 'v***@example.com', 'hash', '{}', 'connected', 'foo/conn_token/google', ?)`,
    )
    .run(h.clock.now() - DAY);
  return h;
}

async function indexAll(h: ReturnType<typeof storeHarness>) {
  for (const f of ['memory/about-you.md', 'memory/people/meera.md', 'memory/identity.md', 'helpers/h_trips/notes.md'])
    await h.svc.fileChanged(f);
}

describe('AT-073 forget by source (engine)', () => {
  it('AT-073: forgetting Gmail removes every gmail fact from the files and the index; the Gmail connection stays connected', async () => {
    const h = world();
    await indexAll(h);
    const r = await h.svc.cmd({ cmd: 'forgetBySource', source: 'gmail', confirm: true });
    expect(r).toEqual({ ok: true, value: { count: 3 } });
    expect(h.read('memory/about-you.md')).toBe(`# About you\n- Vegetarian on Tuesdays  {you said · 2026-10-02 · chat · ${fid(2)}}\n`);
    expect(h.read('memory/people/meera.md')).toBe('');
    expect(h.rows().map((x) => x.id)).toEqual([fid(6), fid(2), fid(5)]);
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM memory_index WHERE origin_kind = ?').get('gmail')).toEqual({ n: 0 });
    expect(h.db.prepare('SELECT status FROM connections WHERE id = ?').get('cn_1')).toEqual({ status: 'connected' });
    expect(h.tombstones().map((t) => t.origin_kind)).toEqual(['gmail', 'gmail', 'gmail']);
    expect(h.db.prepare("SELECT kind, actor, summary FROM activity WHERE event = 'forgot_facts'").all()).toEqual([
      { kind: 'changed', actor: 'user', summary: 'Forgot 3 things from Gmail' },
    ]);
  });

  it('AT-073: forget everything keeps identity.md, empties the other files and helpers’ notes, and counts what it forgot', async () => {
    const h = world();
    await indexAll(h);
    const r = await h.svc.cmd({ cmd: 'forgetAll', typed: 'FORGET' });
    expect(r).toEqual({ ok: true, value: { count: 5 } });
    expect(h.read('memory/about-you.md')).toBe('');
    expect(h.read('helpers/h_trips/notes.md')).toBe('');
    expect(h.read('memory/identity.md')).toContain(fid(5));
    expect(h.rows().map((x) => x.id)).toEqual([fid(5)]);
    expect(h.db.prepare("SELECT summary FROM activity WHERE event = 'forgot_facts'").all()).toEqual([{ summary: 'Forgot 5 things.' }]);
  });

  it('AT-073: nothing from that source answers count 0 and writes nothing', async () => {
    const h = world();
    await indexAll(h);
    const writes = h.writes.length;
    expect(await h.svc.cmd({ cmd: 'forgetBySource', source: 'whatsapp', confirm: true })).toEqual({ ok: true, value: { count: 0 } });
    expect(h.writes.length).toBe(writes);
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM activity WHERE event = 'forgot_facts'").get()).toEqual({ n: 0 });
  });
});
