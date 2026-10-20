// Spec: 04 §13.5 (kit surfaces: messages fold into a surface, a later reply that names the same surfaceId updates it,
// bound values re-checked after they resolve, an unknown surface is dropped; user actions go main `kit:action` → engine
// `kit.action`, a secret-looking value is refused, Article 8), 08-1 §2.4 ("a gated action is handled as if the user typed
// it"), 02-2 §F19.9 (chart axes: 02 number and money rules), X-180. R1 T2 seams: shared/kit/surface.ts, the LineChart
// helpers, main's kitActionHandler and the engine's KitActions. The AT rows live in test/e2e/r1-kit.spec.ts.
import { describe, expect, it } from 'vitest';
import type { KitActionMessage, KitMessage } from '../../src/shared/kit/catalog';
import {
  buttonWords,
  foldFence,
  getPath,
  INVALID,
  kitFences,
  kitMessagesOf,
  resolveContext,
  resolveField,
  setPath,
} from '../../src/shared/kit/surface';
import { axisRange, formatValue, geometry, xLabelIndexes } from '../../src/renderer/kit/LineChart';
import { kitActionHandler } from '../../src/main/kit/kitIpc';
import { actionForAi, actionWords, KitActions } from '../../src/engine/kit/kitAction';
import { plainLine } from '../../src/main/store/queries';
import { ReleaseGate } from '../../src/engine/prompt/releaseGate';
import { FakeClock } from '../../src/shared/clock';

const create = (s = 's1') => `{"createSurface":{"surfaceId":"${s}","catalogId":"foo.kit.v1"}}`;
const comps = (components: unknown[], s = 's1') => JSON.stringify({ updateComponents: { surfaceId: s, components } });
const dataAt = (path: string, value: unknown, s = 's1') => JSON.stringify({ updateDataModel: { surfaceId: s, path, value } });
const fence = (...lines: string[]) => `Here you go.\n\n\`\`\`a2ui\n${lines.join('\n')}\n\`\`\``;
const msgs = (text: string): KitMessage[] => kitMessagesOf(text).messages;

const button = [
  { id: 'root', component: 'Column', children: ['go'] },
  { id: 'go', component: 'Button', child: 'go-t', action: { event: { name: 'book_flight', context: { flight: { path: '/pick' } } } } },
  { id: 'go-t', component: 'Text', text: 'Book IndiGo 6E 201' },
];

