// M5 T1 contracts (CR-0009): 08-2 §9.3 (fields_hash = sha256 of the RFC 8785 canonical JSON; nonce 32 lower-case hex),
// 08-4 §25.1 (ChoiceCardSpec limits, 08-4 wins for the AI's spec, G-M5-07; ApprovalDraft verbs, X-125), 08-1 §2.4 (the M5
// main ⇄ engine rows), §3.2 (the M5 invoke channels), 08-0 §C (test ids), §G.2 (card states), the M5 card registry, and the
// FOO_TEST card seed (approvals row mirrored into cards.state, 08-1 §4.5.1).
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { fieldsHash } from '../../src/engine/gate/fieldsHash';
import { engineToMainSchema, mainToEngineSchema } from '../../src/engine/protocol';
import { migrate, type Db } from '../../src/main/store/db';
import { seedCard } from '../../src/main/test/testHooks';
import { M5_CARD_TYPES } from '../../src/renderer/cards/cardViews';
import { newNonce } from '../../src/shared/canon';
import { isCardState } from '../../src/shared/cards';
import { INVOKE_CHANNELS } from '../../src/shared/ipc';
import { ApprovalDraftSchema, ApprovalFieldsSchema, ChoiceCardSpecSchema } from '../../src/shared/schemas';
import { TID } from '../../src/shared/testids';
import type { ApprovalFields } from '../../src/shared/types';

const NOW = 1_760_000_000_000;

describe('fields_hash and nonce (08-2 §9.3)', () => {
  const fields: ApprovalFields = { verb: 'book', siteDomain: 'example.in', partySize: 2, irreversible: false };

  it('fields_hash is sha256 hex of the canonical JSON, whatever the key order', () => {
    const canonical = '{"irreversible":false,"partySize":2,"siteDomain":"example.in","verb":"book"}';
    const want = createHash('sha256').update(canonical).digest('hex');
    expect(fieldsHash(fields)).toBe(want);
    expect(fieldsHash({ irreversible: false, partySize: 2, verb: 'book', siteDomain: 'example.in' })).toBe(want);
    expect(fieldsHash({ ...fields, partySize: 3 })).not.toBe(want);
  });

  it('a nonce is 32 lower-case hex and never repeats', () => {
    const a = newNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newNonce()).not.toBe(a);
  });
});

describe('act schemas (08-4 §25.1, G-M5-07, X-125)', () => {
  const opt = (label: string, detail?: string) => (detail === undefined ? { label } : { label, detail });

  it('ChoiceCardSpec: question 1–90, label 1–40, detail ≤ 60, 2–4 options', () => {
    const ok = (spec: unknown) => ChoiceCardSpecSchema.safeParse(spec).success;
    expect(ok({ question: 'q'.repeat(90), options: [opt('a'.repeat(40), 'd'.repeat(60)), opt('b')] })).toBe(true);
    expect(ok({ question: 'q'.repeat(91), options: [opt('a'), opt('b')] })).toBe(false);
    expect(ok({ question: 'q', options: [opt('a'.repeat(41)), opt('b')] })).toBe(false);
    expect(ok({ question: 'q', options: [opt('a', 'd'.repeat(61)), opt('b')] })).toBe(false);
    expect(ok({ question: 'q', options: [opt('a')] })).toBe(false);
    expect(ok({ question: 'q', options: [opt('a'), opt('b'), opt('c'), opt('d'), opt('e')] })).toBe(false);
    expect(ok({ question: '', options: [opt('a'), opt('b')] })).toBe(false);
  });

  it('ApprovalFields is strict and ApprovalDraft never carries send', () => {
    expect(ApprovalFieldsSchema.safeParse({ verb: 'pay', amountPaise: 140000, irreversible: true }).success).toBe(true);
    expect(ApprovalFieldsSchema.safeParse({ verb: 'pay', irreversible: true, note: 'free text' }).success).toBe(false);
    const draft = (verb: string) => ({ verb, fields: { verb, irreversible: true }, evidence: [] });
    for (const v of ['book', 'buy', 'pay', 'delete']) expect(ApprovalDraftSchema.safeParse(draft(v)).success, v).toBe(true);
    for (const v of ['send', 'post', 'share', 'use_app']) expect(ApprovalDraftSchema.safeParse(draft(v)).success, v).toBe(false);
  });
});

