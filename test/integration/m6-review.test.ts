// M6 T5 learning from chat, end to end through the real Engine and main's EngineBridge over a temp SQLite db and {DATA}
// (08-3 §22.3 fake AI). AT-076 (review part, 10-acceptance-1 §B): the fake AI's guessed "allergic…" and "salary ₹…" are dropped
// with no chip; the said allergy is saved private. Also: intake "remember…" (👍 + chip, no "Got it.", R-20, G-M6-03),
// "don't remember this" (J17), "forget…" (G-M6-04: one match, two matches, none), ask-before-remembering (`memory_confirm`
// card), the "Used:" chip (08-3 §12.5), and a private chat (§12.1). Seams: `user.message` / `card.answered` in → messages,
// cards, memory files and index rows out.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sendMessage } from '../../src/main/store/composerQueries';
import type { Settings } from '../../src/shared/settings';
import { makeHarness, verified, type FakeLineIn, type Harness } from '../unit/m3-engine-helpers';

let h: Harness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const act = (decision: Record<string, unknown>, used: string[] = []) =>
  `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: used })}</act>`;
const replyAct = (say: string, used: string[] = []) =>
  `<say>${say}</say><act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: used })}</act>`;
const intakeOn = (includes: string, reply: string): FakeLineIn => ({ match: { purpose: 'intake', promptIncludes: includes }, reply });

function rig(script: FakeLineIn[], settings: (s: Settings) => Settings = (s) => s): Harness {
  const v = verified();
  return makeHarness({ script, settings: (s) => settings(v(s)), tools: {} });
}

/** A user message with a fixed id (the fake AI script names it as evidence), handed to the engine as main does. */
function say(x: Harness, id: string, text: string): string {
  x.clock.advance(1_000);
  const r = sendMessage(
    x.db,
    { chatId: x.chatId, clientId: `k_${id}`, text },
    { now: x.clock.now(), newId: () => id, waiting: false, attachment: () => undefined },
  );
  if (!r.ok) throw new Error(r.reason);
  x.send('user.message', { messageId: id, chatId: x.chatId });
  return id;
}

/** A card answer runs beside the chat lane (and the memory parse runs in a worker): wait until `done` holds. */
async function until(x: Harness, done: () => boolean): Promise<void> {
  for (let i = 0; i < 400 && !done(); i++) await realSleep(5);
  await x.idle();
}

/** 08-3 §12.4: 20 s of quiet, then the review turn and its writes. */
async function review(x: Harness): Promise<void> {
  for (let i = 0; i < 5; i++) await realSleep(1);
  x.clock.advance(20_000);
  for (let i = 0; i < 20; i++) {
    await realSleep(2);
    await x.engine.memoryReview.idle();
  }
}

const file = (x: Harness, rel: string) => {
  const p = join(x.dir, 'data', ...rel.split('/'));
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
};
const chips = (x: Harness) =>
  x
    .messages()
    .filter((m) => m.marker_kind === 'memory_chip')
    .map(
      (m) =>
        ({ text: m.text, ...(JSON.parse(String(m.why)) as { memoryChip: Record<string, unknown> }).memoryChip }) as Record<string, unknown>,
    );
const facts = (x: Harness) => x.db.prepare('SELECT * FROM memory_index ORDER BY learned_at').all() as Record<string, unknown>[];
const reactions = (x: Harness, id: string) =>
  x.db.prepare('SELECT emoji FROM reactions WHERE message_id = ?').all(id) as { emoji: string }[];
const fooBubbles = (x: Harness) => x.messages().filter((m) => m.author_kind === 'foo' && m.kind === 'text');

