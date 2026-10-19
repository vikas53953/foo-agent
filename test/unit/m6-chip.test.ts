// M6 T5 memory chip (05-3 §5.17.1, 08-3 §12.4.2, §12.5): what the chip says per kind and state (the six kinds, 48-character
// ellipsis, Undo for 24 h then "See in memory") and what its Undo and ✕ do (MemoryChips over the real store: the marker row,
// the file, the tombstone, activity `forgot_facts` count 1 for a chip forget, G-M6-10). Seams: `chipLine` (rendered words) and
// `MemoryChips` (db.tx + file.write through main's real handlers).
import { describe, expect, it } from 'vitest';
import { chipLine, chipFields, ellipsis, type ChipFields } from '../../src/renderer/messages/MemoryChip';
import { MemoryChips, UNDO_SAVE_MS, type ChipData } from '../../src/engine/memory/chips';
import { applyDbOps, runNamedQuery } from '../../src/main/engine-supervisor/engineHost';
import { ensureFooChat } from '../../src/main/store/queries';
import type { DbOp, NamedQuery } from '../../src/engine/protocol';
import type { MemoryChip, MemoryFactView } from '../../src/shared/types';
import { t } from '../../src/shared/copy/t';
import { TEST_EPOCH_MS } from '../../src/shared/clock';
import { storeHarness } from '../integration/m6-store-harness';

const NOW = TEST_EPOCH_MS;
const base: ChipFields = { kind: 'saved', messageId: 'm_1', factIds: ['f_1'], undoToken: 'chip_m_2', undoUntil: NOW + UNDO_SAVE_MS };

describe('M6 T5 chip words (05-3 §5.17.1)', () => {
  it('the six kinds', () => {
    expect(chipLine(base, 'Allergic to peanuts', NOW)).toMatchObject({
      text: 'I’ll remember: Allergic to peanuts',
      action: 'undo',
      icon: 'Brain',
    });
    expect(chipLine({ ...base, kind: 'guessed' }, 'you pick window seats', NOW).text).toBe(
      'I’ll remember: you pick window seats · I guessed',
    );
    expect(chipLine({ ...base, kind: 'updated', was: 'Mumbai' }, 'you live in Pune', NOW).text).toBe(
      'Updated: you live in Pune (was Mumbai)',
    );
    expect(chipLine({ kind: 'used', messageId: 'm_1', factIds: ['f_1'] }, 'hates early flights', NOW)).toMatchObject({
      text: 'Used: hates early flights',
      action: 'forget',
    });
    expect(chipLine({ kind: 'not_saving', messageId: 'm_1', factIds: [] }, '', NOW)).toMatchObject({
      text: 'Not saving this one.',
      action: null,
      icon: 'LockClosed',
    });
    // The sixth kind, ask-before-remembering, is a Choice card (test/integration/m6-review.test.ts).
    expect(t('cards.choice.question.memory_confirm', { fact: 'you’re allergic to peanuts' })).toBe(
      'Remember that you’re allergic to peanuts?',
    );
  });

  it('the fact is cut at 48 characters; the full text stays for the tooltip and Narrator', () => {
    const long = 'Prefers an aisle seat near the front on any flight over two hours long';
    expect(Array.from(ellipsis(long))).toHaveLength(48);
    expect(ellipsis(long).endsWith('…')).toBe(true);
    expect(chipLine(base, long, NOW).text).toBe(`I’ll remember: ${ellipsis(long)}`);
    expect(chipLine(base, long, NOW, Infinity).text).toBe(`I’ll remember: ${long}`);
  });

  it('Undo for 24 h after the save, then "See in memory"; undone and forgotten states', () => {
    expect(chipLine(base, 'Allergic to peanuts', NOW + UNDO_SAVE_MS - 1).action).toBe('undo');
    expect(chipLine(base, 'Allergic to peanuts', NOW + UNDO_SAVE_MS)).toMatchObject({
      text: 'I’ll remember: Allergic to peanuts',
      action: 'see',
    });
    expect(chipLine({ ...base, kind: 'guessed' }, 'x', NOW + UNDO_SAVE_MS).text).toBe('I’ll remember: x');
    expect(chipLine({ ...base, state: 'undone' }, 'x', NOW)).toMatchObject({
      text: 'Undone. I won’t remember that.',
      muted: true,
      action: null,
    });
    expect(chipLine({ kind: 'used', messageId: 'm', factIds: ['f'], state: 'forgotten' }, 'x', NOW)).toMatchObject({
      text: 'Forgot it. I won’t use that again.',
      action: null,
    });
    // An intake forget keeps its 5 s Undo (G-M6-04).
    const intake: ChipFields = {
      kind: 'used',
      messageId: 'm',
      factIds: ['f'],
      state: 'forgotten',
      undoToken: 'undo_1',
      undoUntil: NOW + 5_000,
    };
    expect(chipLine(intake, 'x', NOW + 4_999).action).toBe('undo');
    expect(chipLine(intake, 'x', NOW + 5_000).action).toBe(null);
  });

  it('reads its fields from the marker row (why.memoryChip)', () => {
    expect(chipFields({ why: { memoryChip: base } })).toEqual(base);
    expect(chipFields({ why: null })).toBe(null);
    expect(chipFields({ why: { source: 'routine_asked' } })).toBe(null);
  });
});

