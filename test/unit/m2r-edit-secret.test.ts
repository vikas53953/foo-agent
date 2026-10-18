// Spec: Art. 8; 04 §6.2 (edit the last message); 04-2 §22.4 (the paste catcher runs "on every Send, over the whole text";
// "Send anyway" sends "•••• (hidden)"), §23.6 (10,000); 08-2 §11.4 R1 (main re-checks). M2 review D4 / S1: an edit passes the
// same catcher, redactor and limit as a Send, in the renderer and in main.
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { HIDDEN_FOR_AI, SEND_TEXT_LIMIT } from '../../src/main/store/composerQueries';
import { migrate, type Db } from '../../src/main/store/db';
import { editMessage } from '../../src/main/store/queries';
import { MIN, SeedWriter, ist } from '../../src/main/test/seed/writer';
import { TEXT_LIMIT } from '../../src/shared/attachmentRules';
import { t } from '../../src/shared/copy/t';
import { editSubmission, type Segment } from '../../src/renderer/composer/fieldModel';

const NOW = ist(2026, 10, 16, 9, 0);
const KEY = 'sk-proj-abcdEFGHijklMNOPqrstUVWXyz0123456789';
const HIDDEN = t('composer.paste.hidden_in_bubble');

describe('message:edit in main re-checks like message:send (R1)', () => {
  let db: Db;
  let id = '';
  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrate(db);
    const w = new SeedWriter(db, 1);
    db.transaction(() => {
      const chat = w.chat({ kind: 'foo', title: 'foo', at: NOW }).chatId;
      id = w.message(chat, { author: 'user', text: 'my key is coming', at: NOW - 2 * MIN });
    })();
    w.finish(NOW);
  });
  const stored = () =>
    db.prepare('SELECT text, text_for_ai FROM messages WHERE id = ?').get(id) as { text: string; text_for_ai: string | null };

  it('refuses a secret with the PasteCatch and leaves the message as it was', () => {
    const r = editMessage(db, id, `here it is ${KEY}`, NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('secret');
    expect(!r.ok && r.reason === 'secret' && r.paste.kind).toBe('ai_key');
    expect(stored().text).toBe('my key is coming');
  });

  it('refuses a card number too (the same P1–P17 set)', () => {
    const r = editMessage(db, id, 'card 4111 1111 1111 1111', NOW);
    expect(!r.ok && r.reason).toBe('secret');
  });

  it('"Send anyway" text (spans already hidden) is stored and the AI reads the hidden note', () => {
    const r = editMessage(db, id, `here it is ${HIDDEN}`, NOW);
    expect(r.ok).toBe(true);
    expect(stored()).toEqual({ text: `here it is ${HIDDEN}`, text_for_ai: `here it is ${HIDDEN_FOR_AI}` });
  });

  it('refuses text over the 10,000 limit (same as send)', () => {
    expect(editMessage(db, id, 'a'.repeat(SEND_TEXT_LIMIT + 1), NOW)).toEqual({ ok: false, reason: 'too_long' });
    expect(editMessage(db, id, 'a'.repeat(SEND_TEXT_LIMIT), NOW).ok).toBe(true);
  });
});

describe('Save edit in the renderer passes the paste catcher and the limit', () => {
  const text = (s: string): Segment[] => [{ kind: 'text', text: s }];
  const base = { limit: TEXT_LIMIT, hidden: HIDDEN, trim: (s: string) => s.trim() };

  it('a caught secret opens the catch instead of saving', () => {
    let checked = 0;
    const r = editSubmission(text(`key ${KEY}`), { ...base, override: false, check: () => (++checked, true) });
    expect(r).toEqual({ kind: 'catch' });
    expect(checked).toBe(1);
  });

  it('"Send anyway" saves masks as "•••• (hidden)", never dropping them', () => {
    const segs: Segment[] = [
      { kind: 'text', text: 'key ' },
      { kind: 'mask', id: 'k1' },
    ];
    const r = editSubmission(segs, { ...base, override: true, check: () => true });
    expect(r).toEqual({ kind: 'save', text: `key ${HIDDEN}` });
  });

  it('over the limit or blank does nothing; clean text saves', () => {
    expect(editSubmission(text('a'.repeat(TEXT_LIMIT + 1)), { ...base, override: false, check: () => false })).toEqual({ kind: 'skip' });
    expect(editSubmission(text('   '), { ...base, override: false, check: () => false })).toEqual({ kind: 'skip' });
    expect(editSubmission(text(' fine '), { ...base, override: false, check: () => false })).toEqual({ kind: 'save', text: 'fine' });
  });
});
