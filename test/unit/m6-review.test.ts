// M6 T5 post-turn review (08-3 §12.3, §12.4, §12.4.2): the provenance rule, chip placement (R-20), the "Used:" pick (§12.5) and
// when a review runs (20 s quiet, once per chat per 2 min, `privacy.learnFromChats`, never a private chat). Seams: the
// exported rule functions and `MemoryReview` over a fake clock with stub deps.
import { describe, expect, it } from 'vitest';
import type { EngineChat, EngineFact, EngineMessage } from '../../src/main/db/queries';
import { usedForChips } from '../../src/engine/memory/chips';
import { DONT_REMEMBER } from '../../src/engine/memory/intakeMemory';
import { anchorOf, MemoryReview, MemoryReviewActSchema, overlap, provenanceOk, type ReviewDeps } from '../../src/engine/memory/review';
import { FakeClock, TEST_EPOCH_MS } from '../../src/shared/clock';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import type { Settings } from '../../src/shared/settings';

const msg = (id: string, seq: number, authorKind: EngineMessage['authorKind'], text: string): EngineMessage => ({
  id,
  chatId: 'c_1',
  seq,
  authorKind,
  authorId: null,
  kind: 'text',
  text,
  textForAi: null,
  status: 'complete',
  badge: null,
  createdAt: TEST_EPOCH_MS + seq,
  transcript: null,
  attachments: 0,
  why: null,
});
const fact = (id: string, provenance: 'said' | 'guessed'): EngineFact => ({
  id,
  file: 'memory/about-you.md',
  lineNo: 1,
  scope: 'global',
  chatId: null,
  text: id,
  provenance,
  origin: 'chat:c_1/m_1',
  originKind: 'chat',
  reason: null,
  category: 'other',
  kind: 'fact',
  sensitive: false,
  private: false,
  learnedAt: TEST_EPOCH_MS,
  lastUsedAt: null,
  useCount: 0,
  hash: id,
});

describe('M6 T5 provenance (08-3 §12.3)', () => {
  const window = [msg('m_1', 1, 'user', "I'm allergic to peanuts, by the way"), msg('m_2', 2, 'foo', 'Noted, no peanuts.')];
  const byId = new Map(window.map((m) => [m.id, m]));

  it('"said" needs a user message among the evidence with token overlap ≥ 0.6', () => {
    expect(overlap('Allergic to peanuts', "I'm allergic to peanuts, by the way")).toBe(1);
    expect(provenanceOk({ provenance: 'said', text: 'Allergic to peanuts', evidenceMessageIds: ['m_1'] }, byId)).toBe(true);
    // foo's own words are never "you said".
    expect(provenanceOk({ provenance: 'said', text: 'No peanuts', evidenceMessageIds: ['m_2'] }, byId)).toBe(false);
    // 1 of 3 tokens (0.33) is under 0.6.
    expect(provenanceOk({ provenance: 'said', text: 'Loves peanut butter cookies', evidenceMessageIds: ['m_1'] }, byId)).toBe(false);
    expect(provenanceOk({ provenance: 'said', text: 'Allergic to peanuts', evidenceMessageIds: [] }, byId)).toBe(false);
  });

  it('"guessed" needs ≥ 2 distinct evidence events and a reason ("One booking is never enough", J9)', () => {
    expect(
      provenanceOk(
        { provenance: 'guessed', text: 'Prefers window seats', evidenceMessageIds: ['b1', 'b2'], reason: 'from 2 bookings' },
        byId,
      ),
    ).toBe(true);
    expect(
      provenanceOk(
        { provenance: 'guessed', text: 'Prefers window seats', evidenceMessageIds: ['b1', 'b1'], reason: 'from 2 bookings' },
        byId,
      ),
    ).toBe(false);
    expect(provenanceOk({ provenance: 'guessed', text: 'Prefers window seats', evidenceMessageIds: ['b1', 'b2'] }, byId)).toBe(false);
  });
});

describe('M6 T5 chip placement (R-20) and the "Used:" pick (§12.5)', () => {
  it('under the foo bubble that followed the evidence; else under the user bubble that carried it', () => {
    const w = [msg('m_1', 1, 'user', 'I hate early flights'), msg('m_2', 2, 'foo', 'Got it, later ones.'), msg('m_3', 3, 'user', 'thanks')];
    expect(anchorOf(['m_1'], w)).toBe('m_2');
    expect(anchorOf(['m_3'], w)).toBe('m_3');
  });

  it('at most 2 facts, guessed ones first', () => {
    const picked = usedForChips([fact('a', 'said'), fact('b', 'guessed'), fact('c', 'said'), fact('d', 'guessed')]);
    expect(picked.map((f) => f.id)).toEqual(['b', 'd']);
    expect(usedForChips([fact('a', 'said')]).map((f) => f.id)).toEqual(['a']);
  });
});

