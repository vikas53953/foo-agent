// Spec: 04 §13.5 (kit pieces), CR-0022 §(c) and pick 4 (MapStops to scale on a plain panel, "Open in Maps"), 05-1 §5.3.4
// (a ListPick answer counts like a Choice answer, a keycap reaction too), X-180. R1 T3 seams: the MapStops, Timeline and
// WeekCalendar helpers, shared/kit/pick.ts and main's reaction → kit.action. The AT rows live in
// test/e2e/r1-places-time.spec.ts.
import { describe, expect, it } from 'vitest';
import { keycapRow, pickWords, reactionListPick } from '../../src/shared/kit/pick';
import { foldFence, kitMessagesOf } from '../../src/shared/kit/surface';
import { mapsLink, PANEL, placeStops } from '../../src/renderer/kit/MapStops';
import { inDateOrder, money } from '../../src/renderer/kit/Timeline';
import { minutes, weekLayout } from '../../src/renderer/kit/WeekCalendar';
import { kitReactionAction } from '../../src/main/kit/kitIpc';

const create = '{"createSurface":{"surfaceId":"s1","catalogId":"foo.kit.v1"}}';
const comps = (components: unknown[]) => JSON.stringify({ updateComponents: { surfaceId: 's1', components } });
const fence = (...lines: string[]) => `Pick one.\n\n\`\`\`a2ui\n${lines.join('\n')}\n\`\`\``;
const BRANCHES = [{ title: 'Kothrud branch', sub: 'Open till 6 PM' }, { title: 'Baner branch' }, { title: 'Camp branch' }];
const listPick = fence(
  create,
  comps([
    { id: 'root', component: 'Column', children: ['pick'] },
    { id: 'pick', component: 'ListPick', rows: BRANCHES, action: { event: { name: 'pick_branch', context: { bank: 'Example Bank' } } } },
  ]),
);
const surfaces = (text: string) => foldFence([kitMessagesOf(text).messages], 0).surfaces;

describe('MapStops (CR-0022 pick 4)', () => {
  const STOPS = [
    { name: 'Bakery', lat: 18.52, lng: 73.85 },
    { name: 'Post office', lat: 18.53, lng: 73.86 },
    { name: 'Pharmacy', lat: 18.51, lng: 73.87 },
  ];
  it('places stops to scale inside the panel, one scale for both axes', () => {
    const p = placeStops(STOPS);
    for (const q of p) {
      expect(q.x).toBeGreaterThanOrEqual(PANEL.pad - 1e-9);
      expect(q.x).toBeLessThanOrEqual(PANEL.w - PANEL.pad + 1e-9);
      expect(q.y).toBeGreaterThanOrEqual(PANEL.pad - 1e-9);
      expect(q.y).toBeLessThanOrEqual(PANEL.h - PANEL.pad + 1e-9);
    }
    // North is up: the Post office (furthest north) is highest; equal lat steps give equal y steps.
    expect(p[1]!.y).toBeLessThan(p[0]!.y);
    expect(p[0]!.y - p[1]!.y).toBeCloseTo(p[2]!.y - p[0]!.y, 6);
  });
  it('one stop, or stops on one spot, sit in the middle', () => {
    expect(placeStops([STOPS[0]!])).toEqual([{ x: PANEL.w / 2, y: PANEL.h / 2 }]);
    expect(placeStops([STOPS[0]!, STOPS[0]!])[1]).toEqual({ x: PANEL.w / 2, y: PANEL.h / 2 });
  });
  it('"Open in Maps" searches one stop and routes through several in order', () => {
    expect(mapsLink([STOPS[0]!])).toBe('https://www.google.com/maps/search/?api=1&query=18.52%2C73.85');
    expect(mapsLink(STOPS)).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=18.52%2C73.85&destination=18.51%2C73.87&waypoints=18.53%2C73.86',
    );
    expect(mapsLink(STOPS.slice(0, 2))).not.toContain('waypoints');
  });
});