function rig() {
  const h = storeHarness();
  const chatId = ensureFooChat(h.db, h.clock.now(), 'foo', 'c_foo');
  h.db
    .prepare(
      "INSERT INTO messages (id, chat_id, seq, author_kind, kind, text, status, created_at) VALUES ('m_user', ?, 1, 'user', 'text', 'remember I’m allergic to peanuts', 'complete', ?)",
    )
    .run(chatId, h.clock.now());
  let n = 0;
  const chips: MemoryChip[] = [];
  const mc = new MemoryChips({
    now: () => h.clock.now(),
    newId: () => `m_chip${++n}`,
    tx: (ops: DbOp[]) => Promise.resolve(applyDbOps(h.db, ops, { now: h.clock.now(), dataDir: h.dataDir }).result as never),
    query: <T>(q: string, ...args: unknown[]) => {
      const r = runNamedQuery(h.db, q as NamedQuery, args, h.clock.now());
      return Promise.resolve((r.ok ? r.value : null) as T);
    },
    memory: h.svc,
    changed: (_ids, chip) => chips.push(chip),
  });
  const row = (id: string) => h.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown>;
  const data = (id: string) => (JSON.parse(String(row(id).why)) as { memoryChip: ChipData }).memoryChip;
  const activity = () => h.db.prepare("SELECT * FROM activity WHERE event = 'forgot_facts'").all() as Record<string, unknown>[];
  return { h, chatId, mc, chips, row, data, activity };
}

const value = <T>(r: { ok: boolean; value?: unknown }) => {
  expect(r.ok).toBe(true);
  return r.value as T;
};

