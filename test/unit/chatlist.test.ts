// Spec: 03-shell-1 §3.4.3 search, §3.4.4 chip counts, §3.4.5 pill precedence / time format, §3.4.6 preview, §3.4.7
// folded, §3.4.8 order rules, §3.4.9 context menu items, §3.4.11 footer status and spend, §3.3.2 banner priority,
// §3.1.3 layout, 03-shell-2 §3.9.3 list keys. Rows come from main's real queries over the demo seed.
import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/main/store/db';
import { listChats } from '../../src/main/store/queries';
import { ist } from '../../src/main/test/seed/writer';
import { seedUxWorld } from '../../src/main/test/seed/uxWorld';
import { formatRowTime } from '../../src/shared/format';
import type { AiStatus, ChatRow, SpendSummary } from '../../src/shared/types';
import { pickBanner, type BannerFacts } from '../../src/renderer/banner/selectBanner';
import { rowMenuEntries, typeAheadTarget } from '../../src/renderer/chatlist/menu';
import { previewParts, previewText } from '../../src/renderer/chatlist/preview';
import { chipCounts, effectivePill, isFolded, orderChats, unreadText, visibleChats } from '../../src/renderer/chatlist/rules';
import { footerAi, footerSpend } from '../../src/renderer/chatlist/footer';
import { breakpointOf, clampWidth, computeLayout } from '../../src/renderer/shell/layout';
import { nextNeedsYou, stepChat } from '../../src/renderer/shell/shortcuts';

const NOW = ist(2026, 10, 16, 9, 0);
const TZ = 'Asia/Kolkata';
let rows: ChatRow[];
let refs: Record<string, string>;
const row = (ref: string) => rows.find((r) => r.id === refs[ref])!;

beforeAll(() => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  refs = seedUxWorld(db, NOW).refs;
  rows = listChats(db, { now: NOW, agentName: 'foo', draftPrefix: 'Draft:' });
});

describe('order rules (§3.4.8)', () => {
  it('Needs you first, then foo, pins, then newest first', () => {
    const ids = orderChats(rows, NOW).map((r) => r.id);
    expect(ids[0]).toBe(refs.foo); // foo needs you (Goa payment) and is foo
    expect(ids.indexOf(refs.trips!)).toBeLessThan(ids.indexOf(refs.family!));
  });
  it('3.11.4: Money needing you sorts above foo and pinned Trips', () => {
    const changed = rows.map((r) => {
      if (r.id === refs.money)
        return { ...r, pill: 'needs_you' as const, list: { ...r.list, needsYou: { since: NOW - 60_000, expiresAt: null } } };
      if (r.id === refs.foo) return { ...r, pill: null };
      if (r.id === refs.trips) return { ...r, pinned: true, list: { ...r.list, pinnedAt: NOW } };
      return r;
    }) as ChatRow[];
    const ids = orderChats(changed, NOW).map((r) => r.id);
    expect(ids.slice(0, 3)).toEqual([refs.money, refs.foo, refs.trips]);
  });
  it('a WhatsApp mirror never goes to the needs-you block and shows no pill', () => {
    const m = { ...row('society'), pill: 'needs_you' as const };
    expect(effectivePill(m, NOW)).toBeNull();
    expect(orderChats([row('foo'), m], NOW)[0]!.id).toBe(refs.foo);
  });
  it('Done fades after 24 h', () => {
    const home = row('home');
    expect(effectivePill(home, NOW)).toBe('done');
    expect(effectivePill(home, home.pillUntil! + 1)).toBeNull();
  });
});

describe('chips and search (§3.4.3–§3.4.4)', () => {
  it('counts Needs you and Working', () => {
    expect(chipCounts(rows, NOW)).toEqual({ needs_you: 1, working: 1 });
  });
  it('search is case- and accent-insensitive and matches the last message', () => {
    expect(visibleChats(rows, 'all', 'tríps', NOW).map((r) => r.id)).toEqual([refs.trips]);
    expect(visibleChats(rows, 'all', 'airtel', NOW).map((r) => r.id)).toEqual([refs.money]);
    expect(visibleChats(rows, 'working', 'money', NOW)).toEqual([]);
  });
  it('folds News & X only', () => {
    expect(rows.filter((r) => isFolded(r, NOW)).map((r) => r.id)).toEqual([refs.news]);
    expect(isFolded(row('news'), NOW, true)).toBe(false);
  });
  it('unread badge caps at 99+', () => {
    expect(unreadText(99, '99+')).toBe('99');
    expect(unreadText(100, '99+')).toBe('99+');
  });
});

