// M6 T6 Memory page rows (06-2 §7.3 source table, groups, chips, learned strip; §7.5 states; 08-3 §12 origins). Expected
// strings are copied from the spec tables, not rebuilt from the copy file.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import { setBridge } from '../../src/renderer/ipc/client';
import { learnedInChat, memoryActions } from '../../src/renderer/screens/memoryActions';
import {
  exportErrorLine,
  forgetSource,
  groupFacts,
  highlight,
  learnedCount,
  matches,
  pageState,
  rowName,
  sourceLine,
  undoText,
  visibleChips,
  type PageFilter,
} from '../../src/renderer/screens/memoryView';
import type { MemoryFactView } from '../../src/shared/types';

const TZ = 'Asia/Kolkata';
const NOW = Date.UTC(2026, 9, 16, 6, 30); // 16 Oct 2026, 12:00 IST
const DAY = 86_400_000;
const at = (d: number) => Date.UTC(2026, 9, d, 6, 30);

const fact = (id: string, over: Partial<MemoryFactView> = {}): MemoryFactView => ({
  id,
  file: 'memory/about-you.md',
  lineNo: 1,
  scope: 'global',
  chatId: null,
  text: `fact ${id}`,
  provenance: 'said',
  origin: 'chat:c_foo/m_1',
  originKind: 'chat',
  reason: null,
  category: null,
  kind: 'fact',
  sensitive: false,
  private: false,
  learnedAt: at(2),
  lastUsedAt: null,
  useCount: 0,
  fileLabel: 'about-you.md',
  originLabel: 'chat',
  ...over,
});
const all: PageFilter = { chip: 'all', last7: false, q: '' };

describe('source line (06-2 §7.3 "Source line (final copy)")', () => {
  it('user said it: "You said · 2 Oct"', () => {
    expect(sourceLine(fact('a'), NOW, TZ)).toBe('You said · 2 Oct');
  });
  it('foo noticed it: "I guessed · from 4 bookings · 9 Oct"', () => {
    expect(sourceLine(fact('a', { provenance: 'guessed', reason: 'from 4 bookings', learnedAt: at(9) }), NOW, TZ)).toBe(
      'I guessed · from 4 bookings · 9 Oct',
    );
  });
  it('a guess without a reason is not shown', () => {
    expect(sourceLine(fact('a', { provenance: 'guessed', reason: null }), NOW, TZ)).toBeNull();
    const view = groupFacts([fact('a', { provenance: 'guessed', reason: '' }), fact('b')], () => undefined);
    expect(view.sections.flatMap((s) => s.facts.map((f) => f.id))).toEqual(['b']);
  });
  it('from an app: "From Gmail · 9 Oct" (a guess read from Gmail, WhatsApp or the calendar, 08-3 §12)', () => {
    const g = fact('a', { provenance: 'guessed', reason: 'from an email', originKind: 'gmail', originLabel: 'Gmail', learnedAt: at(9) });
    expect(sourceLine(g, NOW, TZ)).toBe('From Gmail · 9 Oct');
    const w = fact('b', { provenance: 'guessed', reason: 'from a chat', originKind: 'whatsapp', originLabel: 'WhatsApp' });
    expect(sourceLine(w, NOW, TZ)).toBe('From WhatsApp · 2 Oct');
  });
  it('a fact the user confirmed or edited stays "You said" whatever its origin', () => {
    expect(sourceLine(fact('a', { originKind: 'gmail', originLabel: 'Gmail', learnedAt: at(16) }), NOW, TZ)).toBe('You said · 16 Oct');
  });
  it('private facts end line 2 with " · Private"', () => {
    expect(sourceLine(fact('a', { private: true }), NOW, TZ)).toBe('You said · 2 Oct · Private');
  });
  it('Narrator row name: "{fact}. {source}."', () => {
    expect(rowName(fact('a', { text: 'Prefers window seats' }), NOW, TZ)).toBe('Prefers window seats. You said · 2 Oct.');
  });
});

