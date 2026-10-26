// Spec: 08-1 §3.2 message:get / message:react / message:pin and the M2 gap channels message:edit / message:delete /
// message:retry (04 §6.2, §6.3, §7), §3.2 job:details, files:open PATH_NOT_ALLOWED ({DATA} only), 04 §6.3 (a deleted
// bubble stays as "You deleted this message"), §10.11 (the mirror's rows), 08-3 §22.9 seeds (UX-08 scene and the bubble
// gallery; PERF-04 mixes cards and images into the 5,000-message chat).
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { migrate, type Db } from '../../src/main/store/db';
import {
  chatOpen,
  deleteMessages,
  editMessage,
  jobDetails,
  messageGet,
  messageList,
  pinMessage,
  reactMessage,
  retryMessage,
} from '../../src/main/store/queries';
import { insideDir } from '../../src/main/windows/protocol';
import { writeSeedMedia } from '../../src/main/test/seed/media';
import { seedPerf, PERF_FOO_MESSAGES, PERF_MESSAGES } from '../../src/main/test/seed/perf';
import { seedUxWorld } from '../../src/main/test/seed/uxWorld';
import { MIN, SeedWriter, ist } from '../../src/main/test/seed/writer';
import { joinsRun, layoutRows } from '../../src/renderer/messages/runs';

const NOW = ist(2026, 10, 16, 9, 0);

