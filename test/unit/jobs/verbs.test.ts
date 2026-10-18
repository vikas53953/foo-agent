// Spec: 08-2 §5.3.1 (do-verb lexicon; empty → read_only), CR-0008 G-M4-14 ("cancel" alone is a stop word, "cancel my booking"
// is the delete verb).
import { describe, expect, it } from 'vitest';
import { extractDoVerbs } from '../../../src/engine/jobs/verbs';

describe('08-2 §5.3.1 extractDoVerbs', () => {
  it('a looking request has no do-verbs', () => {
    expect(extractDoVerbs('Find bills due this week')).toEqual([]);
    expect(extractDoVerbs('Read my email and tell me what is new')).toEqual([]);
  });
  it('English, Hinglish and Devanagari forms', () => {
    expect(extractDoVerbs('Book a table for two')).toEqual(['book']);
    expect(extractDoVerbs('Airtel ka bill bhar do')).toEqual(['pay']);
    expect(extractDoVerbs('मम्मी को भेज दो')).toEqual(['send']);
    expect(extractDoVerbs('Email Asha the plan')).toEqual(['send']);
    expect(extractDoVerbs('Add it to my calendar')).toEqual(['add_calendar']);
  });
  it('G-M4-14: "cancel my booking" is delete; bare "cancel" is not a verb here', () => {
    expect(extractDoVerbs('cancel my booking')).toEqual(['delete']);
    expect(extractDoVerbs('cancel')).toEqual([]);
  });
  it('"get me" is buy unless a table, slot, appointment, the time or directions follows', () => {
    expect(extractDoVerbs('get me new earphones')).toEqual(['buy']);
    expect(extractDoVerbs('get me directions to the station')).toEqual([]);
  });
});
