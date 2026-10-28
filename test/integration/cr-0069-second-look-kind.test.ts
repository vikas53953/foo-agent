// Spec: CR-0069 (X-226): with a feature off, intake gets one more look at a kind that is likely wrong before foo shows that
// feature's line. QA-X-F30 (real-AI run 40595003833 on 2467a76): "Switch to dark mode" right after a memory ask came back
// `memory`, and foo said "I can't remember things…" with settings by chat on. QA-X-F32 (same run): "Book a table…" came back
// `reply`, so the jobs line never showed. A memory answer to a message with no remember, note or forget word never shows
// the memory line; a reply to a task ask with jobs off is asked once more.
import { afterEach, describe, expect, it } from 'vitest';
import { MEMORY_OFF_LINE, REASK_JOB_LINE, REASK_MEMORY_LINE } from '../../src/engine/prompt/PromptBuilder';
import { t } from '../../src/shared/copy/t';
import { jobHarness, type JobHarness } from './jobs/jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const BATCH_1 = 'install,ai,name,chat,settings';
const act = (decision: Record<string, unknown>, say = '') =>
  `<say>${say}</say>\n<act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const MEMORY = act({ kind: 'memory', op: 'remember', text: 'Prefers dark mode' });
const DARK = act({ kind: 'setting', path: 'appearance.theme', value: 'dark' });
const TABLE_JOB = act({
  kind: 'job',
  title: 'Table for 2',
  plan: [{ phraseKey: 'check_site', slots: { site: 'the site' }, route: 'browser' }],
  routeHint: ['browser'],
  needsApps: [],
});
const HINGLISH_NO = 'Main abhi tasks nahi kar sakta.';

const fooTexts = (x: JobHarness) =>
  (x.db.prepare("SELECT text FROM messages WHERE author_kind = 'foo' AND kind = 'text' ORDER BY seq").all() as { text: string }[]).map(
    (m) => m.text,
  );
const intakes = (x: JobHarness) => x.turnsJsonl().filter((turn) => turn.purpose === 'intake');
const asked = (x: JobHarness, line: string) => intakes(x).filter((turn) => String(turn.system).includes(line)).length;

async function run(
  script: { match: { purpose: string; promptIncludes?: string }; reply?: string; chunks?: { text: string; delayMs?: number }[] }[],
  text: string,
  features: string | null = BATCH_1,
) {
  h = jobHarness({ script, ...(features ? { features } : {}) });
  h.userSays(text);
  await h.settle();
  return h;
}

describe('CR-0069 · memory off: a setting ask labelled memory gets a second look (QA-X-F30)', () => {
  it('"Switch to dark mode" labelled memory: asked once more, the setting changes, the memory line never shows', async () => {
    const x = await run(
      [
        { match: { purpose: 'intake' }, reply: MEMORY },
        { match: { purpose: 'intake' }, reply: DARK },
      ],
      'Switch to dark mode',
    );
    expect(intakes(x)).toHaveLength(2);
    expect(asked(x, REASK_MEMORY_LINE)).toBe(1);
    expect(x.settings().appearance.theme).toBe('dark');
    expect(fooTexts(x)).not.toContain(t('thread.feature_off.memory'));
  });

  it('labelled memory twice with no remember word: foo asks to say it another way, never the memory line', async () => {
    const x = await run(
      [
        { match: { purpose: 'intake' }, reply: MEMORY },
        { match: { purpose: 'intake' }, reply: MEMORY },
      ],
      'Switch to dark mode',
    );
    expect(intakes(x)).toHaveLength(2);
    expect(fooTexts(x)).toEqual([t('thread.reply.empty')]);
  });

  it.each([
    'remember that I am vegetarian',
    'yaad rakhna ki main vegetarian hoon',
    'याद रखना कि मैं शाकाहारी हूँ',
    'forget my address',
    'note that my PIN changes monthly',
  ])('a real memory ask ("%s") gets the memory line at once, with no second look', async (text) => {
    const x = await run([{ match: { purpose: 'intake' }, reply: MEMORY }], text);
    expect(intakes(x)).toHaveLength(1);
    expect(fooTexts(x)).toEqual([t('thread.feature_off.memory')]);
  });

  it('with memory off, every intake is told so (MEMORY_OFF_LINE); with every feature on it is not, and memory is never re-asked', async () => {
    let x = await run([{ match: { purpose: 'intake' }, reply: act({ kind: 'reply' }, 'Hi!') }], 'hi');
    expect(asked(x, MEMORY_OFF_LINE)).toBe(1);
    x.close();
    x = await run([{ match: { purpose: 'intake' }, reply: MEMORY }], 'Switch to dark mode', null);
    expect(intakes(x)).toHaveLength(1);
    expect(asked(x, MEMORY_OFF_LINE)).toBe(0);
  });
});

describe('CR-0069 · jobs off: a task ask answered in words gets a second look (QA-X-F32)', () => {
  it('"Book a table for 2 tonight" answered as a reply: asked once more, the jobs line replaces the words in one bubble', async () => {
    const x = await run(
      [
        {
          match: { purpose: 'intake' },
          chunks: [{ text: `<say>${HINGLISH_NO}</say>\n` }, { text: act({ kind: 'reply' }).slice('<say></say>\n'.length), delayMs: 5_000 }],
        },
        { match: { purpose: 'intake' }, reply: TABLE_JOB },
      ],
      'Book a table for 2 tonight at a cafe in Delhi',
    );
    expect(intakes(x)).toHaveLength(2);
    expect(asked(x, REASK_JOB_LINE)).toBe(1);
    expect(fooTexts(x)).toEqual([t('thread.feature_off.jobs')]);
    expect((x.db.prepare('SELECT COUNT(*) AS n FROM jobs').get() as { n: number }).n).toBe(0);
  });

  it('"Did you book my cab?" stays a reply after the second look: one bubble, the first answer kept', async () => {
    const no = 'No, I have not booked a cab. I cannot do tasks yet.';
    const x = await run(
      [
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }, no) },
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }, 'Theek hai.') },
      ],
      'Did you book my cab?',
    );
    expect(intakes(x)).toHaveLength(2);
    expect(fooTexts(x)).toEqual([no]);
  });

  it("words streamed by the first look stay when the second look fails or says nothing (QA-X-F31's one-line script)", async () => {
    const streamed = `${HINGLISH_NO} Jab yeh ready hoga, main book kar dunga.`;
    const replyAct = act({ kind: 'reply' }).slice('<say></say>\n'.length);
    let x = await run(
      [
        {
          match: { purpose: 'intake' },
          chunks: [
            { text: `<say>${streamed} `, delayMs: 2_000 },
            { text: `</say>\n${replyAct}`, delayMs: 5_000 },
          ],
        },
      ],
      'Did you book the cab?',
    );
    expect(intakes(x)).toHaveLength(2);
    expect(fooTexts(x)).toEqual([streamed]);
    x.close();
    x = await run(
      [
        {
          match: { purpose: 'intake' },
          chunks: [
            { text: `<say>${streamed} `, delayMs: 2_000 },
            { text: `</say>\n${replyAct}`, delayMs: 5_000 },
          ],
        },
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }) },
      ],
      'Did you book the cab?',
    );
    expect(fooTexts(x)).toEqual([streamed]);
  });

  it('plain chat is never asked twice: "hi" with jobs off, and a task ask with every feature on', async () => {
    let x = await run([{ match: { purpose: 'intake' }, reply: act({ kind: 'reply' }, 'Hi! How can I help?') }], 'hi');
    expect(intakes(x)).toHaveLength(1);
    expect(fooTexts(x)).toEqual(['Hi! How can I help?']);
    x.close();
    x = await run([{ match: { purpose: 'intake' }, reply: act({ kind: 'reply' }, 'Sure.') }], 'Book a table for 2 tonight', null);
    expect(intakes(x)).toHaveLength(1);
  });
});