describe('surface fold (04 §13.5)', () => {
  it('reads the a2ui fences of a reply and ignores other code', () => {
    const text = `${fence(create())}\n\n\`\`\`js\nx\n\`\`\`\n\n\`\`\`a2ui\n${create('s2')}`;
    expect(kitFences(text)).toEqual([
      { body: create(), closed: true },
      { body: create('s2'), closed: false },
    ]);
  });

  it('a later fence that names the same surface updates it; one that creates it again takes over', () => {
    const first = msgs(fence(create(), comps([{ id: 'root', component: 'Text', text: { path: '/t' } }]), dataAt('/t', 'Fares fall')));
    const update = msgs(fence(dataAt('/t', 'Fares rise')));
    const again = msgs(fence(create(), comps([{ id: 'root', component: 'Text', text: 'New' }])));
    const after = msgs(fence(dataAt('/t', 'Not mine')));
    expect(getPath(foldFence([first, update], 0).surfaces[0]!.data, '/t')).toBe('Fares rise');
    const moved = foldFence([first, update, again, after], 0).surfaces[0]!;
    expect(getPath(moved.data, '/t')).toBe('Fares rise');
    // The later fence draws nothing itself (its surface lives in the first) and drops nothing.
    expect(foldFence([first, update], 1)).toEqual({ surfaces: [], dropped: 0 });
    // A message for a surface no fence created is dropped (caption).
    expect(foldFence([msgs(fence(dataAt('/t', 'x', 'nope')))], 0).dropped).toBe(1);
  });

  it('deleteSurface removes it', () => {
    const first = msgs(fence(create(), comps([{ id: 'root', component: 'Divider' }])));
    expect(foldFence([first, msgs(fence('{"deleteSurface":{"surfaceId":"s1"}}'))], 0).surfaces).toEqual([]);
  });

  it('bound values are re-checked with the field schema; a failing one is INVALID', () => {
    const text = { id: 't', component: 'Text', text: { path: '/t' } } as const;
    expect(resolveField(text, 'text', { t: 'ok' })).toBe('ok');
    expect(resolveField(text, 'text', { t: 42 })).toBe(INVALID);
    expect(resolveField(text, 'text', {})).toBe(INVALID);
    // Template children read relative paths against their list item.
    const rel = { id: 't', component: 'Text', text: { path: 'name' } } as const;
    expect(resolveField(rel, 'text', { rows: [{ name: 'Goa' }] }, '/rows/0')).toBe('Goa');
  });

  it('JSON Pointer writes copy and never touch the prototype', () => {
    const d = { a: { b: 1 } };
    const next = setPath(d, '/a/c', 2);
    expect(next).toEqual({ a: { b: 1, c: 2 } });
    expect(d).toEqual({ a: { b: 1 } });
    expect(setPath({}, '/__proto__/x', 1)).toEqual({});
    expect(getPath({ 'a/b': 1 }, '/a~1b')).toBe(1);
  });

  it("an action's context resolves its bound values; a Button's words come from its Text child", () => {
    const s = foldFence([msgs(fence(create(), comps(button), dataAt('/pick', '6E 201')))], 0).surfaces[0]!;
    expect(resolveContext({ flight: { path: '/pick' }, n: 2 }, s.data)).toEqual({ flight: '6E 201', n: 2 });
    expect(buttonWords(s, 'go')).toBe('Book IndiGo 6E 201');
    expect(buttonWords(s, 'root')).toBeNull();
  });
});

describe('LineChart helpers (02-2 §F19.9, §F19.1, §F19.2)', () => {
  it('formats axis values by the 02 rules', () => {
    expect(formatValue(123456)).toBe('1,23,456');
    expect(formatValue(-4.26)).toBe('−4.3');
    expect(formatValue(80, 'percent')).toBe('80%');
    expect(formatValue(4200, 'rupees')).toBe('₹4,200');
    expect(formatValue(550000, 'rupees')).toBe('₹5.5 lakh');
  });

  it('axes hold every value and zero, on round bounds', () => {
    expect(axisRange([3900, 4200, 4700])).toEqual({ min: 0, max: 5000 });
    expect(axisRange([-30, 20])).toEqual({ min: -30, max: 20 });
    expect(axisRange([0])).toEqual({ min: 0, max: 1 });
  });

  it('categories follow first appearance across series; x labels never exceed 6', () => {
    const g = geometry(
      [
        {
          label: 'This month',
          points: [
            { x: 'Mon', y: 1 },
            { x: 'Tue', y: 2 },
          ],
        },
        {
          label: 'Last month',
          points: [
            { x: 'Tue', y: 3 },
            { x: 'Wed', y: 1 },
          ],
        },
      ],
      'line',
    );
    expect(g.categories).toEqual(['Mon', 'Tue', 'Wed']);
    expect(g.y(g.range.max)).toBeLessThan(g.y(g.range.min));
    expect(xLabelIndexes(4)).toEqual([0, 1, 2, 3]);
    expect(xLabelIndexes(7)).toEqual([0, 2, 4, 6]);
    expect(xLabelIndexes(30)).toEqual([0, 5, 10, 15, 20, 25]);
  });
});

const action = (o: Partial<KitActionMessage> = {}): KitActionMessage => ({
  chatId: 'c_1',
  messageId: 'm_1',
  surfaceId: 's1',
  name: 'book_flight',
  sourceComponentId: 'go',
  context: { flight: '6E 201' },
  timestamp: '2026-10-20T10:00:00.000Z',
  ...o,
});

