// ART-02b (10-2, Article 2; 08-2 §7.6, 08-4 §25.5 item 2, §25.8): 300 fixture replies with banned terms (English, Hindi in
// Devanagari, Hinglish, Gurmukhi) go through the reply pipeline with a fake rewrite turn that removes the word; 0 banned terms
// reach the text the bubble, the toast and Narrator are built from. Fixtures: test/fixtures/art-02b/replies.json
// (deterministic, seeded generator; 30 % of replies hold two sentences with terms).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BANNED } from '../../scripts/check-copy';
import { filterReply, findBanned } from '../../src/engine/prompt/filters';
import { ReleaseGate } from '../../src/engine/prompt/releaseGate';
import { Redactor } from '../../src/engine/redact/Redactor';
import { FakeClock } from '../../src/shared/clock';

interface Reply {
  id: string;
  lang: 'en' | 'hi' | 'mixed' | 'pa';
  text: string;
}
const replies = JSON.parse(readFileSync('test/fixtures/art-02b/replies.json', 'utf8')) as Reply[];

// Independent of the filter's own tables: ART-02a's regex, the 08-2 §7.6 additions and the 08-4 §25.8 script forms.
const EXTRA = /\b(agents?|tool calls?)\b/i;
const SCRIPT = /(?<![\p{L}\p{M}])(टोकन|टोकेन|सर्वर|प्रॉम्प्ट|प्रांप्ट|मॉडल|मोडल|कमांड|टर्मिनल|एपीआई|ਟੋਕਨ|ਸਰਵਰ|ਮਾਡਲ|ਕਮਾਂਡ)(?![\p{L}\p{M}])/u;
const banned = (t: string) => new RegExp(BANNED.source, 'i').test(t) || EXTRA.test(t) || SCRIPT.test(t);
const fakeRewrite = async (t: string) => findBanned(t).reduce((s, w) => s.split(w).join(''), t);

describe('ART-02b AI-reply post-processing', () => {
  it('has 300 fixtures in English, Hindi, Hinglish and Gurmukhi, each with a banned term', () => {
    expect(replies).toHaveLength(300);
    expect(new Set(replies.map((r) => r.lang))).toEqual(new Set(['en', 'hi', 'mixed', 'pa']));
    for (const r of replies) expect(banned(r.text), r.id).toBe(true);
  });

  it('whole replies (chat mode): 0 banned terms displayed', async () => {
    const redactor = new Redactor({ clock: new FakeClock(), log: () => {} });
    let kept = 0;
    for (const r of replies) {
      const out = await filterReply(r.text, { lang: r.lang, redactor, rewrite: fakeRewrite });
      expect(banned(out), `${r.id}: ${out}`).toBe(false);
      if (out.trim()) kept++;
    }
    expect(kept).toBe(300);
  });

  it('streamed replies (sentence mode through the release gate): 0 banned terms displayed', async () => {
    for (const r of replies) {
      const clock = new FakeClock();
      let shown = '';
      const gate = new ReleaseGate({
        clock,
        redactor: new Redactor({ clock, log: () => {} }),
        rewrite: fakeRewrite,
        onRelease: (t) => (shown += t),
        onSayClosed: () => {},
      });
      const raw = `<say>${r.text}</say><act>{"decision":{"kind":"reply"},"usedMemoryIds":[]}</act>`;
      for (let i = 0; i < raw.length; i += 7) {
        gate.feed(raw.slice(i, i + 7));
        if (i === 14) clock.advance(1_500);
      }
      gate.end();
      await gate.done;
      expect(banned(shown), `${r.id}: ${shown}`).toBe(false);
      expect(shown.trim().length, r.id).toBeGreaterThan(0);
    }
  });
});
