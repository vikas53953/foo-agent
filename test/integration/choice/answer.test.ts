// Spec: 08-1 §3.2 card:answer (CARD_STALE when the nonce or state is old, CARD_EXPIRED past expires_at), §2.4 card.answered
// (a job's card goes to the runner), 05-1 §5.3.3 (asking → answered | skipped; resolved_by), §5.3 purposes (no Skip on
// file_in / photo_notice), §5.3.1 (multi-select needs ≥ 1 row), CR-0009 G-M5-09 (the notifier's Best fit button), 08-4 §26.6 rule 4
// (1️⃣–4️⃣ reactions), 08-2 §5.2.2 (👍 / ✅ on a gated card: the G16 line only), and the typed hook in the real engine
// (08-2 §5.2 order: stop word first, then the typed answer, then the G16 reply).
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { answerCard, answerFromToast, onCardReaction, type AnswerDeps } from '../../../src/main/cards/answerCard';
import { migrate } from '../../../src/main/store/db';
import { ensureFooChat } from '../../../src/main/store/queries';
import { t } from '../../../src/shared/copy/t';
import { newId } from '../../../src/shared/ids';
import type { CardRow } from '../../../src/shared/types';
import { envelope, intake } from '../../unit/m3-engine-helpers';
import { jobHarness, jobIntake, step, type JobHarness } from '../jobs/jobHarness';
import { fooTexts, until } from '../jobs/t3Helpers';
import { cardOf, FLIGHTS, seedCard } from './seedCard';

const NOW = Date.UTC(2026, 9, 16, 4, 11);

function world() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const chatId = ensureFooChat(db, NOW, 'foo', newId('c', NOW));
  const sent: { kind: string; payload: unknown }[] = [];
  const emitted: string[] = [];
  const d: AnswerDeps = {
    db,
    now: () => NOW + 1_000,
    engine: { send: (kind: string, payload: unknown) => (sent.push({ kind, payload }), true) } as AnswerDeps['engine'],
    emitCard: (c) => emitted.push(`card:${c.id}:${c.state}`),
    emitMessage: (m) => emitted.push(`message:${m.id}`),
    emitChat: (id) => emitted.push(`chat:${id}`),
  };
  const seed = (
    payload: Record<string, unknown> = FLIGHTS,
    extra: { jobId?: string; expiresAt?: number; state?: string; type?: 'choice' | 'tiles' } = {},
  ) => seedCard(db, { chatId, type: extra.type ?? 'choice', state: extra.state ?? 'asking', payload, now: NOW, ...extra });
  return { db, chatId, sent, emitted, d, seed };
}

describe("05-2 §5.8.4 the save-login offer is main's (CR-0030 pick 4)", () => {
  const offer = {
    purpose: 'job',
    question: t('cards.secret.login.offer', { site: 'example.com' }),
    options: [
      { id: 'o1', label: t('cards.secret.login.save') },
      { id: 'o2', label: t('cards.secret.login.dont_save') },
    ],
    multi: false,
    aiReversible: false,
    reversible: false,
    livePrices: false,
    saveLogin: { site: 'example.com' },
  };
  const suggestion = (db: Database.Database) => db.prepare("SELECT state FROM suggestions WHERE key = 'save_login:example.com'").get();
  const boxes = (db: Database.Database) =>
    db.prepare("SELECT state, payload FROM cards WHERE type = 'secret'").all() as { state: string; payload: string }[];

  it('Save → the "{site} login" Secret box (typed again, no value carried) and the suggestion accepted; nothing to the engine', () => {
    const w = world();
    const c = w.seed(offer);
    expect(answerCard(w.d, { cardId: c.id, nonce: c.nonce, answer: { optionId: 'o1' }, resolvedBy: 'tap' }).ok).toBe(true);
    expect(cardOf(w.db, c.id).state).toBe('answered');
    expect(suggestion(w.db)).toEqual({ state: 'accepted' });
    const [box, ...more] = boxes(w.db);
    expect(more).toEqual([]);
    expect(box!.state).toBe('asking');
    expect(JSON.parse(box!.payload)).toEqual({
      secretKind: 'login',
      name: t('cards.secret.title.login', { site: 'example.com' }),
      why: '',
      fields: [],
      vaultName: 'example.com',
      afterSignIn: true,
    });
    expect(w.sent).toEqual([]);
  });

  it("Don't save → no box, the key dismissed for good", () => {
    const w = world();
    const c = w.seed(offer);
    expect(answerCard(w.d, { cardId: c.id, nonce: c.nonce, answer: { optionId: 'o2' }, resolvedBy: 'tap' }).ok).toBe(true);
    expect(suggestion(w.db)).toEqual({ state: 'dismissed' });
    expect(boxes(w.db)).toEqual([]);
  });
});