describe('main ⇄ engine M5 rows (08-1 §2.4)', () => {
  it('main → engine: approval.changed, registry:add|remove, code.submit', () => {
    const ok = (m: unknown) => mainToEngineSchema.safeParse(m).success;
    expect(ok({ id: '1', kind: 'approval.changed', payload: { approvalId: 'ap_1', state: 'EXPIRED' } })).toBe(true);
    expect(ok({ id: '1', kind: 'approval.changed', payload: { approvalId: 'ap_1', state: 'expired' } })).toBe(false);
    expect(
      ok({
        id: '2',
        kind: 'registry:add',
        payload: { handle: 'h1', hash: 'abc', len: 8, value: 'sk-x', normalised: [], ttlMs: 600_000 },
      }),
    ).toBe(true);
    expect(ok({ id: '3', kind: 'registry:remove', payload: { handles: ['h1'] } })).toBe(true);
    expect(ok({ id: '4', kind: 'code.submit', payload: { requestId: 'r1', codeRef: 'h2' } })).toBe(true);
    expect(ok({ id: '4', kind: 'code.submit', payload: { requestId: 'r1', code: '123456' } })).toBe(false);
  });

  it('engine → main: approval.open (ApprovalDraft), approval.transition, vault.use purposes', () => {
    const ok = (m: unknown) => engineToMainSchema.safeParse(m).success;
    const draft = { verb: 'book', fields: { verb: 'book', irreversible: false }, evidence: [] };
    // M5 T7: the job and the card text ride with the draft (ApprovalGate.openFromEngine).
    const open = (d: unknown) => ({
      id: '1',
      kind: 'approval.open',
      payload: { jobId: 'j_1', draft: d, title: 'Book this table?', impact: 'x' },
    });
    expect(ok(open(draft))).toBe(true);
    expect(ok(open({ ...draft, verb: 'send' }))).toBe(false);
    expect(ok({ id: '1', kind: 'approval.open', payload: draft })).toBe(false);
    expect(ok({ id: '2', kind: 'approval.transition', payload: { approvalId: 'ap_1', to: 'RUNNING', data: { submittedAt: NOW } } })).toBe(
      true,
    );
    expect(ok({ id: '3', kind: 'vault.use', payload: { purpose: 'fill_card', name: '4242', jobId: 'j_1', approvalId: 'ap_1' } })).toBe(
      true,
    );
    expect(ok({ id: '3', kind: 'vault.use', payload: { purpose: 'read_value', name: '4242' } })).toBe(false);
  });
});

describe('renderer contract', () => {
  it('every M5 invoke channel of 08-1 §3.2 is declared', () => {
    for (const c of [
      'card:answer',
      'card:approve',
      'card:decline',
      'card:askAgain',
      'card:heldPick',
      'draft:update',
      'draft:send',
      'draft:undo',
      'draft:discard',
      'draft:openInApp',
      'secret:save',
      'secret:list',
      'secret:delete',
      'code:submit',
    ])
      expect(INVOKE_CHANNELS as readonly string[]).toContain(c);
  });

  it('the card roots and the controls the tickets need are in TID (08-0 §C)', () => {
    const ids = Object.values(TID) as string[];
    for (const id of [
      'card-choice',
      'card-choice-option',
      'card-choice-pager',
      'card-tiles',
      'card-approval',
      'card-approval-approve',
      'card-approval-not-now',
      'card-approval-ask-again',
      'card-approval-scope',
      'card-approval-held-option',
      'card-draft',
      'card-draft-send',
      'card-draft-undo',
      'card-secret',
      'card-secret-field',
      'card-secret-save',
      'dialog-c-22',
    ])
      expect(ids).toContain(id);
  });

  it('the five M5 card types are in CARD_VIEWS, and their states are the 08-0 §G.2 lists', () => {
    expect([...M5_CARD_TYPES].sort()).toEqual(['approval', 'choice', 'draft', 'secret', 'tiles']);
    const registry = readFileSync('src/renderer/cards/renderCard.tsx', 'utf8');
    for (const type of M5_CARD_TYPES) expect(registry, type).toMatch(new RegExp(`^  ${type}: \\w+,$`, 'm'));
    expect(isCardState('approval', 'PENDING')).toBe(true);
    expect(isCardState('approval', 'pending')).toBe(false);
    expect(isCardState('draft', 'undo_window')).toBe(true);
    expect(isCardState('secret', 'saved')).toBe(true);
    expect(isCardState('choice', 'auto_picked')).toBe(true);
  });
});