describe('M6 T5 MemoryReviewAct (08-3 §12.4)', () => {
  it('takes add / update / nothing ops and rejects a category outside MemoryCategory', () => {
    const add = {
      op: 'add',
      scope: 'global',
      text: 'Allergic to peanuts',
      provenance: 'said',
      evidenceMessageIds: ['m_1'],
      category: 'health',
      kind: 'fact',
      private: true,
    };
    expect(MemoryReviewActSchema.safeParse({ ops: [add, { op: 'nothing' }] }).success).toBe(true);
    expect(MemoryReviewActSchema.safeParse({ ops: [{ ...add, category: 'medical' }] }).success).toBe(false);
  });

  it('"don\'t remember this" is caught in the same message (J17 branch)', () => {
    expect(DONT_REMEMBER.test("don't remember this, but my PIN hint is a dog's name")).toBe(true);
    expect(DONT_REMEMBER.test('Do not save that')).toBe(true);
    expect(DONT_REMEMBER.test('remember this for me')).toBe(false);
  });
});

describe('M6 T5 review trigger (08-3 §12.4)', () => {
  function rig(over: { private?: boolean; settings?: (s: Settings) => Settings } = {}) {
    const clock = new FakeClock(TEST_EPOCH_MS);
    let seq = 0;
    const messages: EngineMessage[] = [];
    const turns: number[] = [];
    let settings = (over.settings ?? ((s) => s))(structuredClone(settingsDefaults));
    const chat: EngineChat = { id: 'c_1', kind: 'foo', title: 'foo', helperId: null, private: over.private ?? false };
    const d: ReviewDeps = {
      clock,
      settings: () => settings,
      query: <T>(q: string) =>
        Promise.resolve(
          (q === 'chatOpen'
            ? chat
            : q === 'messagesBefore'
              ? [...messages]
              : q === 'memoryByScope' || q === 'memory.tombstones'
                ? []
                : null) as T,
        ),
      tx: () => Promise.resolve({ ok: true, value: { ids: [] } } as never),
      newId: (p) => `${p}_x`,
      messageLine: (m) => Promise.resolve(`[You, Fri 16 Oct 9:00 AM]: ${m.text}`),
      factLine: (f) => f.text,
      build: (data) => ({ system: 's', prompt: data }),
      turn: () => {
        turns.push(clock.now());
        return Promise.resolve({ ops: [{ op: 'nothing' }] });
      },
      memory: { learn: () => Promise.reject(new Error('no add expected')), update: () => Promise.reject(new Error('no update')) },
      chips: {} as never,
      log: () => undefined,
    };
    const review = new MemoryReview(d);
    const say = (text: string, author: EngineMessage['authorKind'] = 'user') => {
      seq += 1;
      const m = msg(`m_${seq}`, seq, author, text);
      messages.push(m);
      if (author === 'user') review.userMessage('c_1', seq);
      return m;
    };
    const tick = async (ms: number) => {
      clock.advance(ms);
      await review.idle();
      await review.idle();
    };
    return { clock, review, say, tick, turns, set: (fn: (s: Settings) => Settings) => (settings = fn(settings)) };
  }

  it('runs after 20 s of quiet; a new message restarts the wait', async () => {
    const r = rig();
    r.say('I hate early flights');
    r.say('Noted.', 'foo');
    r.review.after('c_1');
    await r.tick(19_000);
    expect(r.turns).toHaveLength(0);
    r.say('and window seats please');
    await r.tick(19_000);
    expect(r.turns).toHaveLength(0);
    await r.tick(1_000);
    expect(r.turns).toEqual([TEST_EPOCH_MS + 39_000]);
  });

  it('at most once per chat per 2 minutes, and only with a new user message since the last review', async () => {
    const r = rig();
    r.say('I hate early flights');
    r.review.after('c_1');
    await r.tick(20_000);
    expect(r.turns).toEqual([TEST_EPOCH_MS + 20_000]);
    // No new user message since: the next slot (2 min on) reads nothing.
    r.review.after('c_1');
    await r.tick(130_000);
    expect(r.turns).toHaveLength(1);
    r.say('I live in Pune');
    r.review.after('c_1');
    await r.tick(20_000);
    expect(r.turns).toEqual([TEST_EPOCH_MS + 20_000, TEST_EPOCH_MS + 170_000]);
    // 20 s of quiet is not enough within 2 min of the last review.
    r.say('and I work from home');
    r.review.after('c_1');
    await r.tick(20_000);
    expect(r.turns).toHaveLength(2);
    await r.tick(100_000);
    expect(r.turns).toEqual([TEST_EPOCH_MS + 20_000, TEST_EPOCH_MS + 170_000, TEST_EPOCH_MS + 290_000]);
  });

  it('never in a private chat, never with learn-from-chats or memory off', async () => {
    const p = rig({ private: true });
    p.say('I hate early flights');
    p.review.after('c_1');
    await p.tick(30_000);
    expect(p.turns).toHaveLength(0);

    const off = rig({ settings: (s) => ({ ...s, privacy: { ...s.privacy, learnFromChats: false } }) });
    off.say('I hate early flights');
    off.review.after('c_1');
    await off.tick(30_000);
    expect(off.turns).toHaveLength(0);

    const mem = rig({ settings: (s) => ({ ...s, privacy: { ...s.privacy, rememberOn: false } }) });
    mem.say('I hate early flights');
    mem.review.after('c_1');
    await mem.tick(30_000);
    expect(mem.turns).toHaveLength(0);
  });

  it('a "don\'t remember this" message is never read by the review', async () => {
    const r = rig();
    const m = r.say("don't remember this: my PIN hint is a dog's name");
    r.review.skip(m.id);
    r.review.after('c_1');
    await r.tick(20_000);
    expect(r.turns).toHaveLength(0);
  });
});
