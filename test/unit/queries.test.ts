// Spec: 08-1 §3.2 app:getBootstrap and §3.4 chat:list (rows derived from the DB, Article 12), 03-shell-1 §3.4.5–§3.4.8
// (pill precedence, preview rules, order, pins), 08-3 §22.9 `demo` seed, 03-shell-1 §3.11.4 (Money above foo and Trips).
import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { migrate, type Db } from '../../src/main/store/db';
import {
  bootstrap,
  chatOpen,
  chatRowById,
  derivePill,
  derivePreview,
  ensureFooChat,
  fooChatId,
  listChats,
  pinChat,
  plainLine,
  recomputePill,
  spendSummary,
  tickOf,
} from '../../src/main/store/queries';
import { ist } from '../../src/main/test/seed/writer';
import { seedUxWorld, uxWorldSettings } from '../../src/main/test/seed/uxWorld';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import { orderChats } from '../../src/renderer/chatlist/rules';

const NOW = ist(2026, 10, 16, 9, 0);
const ctx = { now: NOW, agentName: 'foo', draftPrefix: 'Draft:' };

function fresh(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

describe('derivePill (03-shell-1 §3.4.5 precedence)', () => {
  const job = (state: string, finishedAt: number | null = null) => ({ state, finishedAt }) as never;
  it('Needs you wins over everything', () => {
    expect(derivePill({ jobs: [job('needs_you'), job('waiting'), job('working')], cards: [] }, NOW).pill).toBe('needs_you');
    expect(derivePill({ jobs: [job('working')], cards: [{ type: 'payment', state: 'PENDING' }] }, NOW).pill).toBe('needs_you');
  });
  it('Paused beats Working; Working beats Done', () => {
    expect(derivePill({ jobs: [job('waiting'), job('working')], cards: [] }, NOW).pill).toBe('paused');
    expect(derivePill({ jobs: [job('queued'), job('done', NOW - 1000)], cards: [] }, NOW).pill).toBe('working');
  });
  it('Done lasts 24 h, then no pill', () => {
    const d = derivePill({ jobs: [job('done', NOW - 1000)], cards: [] }, NOW);
    expect(d).toEqual({ pill: 'done', pillUntil: NOW - 1000 + 86_400_000 });
    expect(derivePill({ jobs: [job('done', NOW - 86_400_001)], cards: [] }, NOW).pill).toBeNull();
  });
  it('a settled card does not need you', () => {
    expect(derivePill({ jobs: [], cards: [{ type: 'payment', state: 'COMPLETED' }] }, NOW).pill).toBeNull();
  });
});

describe('preview helpers (03-shell-1 §3.4.6)', () => {
  const input = (over: Record<string, unknown>) =>
    ({ chatKind: 'helper', jobs: [], waitingCards: [], lastFinished: null, last: null, wa: null, ...over }) as never;
  const msg = (over: Record<string, unknown>) => ({
    authorKind: 'foo',
    authorName: null,
    kind: 'text',
    text: 'Hi',
    status: 'sent',
    badge: null,
    voiceMs: null,
    attachments: null,
    card: null,
    ...over,
  });
  it('strips markdown and joins lines', () => {
    expect(plainLine('**Booked**\nfor _Fri_')).toBe('Booked for Fri');
  });
  it('CR-0061: a table reads as its cells, never as raw | and --- markdown', () => {
    const table = 'Here:\n| Plan | Price | Data |\n|---|:---:|---|\n| Airtel | ₹649 | 75 GB |\n| Jio | ₹599 | 60 GB |';
    expect(plainLine(table)).toBe('Here: Plan · Price · Data Airtel · ₹649 · 75 GB Jio · ₹599 · 60 GB');
    expect(plainLine('Pick one | or the other')).toBe('Pick one | or the other');
    expect(plainLine('Plan | Price\n--- | ---\nA | 1')).toBe('Plan · Price A · 1');
    expect(plainLine('| Only |\n|---|\n| one |')).toBe('Only one');
    expect(plainLine('Intro\n\n---\n\nEnd')).not.toContain('·');
  });
  it('maps message status to the tick', () => {
    expect(tickOf({ status: 'queued', badge: null } as never)).toBe('waiting');
    expect(tickOf({ status: 'failed', badge: null } as never)).toBe('not_sent');
    expect(tickOf({ status: 'sent', badge: 'done' } as never)).toBe('read');
    expect(tickOf({ status: 'complete', badge: null } as never)).toBe('read');
  });
  it('rule order: working › waiting card › failed › mine', () => {
    const working = { state: 'working', title: 'Flights for 12 Dec', createdAt: 1 };
    const card = { type: 'payment', title: '₹14,600 to Taj Holiday Village' };
    expect(derivePreview(input({ jobs: [working], waitingCards: [card] }), NOW)).toEqual({
      rule: 'working',
      jobTitle: 'Flights for 12 Dec',
    });
    expect(derivePreview(input({ waitingCards: [card] }), NOW)).toEqual({ rule: 'needs_ok', title: card.title });
    const failed = { state: 'failed', finishedAt: NOW - 1000, failureLine: 'IRCTC didn’t accept it. Nothing was booked.' };
    expect(derivePreview(input({ lastFinished: failed, last: msg({}) }), NOW)).toMatchObject({ rule: 'failed' });
    expect(derivePreview(input({ last: msg({ authorKind: 'user' }) }), NOW)).toMatchObject({ rule: 'mine', tick: 'sent' });
  });
  it('group sender and WhatsApp mirror sender', () => {
    expect(derivePreview(input({ chatKind: 'group', last: msg({ authorName: 'foo', text: 'Mom’s cake is ordered 🎂' }) }), NOW)).toEqual({
      rule: 'sender',
      sender: 'foo',
      body: { kind: 'text', text: 'Mom’s cake is ordered 🎂' },
    });
    expect(derivePreview(input({ chatKind: 'wa_mirror', wa: { senderLabel: 'Priya', text: 'Lift is fixed' } }), NOW)).toMatchObject({
      rule: 'sender',
      sender: 'Priya',
    });
  });
});

describe('queries on the demo world', () => {
  let db: Db;
  let refs: Record<string, string>;
  beforeAll(() => {
    db = fresh();
    refs = seedUxWorld(db).refs;
  });

  it('seeds every chat the list needs', () => {
    const rows = listChats(db, ctx);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[refs.foo!]?.kind).toBe('foo');
    expect(byId[refs.society!]?.kind).toBe('wa_mirror');
    expect(byId[refs.family!]?.kind).toBe('group');
    expect(fooChatId(db)).toBe(refs.foo);
  });

  it('pills follow the jobs (foo needs you, Trips working, Home done)', () => {
    expect(chatRowById(db, ctx, refs.foo!)?.pill).toBe('needs_you');
    expect(chatRowById(db, ctx, refs.trips!)?.pill).toBe('working');
    expect(chatRowById(db, ctx, refs.society!)?.pill).toBeNull();
  });

  it('previews: working job, group sender, WhatsApp sender', () => {
    expect(chatRowById(db, ctx, refs.trips!)?.list.preview).toEqual({ rule: 'working', jobTitle: 'Flights for 12 Dec' });
    const fam = chatRowById(db, ctx, refs.family!)?.list.preview;
    expect(fam?.rule).toBe('sender');
    expect(chatRowById(db, ctx, refs.society!)?.list.preview.rule).toBe('sender');
  });

  it('filters and search match main and renderer rules', () => {
    const needs = listChats(db, ctx, 'needs_you').map((r) => r.id);
    expect(needs).toContain(refs.foo);
    expect(listChats(db, ctx, 'working').map((r) => r.id)).toContain(refs.trips);
    expect(listChats(db, ctx, 'all', 'TRIPS').map((r) => r.id)).toEqual([refs.trips]);
  });

  it('3.11.4: a chat that needs you sorts above foo and pinned chats', () => {
    db.prepare("UPDATE jobs SET state = 'needs_you' WHERE id = ?").run(refs.moneyJob);
    recomputePill(db, refs.money!, NOW);
    pinChat(db, refs.trips!, true, NOW);
    const order = orderChats(listChats(db, ctx), NOW).map((r) => r.id);
    const money = order.indexOf(refs.money!);
    expect(money).toBeGreaterThanOrEqual(0);
    expect(money).toBeLessThan(order.indexOf(refs.trips!));
  });

  it('pins are limited to 3 user chats', () => {
    const ids = [refs.trips, refs.money, refs.home, refs.family] as string[];
    const results = ids.map((id) => pinChat(db, id, true, NOW));
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
    expect(results[3]).toMatchObject({ ok: false });
  });

  it('chat:open returns the newest page and the jobs', () => {
    const open = chatOpen(db, refs.foo!, NOW);
    expect(open?.messages.length).toBeGreaterThan(0);
    expect(open?.jobs.some((j) => j.id === refs.goaJob)).toBe(true);
  });

  it('bootstrap: settings, open chat, spend', () => {
    const settings = uxWorldSettings(structuredClone(settingsDefaults), refs, NOW);
    const b = bootstrap(db, { ...ctx, settings, offline: false });
    expect(b.chats.length).toBeGreaterThanOrEqual(8);
    expect(b.settings.setup.complete).toBe(true);
    expect(spendSummary(db, settings, NOW).aiSpentPaise).toBe(21_200);
  });

  it('ensureFooChat keeps the one foo chat', () => {
    expect(ensureFooChat(db, NOW, 'foo', 'c_new')).toBe(refs.foo);
    const empty = fresh();
    expect(ensureFooChat(empty, NOW, 'foo', 'c_first')).toBe('c_first');
    expect(fooChatId(empty)).toBe('c_first');
  });
});