describe('FOO_TEST card seed (test:card.seed)', () => {
  let db: Db;
  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrate(db, 'src/main/store/migrations');
    db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_1', 'foo', 'foo', 1, 1)").run();
  });

  it('a choice card: message + card, no approval row', () => {
    const r = seedCard(db, { chatId: 'c_1', type: 'choice', state: 'asking', payload: { question: 'Which one?' } }, NOW);
    const card = db.prepare('SELECT type, state, message_id, nonce FROM cards WHERE id = ?').get(r.cardId);
    expect(card).toEqual({ type: 'choice', state: 'asking', message_id: r.messageId, nonce: r.nonce });
    expect(r.approvalId).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) FROM approvals').pluck().get()).toBe(0);
  });

  it('an approval card: approvals row PENDING with the verb’s expiry, card state mirrored, job needs_you', () => {
    const fields: ApprovalFields = { verb: 'book', siteDomain: 'example.in', irreversible: false };
    const r = seedCard(
      db,
      { chatId: 'c_1', type: 'approval', state: 'PENDING', payload: { title: 'Book this table?', approvalId: '' }, approval: { fields } },
      NOW,
    );
    const ap = db.prepare('SELECT * FROM approvals WHERE id = ?').get(r.approvalId) as Record<string, unknown>;
    expect(ap).toMatchObject({
      card_id: r.cardId,
      verb: 'book',
      state: 'PENDING',
      fields_hash: fieldsHash(fields),
      expires_at: NOW + 15 * 60_000,
    });
    const card = db.prepare('SELECT state, expires_at, payload FROM cards WHERE id = ?').get(r.cardId) as Record<string, unknown>;
    expect(card.state).toBe('PENDING');
    expect(card.expires_at).toBe(NOW + 15 * 60_000);
    expect(JSON.parse(String(card.payload)).approvalId).toBe(r.approvalId);
    expect(db.prepare('SELECT state FROM jobs WHERE id = ?').pluck().get(r.jobId)).toBe('needs_you');
  });

  it('a draft card keeps its own state and gets a 60 min send approval (08-0 §G.7)', () => {
    const r = seedCard(
      db,
      {
        chatId: 'c_1',
        type: 'draft',
        state: 'pending',
        payload: { approvalId: '', channel: 'email', body: 'Hi', edited: false, sendAllowed: true },
        approval: { fields: { verb: 'send', channel: 'email', irreversible: true } },
      },
      NOW,
    );
    expect(db.prepare('SELECT state FROM cards WHERE id = ?').pluck().get(r.cardId)).toBe('pending');
    expect(db.prepare('SELECT state, expires_at FROM approvals WHERE id = ?').get(r.approvalId)).toEqual({
      state: 'PENDING',
      expires_at: NOW + 60 * 60_000,
    });
  });

  it('a state the type does not have is refused and nothing is written', () => {
    expect(() => seedCard(db, { chatId: 'c_1', type: 'secret', state: 'PENDING', payload: {} }, NOW)).toThrow();
    expect(db.prepare('SELECT COUNT(*) FROM cards').pluck().get()).toBe(0);
  });
});