describe("main's kit:action (08-1 §3.2)", () => {
  const reply = fence(create(), comps(button));
  const setup = (text: string | null) => {
    const sent: unknown[] = [];
    const h = kitActionHandler({
      hostText: () => text,
      engine: () => ({ send: (kind: string, payload: unknown) => (sent.push({ kind, payload }), true) }) as never,
      log: () => undefined,
    });
    return { h, sent };
  };

  it('forwards exactly one kit.action for a surface its host created', () => {
    const { h, sent } = setup(reply);
    expect(h(action())).toEqual({ ok: true, value: undefined });
    expect(sent).toEqual([{ kind: 'kit.action', payload: action() }]);
  });

  it('refuses an unknown host or surface, and a secret-looking value', () => {
    expect(setup(null).h(action()).ok).toBe(false);
    const other = setup(reply);
    expect(other.h(action({ surfaceId: 's9' }))).toMatchObject({ ok: false, error: { kind: 'NOT_FOUND' } });
    const secret = setup(reply);
    expect(secret.h(action({ context: { pin: 'my password is hunter2 4111 1111 1111 1111' } }))).toMatchObject({
      ok: false,
      error: { kind: 'SECRET_SUSPECTED' },
    });
    expect(secret.sent).toEqual([]);
  });
});

describe("the engine's kit.action (08-1 §2.4: as if the user typed it)", () => {
  it("stores the tap as the user's message in the Button's words, with the action for the AI, then hands it to the lane", async () => {
    const txs: unknown[] = [];
    const queued: string[][] = [];
    const k = new KitActions({
      link: {
        request: async (kind: string, p: { q?: string; ops?: unknown[] }) => {
          if (kind === 'db.query' && p.q === 'messageById')
            return { ok: true, value: { id: 'm_1', chatId: 'c_1', authorKind: 'foo', text: fence(create(), comps(button)) } };
          if (kind === 'db.tx') return (txs.push(p.ops), { ok: true, value: { ids: [], revs: [] } });
          return { ok: true, value: null };
        },
      } as never,
      clock: { now: () => 1_000 } as never,
      newId: () => 'm_2',
      enqueue: (chatId, messageId) => queued.push([chatId, messageId]),
      log: () => undefined,
    });
    await k.handle(action());
    expect(txs).toEqual([
      [
        {
          op: 'insert',
          table: 'messages',
          row: expect.objectContaining({ id: 'm_2', chat_id: 'c_1', author_kind: 'user', text: 'Book IndiGo 6E 201', status: 'sent' }),
        },
      ],
    ]);
    const forAi = (txs[0] as { row: { text_for_ai: string } }[])[0]!.row.text_for_ai;
    expect(forAi).toBe(actionForAi('Book IndiGo 6E 201', action()));
    expect(forAi).toContain('surfaceId "s1"');
    expect(queued).toEqual([['c_1', 'm_2']]);
  });

  it('names a Button without words by its action', () => {
    expect(actionWords('compare_last_month')).toBe('Compare last month');
    expect(actionWords('showMore')).toBe('Show more');
  });
});

describe('previews (03-shell-1 §3.4.6)', () => {
  it('a reply that is only a kit block leaves no JSON in the chat-list line', () => {
    expect(plainLine(fence(create(), comps(button)))).toBe('Here you go.');
  });
});

describe('release gate inside a fence (08-4 §25.5 item 2, 04 §13.5 streaming)', () => {
  it('each line of an a2ui fence releases on its own; prose lines still need whitespace after the break', async () => {
    const clock = new FakeClock();
    const out: string[] = [];
    const gate = new ReleaseGate({ clock, rewrite: async (x) => x, onRelease: (x) => out.push(x), onSayClosed: () => undefined });
    clock.advance(1_500);
    gate.feed('<say>Fares are falling.\n\n```a2ui\n{"a":1}\n{"b"');
    await Promise.resolve();
    expect(out.join('')).toBe('Fares are falling.\n\n```a2ui\n{"a":1}\n');
    gate.feed(':2}\n```\nDone\nok</say>');
    await gate.done;
    expect(out.join('')).toBe('Fares are falling.\n\n```a2ui\n{"a":1}\n{"b":2}\n```\nDone\nok');
    // From the closing fence on, a bare line break is no boundary again: "Done\nok" stays one sentence, as before.
    expect(out.at(-1)).toBe('```\nDone\nok');
  });
});
