// M3 FOO/1 envelope (08-2 §7.3, §7.5; 08-4 §25.5 item 1, §24.8) and the strict act schemas (08-4 §25.1–§25.4).
import { describe, expect, it } from 'vitest';
import { formatIssues, parseEnvelope, validateAct } from '../../src/engine/prompt/envelope';
import { IntakeActSchema } from '../../src/shared/schemas';

const logs: string[] = [];
const log = (k: string, d?: Record<string, unknown>) => logs.push(`${k} ${JSON.stringify(d)}`);

describe('m3 parseEnvelope', () => {
  it('reads <say> and <act>', () => {
    const e = parseEnvelope('<say>Hi there.</say>\n<act>{"decision":{"kind":"reply"},"usedMemoryIds":[]}</act>');
    expect(e.say).toBe('Hi there.');
    expect(e.sayTagged).toBe(true);
    expect(e.act).toEqual({ decision: { kind: 'reply' }, usedMemoryIds: [] });
    expect(e.actError).toBeNull();
    expect(e.strayChars).toBe(0);
  });

  it('untagged: text before the first <act> is the say', () => {
    const e = parseEnvelope('Hello Vikas.\n<act>{}</act>');
    expect(e.say).toBe('Hello Vikas.');
    expect(e.sayTagged).toBe(false);
    expect(e.act).toEqual({});
  });

  it('untagged with no <act>: the whole reply is the say, act missing', () => {
    const e = parseEnvelope('Just text');
    expect(e.say).toBe('Just text');
    expect(e.act).toBeUndefined();
    expect(e.actError).toMatch(/no <act>/);
  });

  it('stray text between </say> and <act> and after </act> is dropped and logged (length only)', () => {
    logs.length = 0;
    const e = parseEnvelope('<say>A.</say> oops <act>{}</act> trailing', { log });
    expect(e.say).toBe('A.');
    expect(e.strayChars).toBe('oops'.length + 'trailing'.length);
    expect(logs).toEqual(['PROTOCOL_STRAY_TEXT {"chars":12}']);
  });

  it('a <say> with no </say> ends at <act>', () => {
    expect(parseEnvelope('<say>Half<act>{}</act>').say).toBe('Half');
  });

  it('non-JSON act', () => {
    const e = parseEnvelope('<say></say><act>{nope}</act>');
    expect(e.act).toBeUndefined();
    expect(e.actError).toMatch(/not one JSON/);
  });
});

describe('m3 validateAct', () => {
  it('accepts every IntakeDecision kind of §25.2', () => {
    const acts = [
      { kind: 'reply' },
      { kind: 'react', emoji: '👍' },
      { kind: 'react', emoji: '❤️' },
      { kind: 'ask', card: { question: 'Which day?', options: [{ label: 'Sat 12 Dec' }, { label: 'Sun 13 Dec', detail: 'cheaper' }] } },
      { kind: 'handoff', helperId: 'h_trips', task: 'Book a train to Mumbai' },
      {
        kind: 'job',
        title: 'Train to Mumbai',
        plan: [{ phraseKey: 'check_site', slots: { site: 'IRCTC' }, route: 'browser' }],
        estimate: { minutes: 3 },
        routeHint: ['browser'],
        needsApps: [],
      },
      {
        kind: 'routine',
        draft: {
          title: 'BTC price',
          whatText: 'Tell me when BTC drops below ₹55,00,000',
          task: { prompt: 'Check BTC on CoinDCX', tools: ['web.read'], site: 'coindcx.com' },
          schedule: { kind: 'interval', everyMin: 15, anchor: 0 },
          tz: 'Asia/Kolkata',
          conditionText: 'below ₹55,00,000',
          whereChatId: 'c_foo',
          deliverToast: true,
        },
      },
      { kind: 'memory', op: 'remember', text: 'I like window seats' },
      { kind: 'setting', path: 'chat.voiceReplies', value: 'never' },
      { kind: 'catch_up', source: { kind: 'wa_group', chatId: 'wa_1' }, sinceHint: 'since yesterday' },
      { kind: 'catch_up', source: { kind: 'gmail' } },
    ];
    for (const decision of acts) {
      const r = validateAct('intake', { decision, usedMemoryIds: ['m1'], tags: ['intent_capabilities'] });
      expect(r.ok, JSON.stringify(decision)).toBe(true);
    }
  });

  it('rejects unknown fields (strict), wrong kinds and a lang field', () => {
    expect(validateAct('intake', { decision: { kind: 'reply', extra: 1 }, usedMemoryIds: [] }).ok).toBe(false);
    expect(validateAct('intake', { decision: { kind: 'chat' }, usedMemoryIds: [] }).ok).toBe(false);
    expect(validateAct('intake', { decision: { kind: 'reply' }, usedMemoryIds: [], lang: 'en' }).ok).toBe(false);
    expect(validateAct('intake', { decision: { kind: 'react', emoji: '🎉' }, usedMemoryIds: [] }).ok).toBe(false);
    const card = { question: 'Q?', options: [{ label: 'only one' }] };
    expect(validateAct('intake', { decision: { kind: 'ask', card }, usedMemoryIds: [] }).ok).toBe(false);
  });

  it('issues are zod messages joined by "; " and cut to 400 chars (repair.md)', () => {
    const r = validateAct('intake', { decision: { kind: 'reply', a: 1 }, extra: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues).toContain('; ');
      expect(r.issues.length).toBeLessThanOrEqual(400);
    }
    expect(formatIssues(['x'.repeat(300), 'y'.repeat(300)])).toHaveLength(400);
    expect(validateAct('intake', undefined).ok).toBe(false);
  });

  it('small acts: second look, rewrite, stuck', () => {
    expect(validateAct('second_look', { match: true }).ok).toBe(true);
    expect(validateAct('second_look', { match: false, field: 'amount', userSaid: '₹500', actionHas: '₹5,000' }).ok).toBe(true);
    expect(validateAct('second_look', { match: false }).ok).toBe(false);
    expect(validateAct('rewrite', {}).ok).toBe(true);
    expect(validateAct('rewrite', { text: 'x' }).ok).toBe(false);
    expect(validateAct('classify', { whatsWrong: 'MakeMyTrip keeps sending me back to the search page' }).ok).toBe(true);
    expect(validateAct('classify', { whatsWrong: 'x'.repeat(81) }).ok).toBe(false);
  });

  it('a purpose with no M3 schema fails cleanly', () => {
    expect(validateAct('brief', {}).ok).toBe(false);
  });

  it('the schema is strict all the way down', () => {
    expect(
      IntakeActSchema.safeParse({
        decision: { kind: 'job', title: 't', plan: [{ phraseKey: 'k', slots: {}, route: 'browser', x: 1 }], routeHint: [], needsApps: [] },
        usedMemoryIds: [],
      }).success,
    ).toBe(false);
  });
});
