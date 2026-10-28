// Spec: CR-0069 (X-226): with a feature off, intake gets one more look at a kind that is likely wrong before foo shows that
// feature's line. QA-X-F30 (real-AI run 40595003833 on 2467a76): "Switch to dark mode" right after a memory ask came back
// `memory`, and foo said "I can't remember things…" with settings by chat on. QA-X-F32 (same run): "Book a table…" came back
// `reply`, so the jobs line never showed. A memory answer to a message with no remember, note or forget word never shows
// the memory line; a reply to a task ask with jobs off is asked once more.
import { afterEach, describe, expect, it } from 'vitest';
import { JOBS_OFF_LINE, MEMORY_OFF_LINE, REASK_EMPTY_LINE, REASK_JOB_LINE, REASK_MEMORY_LINE } from '../../src/engine/prompt/PromptBuilder';
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
  script: {
    match: { purpose: string; promptIncludes?: string };
    reply?: string;
    error?: string;
    once?: boolean;
    chunks?: { text: string; delayMs?: number }[];
  }[],
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
    'dhyan rakhna main vegetarian hoon',
    "don't store my address",
    'delete what you know about me',
    'I am vegetarian, keep that in mind',
    'remeber that I am vegetarian',
    'yad rakhna main vegetarian hoon',
    'erase my address',
    'take notes: my PIN changes monthly',
    'मेरा पता मिटा दो',
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

  it('Stop during the second look keeps the words the first look showed, with "Stopped." (review on CR-0069)', async () => {
    const shown = 'Main abhi book nahi kar sakta.';
    h = jobHarness({
      script: [
        {
          match: { purpose: 'intake' },
          chunks: [{ text: `<say>${shown} `, delayMs: 2_000 }, { text: `</say>\n${act({ kind: 'reply' }).slice('<say></say>\n'.length)}` }],
        },
        { match: { purpose: 'intake' }, reply: TABLE_JOB, delayMs: 60_000 },
      ],
      features: BATCH_1,
    });
    h.userSays('Book a cab for me');
    for (let i = 0; i < 40 && intakes(h).length < 2; i++) {
      await new Promise((r) => setTimeout(r, 20));
      h.clock.advance(250);
    }
    expect(intakes(h)).toHaveLength(2);
    h.send('reply.stop', { chatId: h.chatId });
    await h.settle();
    const rows = h.db.prepare("SELECT text, status, badge FROM messages WHERE author_kind = 'foo' AND kind = 'text'").all();
    expect(rows).toEqual([{ text: shown, status: 'complete', badge: 'stopped' }]);
  });

  it('one second look per message, even when an empty answer runs the turn again (review on CR-0069)', async () => {
    const x = await run([{ match: { purpose: 'intake' }, reply: act({ kind: 'reply' }), once: false }], 'Send me a joke');
    expect(asked(x, REASK_JOB_LINE)).toBe(1);
    expect(intakes(x).length).toBeLessThanOrEqual(3);
    expect(fooTexts(x)).toEqual([t('thread.reply.empty')]);
  });

  it('"Send me a joke" with jobs off: the second look is told that asking for words is a reply, and the joke stays (review on CR-0069)', async () => {
    const joke = 'Why did the router break up? Too many bad connections.';
    const x = await run(
      [
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }, joke) },
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }) },
      ],
      'Send me a joke',
    );
    expect(asked(x, REASK_JOB_LINE)).toBe(1);
    expect(REASK_JOB_LINE).toContain('asks foo for words (a joke');
    expect(fooTexts(x)).toEqual([joke]);
  });

  it('the jobs-off line goes with every intake on batch 1 and asks for everyday words, no offer to look things up (QA on f1a6d09)', async () => {
    // Real Claude on f1a6d09 answered "did you book the table?" with "this build only reads and checks things. I can find
    // cafes…": jargon, and an offer batch 1 cannot keep.
    const x = await run([{ match: { purpose: 'intake' }, reply: act({ kind: 'reply' }, 'No, I haven’t.') }], 'Did you book my table?');
    expect(intakes(x).length).toBeGreaterThan(0);
    expect(asked(x, JOBS_OFF_LINE)).toBe(intakes(x).length);
    expect(JOBS_OFF_LINE).not.toMatch(/^This build/);
    expect(JOBS_OFF_LINE).toContain('never mention a build or a version');
    expect(JOBS_OFF_LINE).toContain('never offer to search, find or check something');
    // Run 40646517889 (R1): "looking things up on the web" made a phone table a job; words from what the AI knows are a reply.
    expect(JOBS_OFF_LINE).not.toContain('looking things up');
    expect(JOBS_OFF_LINE).toContain('(an answer, a table, a comparison, a list, a plan), decide "reply"');
    // Run 40663528915 (B15): "what did I miss on WhatsApp" got "Tell me its name and I'll read what came in".
    expect(JOBS_OFF_LINE).toContain('cannot read the user’s email, WhatsApp or other apps yet');
    // Run 40663528915 (B1): with that longer line, "Switch to dark mode" came back a reply saying foo can't switch it.
    expect(JOBS_OFF_LINE).toContain('Changing foo’s own settings (dark mode, text size, language and the like) is not a task');
  });

  it('a reply with an empty say is asked once more with a line naming it, and the words show (R1, QA2 on run 40643760745)', async () => {
    // Real Claude answered "Make a table comparing 3 budget phones…" and "aur tumhara naam? sirf naam batao" with
    // `<say></say>` and kind reply, twice in a row (shape say_empty_before_act), so foo said "I didn't get that".
    const words = '| Phone | Price |\n|---|---|\n| A | ₹15,999 |';
    const x = await run(
      [
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }), once: true },
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }, words) },
      ],
      'Make a table comparing 3 budget phones under 20000 rupees',
    );
    expect(intakes(x)).toHaveLength(2);
    expect(asked(x, REASK_EMPTY_LINE)).toBe(1);
    expect(String(intakes(x)[0]!.system)).not.toContain(REASK_EMPTY_LINE);
    expect(fooTexts(x)).toHaveLength(1);
    expect(fooTexts(x)[0]).toContain('₹15,999');
  });

  it('a reply whose every sentence was dropped is run again without the empty-say line (review on CR-0069 item 9)', async () => {
    // "webhook" is a banned word with no plain word: the sentence waits for a rewrite turn, which fails, so it is dropped.
    const x = await run(
      [
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }, 'The webhook failed.'), once: true },
        { match: { purpose: 'rewrite' }, error: 'AI_TIMEOUT' },
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }, 'All good now.') },
      ],
      'Is it working?',
    );
    expect(intakes(x)).toHaveLength(2);
    expect(asked(x, REASK_EMPTY_LINE)).toBe(0);
  });

  it('a protocol rerun of the empty-say retry still carries the line (review on CR-0069 item 9)', async () => {
    const x = await run(
      [
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }), once: true },
        { match: { purpose: 'intake' }, error: 'AI_PROTOCOL_VIOLATION', once: true },
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }, 'Here it is.') },
      ],
      'Make a table comparing 3 budget phones under 20000 rupees',
    );
    expect(intakes(x).map((turn) => String(turn.system).includes(REASK_EMPTY_LINE))).toEqual([false, true, true]);
    expect(fooTexts(x)).toEqual(['Here it is.']);
  });

  it('Try again after an empty-say retry is a new ask, without the empty-say line (review on CR-0069 item 9)', async () => {
    const x = await run(
      [
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }), once: true },
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }, 'First words.'), once: true },
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }, 'Second words.') },
      ],
      'Tell me something',
    );
    const first = x.db.prepare("SELECT id FROM messages WHERE author_kind = 'foo' AND kind = 'text'").get() as { id: string };
    x.send('reply.rewrite', { messageId: first.id });
    await x.settle();
    expect(intakes(x)).toHaveLength(3);
    expect(String(intakes(x)[1]!.system)).toContain(REASK_EMPTY_LINE);
    expect(String(intakes(x)[2]!.system)).not.toContain(REASK_EMPTY_LINE);
    expect(fooTexts(x)).toEqual(['Second words.']);
  });

  it('a memory answer on a later run of the same message still never gets the memory line (review on CR-0069)', async () => {
    const x = await run(
      [
        { match: { purpose: 'intake' }, reply: MEMORY },
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }) },
        { match: { purpose: 'intake' }, reply: MEMORY },
      ],
      'Switch to dark mode',
    );
    expect(fooTexts(x)).not.toContain(t('thread.feature_off.memory'));
    expect(fooTexts(x)).toEqual([t('thread.reply.empty')]);
  });

  it('memory off: a first look labelled memory and a second look that replies posts that reply', async () => {
    const x = await run(
      [
        { match: { purpose: 'intake' }, reply: MEMORY },
        { match: { purpose: 'intake' }, reply: act({ kind: 'reply' }, 'Dark mode is in Settings, under Appearance.') },
      ],
      'how do I get dark mode',
    );
    expect(fooTexts(x)).toEqual(['Dark mode is in Settings, under Appearance.']);
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