describe('AT-076 (review): sensitive guesses are never saved', () => {
  it('AT-076 · guessed "allergic…" and "salary ₹…" are dropped with no chip; said → saved private', async () => {
    const add = (o: Record<string, unknown>) => ({ op: 'add', scope: 'global', category: 'other', kind: 'fact', private: false, ...o });
    const ops = [
      add({ text: 'Allergic to peanuts', provenance: 'guessed', evidenceMessageIds: ['m_u1', 'm_u2'], reason: 'from 2 messages' }),
      add({
        text: 'Salary ₹1,20,000 a month',
        provenance: 'guessed',
        evidenceMessageIds: ['m_u1', 'm_u2'],
        reason: 'from 2 messages',
        category: 'work',
      }),
      add({ text: 'Allergic to peanuts', provenance: 'said', evidenceMessageIds: ['m_u1'] }),
    ];
    h = rig([
      intakeOn('allergic', replyAct('Noted, no peanuts.')),
      intakeOn('cookies', replyAct('Sure.')),
      { match: { purpose: 'memory_review' }, reply: `<act>${JSON.stringify({ ops })}</act>` },
    ]);
    const x = h;
    say(x, 'm_u1', "I'm allergic to peanuts");
    await x.idle();
    say(x, 'm_u2', 'any cookies without them? my salary is ₹1,20,000 so not too pricey');
    await x.idle();
    await review(x);

    const turn = x.turnsJsonl().find((t) => t.purpose === 'memory_review')!;
    expect(String(turn.prompt)).toContain('Messages since my last look:');
    expect(String(turn.prompt)).toContain('[m_u1] [the user, Fri 16 Oct');
    expect(String(turn.system)).toContain('Save only facts that will matter in future conversations.');

    const saved = facts(x);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ text: 'Allergic to peanuts', provenance: 'said', private: 1, origin: `chat:${x.chatId}/m_u1` });
    expect(file(x, 'memory/about-you.md')).not.toMatch(/salary|₹/i);
    expect(file(x, 'memory/about-you.md')).toMatch(/- Allergic to peanuts {2}\{you said · 2026-10-16 · chat · private · f_/);
    const c = chips(x);
    expect(c).toHaveLength(1);
    // Under the foo bubble that followed the evidence (R-20).
    expect(c[0]).toMatchObject({ kind: 'saved', text: 'Allergic to peanuts', messageId: fooBubbles(x)[0]!.id });
    expect(x.logs.some((l) => l.evt === 'memory.dropped_sensitive')).toBe(true);
    // One ai_turns row for the review, in foo's 1:1 chat (08-4 §31).
    expect(x.db.prepare("SELECT chat_id, outcome FROM ai_turns WHERE purpose = 'memory_review'").all()).toEqual([
      { chat_id: x.chatId, outcome: 'ok' },
    ]);
  });
});

