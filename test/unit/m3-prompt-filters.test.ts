// M3 output filters (08-2 §7.6 steps 1, 2, 3, 4; 08-4 §25.8 script forms; CR-0053 tables kept (AT-444); AT-031 filler; Redactor R10).
import { describe, expect, it } from 'vitest';
import { BANNED } from '../../scripts/check-copy';
import {
  BANNED_LIST,
  filterReply,
  filterSay,
  findBanned,
  mapBannedWords,
  removeFiller,
  splitSentences,
} from '../../src/engine/prompt/filters';
import { Redactor } from '../../src/engine/redact/Redactor';
import { FakeClock } from '../../src/shared/clock';

describe('m3 banned words (§7.6 step 1)', () => {
  it('covers every Article 2 form of scripts/check-copy.ts BANNED', () => {
    const samples = [
      'api',
      'token',
      'tokens',
      'cli',
      'oauth',
      'server',
      'servers',
      'cron',
      'webhook',
      'webhooks',
      'mcp',
      'json',
      'prompt',
      'prompts',
      'model',
      'models',
      'terminal',
      'terminals',
      'command',
      'commands',
      'error code',
      'error codes',
      'stack',
      'timeout',
      'time out',
      'time-out',
      'timeouts',
      'timed out',
      'localhost',
      'llm',
      'llms',
      'agent loop',
      'agent loops',
    ];
    for (const s of samples) {
      expect(s.match(new RegExp(BANNED.source, 'gi')), s).not.toBeNull();
      expect(findBanned(`x ${s} y`), s).toHaveLength(1);
    }
    expect(BANNED_LIST).toContain('agent');
    expect(BANNED_LIST).toContain('tool call');
  });

  it('maps to the plain words, keeping a leading capital', () => {
    expect(mapBannedWords('Your token expired. Token again.')).toBe('Your key expired. Key again.');
    expect(mapBannedWords('The API is down and the server is slow.')).toBe('The connection is down and the service is slow.');
    expect(mapBannedWords('API keys live here. Use OAuth.')).toBe('Keys live here. Use sign in.');
    expect(mapBannedWords('a cron, two prompts, the model, a CLI, the terminal, one command')).toBe(
      'a routine, two messages, the AI, a helper app, the helper app, one helper app',
    );
    expect(mapBannedWords('The agent loop ran a tool call. Agents help.')).toBe('The helper ran a step. Helpers help.');
    expect(mapBannedWords('Models are fine')).toBe('AI are fine');
  });

  it('whole words only', () => {
    expect(findBanned('tokenise apiary servery stacked prompted agentic commander')).toEqual([]);
  });

  it('unmapped words need a rewrite', () => {
    const r = filterSay('The webhook failed with a timeout.');
    expect(r.needsRewrite).toBe(true);
    expect(r.unmapped).toEqual(['webhook', 'timeout']);
    expect(filterSay('The token expired.').needsRewrite).toBe(false);
  });

  it('Hindi and Punjabi script forms (§25.8)', () => {
    expect(mapBannedWords('आपका टोकन खत्म हो गया। सर्वर धीमा है।')).toBe('आपका की खत्म हो गया। सेवा धीमा है।');
    expect(mapBannedWords('एपीआई बंद है, प्रॉम्प्ट लिखो, मॉडल बदलो, कमांड चलाओ, टर्मिनल खोलो')).toBe(
      'कनेक्शन बंद है, संदेश लिखो, AI बदलो, helper app चलाओ, helper app खोलो',
    );
    expect(mapBannedWords('ਤੁਹਾਡਾ ਟੋਕਨ ਅਤੇ ਸਰਵਰ, ਮਾਡਲ, ਕਮਾਂਡ')).toBe('ਤੁਹਾਡਾ ਕੁੰਜੀ ਅਤੇ ਸੇਵਾ, AI, helper app');
    // A longer word that only starts with the form is not the form (the matra/letter boundary).
    expect(findBanned('सर्वरों')).toEqual([]);
  });

  it('Hinglish (romanised) uses the Latin rules', () => {
    expect(mapBannedWords('Aapka token expire ho gaya, server down hai')).toBe('Aapka key expire ho gaya, service down hai');
  });
});

describe('m3 filler (§7.6 step 2)', () => {
  it('AT-031 no filler phrase survives', () => {
    const replies = [
      'Great question! The train leaves at 9:00 AM.',
      'The train leaves at 9:00 AM. How can I help you further?',
      'I apologize for the confusion. It is on Sat 12 Dec, 8:00 PM.',
      'As an AI, I cannot feel. Here are three options.',
      'Done. I hope this helps!',
      'great QUESTION. ok.',
    ];
    for (const r of replies) {
      const out = filterSay(r).text;
      expect(out).not.toMatch(/great question|how can i help you|i apologize for the confusion|as an ai|i hope this helps/i);
      expect(out.trim().length).toBeGreaterThan(0);
    }
    expect(removeFiller('Great question! The train leaves at 9:00 AM.')).toBe('The train leaves at 9:00 AM.');
  });

  it('sentence split keeps the text', () => {
    const t = 'One. Two? Three!\nFour। Five';
    expect(splitSentences(t).join('')).toBe(t);
    expect(splitSentences(t)).toHaveLength(5);
    expect(splitSentences('Pay ₹1.5 lakh now.')).toEqual(['Pay ₹1.5 lakh now.']);
  });
});

describe('CR-0053 tables stay tables (AT-444)', () => {
  // Real-AI run 62d419e R1: "Make a table comparing 3 budget phones" came back as "label: value" lines, never a table.
  it('AT-444 a table in a reply reaches the bubble as a table', () => {
    const say =
      'Fares:\n| Train | Fare | Leaves |\n| :-- | --: | --- |\n| Rajdhani | ₹2,450 | 4:00 PM |\n| Duronto | ₹1,980 | 11:00 PM |\nPick one.';
    expect(filterSay(say).text).toBe(say);
  });
});

describe('m3 Redactor last (§7.6 step 4)', () => {
  it('a registry value echoed by the AI is hidden', () => {
    const r = new Redactor({ clock: new FakeClock(), log: () => {} });
    r.registry.add({ handle: 'h', value: 'myS3cretValue' });
    expect(filterSay('Your code is myS3cretValue.', { redactor: r }).text).toBe('Your code is [hidden].');
  });
});

describe('m3 rewrite pipeline', () => {
  it('rewrite fixes it, or the sentence is dropped', async () => {
    expect(await filterReply('Fine. The webhook broke.', { rewrite: async () => 'Fine. The link broke.' })).toBe('Fine. The link broke.');
    expect(await filterReply('Fine. The webhook broke.', { rewrite: async () => null })).toBe('Fine. ');
    expect(await filterReply('Fine. The webhook broke.', { rewrite: async (t) => t })).toBe('Fine. ');
  });
});