function fresh(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

describe('message writes', () => {
  let db: Db;
  const ids: Record<string, string> = {};
  let chat = '';
  beforeAll(() => {
    db = fresh();
    const w = new SeedWriter(db, 1);
    db.transaction(() => {
      chat = w.chat({ kind: 'foo', title: 'foo', at: NOW }).chatId;
      ids.foo = w.message(chat, { author: 'foo', text: 'Cake is booked.', at: NOW - 20 * MIN });
      ids.voice = w.message(chat, { author: 'foo', kind: 'voice', voiceMs: 4000, at: NOW - 19 * MIN });
      ids.failed = w.message(chat, { author: 'user', text: 'also trains', at: NOW - 18 * MIN, status: 'failed' });
      ids.old = w.message(chat, { author: 'user', text: 'thanks!', at: NOW - 17 * MIN });
      ids.marker = w.message(chat, { author: 'system', kind: 'marker', markerKind: 'system_line', text: 'x', at: NOW - 6 * MIN });
      ids.latest = w.message(chat, { author: 'user', text: 'is Mon 2 Nov a holiday?', at: NOW - 5 * MIN });
    })();
    w.finish(NOW);
  });

  it('react: one reaction from the user on foo’s message; a new emoji replaces it; never on the user’s own', () => {
    const a = reactMessage(db, ids.foo!, '👍', true, NOW);
    expect(a.ok && a.row.reactions).toEqual([{ emoji: '👍', by: 'me' }]);
    const b = reactMessage(db, ids.foo!, '❤️', true, NOW);
    expect(b.ok && b.row.reactions).toEqual([{ emoji: '❤️', by: 'me' }]);
    expect(b.ok && a.ok && b.row.rev).toBe(a.ok ? a.row.rev + 1 : 0);
    const c = reactMessage(db, ids.foo!, '❤️', false, NOW);
    expect(c.ok && c.row.reactions).toEqual([]);
    expect(reactMessage(db, ids.latest!, '👍', true, NOW)).toEqual({ ok: false, reason: 'not_allowed' });
    expect(reactMessage(db, 'm_missing', '👍', true, NOW)).toEqual({ ok: false, reason: 'not_found' });
  });
  it('pin: voice notes only', () => {
    const r = pinMessage(db, ids.voice!, true);
    expect(r.ok && r.row.pinned).toBe(true);
    expect(pinMessage(db, ids.foo!, true)).toEqual({ ok: false, reason: 'not_allowed' });
  });
  it('edit: the latest user text within 15 minutes; never an older one, never after the window', () => {
    expect(editMessage(db, ids.old!, 'thank you!', NOW)).toEqual({ ok: false, reason: 'not_allowed' });
    expect(editMessage(db, ids.latest!, 'is Mon 2 Nov a bank holiday?', NOW + 11 * MIN)).toEqual({ ok: false, reason: 'not_allowed' });
    const r = editMessage(db, ids.latest!, 'is Mon 2 Nov a bank holiday?', NOW);
    expect(r.ok && [r.row.text, r.row.editedAt]).toEqual(['is Mon 2 Nov a bank holiday?', NOW]);
    expect(editMessage(db, ids.latest!, '   ', NOW)).toEqual({ ok: false, reason: 'not_allowed' });
  });
  it('retry: a failed user message goes back to queued; nothing else', () => {
    const r = retryMessage(db, ids.failed!);
    expect(r.ok && r.row.status).toBe('queued');
    expect(retryMessage(db, ids.foo!)).toEqual({ ok: false, reason: 'not_allowed' });
  });
  it('delete: soft, blanked on read, markers skipped; the list still carries the row for "You deleted this message"', () => {
    const r = deleteMessages(db, [ids.old!, ids.marker!, 'm_missing'], NOW);
    expect(r.chatIds).toEqual([chat]);
    expect(r.rows.map((m) => m.id)).toEqual([ids.old]);
    const row = messageGet(db, ids.old!)!;
    expect([row.deletedAt, row.text, row.reactions]).toEqual([NOW, '', []]);
    const list = messageList(db, chat, 50);
    expect(list.map((m) => m.id)).toContain(ids.old);
    expect(list.find((m) => m.id === ids.marker)!.deletedAt).toBeNull();
    expect(reactMessage(db, ids.old!, '👍', true, NOW).ok).toBe(false);
  });
  it('delete the newest message: the chat row takes a new rev and its last message is the one before (CR-0059 row 5)', () => {
    const before = db.prepare('SELECT rev, last_message_id FROM chats WHERE id = ?').get(chat) as { rev: number; last_message_id: string };
    expect(before.last_message_id).toBe(ids.latest);
    deleteMessages(db, [ids.latest!], NOW);
    const after = db.prepare('SELECT rev, last_message_id FROM chats WHERE id = ?').get(chat) as { rev: number; last_message_id: string };
    expect(after.rev).toBeGreaterThan(before.rev);
    expect(after.last_message_id).toBe(ids.marker);
  });
});

describe('files stay inside {DATA}', () => {
  it('insideDir accepts relative and absolute paths inside, refuses ../ and other roots', () => {
    const root = join(tmpdir(), 'foo-data');
    expect(insideDir(root, 'data/inbox/a.png')).toBe(join(root, 'data', 'inbox', 'a.png'));
    expect(insideDir(root, 'data\\inbox\\a.png')).toBe(join(root, 'data', 'inbox', 'a.png'));
    expect(insideDir(root, join(root, 'x.pdf'))).toBe(join(root, 'x.pdf'));
    expect(insideDir(root, '../secrets.txt')).toBeNull();
    expect(insideDir(root, '/etc/passwd')).toBeNull();
    expect(insideDir(root, root)).toBeNull();
    expect(insideDir(root, 'a\0b')).toBeNull();
  });
});

describe('the ux-world seed: the chapter 8 scene and the bubble gallery', () => {
  let db: Db;
  let refs: Record<string, string>;
  let media: ReturnType<typeof seedUxWorld>['media'];
  beforeAll(() => {
    db = fresh();
    ({ refs, media } = seedUxWorld(db, NOW));
  });

  it('chapter 8: 👍 on "thanks!", 👀 on the question, Punjabi tagged pa, the reply-quote and the rich answer', () => {
    expect(messageGet(db, refs.thanks!)!.reactions).toEqual([{ emoji: '👍', by: 'foo' }]);
    expect(messageGet(db, refs.holidayAsk!)!.badge).toBe('seen');
    expect(messageGet(db, refs.punjabi!)!.lang).toBe('pa');
    const q = messageGet(db, refs.replyQuote!)!;
    expect([q.badge, messageGet(db, q.replyToId!)!.text]).toEqual(['working', 'Cake from Theobroma is booked for Sun 18 Oct, 11:00 AM.']);
    expect(messageGet(db, refs.richAnswer!)!.text).toMatch(/^### Goa flights, Sat 12 Dec[\s\S]*\| Akasa Air[\s\S]*cite\+/);
  });
  it('the gallery has every state the list draws', () => {
    expect(messageGet(db, refs.galleryFailed!)!.status).toBe('failed');
    expect(messageGet(db, refs.galleryDeleted!)!.deletedAt).not.toBeNull();
    expect(messageGet(db, refs.galleryEdited!)!.editedAt).not.toBeNull();
    expect(messageGet(db, refs.galleryVoiceUser!)!.voicePath).toBe(`data/voice/${refs.galleryVoiceUser}.wav`);
    expect(messageGet(db, refs.galleryWhy!)!.prompted).toBe(false);
    expect(messageGet(db, refs.galleryBackup!)!.providerNote).toMatch(/ChatGPT/);
    const worked = messageGet(db, refs.galleryWorked!)!;
    const d = jobDetails(db, worked.jobId!, NOW)!;
    expect([d.steps.length, d.job.finishedAt! - d.job.startedAt!]).toEqual([1, 42_000]);
    const open = chatOpen(db, refs.trips!, NOW)!;
    expect(new Set(open.cards.map((c) => c.type))).toEqual(new Set(['table', 'file', 'link_preview', 'place']));
  });
  it('the family group has helper lines and a handoff marker pointing at Trips', () => {
    const rows = messageList(db, refs.family!, 50);
    const handoff = rows.find((m) => m.markerKind === 'handoff')!;
    expect(handoff.authorId).toBe(rows.find((m) => m.authorKind === 'helper' && m.text.includes('cab'))!.authorId);
  });
  it('media: images and voice notes are written under {DATA} only', () => {
    expect(media.filter((m) => m.kind === 'image')).toHaveLength(4);
    expect(media.filter((m) => m.kind === 'voice')).toHaveLength(2);
    const dir = mkdtempSync(join(tmpdir(), 'foo-seed-'));
    try {
      expect(writeSeedMedia(dir, [...media, { path: '../escape.svg', kind: 'image', label: 'x', hue: 0 }])).toBe(media.length);
      expect(existsSync(join(dir, '..', 'escape.svg'))).toBe(false);
      const wav = readFileSync(join(dir, media.find((m) => m.kind === 'voice')!.path));
      expect(wav.subarray(0, 4).toString()).toBe('RIFF');
      const svg = readFileSync(join(dir, media.find((m) => m.kind === 'image')!.path), 'utf8');
      expect(svg.startsWith('<svg')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the perf seed mixes bubbles, cards and images', () => {
  it('keeps its counts and gives the 5,000-message chat cards, images, rich answers and reactions', { timeout: 60_000 }, () => {
    const db = fresh();
    const r = seedPerf(db, NOW);
    expect(r.messages).toBe(PERF_MESSAGES);
    const foo = r.refs.foo!;
    const count = (sql: string) => db.prepare(sql).pluck().get(foo) as number;
    expect(count('SELECT COUNT(*) FROM messages WHERE chat_id = ?')).toBe(PERF_FOO_MESSAGES);
    for (const type of ['table', 'file', 'link_preview', 'place'])
      expect(db.prepare('SELECT COUNT(*) FROM cards WHERE chat_id = ? AND type = ?').pluck().get(foo, type)).toBeGreaterThan(10);
    expect(count("SELECT COUNT(*) FROM messages WHERE chat_id = ? AND attachments LIKE '%image/svg+xml%'")).toBeGreaterThan(50);
    expect(count("SELECT COUNT(*) FROM messages WHERE chat_id = ? AND text LIKE '%|---|%'")).toBeGreaterThan(10);
    expect(count('SELECT COUNT(*) FROM reactions r JOIN messages m ON m.id = r.message_id WHERE m.chat_id = ?')).toBeGreaterThan(50);
    expect(db.prepare("SELECT COUNT(*) FROM messages WHERE text LIKE '%taj%'").pluck().get()).toBe(12);
    expect(r.media.every((m) => m.path.startsWith('data/inbox/'))).toBe(true);
  });
});

describe('seeds can follow each other on one database (test:seed demo → perf → ux-world)', () => {
  it('keeps the message search index whole when a seed wipes a soft-deleted bubble', { timeout: 60_000 }, () => {
    const db = fresh();
    const integrity = () => db.prepare("INSERT INTO messages_fts(messages_fts) VALUES('integrity-check')").run();
    seedUxWorld(db, NOW);
    expect(db.prepare('SELECT COUNT(*) FROM messages WHERE deleted_at IS NOT NULL').pluck().get()).toBeGreaterThan(0);
    expect(() => seedPerf(db, NOW)).not.toThrow();
    expect(() => seedUxWorld(db, NOW)).not.toThrow();
    expect(() => seedUxWorld(db, NOW)).not.toThrow();
    expect(integrity).not.toThrow();
    const hits = (q: string) => db.prepare('SELECT COUNT(*) FROM messages_fts WHERE messages_fts MATCH ?').pluck().get(q);
    expect(hits('"wrong chat sorry"')).toBe(0); // the deleted bubble is not searchable
    expect(hits('mummy OR bill OR doctor')).toBeGreaterThan(0);
  });
});

describe('the bubble gallery has a run of the user’s images (SV-02 measures the last bubble of a run)', () => {
  it('joins the single photo and the grid of three into one run (04 §1.3: the earlier bubble carries no badge)', () => {
    const db = fresh();
    const { refs } = seedUxWorld(db, NOW);
    const list = messageList(db, refs.trips!, 200);
    const i = list.findIndex((m) => m.id === refs.galleryImage);
    expect(i).toBeGreaterThanOrEqual(0);
    const [photo, grid] = [list[i]!, list[i + 1]!];
    expect(grid.attachments?.length).toBe(3);
    expect(joinsRun(photo, grid)).toBe(true);
    const layout = layoutRows(
      list.map((m) => ({ kind: 'message' as const, key: m.id, message: m })),
      { chatKind: 'helper' },
    );
    expect(layout[i + 1]!.pos).toBe('last');
  });
});