describe('M6 T5 intake remember / forget (G-M6-03, G-M6-04, J17, R-20)', () => {
  it('"remember I\'m allergic to peanuts" → 👍 on the bubble and the chip under it; no "Got it." bubble', async () => {
    h = rig([intakeOn('remember', act({ kind: 'memory', op: 'remember', text: 'Allergic to peanuts' }))]);
    const x = h;
    const id = say(x, 'm_r1', "remember I'm allergic to peanuts");
    await x.idle();
    expect(reactions(x, id)).toEqual([{ emoji: '👍' }]);
    expect(fooBubbles(x)).toHaveLength(0);
    expect(chips(x)).toEqual([
      expect.objectContaining({ kind: 'saved', text: 'Allergic to peanuts', messageId: id, undoToken: expect.stringMatching(/^chip_/) }),
    ]);
    expect(facts(x)[0]).toMatchObject({ provenance: 'said', origin_kind: 'chat', origin: `chat:${x.chatId}/${id}`, private: 1 });
  });

  it('"don\'t remember this" → nothing is saved, chip "Not saving this one."', async () => {
    h = rig([intakeOn('PIN', act({ kind: 'memory', op: 'remember', text: 'PIN hint is a dog’s name' }))]);
    const x = h;
    const id = say(x, 'm_d1', "don't remember this, but my PIN hint is my dog's name");
    await x.idle();
    expect(facts(x)).toHaveLength(0);
    expect(file(x, 'memory/about-you.md')).toBe('');
    expect(chips(x)).toEqual([expect.objectContaining({ kind: 'not_saving', messageId: id })]);
  });

  it('a bare "don\'t remember this" covers the next message', async () => {
    h = rig([
      intakeOn('remember this', replyAct('Okay.')),
      intakeOn('Pune', act({ kind: 'memory', op: 'remember', text: 'Moving to Pune' })),
    ]);
    const x = h;
    say(x, 'm_d1', "don't remember this");
    await x.idle();
    const next = say(x, 'm_d2', 'I am moving to Pune next month');
    await x.idle();
    expect(facts(x)).toHaveLength(0);
    expect(chips(x)).toEqual([expect.objectContaining({ kind: 'not_saving', messageId: next })]);
  });

  it('"forget …" with one match forgets it: chip "Forgot it…" with a 5 s Undo, tombstone written', async () => {
    h = rig([
      intakeOn('remember', act({ kind: 'memory', op: 'remember', text: 'Brother Rohit lives in Pune' })),
      intakeOn('forget', act({ kind: 'memory', op: 'forget', text: 'that my brother lives in Pune' })),
    ]);
    const x = h;
    say(x, 'm_r1', 'remember my brother Rohit lives in Pune');
    await x.idle();
    expect(facts(x)).toHaveLength(1);
    const id = say(x, 'm_f1', 'forget that my brother lives in Pune');
    await x.idle();
    expect(facts(x)).toHaveLength(0);
    expect(x.db.prepare('SELECT COUNT(*) AS n FROM memory_tombstones').get()).toEqual({ n: 1 });
    const forgot = chips(x).find((c) => c.state === 'forgotten')!;
    expect(forgot).toMatchObject({
      kind: 'used',
      messageId: id,
      text: 'Brother Rohit lives in Pune',
      undoToken: expect.stringMatching(/^undo_/),
    });
    expect(Number(forgot.undoUntil) - x.clock.now()).toBeLessThanOrEqual(5_000);
  });

  it('two matches → a memory_confirm Choice card listing them; the answer forgets that one', async () => {
    h = rig([
      intakeOn('Pune', act({ kind: 'memory', op: 'remember', text: 'Brother Rohit lives in Pune' })),
      intakeOn('Delhi', act({ kind: 'memory', op: 'remember', text: 'Brother Aman lives in Delhi' })),
      intakeOn('forget', act({ kind: 'memory', op: 'forget', text: 'that my brother lives in Pune or Delhi' })),
    ]);
    const x = h;
    say(x, 'm_r1', 'remember my brother Rohit lives in Pune');
    await x.idle();
    say(x, 'm_r2', 'remember my brother Aman lives in Delhi');
    await x.idle();
    say(x, 'm_f1', 'forget that my brother lives in Pune or Delhi');
    await x.idle();
    const card = x.db.prepare("SELECT * FROM cards WHERE type = 'choice'").get() as Record<string, unknown>;
    const payload = JSON.parse(String(card.payload)) as { purpose: string; question: string; options: { id: string; label: string }[] };
    expect(payload.purpose).toBe('memory_confirm');
    expect(payload.question).toBe('Which one should I forget?');
    expect(payload.options.map((o) => o.label).sort()).toEqual(['Brother Aman lives in Delhi', 'Brother Rohit lives in Pune']);
    const delhi = payload.options.find((o) => o.label.includes('Delhi'))!;
    x.send('card.answered', { cardId: String(card.id), answer: { optionId: delhi.id as 'o1' }, resolvedBy: 'tap' });
    await until(x, () => facts(x).length === 1);
    expect(facts(x).map((f) => f.text)).toEqual(['Brother Rohit lives in Pune']);
    expect((x.db.prepare('SELECT state FROM cards WHERE id = ?').get(card.id) as { state: string }).state).toBe('answered');
  });

  it('no match → foo says it has nothing like that', async () => {
    h = rig([intakeOn('forget', act({ kind: 'memory', op: 'forget', text: 'my gym timings' }))]);
    const x = h;
    say(x, 'm_f1', 'forget my gym timings');
    await x.idle();
    expect(fooBubbles(x).map((m) => m.text)).toEqual(['I don’t have anything like that saved.']);
  });

  it('ask-before-remembering → "Remember that {fact}?" [ Remember ] [ Don\'t ]; Remember saves with the chip', async () => {
    h = rig([intakeOn('remember', act({ kind: 'memory', op: 'remember', text: 'Allergic to peanuts' }))], (s) => ({
      ...s,
      privacy: { ...s.privacy, askBeforeRemembering: true },
    }));
    const x = h;
    say(x, 'm_r1', "remember I'm allergic to peanuts");
    await x.idle();
    expect(facts(x)).toHaveLength(0);
    const card = x.db.prepare("SELECT * FROM cards WHERE type = 'choice'").get() as Record<string, unknown>;
    const payload = JSON.parse(String(card.payload)) as { purpose: string; question: string; options: { label: string }[] };
    expect(payload).toMatchObject({ purpose: 'memory_confirm', question: 'Remember that Allergic to peanuts?' });
    expect(payload.options.map((o) => o.label)).toEqual(['Remember', 'Don’t']);
    x.send('card.answered', { cardId: String(card.id), answer: { optionId: 'o1' }, resolvedBy: 'tap' });
    await until(x, () => chips(x).length === 1);
    expect(facts(x)).toHaveLength(1);
    expect(chips(x)).toEqual([expect.objectContaining({ kind: 'saved', text: 'Allergic to peanuts' })]);
  });

  it('a private chat never saves: "remember …" gets the not-saving chip and no review runs', async () => {
    h = rig([
      intakeOn('remember', act({ kind: 'memory', op: 'remember', text: 'Allergic to peanuts' })),
      { match: { purpose: 'memory_review' }, reply: '<act>{"ops":[{"op":"nothing"}]}</act>' },
    ]);
    const x = h;
    x.db.prepare('UPDATE chats SET private = 1 WHERE id = ?').run(x.chatId);
    say(x, 'm_r1', "remember I'm allergic to peanuts");
    await x.idle();
    await review(x);
    expect(facts(x)).toHaveLength(0);
    expect(chips(x)).toEqual([expect.objectContaining({ kind: 'not_saving' })]);
    expect(x.turnsJsonl().some((t) => t.purpose === 'memory_review')).toBe(false);
  });
});