describe('preview words (§3.4.6)', () => {
  const ctx = { typing: false, isOpen: false, setupComplete: true };
  it('typing and draft come first', () => {
    expect(previewParts(row('trips'), { ...ctx, typing: true }).text).toBe('typing…');
    const draft = { ...row('trips'), list: { ...row('trips').list, draft: 'hello' } };
    expect(previewText(previewParts(draft, ctx))).toBe('Draft: hello');
    expect(previewParts(draft, { ...ctx, isOpen: true }).rule).toBe('working');
  });
  it('working, group sender and first run', () => {
    expect(previewText(previewParts(row('trips'), ctx))).toBe('Working on Flights for 12 Dec…');
    expect(previewText(previewParts(row('family'), ctx))).toBe('foo: Mom’s cake is ordered 🎂');
    expect(previewText(previewParts(row('foo'), { ...ctx, setupComplete: false }))).toBe('Setting up…');
  });
});

describe('row time (§3.4.5)', () => {
  it('today, this week, older, other year', () => {
    expect(formatRowTime(ist(2026, 10, 16, 8, 2), { timeZone: TZ, now: NOW })).toBe('8:02 AM');
    expect(formatRowTime(ist(2026, 10, 15, 19, 30), { timeZone: TZ, now: NOW })).toBe('Thu');
    expect(formatRowTime(ist(2026, 9, 1, 9, 0), { timeZone: TZ, now: NOW })).toBe('1 Sep');
    expect(formatRowTime(ist(2025, 12, 12, 9, 0), { timeZone: TZ, now: NOW })).toBe('12 Dec 2025');
  });
});

describe('context menu (§3.4.9)', () => {
  const ctx = { agentName: 'foo', muted: false, markedUnread: false, now: NOW };
  const ids = (r: ChatRow, c = ctx) => rowMenuEntries(r, c).map((e) => e.id);
  it('foo: no pin, no delete', () => {
    expect(ids(row('foo'))).toEqual(['unread', 'mute', 'profile', 'find', 's1', 'clear']);
  });
  it('helper and group get pin and delete; a mirror gets neither', () => {
    expect(ids(row('trips'))).toEqual(['pin', 'unread', 'mute', 'profile', 'find', 's1', 'clear', 'delete']);
    expect(ids(row('family'))).toContain('delete');
    expect(ids(row('society'))).toEqual(['unread', 'mute', 'find', 's1', 'clear']);
  });
  it('labels follow state', () => {
    const e = rowMenuEntries(row('money'), { ...ctx, muted: true });
    const label = (id: string) => e.find((x) => x.id === id && x.kind === 'item');
    expect(label('unread')).toMatchObject({ label: 'Mark as read' });
    expect(label('mute')).toMatchObject({ label: 'Unmute' });
    expect(label('profile')).toMatchObject({ label: 'Open Money’s profile' });
  });
});

describe('list keys (03-shell-2 §3.9.3)', () => {
  const ids = ['a', 'b', 'c'];
  it('next / previous wrap', () => {
    expect(stepChat(ids, 'c', 1)).toBe('a');
    expect(stepChat(ids, 'a', -1)).toBe('c');
    expect(stepChat(ids, null, 1)).toBe('a');
    expect(stepChat([], null, 1)).toBeNull();
  });
  it('next that needs you skips the open one', () => {
    expect(nextNeedsYou(ids, 'b', (id) => id !== 'c')).toBe('a');
    expect(nextNeedsYou(ids, 'a', (id) => id === 'a')).toBeNull();
  });
  it('type-ahead finds the next name with the prefix, wrapping', () => {
    const names: Record<string, string> = { a: 'Money', b: 'Home', c: 'Mom' };
    expect(typeAheadTarget(ids, (id) => names[id]!, 'a', 'm')).toBe('c');
    expect(typeAheadTarget(ids, (id) => names[id]!, 'c', 'm')).toBe('a');
    expect(typeAheadTarget(ids, (id) => names[id]!, null, 'ho')).toBe('b');
    expect(typeAheadTarget(ids, (id) => names[id]!, null, 'x')).toBeNull();
  });
});

