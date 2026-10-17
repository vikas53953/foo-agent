// Spec: 04 §13 (markdown subset, code block, table, citations), §12.1 (rich triggers), §14.4 (streaming hold-back),
// §10.10 (the user's WhatsApp set), §16.1 (auto-links), §16.2 (money), §13 C-26 (link text naming another domain),
// §10.9 (emoji-only), §2 / §12.2 (script lang), §10.5 (Read more), §10.3 (voice: waveform, speed, transcript state),
// 05-3 §5.22 (table card cells and copy), 02-2 §F13.3 (row estimates).
import { describe, expect, it } from 'vitest';
import {
  allSources,
  headingRanks,
  isRich,
  parseBlocks,
  parseInline,
  parseWhatsApp,
  plainText,
  streamSafe,
} from '../../src/renderer/messages/markdownParse';
import {
  READ_MORE_OVER_LINES,
  emojiOnly,
  findAutoLinks,
  findMoney,
  formatMoneyIn,
  hrefOf,
  needsReadMore,
  otherDomain,
  scriptLang,
} from '../../src/renderer/messages/textRules';
import { BARS, TRANSCRIPT_WAIT_MS, nextSpeed, voiceTextState, waveform } from '../../src/renderer/messages/voiceRules';
import { cellText, tableTsv } from '../../src/renderer/cards/tableText';
import { estimateText } from '../../src/renderer/messages/rows';
import type { TablePayload } from '../../src/shared/types';

const TZ = 'Asia/Kolkata';
const NOW = Date.UTC(2026, 9, 16, 3, 30);

describe('markdown subset (04 §13)', () => {
  it('headings, lists two deep, quotes, rules, code and tables', () => {
    const b = parseBlocks('### Goa\n\n- a\n  - b\n\n> q\n\n---\n\n```ts\nconst x = 1;\n```\n\n| A | B |\n|---|---:|\n| x | ₹1 |');
    expect(b.map((x) => x.t)).toEqual(['h', 'list', 'quote', 'hr', 'code', 'table']);
    const list = b[1] as Extract<(typeof b)[number], { t: 'list' }>;
    expect(list.items[0]!.sub?.items).toHaveLength(1);
    const code = b[4] as Extract<(typeof b)[number], { t: 'code' }>;
    expect(code).toEqual({ t: 'code', lang: 'ts', v: 'const x = 1;' });
    const table = b[5] as Extract<(typeof b)[number], { t: 'table' }>;
    expect(table.numeric).toEqual([false, true]);
  });
  it('raw HTML and task boxes are plain text', () => {
    expect(plainText(parseBlocks('<b>hi</b>'))).toBe('<b>hi</b>');
    expect(plainText(parseBlocks('- [x] done'))).toBe('• done');
  });
  it('bold, italic, strike, inline code and links; copy is plain with "text (url)"', () => {
    const p = parseBlocks('**a** *b* ~~c~~ `d` [e](https://e.in)');
    expect(plainText(p)).toBe('a b c d e (https://e.in)');
  });
  it('citations: consecutive cite links become one pill; sources de-duplicate', () => {
    const p = parseBlocks('Fares. [MakeMyTrip](cite+https://www.makemytrip.com/) [IndiGo](cite+https://www.goindigo.in/)');
    const para = p[0] as Extract<(typeof p)[number], { t: 'p' }>;
    const cites = para.c.filter((n) => n.t === 'cite');
    expect(cites).toHaveLength(1);
    expect(allSources(p).map((s) => s.name)).toEqual(['MakeMyTrip', 'IndiGo']);
    expect(plainText(p)).toBe('Fares.');
  });
  it('rich triggers: heading, table, code, image, > 7 list items or > 900 characters', () => {
    expect(isRich('just a line')).toBe(false);
    expect(isRich('# Title')).toBe(true);
    expect(isRich('```\nx\n```')).toBe(true);
    expect(isRich(Array.from({ length: 8 }, (_, i) => `- ${i}`).join('\n'))).toBe(true);
    expect(isRich(Array.from({ length: 7 }, (_, i) => `- ${i}`).join('\n'))).toBe(false);
    expect(isRich('x'.repeat(901))).toBe(true);
  });
  it('streaming holds back an unclosed ** or ` and a half table row', () => {
    expect(streamSafe('Hello **wor')).toBe('Hello ');
    expect(streamSafe('Hello **world**')).toBe('Hello **world**');
    expect(streamSafe('see `cod')).toBe('see ');
    expect(streamSafe('| A | B |\n|---|---|\n| x ')).toBe('| A | B |\n|---|---|\n');
    expect(streamSafe('```\nhalf **code')).toBe('```\nhalf **code');
  });
  it('the user’s WhatsApp set: *bold* _italic_ ~strike~ `code` and ```block``` only', () => {
    const kinds = parseWhatsApp('*a* _b_ ~c~ `d` ```e``` **f**').map((n) => n.t);
    expect(kinds).toEqual(expect.arrayContaining(['strong', 'em', 'del', 'code', 'pre']));
    expect(parseWhatsApp('# not a heading').every((n) => n.t === 'text')).toBe(true);
  });
});