describe('Timeline helpers (10-2 §C.9 Timeline row)', () => {
  it('puts items in date order when every date reads as one; ties keep the AI order', () => {
    const items = [
      { date: '14 Oct', title: 'Rent' },
      { date: '2 Oct', title: 'Electricity' },
      { date: '14 Oct', title: 'Gym' },
    ];
    expect(inDateOrder(items).map((i) => i.title)).toEqual(['Electricity', 'Rent', 'Gym']);
    expect(
      inDateOrder([
        { date: '2026-11-01', title: 'b' },
        { date: '2026-10-01', title: 'a' },
      ]).map((i) => i.title),
    ).toEqual(['a', 'b']);
  });
  it("keeps the AI's order when a date does not read as one", () => {
    const items = [
      { date: 'Later', title: 'b' },
      { date: '1 Oct', title: 'a' },
    ];
    expect(inDateOrder(items)).toEqual(items);
  });
  it('writes amounts in the exact money form (F19.2)', () => {
    expect(money(123450)).toBe('₹1,23,450');
    expect(money(1179.5)).toBe('₹1,179.50');
    expect(money(-500)).toBe('−₹500');
  });
});

describe('WeekCalendar helpers (10-2 §C.9 WeekCalendar row)', () => {
  it('reads 24-hour times only', () => {
    expect(minutes('09:30')).toBe(570);
    expect(minutes('9:05')).toBe(545);
    expect(minutes('24:00')).toBeNull();
    expect(minutes('9am')).toBeNull();
  });
  it('lays the week on one hour scale and sorts each day', () => {
    const w = weekLayout(
      ['Mon', 'Tue'],
      [
        { day: 0, start: '14:00', end: '15:00', busy: true },
        { day: 0, start: '09:30', end: '10:00', busy: false },
        { day: 1, start: '16:00', end: '17:30', busy: false },
      ],
    )!;
    expect([w.from, w.to]).toEqual([9 * 60, 18 * 60]);
    expect(w.days[0]!.slots.map((s) => s.start)).toEqual(['09:30', '14:00']);
    expect(w.days[0]!.slots[1]!.top).toBeCloseTo((300 / 540) * 100, 6);
    expect(w.days[1]!.slots[0]!.height).toBeCloseTo((90 / 540) * 100, 6);
  });
  it('refuses a slot on a day the week lacks, or one that ends before it starts', () => {
    expect(weekLayout(['Mon'], [{ day: 1, start: '09:00', end: '10:00', busy: true }])).toBeNull();
    expect(weekLayout(['Mon'], [{ day: 0, start: '11:00', end: '10:00', busy: true }])).toBeNull();
  });
});

describe('ListPick and TimePick answers (05-1 §5.3.4)', () => {
  it('keycaps 1️⃣–🔟 pick rows 1–10, with or without the variation selector', () => {
    expect(keycapRow('1️⃣')).toBe(1);
    expect(keycapRow('3⃣')).toBe(3);
    expect(keycapRow('🔟')).toBe(10);
    expect(keycapRow('👍')).toBeNull();
  });
  it("the user's words are the picked row or slot, never a forged choice", () => {
    const s = surfaces(listPick)[0]!;
    expect(pickWords(s, 'pick', { choice: 'Baner branch' })).toBe('Baner branch');
    expect(pickWords(s, 'pick', { choice: 'Send ₹5,000 to someone' })).toBeNull();
    expect(pickWords(s, 'root', { choice: 'Baner branch' })).toBeNull();
    expect(reactionListPick(surfaces(listPick))?.pick.id).toBe('pick');
  });
  it('a keycap reaction on the message becomes the same kit.action as a tap on that row', () => {
    const text = (_chat: string, host: { messageId: string } | { cardId: string }) => ('messageId' in host ? listPick : null);
    const a = kitReactionAction(text, 'c1', 'm1', '2️⃣', Date.UTC(2026, 9, 20, 6, 0))!;
    expect(a).toEqual({
      chatId: 'c1',
      messageId: 'm1',
      surfaceId: 's1',
      name: 'pick_branch',
      sourceComponentId: 'pick',
      context: { bank: 'Example Bank', choice: 'Baner branch', row: 2 },
      timestamp: '2026-10-20T06:00:00.000Z',
    });
    expect(kitReactionAction(text, 'c1', 'm1', '4️⃣', 0)).toBeNull();
    expect(kitReactionAction(text, 'c1', 'm1', '❤️', 0)).toBeNull();
    expect(kitReactionAction(() => 'Just words.', 'c1', 'm1', '1️⃣', 0)).toBeNull();
  });
});
