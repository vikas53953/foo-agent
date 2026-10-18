// Spec: 08-1 §3.2 message:send (R1 re-check → SECRET_SUSPECTED with the PasteCatch; "Send anyway" stores "•••• (hidden)" and
// the hidden note for the AI), composer:saveDraft (redacted; empty deletes; ChatRow.hasDraft / lastLine "Draft: …", §3.4),
// voice:submit (VOICE_TOO_SHORT), 04 §3.3 (Waiting to send while foo cannot hand it on), 04-2 §21.3 (trim), §23.6 (10,000),
// 08-1 §0.7.1 safeName, files:stage limits (04-2 §22.6).
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Inbox } from '../../src/main/data/inbox';
import { migrate, type Db } from '../../src/main/store/db';
import {
  HIDDEN_FOR_AI,
  saveDraft,
  sendMessage,
  submitVoice,
  textLang,
  trimBlankLines,
  type SendContext,
} from '../../src/main/store/composerQueries';
import { chatOpen, chatRowById } from '../../src/main/store/queries';
import { SeedWriter, ist } from '../../src/main/test/seed/writer';
import { safeName } from '../../src/shared/safeName';

const NOW = ist(2026, 10, 16, 9, 0);
let n = 0;
const ctx = (over: Partial<SendContext> = {}): SendContext => ({
  now: NOW,
  newId: () => `m_b_${++n}`,
  waiting: false,
  attachment: () => undefined,
  ...over,
});
const listCtx = { now: NOW, agentName: 'foo', draftPrefix: 'Draft:' };

describe('message:send (main)', () => {
  let db: Db;
  let chat = '';
  let other = '';
  beforeAll(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrate(db);
    const w = new SeedWriter(db, 1);
    db.transaction(() => {
      chat = w.chat({ kind: 'foo', title: 'foo', at: NOW }).chatId;
      other = w.chat({ kind: 'foo', title: 'other', at: NOW }).chatId;
      w.message(chat, { author: 'foo', text: 'Hi', at: NOW - 60_000 });
    })();
    w.finish(NOW);
  });

  it('trims leading and trailing blank lines and keeps inner ones; spaces only never send', () => {
    expect(trimBlankLines('\n\n  hi\n\nthere  \n\n')).toBe('  hi\n\nthere  ');
    expect(sendMessage(db, { chatId: chat, clientId: 'e1', text: '   \n  ' }, ctx())).toEqual({ ok: false, reason: 'empty' });
  });

  it('writes the next seq, ✓ Sent, moves the chat on', () => {
    const r = sendMessage(db, { chatId: chat, clientId: 's1', text: 'book the Goa hotel' }, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.status).toBe('sent');
    expect(r.row.authorKind).toBe('user');
    expect(r.row.seq).toBe(2);
    expect(r.row.lang).toBe('en');
    const row = chatRowById(db, listCtx, chat)!;
    expect(row.lastMessageId).toBe(r.messageId);
  });

  it('is Waiting to send (queued) while foo cannot hand it on', () => {
    const r = sendMessage(db, { chatId: chat, clientId: 'q1', text: 'later' }, ctx({ waiting: true }));
    expect(r.ok && r.queued && r.row.status === 'queued').toBe(true);
  });

  it('refuses a secret with the catch (R1) and stores nothing', () => {
    const text = 'my key sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
    const r = sendMessage(db, { chatId: chat, clientId: 'x1', text }, ctx());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('secret');
    expect(r.paste).toMatchObject({ start: 7, end: text.length, kind: 'ai_key' });
    expect(db.prepare("SELECT COUNT(*) FROM messages WHERE client_id = 'x1'").pluck().get()).toBe(0);
  });

  it('"Send anyway" keeps "•••• (hidden)" and gives the AI the hidden note', () => {
    const r = sendMessage(
      db,
      { chatId: chat, clientId: 'x2', text: 'my key sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 thanks', secretOverride: true },
      ctx(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.text).toBe('my key •••• (hidden) thanks');
    const ai = db.prepare('SELECT text_for_ai FROM messages WHERE id = ?').pluck().get(r.messageId);
    expect(ai).toBe(`my key ${HIDDEN_FOR_AI} thanks`);
    expect(JSON.stringify(db.prepare('SELECT * FROM messages').all())).not.toContain('sk-proj-');
  });

  it('a code right after foo asked for one is caught (P16)', () => {
    const r = sendMessage(db, { chatId: chat, clientId: 'o1', text: '482 913' }, ctx({ askedForCode: true }));
    expect(!r.ok && r.reason === 'secret').toBe(true);
  });

  it('refuses over 10,000 characters and a reply into another chat', () => {
    expect(sendMessage(db, { chatId: chat, clientId: 'l1', text: 'a'.repeat(10_001) }, ctx())).toEqual({ ok: false, reason: 'too_long' });
    const target = sendMessage(db, { chatId: other, clientId: 'r0', text: 'there' }, ctx());
    expect(target.ok).toBe(true);
    if (!target.ok) return;
    expect(sendMessage(db, { chatId: chat, clientId: 'r1', text: 'x', replyToId: target.messageId }, ctx()).ok).toBe(false);
  });

  it('tags Hindi and Punjabi text', () => {
    expect(textLang('कल सुबह की ट्रेन बुक करो')).toBe('hi');
    expect(textLang('ਕੱਲ੍ਹ ਦੀ ਟਿਕਟ')).toBe('pa');
    expect(textLang('book it')).toBe('en');
  });

  it('drafts: saved redacted, shown as "Draft: …", returned by chat:open, deleted when emptied and on Send', () => {
    const d = { now: NOW, newId: () => `dr_${++n}`, attachment: () => undefined };
    const a = saveDraft(db, { chatId: chat, text: 'call mom\nlater', attachmentIds: [], linkPreviewRemoved: false }, d);
    expect(a?.changed).toBe(true);
    expect(chatRowById(db, listCtx, chat)!.lastLine).toBe('Draft: call mom');
    expect(chatRowById(db, listCtx, chat)!.hasDraft).toBe(true);
    expect(chatOpen(db, chat, NOW)!.draft?.text).toBe('call mom\nlater');
    expect(saveDraft(db, { chatId: chat, text: 'call mom\nlater', attachmentIds: [], linkPreviewRemoved: false }, d)?.changed).toBe(false);
    saveDraft(db, { chatId: chat, text: 'pin 4821 for the gate', attachmentIds: [], linkPreviewRemoved: false }, d);
    expect(chatOpen(db, chat, NOW)!.draft?.text).toBe('•••• for the gate');
    const e = saveDraft(db, { chatId: chat, text: '', attachmentIds: [], linkPreviewRemoved: false }, d);
    expect(e).toEqual({ changed: true, draft: null });
    saveDraft(db, { chatId: chat, text: 'again', attachmentIds: [], linkPreviewRemoved: false }, d);
    sendMessage(db, { chatId: chat, clientId: 'd1', text: 'again' }, ctx());
    expect(chatOpen(db, chat, NOW)!.draft).toBeNull();
  });

  it('voice:submit refuses under 0.5 s and writes a voice row', () => {
    expect(
      submitVoice(
        db,
        { chatId: chat, messageId: 'm_v0', voicePath: 'data/voice/m_v0.webm', durationMs: 300 },
        { now: NOW, waiting: false },
      ),
    ).toEqual({ ok: false, reason: 'too_short' });
    const r = submitVoice(
      db,
      { chatId: chat, messageId: 'm_v1', voicePath: 'data/voice/m_v1.webm', durationMs: 4_000 },
      { now: NOW, waiting: false },
    );
    expect(r.ok && r.row.kind === 'voice' && r.row.voiceMs === 4_000 && r.row.status === 'sent').toBe(true);
  });
});