describe('M6 T5 chip actions (05-3 §5.17.1, 08-3 §12.5, G-M6-10)', () => {
  it('a saved chip is a memory_chip marker under its bubble; Undo forgets the fact with a tombstone and no activity row', async () => {
    const r = rig();
    const f = value<MemoryFactView>(await r.h.svc.cmd({ cmd: 'add', text: 'Allergic to peanuts' }));
    const id = (await r.mc.saved(r.chatId, 'm_user', { id: f.id, text: f.text, provenance: 'said' }))!;
    expect(r.row(id)).toMatchObject({ kind: 'marker', marker_kind: 'memory_chip', author_kind: 'system', text: 'Allergic to peanuts' });
    expect(r.data(id)).toEqual({
      kind: 'saved',
      messageId: 'm_user',
      factIds: [f.id],
      undoToken: `chip_${id}`,
      undoUntil: r.h.clock.now() + UNDO_SAVE_MS,
    });
    expect(r.chips[0]).toMatchObject({ kind: 'saved', messageId: 'm_user', text: 'Allergic to peanuts', undoToken: `chip_${id}` });

    value(await r.mc.undo(`chip_${id}`));
    expect(r.h.rows()).toHaveLength(0);
    expect(r.h.read('memory/about-you.md')).not.toContain('Allergic to peanuts');
    expect(r.h.tombstones()).toHaveLength(1);
    expect(r.activity()).toHaveLength(0);
    expect(r.data(id)).toEqual({ kind: 'saved', messageId: 'm_user', factIds: [f.id], state: 'undone' });
    // Twice is too late.
    expect(await r.mc.undo(`chip_${id}`)).toMatchObject({ ok: false, error: { kind: 'TOO_LATE' } });
  });

  it('Undo is refused after 24 h (TOO_LATE) and the fact stays', async () => {
    const r = rig();
    const f = value<MemoryFactView>(await r.h.svc.cmd({ cmd: 'add', text: 'Hates early flights' }));
    const id = (await r.mc.saved(r.chatId, 'm_user', { id: f.id, text: f.text, provenance: 'said' }))!;
    r.h.clock.advance(UNDO_SAVE_MS + 1);
    expect(await r.mc.undo(`chip_${id}`)).toMatchObject({ ok: false, error: { kind: 'TOO_LATE' } });
    expect(r.h.rows()).toHaveLength(1);
  });

  it("an updated chip's Undo brings the old text back", async () => {
    const r = rig();
    const f = value<MemoryFactView>(await r.h.svc.cmd({ cmd: 'add', text: 'Lives in Mumbai' }));
    value(await r.h.svc.update(f.id, 'Lives in Pune'));
    const id = (await r.mc.updated(r.chatId, 'm_user', { id: f.id, text: 'Lives in Pune' }, 'Lives in Mumbai'))!;
    value(await r.mc.undo(`chip_${id}`));
    expect(r.h.rows()[0]).toMatchObject({ id: f.id, text: 'Lives in Mumbai' });
    expect(r.data(id).state).toBe('undone');
  });

  it('✕ on a "Used:" chip forgets the fact and writes activity forgot_facts with count 1', async () => {
    const r = rig();
    const f = value<MemoryFactView>(await r.h.svc.cmd({ cmd: 'add', text: 'Hates early flights' }));
    await r.mc.used(r.chatId, 'm_user', [{ ...(r.h.rows()[0] as object), id: f.id, text: f.text, provenance: 'said' } as never]);
    const chipId = 'm_chip1';
    expect(r.data(chipId)).toEqual({ kind: 'used', messageId: 'm_user', factIds: [f.id] });
    value(await r.mc.forget(chipId, f.id));
    expect(r.h.rows()).toHaveLength(0);
    const act = r.activity();
    expect(act).toHaveLength(1);
    expect(act[0]).toMatchObject({ kind: 'changed', event: 'forgot_facts' });
    expect(String(act[0]!.summary)).not.toContain('early flights');
    expect(r.data(chipId).state).toBe('forgotten');
    // A second ✕ does nothing.
    expect((await r.mc.forget(chipId, f.id)).ok).toBe(false);
  });

  it('an intake forget chip says "Forgot it…" with the store\'s 5 s Undo; the Undo restores the line and the chip', async () => {
    const r = rig();
    const f = value<MemoryFactView>(await r.h.svc.cmd({ cmd: 'add', text: 'Brother Rohit lives in Pune' }));
    const { undoToken } = value<{ undoToken: string }>(await r.h.svc.cmd({ cmd: 'forget', factId: f.id }));
    const id = (await r.mc.forgotten(r.chatId, 'm_user', f, { token: undoToken, until: r.h.clock.now() + 5_000 }))!;
    expect(r.data(id)).toMatchObject({ kind: 'used', state: 'forgotten', undoToken });
    value(await r.h.svc.cmd({ cmd: 'undo', undoToken }));
    await r.mc.restored(undoToken);
    expect(r.h.rows()).toHaveLength(1);
    expect(r.data(id).state).toBe('restored');
  });
});