describe('M6 T5 "Used:" chip (08-3 §12.5)', () => {
  it('the facts the reply names show as "Used:" chips under it, at most 2, guessed first', async () => {
    h = rig([intakeOn('Delhi', replyAct('The 10:15 AM IndiGo is the one.', ['f_said', 'f_guess1', 'f_guess2']))]);
    const x = h;
    const insert = x.db.prepare(
      `INSERT INTO memory_index (id, file, line_no, scope, text, provenance, origin, origin_kind, kind, learned_at, use_count, hash)
       VALUES (?, 'memory/about-you.md', ?, 'global', ?, ?, 'chat', 'chat', 'fact', ?, 0, ?)`,
    );
    insert.run('f_said', 1, 'Hates early flights', 'said', x.clock.now(), 'h1');
    insert.run('f_guess1', 2, 'Prefers window seats', 'guessed', x.clock.now(), 'h2');
    insert.run('f_guess2', 3, 'Flies IndiGo most', 'guessed', x.clock.now(), 'h3');
    say(x, 'm_q1', 'which flight to Delhi on Friday? window seat, not early, IndiGo maybe');
    await x.idle();
    const reply = fooBubbles(x)[0]!;
    expect(chips(x)).toEqual([
      expect.objectContaining({ kind: 'used', text: 'Prefers window seats', messageId: reply.id, factIds: ['f_guess1'] }),
      expect.objectContaining({ kind: 'used', text: 'Flies IndiGo most', messageId: reply.id, factIds: ['f_guess2'] }),
    ]);
  });
});