describe('groups (06-2 §7.3 "Groups", "Helpers\' notes")', () => {
  it('PEOPLE, PREFERENCES, PLACES, FACTS by kind; empty groups hidden; most recently used first', () => {
    const facts = [
      fact('p1', { kind: 'person', lastUsedAt: at(3) }),
      fact('f1', { kind: 'fact', learnedAt: at(1) }),
      fact('p2', { kind: 'person', lastUsedAt: at(10) }),
      fact('f2', { kind: 'fact', learnedAt: at(5) }),
      fact('pl', { kind: 'place' }),
    ];
    const { sections } = groupFacts(facts, () => undefined);
    expect(sections.map((s) => [s.kind, s.facts.map((f) => f.id)])).toEqual([
      ['person', ['p2', 'p1']],
      ['place', ['pl']],
      ['fact', ['f2', 'f1']],
    ]);
  });
  it("helper notes go under HELPERS' NOTES, one row per helper with its count", () => {
    const notes = (id: string) => fact(id, { file: 'helpers/h_trips/notes.md', scope: 'helper' });
    const { sections, helpers } = groupFacts([notes('n1'), notes('n2'), fact('f1')], (id) => (id === 'h_trips' ? 'Trips' : undefined));
    expect(sections.map((s) => s.kind)).toEqual(['fact']);
    expect(helpers).toEqual([
      { helperId: 'h_trips', name: 'Trips', facts: [expect.objectContaining({ id: 'n1' }), expect.objectContaining({ id: 'n2' })] },
    ]);
  });
});

describe('filters, search and the learned strip (06-2 §7.3)', () => {
  const facts = [
    fact('s', { text: 'Prefers window seats' }),
    fact('g', { provenance: 'guessed', reason: 'from 4 bookings', text: 'Books IndiGo' }),
    fact('m', { provenance: 'guessed', reason: 'from an email', originKind: 'gmail', text: 'Mom’s birthday is 18 Oct' }),
    fact('n', { learnedAt: NOW - 2 * DAY, text: 'New this week' }),
  ];
  it('"From …" chips appear only when such facts exist', () => {
    expect(visibleChips(facts)).toEqual(['all', 'said', 'guessed', 'gmail', 'chat']);
    expect(visibleChips([fact('x', { originKind: 'manual' })])).toEqual(['all', 'said', 'guessed']);
  });
  it('chips are single-select over provenance or origin', () => {
    const ids = (f: PageFilter) => facts.filter((x) => matches(x, f, NOW)).map((x) => x.id);
    expect(ids({ ...all, chip: 'said' })).toEqual(['s', 'n']);
    expect(ids({ ...all, chip: 'guessed' })).toEqual(['g', 'm']);
    expect(ids({ ...all, chip: 'gmail' })).toEqual(['m']);
    expect(ids({ ...all, last7: true })).toEqual(['n']);
  });
  it('search is local and case-insensitive; matches are marked', () => {
    expect(facts.filter((x) => matches(x, { ...all, q: 'WINDOW' }, NOW)).map((x) => x.id)).toEqual(['s']);
    expect(highlight('Prefers window seats', 'WINDOW')).toEqual([
      { text: 'Prefers ', hit: false },
      { text: 'window', hit: true },
      { text: ' seats', hit: false },
    ]);
    expect(highlight('abc', '')).toEqual([{ text: 'abc', hit: false }]);
  });
  it('learned strip counts facts added in the last 7 days', () => {
    expect(learnedCount(facts, NOW)).toBe(1);
  });
});

describe('page states (06-2 §7.5)', () => {
  it('first time, empty after Forget everything, filter empty, list', () => {
    expect(pageState({ facts: [], shown: [], forgotAll: false })).toBe('first_time');
    expect(pageState({ facts: [], shown: [], forgotAll: true })).toBe('empty');
    expect(pageState({ facts: [fact('a')], shown: [], forgotAll: false })).toBe('filter_empty');
    expect(pageState({ facts: [fact('a')], shown: [fact('a')], forgotAll: false })).toBe('list');
  });
});

describe('forget by source (06-3 §14 C-3)', () => {
  it('maps each ⋯ menu item to its origin and counts those facts', () => {
    const facts = [fact('a', { originKind: 'gmail' }), fact('b', { originKind: 'gmail' }), fact('c')];
    expect(forgetSource('gmail', facts)).toEqual({ origin: 'gmail', count: 2 });
    expect(forgetSource('chat', facts)).toEqual({ origin: 'chat', count: 1 });
    expect(forgetSource('whatsapp', facts)).toEqual({ origin: 'whatsapp', count: 0 });
  });
});