describe('auto-links and money (04 §16)', () => {
  it('finds URLs, emails, Indian and international phones and dates; trailing punctuation is left out', () => {
    const t = 'see www.goa.in, mail me@x.in or call 98200 12345 or +971 5012 3456 on Sat 12 Dec, 7:30 PM.';
    expect(findAutoLinks(t).map((m) => [m.kind, m.text])).toEqual([
      ['url', 'www.goa.in'],
      ['email', 'me@x.in'],
      ['phone', '98200 12345'],
      ['phone', '+971 5012 3456'],
      ['date', 'Sat 12 Dec, 7:30 PM'],
    ]);
    expect(hrefOf({ kind: 'url', text: 'www.goa.in' })).toBe('https://www.goa.in');
    expect(hrefOf({ kind: 'phone', text: '98200 12345' })).toBe('tel:9820012345');
  });
  it('money becomes ₹ with Indian grouping; the digits never change; other currencies stay', () => {
    expect(formatMoneyIn('Rs 14600 and INR 1,179.50 and 1460000 rupees')).toBe('₹14,600 and ₹1,179.50 and ₹14,60,000');
    expect(formatMoneyIn('$40 or €12')).toBe('$40 or €12');
    expect(findMoney('₹ 5240')).toEqual([{ start: 0, end: 6, text: '₹5,240' }]);
  });
  it('foo’s inline text gets money and dates; the user’s text gets no date links (§10.7)', () => {
    expect(parseInline('Pay Rs 350 by Sat 12 Dec').some((n) => n.t === 'money')).toBe(true);
    expect(parseInline('Sat 12 Dec', { side: 'me' }).some((n) => n.t === 'auto')).toBe(false);
  });
  it('C-26: link text that names another domain asks first', () => {
    expect(otherDomain('makemytrip.com', 'https://evil.example/x')).toBe('evil.example');
    expect(otherDomain('www.makemytrip.com', 'https://makemytrip.com/f')).toBeNull();
    expect(otherDomain('Book here', 'https://evil.example/x')).toBeNull();
    expect(otherDomain('goindigo.in', 'https://www.book.goindigo.in/')).toBeNull();
  });
});