describe('card:answer in main', () => {
  it('G-M5-09 · the notifier answers the Best fit with resolved_by toast; no button without a Best fit', () => {
    const w = world();
    const c = w.seed({ ...FLIGHTS, purpose: 'setup' });
    expect(answerFromToast(w.d, c.id).ok).toBe(true);
    expect(cardOf(w.db, c.id)).toMatchObject({ state: 'answered', answer: { optionId: 'o1' }, resolvedBy: 'toast' });
    const f = w.seed({ ...FLIGHTS, purpose: 'file_in' });
    expect(answerFromToast(w.d, f.id)).toMatchObject({ ok: false, error: { kind: 'VALIDATION' } });
    expect(cardOf(w.db, f.id).state).toBe('asking');
  });

  it('a jobless card: tap on option 2 → answered, answer and resolved_by stored, the window told', () => {
    const w = world();
    const c = w.seed({ ...FLIGHTS, purpose: 'setup' });
    const r = answerCard(w.d, { cardId: c.id, nonce: c.nonce, answer: { optionId: 'o2' }, resolvedBy: 'tap' });
    expect(r.ok).toBe(true);
    const row = cardOf(w.db, c.id);
    expect(row).toMatchObject({ state: 'answered', answer: { optionId: 'o2' }, resolvedBy: 'tap', resolvedAt: NOW + 1_000 });
    expect(r.ok && r.value.state).toBe('answered');
    expect(w.emitted).toContain(`card:${c.id}:answered`);
    expect(w.sent).toEqual([]);
  });

  it('05-2 §5.8.3 a Secret box Cancel ({ skip: true }) → withdrawn and stays so; a saved box is stale; no other answer fits', () => {
    const w = world();
    const secret = { secretKind: 'password', name: 'example.com' };
    const c = seedCard(w.db, { chatId: w.chatId, type: 'secret', state: 'asking', payload: secret, now: NOW });
    const r = answerCard(w.d, { cardId: c.id, nonce: c.nonce, answer: { skip: true }, resolvedBy: 'tap' });
    expect(r.ok && r.value.state).toBe('withdrawn');
    expect(cardOf(w.db, c.id)).toMatchObject({ state: 'withdrawn', answer: { skip: true }, resolvedBy: 'tap' });
    expect(w.emitted).toContain(`card:${c.id}:withdrawn`);
    expect(w.sent).toEqual([]);
    const saved = seedCard(w.db, { chatId: w.chatId, type: 'secret', state: 'saved', payload: secret, now: NOW });
    expect(answerCard(w.d, { cardId: saved.id, nonce: saved.nonce, answer: { skip: true }, resolvedBy: 'tap' })).toMatchObject({
      ok: false,
      error: { kind: 'CARD_STALE' },
    });
    const asking = seedCard(w.db, { chatId: w.chatId, type: 'secret', state: 'asking', payload: secret, now: NOW });
    expect(answerCard(w.d, { cardId: asking.id, nonce: asking.nonce, answer: { optionId: 'o1' }, resolvedBy: 'tap' })).toMatchObject({
      ok: false,
      error: { kind: 'VALIDATION' },
    });
  });

  it('Skip → skipped; not allowed on file_in or photo_notice', () => {
    const w = world();
    const c = w.seed({ ...FLIGHTS, purpose: 'setup' });
    expect(answerCard(w.d, { cardId: c.id, nonce: c.nonce, answer: { skip: true }, resolvedBy: 'tap' }).ok).toBe(true);
    expect(cardOf(w.db, c.id).state).toBe('skipped');
    for (const purpose of ['file_in', 'photo_notice']) {
      const f = w.seed({ ...FLIGHTS, purpose });
      expect(answerCard(w.d, { cardId: f.id, nonce: f.nonce, answer: { skip: true }, resolvedBy: 'tap' })).toEqual({
        ok: false,
        error: { kind: 'VALIDATION' },
      });
    }
  });

  it('a stale nonce, a second answer and a card past its time are refused', () => {
    const w = world();
    const c = w.seed({ ...FLIGHTS, purpose: 'setup' });
    expect(answerCard(w.d, { cardId: c.id, nonce: '0'.repeat(32), answer: { optionId: 'o1' }, resolvedBy: 'tap' })).toMatchObject({
      ok: false,
      error: { kind: 'CARD_STALE' },
    });
    answerCard(w.d, { cardId: c.id, nonce: c.nonce, answer: { optionId: 'o1' }, resolvedBy: 'tap' });
    expect(answerCard(w.d, { cardId: c.id, nonce: c.nonce, answer: { optionId: 'o2' }, resolvedBy: 'tap' })).toMatchObject({
      ok: false,
      error: { kind: 'CARD_STALE' },
    });
    const old = w.seed({ ...FLIGHTS, purpose: 'setup' }, { expiresAt: NOW + 500 });
    expect(answerCard(w.d, { cardId: old.id, nonce: old.nonce, answer: { optionId: 'o1' }, resolvedBy: 'tap' })).toMatchObject({
      ok: false,
      error: { kind: 'CARD_EXPIRED' },
    });
    const gone = w.seed({ ...FLIGHTS, purpose: 'setup' }, { state: 'expired' });
    expect(answerCard(w.d, { cardId: gone.id, nonce: gone.nonce, answer: { optionId: 'o1' }, resolvedBy: 'tap' })).toMatchObject({
      ok: false,
      error: { kind: 'CARD_EXPIRED' },
    });
  });

  it('answers must fit the card: a real option, many only on multi-select; a stepper card is one question', () => {
    const w = world();
    const one = w.seed({ ...FLIGHTS, purpose: 'setup' });
    const bad = (c: CardRow, answer: Parameters<typeof answerCard>[1]['answer']) =>
      answerCard(w.d, { cardId: c.id, nonce: c.nonce, answer, resolvedBy: 'tap' });
    expect(bad(one, { optionId: 'o4' })).toMatchObject({ ok: false, error: { kind: 'VALIDATION' } });
    expect(bad(one, { optionIds: ['o1', 'o2'] })).toMatchObject({ ok: false, error: { kind: 'VALIDATION' } });
    const multi = w.seed({ ...FLIGHTS, purpose: 'setup', multi: true });
    expect(bad(multi, { optionId: 'o1' })).toMatchObject({ ok: false, error: { kind: 'VALIDATION' } });
    expect(bad(multi, { optionIds: ['o1', 'o1'] })).toMatchObject({ ok: false, error: { kind: 'VALIDATION' } });
    expect(bad(multi, { optionIds: ['o1', 'o3'] }).ok).toBe(true);
    const stepper = w.seed({ ...FLIGHTS, purpose: 'setup', stepper: { index: 2, total: 3 } });
    expect(bad(stepper, { optionIds: ['o1', 'o2'] })).toMatchObject({ ok: false, error: { kind: 'VALIDATION' } });
    expect(bad(stepper, { optionId: 'o2' }).ok).toBe(true);
    expect(cardOf(w.db, stepper.id).answer).toEqual({ optionId: 'o2' });
  });

  it("a job's card goes to the runner as card.answered (the card is not moved by main)", () => {
    const w = world();
    const jobId = newId('j', NOW);
    w.db
      .prepare(
        "INSERT INTO jobs (id, chat_id, origin_chat_id, owner_kind, title, origin, intent, state, created_at) VALUES (?, ?, ?, 'foo', 'Delhi flights', 'user', 'read_only', 'needs_you', ?)",
      )
      .run(jobId, w.chatId, w.chatId, NOW);
    const c = w.seed(FLIGHTS, { jobId });
    const r = answerCard(w.d, { cardId: c.id, nonce: c.nonce, answer: { optionId: 'o1' }, resolvedBy: 'keyboard' });
    expect(r.ok).toBe(true);
    expect(w.sent).toEqual([
      { kind: 'card.answered', payload: { cardId: c.id, answer: { optionId: 'o1' }, choice: 'o1', resolvedBy: 'keyboard' } },
    ]);
    expect(cardOf(w.db, c.id).state).toBe('asking');
  });

  it('reactions: 2️⃣ answers a Choice card (resolved_by reaction); 👍 on it does nothing', () => {
    const w = world();
    const c = w.seed({ ...FLIGHTS, purpose: 'setup' });
    onCardReaction(w.d, c.messageId, '👍');
    expect(cardOf(w.db, c.id).state).toBe('asking');
    onCardReaction(w.d, c.messageId, '2️⃣');
    expect(cardOf(w.db, c.id)).toMatchObject({ state: 'answered', answer: { optionId: 'o2' }, resolvedBy: 'reaction' });
  });
});

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

