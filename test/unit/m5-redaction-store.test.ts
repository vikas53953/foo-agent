// Spec: 08-1 §4.6 rule 2 (every listed text column is written only through Store.writeRedacted or a DbOp's `redact` list),
// 08-2 §11.4 R1 (main re-checks the composer) / R2 (DB text) and the registry scrub, §11.5 + 04-2 §22.4 ("Send anyway":
// the bubble and the store show "•••• (hidden)", the AI gets "[the user typed a secret; it was hidden]", the value is
// registered and nothing else keeps it), X-114 (a typed code stays in the registry 10 minutes). Made-up secrets only.
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DbOp } from '../../src/engine/protocol';
import { applyDbOps } from '../../src/main/engine-supervisor/engineHost';
import { mainRegistry, registerSecretValue } from '../../src/main/secrets/registerValue';
import { HIDDEN_FOR_AI, saveDraft, sendMessage } from '../../src/main/store/composerQueries';
import { migrate, type Db } from '../../src/main/store/db';
import { editMessage } from '../../src/main/store/queries';
import { REDACTED_COLUMNS, redactRow, writeRedacted } from '../../src/main/store/writeRedacted';

const NOW = 1_760_000_000_000;
const CANARY = 'sk-proj-FAKE0canary0T3redaction00000000';
const LOGIN = 'tulsi-garden-T3-fake';
let db: Db;
let n = 0;

const ctx = (over: { askedForCode?: boolean } = {}) => ({
  now: NOW,
  newId: () => `m_${++n}`,
  waiting: false,
  attachment: () => undefined,
  ...over,
});
const dump = () =>
  JSON.stringify(
    ['messages', 'drafts', 'tool_calls', 'activity', 'cards', 'suggestions'].map((t) => db.prepare(`SELECT * FROM ${t}`).all()),
  );

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db, 'src/main/store/migrations');
  db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_1', 'foo', 'foo', ?, ?)").run(NOW, NOW);
  mainRegistry().clear();
});

describe('R2: Store.writeRedacted on every §4.6 rule 2 column', () => {
  it('lists exactly the rule 2 columns', () => {
    expect(REDACTED_COLUMNS).toEqual({
      messages: ['text', 'text_for_ai', 'transcript'],
      drafts: ['text'],
      tool_calls: ['args', 'result'],
      activity: ['summary', 'fields'],
      cards: ['payload'],
      suggestions: ['text'],
    });
  });

  it.each(Object.entries(REDACTED_COLUMNS).flatMap(([table, cols]) => cols.map((col) => [table, col])))(
    '%s.%s: a pattern secret and a registered value are scrubbed, as text and as JSON',
    (table, col) => {
      registerSecretValue(LOGIN, { kind: 'login' });
      const text = redactRow(table!, { [col!]: `key ${CANARY} login ${LOGIN}` });
      expect(text[col!]).toBe('key [hidden] login [hidden]');
      const json = redactRow(table!, { [col!]: JSON.stringify({ a: [CANARY], b: { c: LOGIN }, n: 3 }) });
      expect(JSON.parse(String(json[col!]))).toEqual({ a: ['[hidden]'], b: { c: '[hidden]' }, n: 3 });
    },
  );

  it('JSON or text is decided by the column, never by sniffing the value', () => {
    // A message that starts with "{" is text: redacted as written, not parsed and re-serialised.
    const msg = `{ note } key ${CANARY}`;
    expect(redactRow('messages', { text: msg }).text).toBe('{ note } key [hidden]');
    const looksJson = `{"a": "${CANARY}"}`;
    expect(redactRow('messages', { text: looksJson }).text).toBe('{"a": "[hidden]"}');
    // A JSON column that does not parse is still redacted, whole.
    expect(redactRow('tool_calls', { args: `{broken ${CANARY}` }).args).toBe('{broken [hidden]');
    expect(JSON.parse(String(redactRow('activity', { fields: JSON.stringify({ to: CANARY }) }).fields))).toEqual({ to: '[hidden]' });
  });

  it('card numbers keep their last 4; ordinary text is unchanged', () => {
    expect(writeRedacted('card 4111 1111 1111 1111 ok')).toBe('card •••• 1111 ok');
    expect(writeRedacted('Train 12951 leaves 16 Oct at 5:00 PM, ₹1,250')).toBe('Train 12951 leaves 16 Oct at 5:00 PM, ₹1,250');
  });

  it('engine db.tx writes (messages text and AI text, cards, tool calls, activity) land redacted', () => {
    registerSecretValue(LOGIN, { kind: 'login' });
    const ops: DbOp[] = [
      {
        op: 'insert',
        table: 'messages',
        row: {
          id: 'm_a',
          chat_id: 'c_1',
          author_kind: 'foo',
          kind: 'text',
          text: `saved ${LOGIN}`,
          text_for_ai: CANARY,
          status: 'complete',
          created_at: NOW,
        },
      },
      {
        op: 'insert',
        table: 'messages',
        row: { id: 'm_c', chat_id: 'c_1', author_kind: 'foo', kind: 'card', card_id: 'k_1', status: 'complete', created_at: NOW },
      },
      {
        op: 'insert',
        table: 'cards',
        row: {
          id: 'k_1',
          chat_id: 'c_1',
          message_id: 'm_c',
          type: 'brief',
          state: 'open',
          payload: { body: CANARY },
          nonce: 'n1',
          created_at: NOW,
        },
      },
      {
        op: 'insert',
        table: 'jobs',
        row: {
          id: 'j_1',
          chat_id: 'c_1',
          origin_chat_id: 'c_1',
          owner_kind: 'foo',
          title: 'x',
          origin: 'user',
          intent: 'read_only',
          state: 'working',
          created_at: NOW,
        },
      },
      {
        op: 'insert',
        table: 'tool_calls',
        row: {
          id: 'tc_1',
          job_id: 'j_1',
          tool: 'web.search',
          action_class: 'read',
          side_effect: 0,
          args: { q: LOGIN },
          result: { r: CANARY },
          gate: 'auto',
          started_at: NOW,
        },
      },
      {
        op: 'activity',
        row: {
          kind: 'stopped',
          event: 'stopped_job',
          actor: 'user',
          chatId: 'c_1',
          chatTitle: 'foo',
          jobId: 'j_1',
          approvalId: null,
          paymentId: null,
          routineId: null,
          summary: `login ${LOGIN}`,
          toLabel: null,
          fromLabel: null,
          amountPaise: null,
          approvedHow: 'user',
          ruleText: null,
          proofKind: null,
          proofRef: null,
          outcome: 'done',
          fields: { k: CANARY },
        },
      },
      { op: 'update', table: 'messages', id: 'm_a', set: { text: `again ${CANARY}` } },
    ];
    const dataDir = mkdtempSync(join(tmpdir(), 'foo-t3-'));
    const r = applyDbOps(db, ops, { now: NOW, dataDir });
    expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
    const all = dump();
    expect(all).not.toContain(CANARY);
    expect(all).not.toContain(LOGIN);
    const jsonl = readFileSync(join(dataDir, 'activity.jsonl'), 'utf8');
    expect(jsonl).toContain('login [hidden]');
    expect(jsonl).not.toContain(CANARY);
    expect(db.prepare("SELECT text, text_for_ai FROM messages WHERE id = 'm_a'").get()).toEqual({
      text: 'again [hidden]',
      text_for_ai: '[hidden]',
    });
  });

  it('a draft and an edit are stored redacted', () => {
    registerSecretValue(LOGIN, { kind: 'login' });
    saveDraft(
      db,
      { chatId: 'c_1', text: `use ${LOGIN}`, attachmentIds: [], linkPreviewRemoved: false },
      { now: NOW, newId: () => 'dr_1', attachment: () => undefined },
    );
    expect(db.prepare('SELECT text FROM drafts').pluck().get()).toBe('use [hidden]');
    const s = sendMessage(db, { chatId: 'c_1', clientId: 'e1', text: 'see you at 5' }, ctx());
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(editMessage(db, s.messageId, `my login ${LOGIN}`, NOW + 1000).ok).toBe(true);
    expect(db.prepare('SELECT text FROM messages WHERE id = ?').pluck().get(s.messageId)).toBe('my login [hidden]');
  });
});