describe('emoji-only, script, Read more (04 §10.9, §2, §10.5)', () => {
  it('1 emoji → xl, 2–3 → l, 4+ or any letter → null; ZWJ and flags count once', () => {
    expect(emojiOnly('🎂')).toBe('xl');
    expect(emojiOnly('👨‍👩‍👧')).toBe('xl');
    expect(emojiOnly('🇮🇳🎉')).toBe('l');
    expect(emojiOnly('✈️🌴😎')).toBe('l');
    expect(emojiOnly('👍👍👍👍')).toBeNull();
    expect(emojiOnly('ok 👍')).toBeNull();
    expect(emojiOnly('1')).toBeNull();
  });
  it('lang: Devanagari → hi, Gurmukhi → pa, Hinglish stays en-IN', () => {
    expect(scriptLang('कल मिलते हैं')).toBe('hi');
    expect(scriptLang('ਮੰਮੀ ਨੂੰ ਕੇਕ ਕਦੋਂ ਮਿਲੇਗਾ?')).toBe('pa');
    expect(scriptLang('parso mummy ka birthday hai')).toBeUndefined();
    expect(scriptLang('OK, ठीक')).toBe('hi');
  });
  it('Read more only past 20 lines', () => {
    expect(needsReadMore(READ_MORE_OVER_LINES * 22, 22)).toBe(false);
    expect(needsReadMore(READ_MORE_OVER_LINES * 22 + 22, 22)).toBe(true);
  });
});

describe('voice, tables, estimates', () => {
  it('waveform is 40 bars of 4–24, stable per message; speed cycles 1 → 1.5 → 2 → 1', () => {
    const w = waveform('m_1');
    expect(w).toHaveLength(BARS);
    expect(w.every((h) => h >= 4 && h <= 24)).toBe(true);
    expect(waveform('m_1')).toEqual(w);
    expect(waveform('m_2')).not.toEqual(w);
    expect([nextSpeed(1), nextSpeed(1.5), nextSpeed(2)]).toEqual([1.5, 2, 1]);
  });
  it('the user’s transcript: working for a minute, then failed; foo’s voice is always ready', () => {
    const m = { transcript: null, text: '', createdAt: NOW };
    expect(voiceTextState(m, 'me', NOW + 1000)).toBe('working');
    expect(voiceTextState(m, 'me', NOW + TRANSCRIPT_WAIT_MS)).toBe('failed');
    expect(voiceTextState({ ...m, transcript: 'hi' }, 'me', NOW + TRANSCRIPT_WAIT_MS)).toBe('ready');
    expect(voiceTextState(m, 'them', NOW + TRANSCRIPT_WAIT_MS)).toBe('ready');
  });
  it('table card cells: paise through formatInr, text as written; Copy table is tab-separated', () => {
    const p: TablePayload = {
      title: 'Stays',
      columns: [
        { key: 'n', label: 'Hotel', align: 'left', unit: 'text' },
        { key: 'p', label: 'A night', align: 'right', unit: 'inr' },
      ],
      rows: [
        { n: 'Taj', p: 730_000 },
        { n: 'Novotel', p: null },
      ],
    };
    expect(cellText(730_000, p.columns[1]!, { timeZone: TZ, now: NOW })).toBe('₹7,300');
    expect(tableTsv(p, { timeZone: TZ, now: NOW })).toBe('Hotel\tA night\nTaj\t₹7,300\nNovotel\t');
  });
  it('row estimates grow by line and with attachments', () => {
    expect(estimateText('hi', 0)).toBe(56);
    expect(estimateText('a\nb\nc', 0)).toBe(56 + 2 * 22);
    expect(estimateText('x'.repeat(121), 0)).toBe(56 + 2 * 22);
    expect(estimateText('hi', 1)).toBe(56 + 204);
  });
});

describe('heading ranks inside a message (axe heading-order under the chat header h1)', () => {
  const ranks = (md: string) => {
    const blocks = parseBlocks(md);
    const r = headingRanks(blocks);
    const out: number[] = [];
    const walk = (list: typeof blocks) => {
      for (const b of list) {
        if (b.t === 'h') out.push(r.get(b)!);
        else if (b.t === 'quote') walk(b.c);
      }
    };
    walk(blocks);
    return out;
  };
  it('never steps down by more than one from h1, whatever row comes first', () => {
    expect(ranks('### Only a small heading\ntext')).toEqual([2]);
    expect(ranks('## Your Goa options\n### Flights\n#### Fares\n### Hotels')).toEqual([2, 3, 3, 3]);
    expect(ranks('### small\n# big\n### small again')).toEqual([2, 2, 3]);
    expect(ranks('> ### quoted\n\n## top')).toEqual([2, 2]);
  });
});