describe('typed answers in the engine (08-2 §5.2)', () => {
  it('a jobless card: "the second one" answers it, resolved_by typed, and no intake turn runs', async () => {
    h = jobHarness({ script: [intake(envelope('Sure.'))] });
    const c = seedCard(h.db, {
      chatId: h.chatId,
      type: 'choice',
      state: 'asking',
      payload: { ...FLIGHTS, purpose: 'setup' },
      now: h.clock.now(),
    });
    h.userSays('the second one');
    await h.settle();
    expect(cardOf(h.db, c.id)).toMatchObject({ state: 'answered', answer: { optionId: 'o2' }, resolvedBy: 'typed' });
    expect(h.turnsJsonl().filter((x) => x.purpose === 'intake')).toHaveLength(0);
  });

  it('a tie posts "Did you mean {a} or {b}?" and the card stays open', async () => {
    h = jobHarness({ script: [intake(envelope('Sure.'))] });
    const c = seedCard(h.db, {
      chatId: h.chatId,
      type: 'choice',
      state: 'asking',
      payload: { ...FLIGHTS, purpose: 'setup' },
      now: h.clock.now(),
    });
    h.userSays('air');
    await h.settle();
    expect(cardOf(h.db, c.id).state).toBe('asking');
    expect(fooTexts(h)).toContain(t('thread.choice_typed.tie', { a: FLIGHTS.options[1]!.label, b: FLIGHTS.options[2]!.label }));
  });

  it('text that answers no option falls through to intake', async () => {
    h = jobHarness({ script: [intake(envelope('Sure.'))] });
    const c = seedCard(h.db, {
      chatId: h.chatId,
      type: 'choice',
      state: 'asking',
      payload: { ...FLIGHTS, purpose: 'setup' },
      now: h.clock.now(),
    });
    h.userSays('what does the weather look like?');
    await h.settle();
    expect(cardOf(h.db, c.id).state).toBe('asking');
    expect(fooTexts(h)).toContain('Sure.');
  });

  it('a job\'s own ask: typing "2" answers it through the runner and the job carries on', async () => {
    h = jobHarness({
      script: [
        jobIntake([{ phraseKey: 'read_email' }, { phraseKey: 'look_for', slots: { what: 'flights' } }], { estimate: { minutes: 2 } }),
        step({
          kind: 'ask',
          card: { question: 'Which flight time works?', options: [{ label: 'IndiGo 10:15' }, { label: 'Air India 7:10' }] },
        }),
        step({ kind: 'done', result: 'Booked nothing, here is the list.', unverified: true }),
      ],
    });
    h.userSays('find me a flight to Delhi on Friday');
    await until(h, () => h!.cards('choice').length === 1);
    expect(h.job().state).toBe('needs_you');
    const card = h.cards('choice')[0]!;
    expect(JSON.parse(String(card.payload))).toMatchObject({ purpose: 'job', livePrices: false, reversible: false, aiReversible: false });
    h.userSays('2');
    await h.settle();
    expect(h.cards('choice')[0]).toMatchObject({ state: 'answered', resolved_by: 'typed' });
    expect(JSON.parse(String(h.cards('choice')[0]!.answer))).toEqual({ optionId: 'o2' });
    expect(h.job().state).toBe('done_unverified');
  });

  const askJob = () =>
    jobHarness({
      script: [
        jobIntake([{ phraseKey: 'read_email' }, { phraseKey: 'look_for', slots: { what: 'flights' } }], { estimate: { minutes: 2 } }),
        step({
          kind: 'ask',
          card: { question: 'Which flight time works?', options: [{ label: 'IndiGo 10:15' }, { label: 'Air India 7:10' }] },
        }),
        step({ kind: 'done', result: 'Booked nothing, here is the list.', unverified: true }),
        intake(envelope('Sure.')),
      ],
    });

  it('Skip on a job\'s Choice card is stored skipped (05-1 §5.3.2 "Skipped. I\'ll go with {Best fit}.")', async () => {
    h = askJob();
    h.userSays('find me a flight to Delhi on Friday');
    await until(h, () => h!.cards('choice').length === 1);
    h.userSays('skip');
    await h.settle();
    expect(h.cards('choice')[0]).toMatchObject({ state: 'skipped', resolved_by: 'typed' });
  });

  it('a typed answer the runner does not take (a job card its job is not waiting on) is not swallowed', async () => {
    h = askJob();
    h.userSays('find me a flight to Delhi on Friday');
    await until(h, () => h!.cards('choice').length === 1);
    const other = seedCard(h.db, {
      chatId: h.chatId,
      type: 'choice',
      state: 'asking',
      payload: FLIGHTS,
      jobId: String(h.job().id),
      now: h.clock.now() + 1,
    });
    const before = h.turnsJsonl().length;
    h.userSays('1');
    await h.settle();
    expect(cardOf(h.db, other.id).state).toBe('asking');
    expect(h.turnsJsonl().length).toBeGreaterThan(before);
  });
});