describe('files:stage (main)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'foo-inbox-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const inbox = new Inbox(dir);

  it('writes {attachmentId}-{safeName} under data/inbox and refuses programs, zips and > 25 MB', () => {
    const r = inbox.stage('att_1', 'ticket?.pdf', new Uint8Array([1, 2, 3]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.attachment).toMatchObject({ path: 'data/inbox/att_1-ticket-.pdf', kind: 'pdf', mime: 'application/pdf', bytes: 3 });
    expect(readFileSync(join(dir, r.attachment.path))).toHaveLength(3);
    expect(inbox.stage('att_2', 'setup.exe', new Uint8Array(1))).toEqual({ ok: false, reason: 'type' });
    expect(inbox.stage('att_3', 'photos.zip', new Uint8Array(1))).toEqual({ ok: false, reason: 'type' });
    expect(inbox.stage('att_4', 'big.png', new Uint8Array(25 * 1024 * 1024 + 1))).toEqual({ ok: false, reason: 'too_big' });
  });

  it('moves a recording to data/voice/{messageId}.webm', () => {
    expect(inbox.stage('att_v', 'voice.webm', new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])).ok).toBe(true);
    const path = inbox.moveToVoice('att_v', 'm_9');
    expect(path).toBe('data/voice/m_9.webm');
    expect(existsSync(join(dir, path!))).toBe(true);
  });

  it('safeName follows 08-1 §0.7.1', () => {
    expect(safeName('  a<b>:c.txt. ')).toBe('a-b-c.txt');
    expect(safeName('CON.txt')).toBe('_CON.txt');
    expect(safeName('...')).toBe('file');
    expect(safeName(`${'x'.repeat(200)}.pdf`)).toHaveLength(120);
    expect(safeName('a  ·  b.png')).toBe('a - b.png');
  });
});
