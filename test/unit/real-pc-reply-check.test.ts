// 02-3 §F24 (reply script), 02-3 tone table ("thanks!" → react), QA-X-F31 (no raw <say> tags); project testing rule 10.
// Gate 10 (a52aa85) passed chat steps whose words were wrong, because waitReply only counted bubbles. These are the real
// replies from that run's step records, fed to the driver's reply check (pure: no app, no AI; pre-check only).
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Step = {
  replyRe?: string;
  replyNot?: string;
  maxBubbles?: number;
  maxChars?: number;
  script?: 'latin' | 'deva' | 'guru';
  notEcho?: boolean;
  allowReaction?: boolean;
};
const { replyFaults, scriptOf } = createRequire(import.meta.url)('../real-pc/reply-check.js') as {
  replyFaults: (s: Step, r: { texts: string[]; reactions?: string[] }, earlier?: string[]) => string[];
  scriptOf: (t: string) => string;
};
const kit = (j: string) => JSON.parse(readFileSync(join('test', 'real-pc', j), 'utf8')) as { steps: (Step & { do: string })[] };

describe('real-PC driver: a chat check reads foo’s words', () => {
  it('G3 s12: "are you still there?" answered with the earlier sleep tips fails', () => {
    const s = kit('gate/G3-restart.json').steps[12]!;
    const leak = 'Keep your room cool and dark.\nNo screens 30 minutes before bed.\n\n9:28 PM';
    expect(replyFaults(s, { texts: [leak] })).not.toEqual([]);
    expect(replyFaults(s, { texts: ['Haan, main yahin hoon! Bolo?\n\n9:28 PM'] })).toEqual([]);
  });

  it('QA1 s31: "Please just reply OK" answered with a copy of an older answer fails', () => {
    const s = kit('journeys/QA1-batch1-recheck.json').steps[31]!;
    expect(replyFaults(s, { texts: ['Chai, हमेशा। ☕\n\n9:13 PM'] })).not.toEqual([]);
    expect(replyFaults(s, { texts: ['OK\n\n9:13 PM'] })).toEqual([]);
  });

  it('G2 s18: a reply that repeats an earlier answer word for word fails (notEcho)', () => {
    const s = kit('gate/G2-chat.json').steps[18]!;
    const earlier = ['A young tiger named Raja lived deep in the forest.'];
    expect(replyFaults(s, { texts: ['A young tiger named Raja lived deep in the forest.\n\n9:26 PM'] }, earlier)).not.toEqual([]);
    expect(replyFaults(s, { texts: ['Got both lines. What should I do with them?\n9:26 PM'] }, earlier)).toEqual([]);
  });

  it('G4 s18: a settings ask answered with the AI’s own line plus the settings line fails', () => {
    const s = kit('gate/G4-settings.json').steps[18]!;
    expect(replyFaults(s, { texts: ['Changed: Text size → 110%.\n\n9:10 PM', 'Changed: Zoom → 110%. Undo'] })).not.toEqual([]);
    expect(replyFaults(s, { texts: ['Changed: Zoom → 110%. Undo'] })).toEqual([]);
  });

  it('QA5 s26: "7 aur 8?" answered with the old tortoise names leaking in fails', () => {
    const s = kit('journeys/QA5-restart-batch1.json').steps[26]!;
    expect(replyFaults(s, { texts: ['15\n\nKachhua ke liye 3 achhe naam:\n\nShelly\nMoti\n10:03 PM'] })).not.toEqual([]);
    expect(replyFaults(s, { texts: ['15\n10:03 PM'] })).toEqual([]);
  });

  it('QA3 s21: Roman Hinglish answered in Devanagari, or with an 8:15 alarm or a reminder offer, fails', () => {
    const s = kit('journeys/QA3-languages-batch1.json').steps[21]!;
    expect(replyFaults(s, { texts: ['सुबह 7:45 बजे अलार्म लगा लो।\n\n9:17 PM'] })).not.toEqual([]);
    expect(replyFaults(s, { texts: ['8:15 AM ka alarm laga lo. Chaho to main reminder set kar doon?'] })).not.toEqual([]);
    expect(replyFaults(s, { texts: ['7:30 baje ka alarm laga lo, aaram se tayyar ho jaoge.\n9:17 PM'] })).toEqual([]);
  });

  it('G2 s20: "thanks 🙏" gets a reaction and no words, or one short line; a welcome speech fails', () => {
    const s = kit('gate/G2-chat.json').steps[20]!;
    expect(replyFaults(s, { texts: [], reactions: ['❤️'] })).toEqual([]);
    expect(replyFaults(s, { texts: [], reactions: [] })).not.toEqual([]);
    expect(replyFaults(s, { texts: ["You're welcome! Let me know if you need anything else!"] })).not.toEqual([]);
  });

  it('raw <say> tags always fail; the script is decided at 30 % of letters (02-3 §F24)', () => {
    expect(replyFaults({}, { texts: ['<say>Hi</say>'] })).not.toEqual([]);
    expect(scriptOf('Chai, हमेशा।')).toBe('deva');
    expect(scriptOf('Haan bilkul, chai hi best hai yaar, हमेशा')).toBe('latin');
    expect(scriptOf('ਸਤ ਸ੍ਰੀ ਅਕਾਲ!')).toBe('guru');
  });
});

describe('gate journeys: no chat check is a plain wait', () => {
  const READS = ['replyRe', 'replyNot', 'script', 'notEcho', 'allowReaction', 'maxBubbles', 'expectJs', 'expectKit', 'expectTid'];
  const SENDS = new Set(['send', 'pasteSend', 'typeSend']);
  const ids = readFileSync(join('test', 'real-pc', 'gate.txt'), 'utf8')
    .split(/\s+/)
    .filter(Boolean);
  const file = (id: string) => (existsSync(join('test', 'real-pc', 'gate', `${id}.json`)) ? `gate/${id}.json` : `journeys/${id}.json`);

  it('every message sent in a gate journey is followed by a waitReply or waitJs that reads foo’s answer', () => {
    const weak: string[] = [];
    for (const id of ids) {
      const steps = kit(file(id)).steps as (Step & { do: string; [k: string]: unknown })[];
      steps.forEach((s, i) => {
        if (!SENDS.has(s.do)) return;
        const next = steps.slice(i + 1).findIndex((x) => SENDS.has(x.do));
        const span = steps.slice(i + 1, next < 0 ? undefined : i + 1 + next);
        const reads = span.some((x) => x.do === 'waitJs' || (x.do === 'waitReply' && READS.some((k) => k in x)));
        if (!reads) weak.push(`${id} step ${i}`);
      });
    }
    expect(weak).toEqual([]);
  });
});
