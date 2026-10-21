// Spec: 04 §13.5 (kit pieces), CR-0022 §(c) and pick 4 (MapStops to scale on a plain panel, "Open in Maps"), 05-1 §5.3.4
// (a ListPick answer counts like a Choice answer, a keycap reaction too; §5.3.5: it is given once and stays), X-180. R1 T3 seams: the MapStops, Timeline and
// WeekCalendar helpers, shared/kit/pick.ts and main's reaction → kit.action. The AT rows live in
// test/e2e/r1-places-time.spec.ts.
import { describe, expect, it } from 'vitest';
import type { KitActionMessage } from '../../src/shared/kit/catalog';
import {
  answeredChoice,
  hostSurfaces,
  keycapRow,
  kitPickOf,
  pickWords,
  reactionListPick,
  type PickScanRow,
} from '../../src/shared/kit/pick';
import { foldFence, kitMessagesOf } from '../../src/shared/kit/surface';
import { mapsLink, PANEL, PIN, placeStops } from '../../src/renderer/kit/MapStops';
import { inDateOrder, money } from '../../src/renderer/kit/Timeline';
import { minutes, weekLayout } from '../../src/renderer/kit/WeekCalendar';
import { kitActionHandler, kitReactionAction } from '../../src/main/kit/kitIpc';
import { messageRow } from '../../src/main/db/rows';
import { actionForAi } from '../../src/engine/kit/kitAction';

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
  it('one stop sits in the middle; stops on one spot sit around the middle, apart', () => {
    expect(placeStops([STOPS[0]!])).toEqual([{ x: PANEL.w / 2, y: PANEL.h / 2 }]);
    const two = placeStops([STOPS[0]!, STOPS[0]!]);
    expect(Math.hypot(two[0]!.x - two[1]!.x, two[0]!.y - two[1]!.y)).toBeGreaterThanOrEqual(PIN.apart - 1e-6);
    expect((two[0]!.x + two[1]!.x) / 2).toBeCloseTo(PANEL.w / 2, 6);
    expect((two[0]!.y + two[1]!.y) / 2).toBeCloseTo(PANEL.h / 2, 6);
  });
  // Run 10 (real Claude): a Jaipur day trip put City Palace, Jantar Mantar and Hawa Mahal ~200 m apart and Amber Fort
  // ~8 km away, so stops 3, 4 and 5 drew on one spot and their numbers could not be read.
  const JAIPUR = [
    { name: 'Amber Fort', lat: 26.9855, lng: 75.8513 },
    { name: 'Nahargarh Fort', lat: 26.9373, lng: 75.8155 },
    { name: 'City Palace', lat: 26.9258, lng: 75.8237 },
    { name: 'Jantar Mantar', lat: 26.9248, lng: 75.8246 },
    { name: 'Hawa Mahal', lat: 26.9239, lng: 75.8267 },
  ];
  const apartEnough = (p: { x: number; y: number }[]) => {
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++)
        expect(Math.hypot(p[i]!.x - p[j]!.x, p[i]!.y - p[j]!.y), `stops ${i + 1} and ${j + 1}`).toBeGreaterThanOrEqual(PIN.apart - 1e-6);
  };
  const inside = (p: { x: number; y: number }[]) => {
    for (const q of p) {
      expect(q.x).toBeGreaterThanOrEqual(PANEL.pad - 1e-9);
      expect(q.x).toBeLessThanOrEqual(PANEL.w - PANEL.pad + 1e-9);
      expect(q.y).toBeGreaterThanOrEqual(PANEL.pad - 1e-9);
      expect(q.y).toBeLessThanOrEqual(PANEL.h - PANEL.pad + 1e-9);
    }
  };
  it('close stops never cover each other: every pin stays apart so its number can be read', () => {
    const p = placeStops(JAIPUR);
    apartEnough(p);
    inside(p);
    // Far stops stay where the scale puts them: Amber Fort is still highest and the cluster still sits south of Nahargarh.
    expect(p[0]!.y).toBeLessThan(Math.min(...p.slice(1).map((q) => q.y)));
    for (const q of p.slice(2)) expect(q.y).toBeGreaterThan(p[1]!.y);
  });
  it('stops that are already apart do not move', () => {
    const far = placeStops(STOPS);
    const k = Math.cos(((18.52 + 18.53 + 18.51) / 3) * (Math.PI / 180));
    // Bakery → Post office keeps its true bearing, to scale.
    expect((far[1]!.x - far[0]!.x) / (far[0]!.y - far[1]!.y)).toBeCloseTo((0.01 * k) / 0.01, 6);
  });
  it('a crowd of stops on one block, even many on one spot or at the edge, still keeps every pin apart', () => {
    const block = Array.from({ length: 8 }, (_, i) => ({ name: `Shop ${i + 1}`, lat: 26.92 + (i % 3) * 0.0001, lng: 75.82 }));
    const crowd = [
      { name: 'Far', lat: 27.2, lng: 76.1 },
      ...block,
      ...Array.from({ length: 4 }, () => ({ name: 'Same', lat: 26.92, lng: 75.82 })),
    ];
    const p = placeStops(crowd);
    apartEnough(p);
    inside(p);
    expect(placeStops(crowd)).toEqual(p); // the same stops always draw the same way
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

const timePick = fence(
  create,
  comps([
    { id: 'root', component: 'Column', children: ['slots'] },
    { id: 'slots', component: 'TimePick', date: 'Thursday 23 Oct', slots: ['10:30', '11:15'], action: { event: { name: 'pick_slot' } } },
  ]),
);

/** A tiny chat for main's handler: the host foo message, then whatever came after it. */
function chat(host: string) {
  const after: PickScanRow[] = [];
  const sent: KitActionMessage[] = [];
  const deps = {
    hostText: (_c: string, h: { messageId: string } | { cardId: string }) => ('messageId' in h ? host : null),
    later: () => after,
    engine: () => ({ send: (_k: string, p: unknown) => (sent.push(p as KitActionMessage), true) }) as never,
    log: () => undefined,
  };
  /** What the engine stores for a forwarded pick: the user's message with the tap's AI text (main reads kitPick back). */
  const stored = (a: KitActionMessage) => {
    const s = hostSurfaces(host, after).find((x) => x.id === a.surfaceId)!;
    const words = pickWords(s, a.sourceComponentId, a.context)!;
    after.push({ authorKind: 'user', text: words, kitPick: kitPickOf(actionForAi(words, a)) });
  };
  return { deps, after, sent, handle: kitActionHandler(deps), stored };
}
const tap = (row: number, title: string): KitActionMessage => ({
  chatId: 'c1',
  messageId: 'm1',
  surfaceId: 's1',
  name: 'pick_branch',
  sourceComponentId: 'pick',
  context: { choice: title, row, bank: 'Example Bank' },
  timestamp: '2026-10-20T06:00:00.000Z',
});

describe('ListPick and TimePick answers (05-1 §5.3.4, §5.3.5)', () => {
  it('keycaps 1️⃣–🔟 pick rows 1–10, with or without the variation selector', () => {
    expect(keycapRow('1️⃣')).toBe(1);
    expect(keycapRow('3⃣')).toBe(3);
    expect(keycapRow('🔟')).toBe(10);
    expect(keycapRow('👍')).toBeNull();
  });
  it("the user's words are the picked row, or the slot with its day, never a forged choice", () => {
    const s = surfaces(listPick)[0]!;
    expect(pickWords(s, 'pick', { choice: 'Baner branch' })).toBe('Baner branch');
    expect(pickWords(s, 'pick', { choice: 'Send ₹5,000 to someone' })).toBeNull();
    expect(pickWords(s, 'root', { choice: 'Baner branch' })).toBeNull();
    expect(pickWords(surfaces(timePick)[0]!, 'slots', { choice: '11:15' })).toBe('11:15, Thursday 23 Oct');
    expect(reactionListPick(surfaces(listPick))?.pick.id).toBe('pick');
  });
  it("the pick reads back from the tap's AI text, even with odd ids and a long context cut short", () => {
    const a = { ...tap(2, 'Baner "main" branch'), surfaceId: 'trip, day 1', sourceComponentId: 'pick: "x"' };
    a.context = { choice: 'Baner "main" branch', row: 2, notes: 'x'.repeat(5_000) };
    expect(kitPickOf(actionForAi('Baner "main" branch', a))).toEqual({
      surfaceId: 'trip, day 1',
      componentId: 'pick: "x"',
      choice: 'Baner "main" branch',
    });
    // A Button tap (no choice) and a typed message record no pick.
    expect(kitPickOf(actionForAi('Book', { ...tap(1, 'x'), context: { flight: '6E 201' } }))).toBeNull();
    expect(kitPickOf('Baner branch')).toBeNull();
    expect(kitPickOf(null)).toBeNull();
  });
  it('a keycap reaction on the message becomes the same kit.action as a tap on that row, the pick first', () => {
    const { deps } = chat(listPick);
    const a = kitReactionAction(deps, 'c1', 'm1', '2️⃣', Date.UTC(2026, 9, 20, 6, 0))!;
    expect(a).toEqual(tap(2, 'Baner branch'));
    expect(Object.keys(a.context)[0]).toBe('choice');
    expect(kitReactionAction(deps, 'c1', 'm1', '4️⃣', 0)).toBeNull();
    expect(kitReactionAction(deps, 'c1', 'm1', '❤️', 0)).toBeNull();
    expect(kitReactionAction({ ...deps, hostText: () => 'Just words.' }, 'c1', 'm1', '1️⃣', 0)).toBeNull();
  });
  it("a reaction reads the rows as the chat's later foo replies left them", () => {
    const { deps, after } = chat(listPick);
    const relabel = comps([
      {
        id: 'pick',
        component: 'ListPick',
        rows: [{ title: 'Aundh branch' }, { title: 'Wakad branch' }],
        action: { event: { name: 'pick_branch' } },
      },
    ]);
    after.push({ authorKind: 'foo', text: `Two are open now.\n\n\`\`\`a2ui\n${relabel}\n\`\`\``, kitPick: null });
    expect(kitReactionAction(deps, 'c1', 'm1', '2️⃣', 0)?.context.choice).toBe('Wakad branch');
  });
  it('1️⃣ then 2️⃣: the second reaction is refused, one answer only', () => {
    const c = chat(listPick);
    const first = kitReactionAction(c.deps, 'c1', 'm1', '1️⃣', 0)!;
    expect(c.handle(first).ok).toBe(true);
    c.stored(c.sent[0]!);
    const second = kitReactionAction(c.deps, 'c1', 'm1', '2️⃣', 0)!;
    expect(c.handle(second)).toMatchObject({ ok: false, error: { kind: 'VALIDATION' } });
    expect(c.sent.map((a) => a.context.choice)).toEqual(['Kothrud branch']);
  });
  it('a keycap after a tap is refused, and so is a second tap on a TimePick', () => {
    const c = chat(listPick);
    expect(c.handle(tap(3, 'Camp branch')).ok).toBe(true);
    c.stored(c.sent[0]!);
    expect(c.handle(kitReactionAction(c.deps, 'c1', 'm1', '1️⃣', 0)!).ok).toBe(false);
    const t2 = chat(timePick);
    const slot = (choice: string): KitActionMessage => ({
      ...tap(1, choice),
      name: 'pick_slot',
      sourceComponentId: 'slots',
      context: { choice },
    });
    expect(t2.handle(slot('10:30')).ok).toBe(true);
    t2.stored(t2.sent[0]!);
    expect(t2.handle(slot('11:15'))).toMatchObject({ ok: false, error: { kind: 'VALIDATION' } });
  });
  it('a later foo reply that creates the surface again owns the picks made after it, not the first message', () => {
    const c = chat(listPick);
    c.after.push({ authorKind: 'foo', text: listPick, kitPick: null });
    c.after.push({ authorKind: 'user', text: 'Camp branch', kitPick: { surfaceId: 's1', componentId: 'pick', choice: 'Camp branch' } });
    // The first message's s1 is still unanswered; the answer belongs to the newer s1 (its own scan starts after it).
    expect(answeredChoice(c.after, 's1', 'pick')).toBeNull();
    expect(answeredChoice(c.after.slice(1), 's1', 'pick')).toBe('Camp branch');
  });
  it('after a restart the stored message still carries the answer (main derives kitPick from the row)', () => {
    const a = tap(2, 'Baner branch');
    const base = { id: 'm2', chat_id: 'c1', seq: 6, kind: 'text', text: 'Baner branch', status: 'sent', rev: 0, created_at: 1 };
    const row = messageRow({ ...base, author_kind: 'user', text_for_ai: actionForAi('Baner branch', a) });
    expect(row.kitPick).toEqual({ surfaceId: 's1', componentId: 'pick', choice: 'Baner branch' });
    expect(answeredChoice([row], 's1', 'pick')).toBe('Baner branch');
    // Only the user's own messages carry a pick.
    expect(messageRow({ ...base, author_kind: 'foo', text_for_ai: actionForAi('Baner branch', a) }).kitPick).toBeNull();
  });
});