describe('sidebar footer (§3.4.11)', () => {
  const ai = (over: Partial<AiStatus>): AiStatus => ({
    primary: 'claude-cli',
    backup: null,
    displayName: 'Claude',
    billing: 'key',
    state: 'ok',
    usingBackup: false,
    lastVerifiedAt: NOW,
    ...over,
  });
  const o = { setupComplete: true, offline: false, now: NOW };
  it('AI status, first match', () => {
    expect(footerAi(ai({}), { ...o, setupComplete: false }).key).toBe('setting_up');
    expect(footerAi(ai({}), { ...o, offline: true }).key).toBe('offline');
    expect(footerAi(ai({}), o)).toEqual({ key: 'ready', tone: 'ok' });
    expect(footerAi(ai({ lastVerifiedAt: NOW - 11 * 60_000 }), o).key).toBe('checking');
    expect(footerAi(ai({ state: 'down' }), o)).toEqual({ key: 'not_answering', tone: 'bad' });
    expect(footerAi(ai({ state: 'key_invalid' }), o).key).toBe('signed_out');
    expect(footerAi(ai({ state: 'limit' }), o).tone).toBe('warn');
  });
  it('spend line and colour', () => {
    const s = (spent: number, billing: SpendSummary['aiBilling'] = 'key') =>
      ({ aiSpentPaise: spent, aiCapPaise: 100_000, aiBilling: billing }) as SpendSummary;
    expect(footerSpend(s(21_200), 'Claude')).toEqual({ text: '₹212 of ₹1,000 AI this month', tone: 'muted' });
    expect(footerSpend(s(80_000), 'Claude')?.tone).toBe('warn');
    expect(footerSpend(s(100_000), 'Claude')).toEqual({ text: 'AI cap reached · ₹1,000', tone: 'bad' });
    expect(footerSpend(s(0, 'plan'), 'Claude')?.text).toBe('Uses your Claude plan');
    expect(footerSpend(null, 'Claude')).toBeNull();
  });
});

describe('banner priority (§3.3.2)', () => {
  const f: BannerFacts = { connection: 'online', ai: null, spend: null, notificationsAllowed: true, updateReady: false, dismissed: [] };
  it('one banner, highest priority, dismissals respected', () => {
    expect(pickBanner(f)).toBeNull();
    expect(pickBanner({ ...f, connection: 'offline', notificationsAllowed: false })).toBe('offline');
    expect(pickBanner({ ...f, notificationsAllowed: false })).toBe('notifications_blocked');
    expect(pickBanner({ ...f, notificationsAllowed: false, dismissed: ['notifications_blocked'] })).toBeNull();
  });
});

describe('layout (§3.1.3)', () => {
  const base = { sidebarWidth: 340, rightOpenL: true, rightOpenOverlay: false, xsPane: 'chat' as const };
  it('breakpoints', () => {
    expect([1440, 1100, 800, 400].map(breakpointOf)).toEqual(['L', 'M', 'S', 'XS']);
  });
  it('3.11.1: 1440 shows 340 / 760 / 340', () => {
    expect(computeLayout({ ...base, width: 1440 })).toMatchObject({ left: 340, right: 'push' });
  });
  it('at L the widest left shell still fits beside the right shell; M overlays', () => {
    expect(computeLayout({ ...base, width: 1280, sidebarWidth: 460 })).toMatchObject({ left: 460, right: 'push' });
    expect(computeLayout({ ...base, width: 1100, sidebarWidth: 460, rightOpenOverlay: true })).toMatchObject({
      left: 400,
      right: 'overlay',
    });
  });
  it('3.11.3: XS shows one pane', () => {
    expect(computeLayout({ ...base, width: 600 })).toMatchObject({ showLeft: false, showMain: true });
    expect(computeLayout({ ...base, width: 600, xsPane: 'list' })).toMatchObject({ showLeft: true, showMain: false });
  });
  it('resize clamps to the breakpoint range', () => {
    expect(clampWidth(500, { min: 300, max: 460 })).toBe(460);
    expect(clampWidth(250.4, { min: 300, max: 400 })).toBe(300);
  });
});