describe('R1: message:send re-check and "Send anyway"', () => {
  it('without Send anyway a secret is refused and nothing is written', () => {
    const r = sendMessage(db, { chatId: 'c_1', clientId: 'a1', text: `key ${CANARY}` }, ctx());
    expect(r).toMatchObject({ ok: false, reason: 'secret' });
    expect(dump()).not.toContain(CANARY);
  });

  it('Send anyway where main\'s re-check catches a secret the composer missed: stored "•••• (hidden)", AI placeholder, value registered', () => {
    const r = sendMessage(db, { chatId: 'c_1', clientId: 'a2', text: `my key ${CANARY} thanks`, secretOverride: true }, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(db.prepare('SELECT text, text_for_ai FROM messages WHERE id = ?').get(r.messageId)).toEqual({
      text: 'my key •••• (hidden) thanks',
      text_for_ai: `my key ${HIDDEN_FOR_AI} thanks`,
    });
    expect(
      mainRegistry()
        .forms()
        .map((f) => f.form),
    ).toContain(CANARY);
    expect(dump()).not.toContain(CANARY);
  });

  it('a code typed right after foo asked for one is registered for 10 minutes, so a later echo without the OTP word is hidden', () => {
    const r = sendMessage(db, { chatId: 'c_1', clientId: 'a3', text: '482913', secretOverride: true }, ctx({ askedForCode: true }));
    expect(r.ok).toBe(true);
    expect(writeRedacted('the bank took 482913 fine')).toBe('the bank took [hidden] fine');
  });

  it('Send anyway as it really arrives (the composer already masked the span): stored as sent, AI placeholder, nothing registered', () => {
    const r = sendMessage(db, { chatId: 'c_1', clientId: 'a4', text: 'my key •••• (hidden) thanks', secretOverride: true }, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(db.prepare('SELECT text, text_for_ai FROM messages WHERE id = ?').get(r.messageId)).toEqual({
      text: 'my key •••• (hidden) thanks',
      text_for_ai: `my key ${HIDDEN_FOR_AI} thanks`,
    });
    expect(mainRegistry().size).toBe(0);
  });
});

// M5 T4 (proposed G-M5-25): a JSON leaf that is exactly a foo id (08-0 §E.7) is not a P17 secret; ids around it still are.
describe('R2: foo ids in JSON columns', () => {
  it('a card payload keeps its approval and job ids; a key next to them is still hidden', () => {
    const id = 'ap_01a142c2-6ac0-74eb-a023-d38efbc37e5f';
    const row = redactRow('cards', {
      payload: JSON.stringify({ approvalId: id, jobId: 'j_01a142c2-6ac0-74eb-a023-d38efbc37e60', note: CANARY }),
    });
    expect(JSON.parse(String(row.payload))).toEqual({ approvalId: id, jobId: 'j_01a142c2-6ac0-74eb-a023-d38efbc37e60', note: '[hidden]' });
    // In free text the id is not a whole leaf, so the text column keeps the P17 rule unchanged.
    expect(redactRow('messages', { text: `id ${id}` }).text).toBe('id [hidden]');
  });
});