describe('export stops (08-3 §19.6)', () => {
  it('a secret says "I found a key in the export…"; DISK_FULL leaves it to the DISK_LOW card; others say something went wrong', () => {
    expect(exportErrorLine('EXPORT_SECRET_FOUND')).toBe('I found a key in the export, so I stopped. Nothing was saved.');
    expect(exportErrorLine('DISK_FULL')).toBeNull();
    expect(exportErrorLine(undefined)).toBeNull();
    expect(exportErrorLine('UNKNOWN')).toBe(t('errors.unknown.what_happened'));
  });
});

describe('each Memory page button sends exactly one invoke (06-2 §7.4, 08-1 §3.2)', () => {
  const calls: [string, unknown][] = [];
  const answers: Record<string, unknown> = { 'files:pickFolder': { path: 'C:/Users/me/Documents' } };
  beforeEach(() => {
    calls.length = 0;
    setBridge({
      invoke: (channel: string, payload: unknown) => {
        calls.push([channel, payload]);
        return Promise.resolve({ ok: true, value: answers[channel] ?? null });
      },
      on: () => () => undefined,
    } as never);
  });
  afterEach(() => setBridge(undefined));

  it.each([
    ['add', () => memoryActions.add('  I’m allergic to peanuts '), ['memory:add', { text: 'I’m allergic to peanuts' }]],
    ['edit', () => memoryActions.edit('f_1', 'Prefers aisle seats'), ['memory:edit', { factId: 'f_1', text: 'Prefers aisle seats' }]],
    ['forget', () => memoryActions.forget('f_1'), ['memory:forget', { factId: 'f_1' }]],
    ['undo', () => memoryActions.undo('u_1'), ['memory:undo', { undoToken: 'u_1' }]],
    ['mark private', () => memoryActions.setPrivate('f_1', true), ['memory:setPrivate', { factId: 'f_1', private: true }]],
    ['move to People', () => memoryActions.setKind('f_1', 'person'), ['memory:setKind', { factId: 'f_1', kind: 'person' }]],
    ['C-3', () => memoryActions.forgetBySource('gmail'), ['memory:forgetBySource', { source: 'gmail', confirm: true }]],
    ['C-4', () => memoryActions.forgetAll(), ['memory:forgetAll', { typed: 'FORGET' }]],
    ['open the memory folder', () => memoryActions.openFolder(), ['memory:openFolder', {}]],
    ['open the file', () => memoryActions.openFile('memory/about-you.md'), ['files:open', { path: 'memory/about-you.md' }]],
    ['turn back on', () => memoryActions.turnBackOn(), ['settings:set', { path: 'privacy.rememberOn', value: true }]],
  ] as const)('%s', async (_name, run, expected) => {
    await run();
    expect(calls).toEqual([expected]);
  });

  it('Export what I know: the folder picker, then data:export scope memory', async () => {
    await memoryActions.exportTo();
    expect(calls).toEqual([
      ['files:pickFolder', { purpose: 'export' }],
      ['data:export', { folder: 'C:/Users/me/Documents', scope: 'memory' }],
    ]);
  });
  it('a cancelled picker exports nothing', async () => {
    answers['files:pickFolder'] = {};
    expect(await memoryActions.exportTo()).toBeNull();
    expect(calls.map((c) => c[0])).toEqual(['files:pickFolder']);
  });
  it('"Show where I learned it" opens the chat a chat origin names', () => {
    expect(learnedInChat({ origin: 'chat:c_foo/m_9', originKind: 'chat' })).toBe('c_foo');
    expect(learnedInChat({ origin: 'gmail:abc', originKind: 'gmail' })).toBeNull();
  });
});

describe('undo bar text (02-3 §F21.3, 06-2 §7.4)', () => {
  it('"Forgot "{fact}"." with an ellipsis at 48 characters of the quoted item', () => {
    expect(undoText('Prefers window seats')).toBe('Forgot “Prefers window seats”.');
    const long = 'a'.repeat(60);
    expect(undoText(long)).toBe(`Forgot “${'a'.repeat(47)}…”.`);
  });
});
