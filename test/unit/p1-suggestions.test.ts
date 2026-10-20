// P1 T6 (04-2 §21.7, CR-0021 pick 10, AT-307, AT-308): the reply's `Suggestions:` line → ≤ 3 trimmed follow-ups of ≤ 40
// characters with banned words dropped, stripped from the bubble (also while streaming), and the chip row's hide rules.
import { describe, expect, it } from 'vitest';
import { ReleaseGate } from '../../src/engine/prompt/releaseGate';
import { splitSuggestions } from '../../src/engine/prompt/suggestions';
import { Redactor } from '../../src/engine/redact/Redactor';
import { suggestionsFor, type SuggestFacts } from '../../src/renderer/composer/suggestions';
import { FakeClock } from '../../src/shared/clock';
import type { CardType } from '../../src/shared/types';

describe('AT-308 Suggestions: line (engine)', () => {
  it('strips the last line and keeps up to 3 trimmed items', () => {
    const r = splitSuggestions('Your train leaves at 9:00 AM.\nSuggestions:  Book a cab |Set a reminder| Show the map | Pack list');
    expect(r.text).toBe('Your train leaves at 9:00 AM.\n');
    expect(r.suggestions).toEqual(['Book a cab', 'Set a reminder', 'Show the map']);
  });

  it('a reply without the line is unchanged and has none', () => {
    expect(splitSuggestions('Done. Anything else?')).toEqual({ text: 'Done. Anything else?', suggestions: null });
  });

  it('drops items over 40 characters (never cuts them) and empty ones', () => {
    const long = 'Tell me every single train that leaves Pune'; // 43
    const r = splitSuggestions(`Sure.\nSuggestions: ${long} | | Plan my day`);
    expect(r.suggestions).toEqual(['Plan my day']);
  });

  it('drops items with an Article 2 word; none left → null', () => {
    expect(splitSuggestions('Ok.\nSuggestions: Check the API | Reset my token').suggestions).toBeNull();
    expect(splitSuggestions('Ok.\nSuggestions: Check the server | Call Asha').suggestions).toEqual(['Call Asha']);
  });

  it('the line is matched in any case and the text after it stays', () => {
    const r = splitSuggestions('Here you go.\n  suggestions: One | Two\n');
    expect(r.text).toBe('Here you go.\n');
    expect(r.suggestions).toEqual(['One', 'Two']);
  });
});

describe('AT-308 release gate never shows the Suggestions: line', () => {
  function setup() {
    const clock = new FakeClock();
    const out: string[] = [];
    const gate = new ReleaseGate({
      clock,
      redactor: new Redactor({ clock, log: () => {} }),
      rewrite: async () => null,
      onRelease: (text) => out.push(text),
      onSayClosed: () => {},
    });
    return { clock, out, gate };
  }

  it('chat mode: the whole reply without the line', async () => {
    const { gate, out } = setup();
    gate.feed('<say>All set.\nSuggestions: Plan my day | Pay a bill</say><act>{}</act>');
    await gate.done;
    expect(out.join('')).toBe('All set.\n');
  });

  it('streaming: a sentence break inside the line never releases it', async () => {
    const { gate, out, clock } = setup();
    gate.feed('<say>First one. Second one.\nSugg');
    clock.advance(1_500);
    expect(out.join('')).toBe('First one. Second one.\n');
    gate.feed('estions: Pay it. Now | Plan. Later');
    expect(out.join('')).toBe('First one. Second one.\n');
    gate.feed('</say>');
    await gate.done;
    expect(gate.releasedText).toBe('First one. Second one.\n');
  });
});

describe('AT-308 chip row hide rules and starter words', () => {
  const reply = (o: Partial<SuggestFacts['messages'][number]> = {}) => ({
    authorKind: 'foo' as const,
    kind: 'text' as const,
    cardId: null,
    jobId: null,
    suggestions: ['Book a cab', 'Show the map'],
    deletedAt: null,
    ...o,
  });
  const user = { authorKind: 'user' as const, kind: 'text' as const, cardId: null, jobId: null, suggestions: null, deletedAt: null };
  const base: SuggestFacts = { kind: 'foo', private: false, messages: [], cards: {}, recording: false, typed: false };

  it('empty chat: the 3 starters of foo and of a helper (spec words)', () => {
    expect(suggestionsFor(base)).toEqual({ kind: 'starter', items: ['Plan my day', 'What needs me?', 'Pay a bill'] });
    expect(suggestionsFor({ ...base, kind: 'helper' })).toEqual({
      kind: 'starter',
      items: ['What can you do?', 'Show what you’re working on', 'Help me with something'],
    });
  });

  it('a marker alone still counts as an empty chat', () => {
    const marker = { ...user, authorKind: 'system' as const, kind: 'marker' as const };
    expect(suggestionsFor({ ...base, messages: [marker] })?.kind).toBe('starter');
  });

  it('follow-ups only from the latest reply’s own suggestions', () => {
    expect(suggestionsFor({ ...base, messages: [user, reply()] })).toEqual({ kind: 'followup', items: ['Book a cab', 'Show the map'] });
    expect(suggestionsFor({ ...base, messages: [user, reply({ suggestions: null })] })).toBeNull();
    expect(suggestionsFor({ ...base, messages: [reply(), user] })).toBeNull();
    expect(suggestionsFor({ ...base, messages: [user, reply({ authorKind: 'helper' })] })?.kind).toBe('followup');
  });

  it('hidden on the first keystroke and while recording', () => {
    expect(suggestionsFor({ ...base, typed: true })).toBeNull();
    expect(suggestionsFor({ ...base, recording: true })).toBeNull();
  });

  it('hidden while the composer is disabled (§23.3: a chip could not fill the field)', () => {
    expect(suggestionsFor({ ...base, disabled: true })).toBeNull();
  });

  it('hidden in groups, WhatsApp mirrors and private chats', () => {
    expect(suggestionsFor({ ...base, kind: 'group' })).toBeNull();
    expect(suggestionsFor({ ...base, kind: 'wa_mirror' })).toBeNull();
    expect(suggestionsFor({ ...base, private: true })).toBeNull();
  });

  it.each<CardType>(['approval', 'payment', 'draft', 'secret'])('hidden when the latest reply holds a %s card', (type) => {
    const f = { ...base, messages: [user, reply({ kind: 'card', cardId: 'c1' })], cards: { c1: { type, jobId: null } } };
    expect(suggestionsFor(f)).toBeNull();
  });

  it('hidden when the reply’s job touched money; other jobs do not count', () => {
    const msgs = [user, reply({ jobId: 'j1' })];
    expect(suggestionsFor({ ...base, messages: msgs, cards: { c1: { type: 'payment', jobId: 'j1' } } })).toBeNull();
    expect(suggestionsFor({ ...base, messages: msgs, cards: { c1: { type: 'bill', jobId: 'j1' } } })).toBeNull();
    expect(suggestionsFor({ ...base, messages: msgs, cards: { c1: { type: 'payment', jobId: 'j2' } } })?.kind).toBe('followup');
    expect(suggestionsFor({ ...base, messages: msgs, cards: { c1: { type: 'checklist', jobId: 'j1' } } })?.kind).toBe('followup');
  });
});
