// Spec: CR-0054 (X-211): a build switches on the features in resources/features.json. An ask whose feature is off gets that
// feature's one fixed line (no job, no fact, no setting change); plain chat answers as before; with no list every feature is on.
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import { envelope } from '../unit/m3-engine-helpers';
import { BILLS_PLAN, jobHarness, jobIntake, type JobHarness } from './jobs/jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const BATCH_1 = 'install,ai,name,chat,settings';
const REMEMBER = envelope('', { kind: 'memory', op: 'remember', text: 'Allergic to peanuts' });

const fooTexts = (x: JobHarness) =>
  (x.db.prepare("SELECT text FROM messages WHERE author_kind = 'foo' AND kind = 'text'").all() as { text: string }[]).map((m) => m.text);
const count = (x: JobHarness, table: string) => (x.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('CR-0054 · feature switches', () => {
  it('jobs off: "Find bills due this week" gets the jobs line and starts no job', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN, { title: 'Bills due this week' })], features: BATCH_1 });
    h.userSays('Find bills due this week');
    await h.settle();
    expect(fooTexts(h)).toEqual([t('thread.feature_off.jobs')]);
    expect(count(h, 'jobs')).toBe(0);
  });

  it('memory off: "remember I\'m allergic to peanuts" gets the memory line and saves nothing', async () => {
    h = jobHarness({ script: [{ match: { purpose: 'intake' }, reply: REMEMBER }], features: BATCH_1 });
    h.userSays("remember I'm allergic to peanuts");
    await h.settle();
    expect(fooTexts(h)).toEqual([t('thread.feature_off.memory')]);
    expect(count(h, 'memory_index')).toBe(0);
  });

  it('memory off: words the AI already showed ("Noted: Vegetarian.") give way to the memory line in one bubble (CR-0067)', async () => {
    // QA-X-F29 (real-AI run on 20c8ba0): "Noted: Vegetarian." and then "I can't remember things…", two bubbles that disagree.
    const act = `<act>${JSON.stringify({ decision: { kind: 'memory', op: 'remember', text: 'Vegetarian' }, usedMemoryIds: [] })}</act>`;
    h = jobHarness({
      script: [{ match: { purpose: 'intake' }, chunks: [{ text: '<say>Noted: Vegetarian.</say>\n' }, { text: act, delayMs: 5_000 }] }],
      features: BATCH_1,
    });
    h.userSays('remember that I am vegetarian');
    await h.settle();
    expect(fooTexts(h)).toEqual([t('thread.feature_off.memory')]);
    expect(count(h, 'memory_index')).toBe(0);
  });

  it('jobs off: "Book a table for 2 tonight" answered with kind ask gets the jobs line and no Choice card', async () => {
    // B1-batch1 on 1d498c0: the real AI asked "Kaunsa area?" on a Choice card instead of planning the job.
    const ask = `<say></say>\n<act>${JSON.stringify({ decision: { kind: 'ask', card: { question: 'Which area?', options: [{ label: 'Connaught Place' }, { label: 'Khan Market' }] } }, usedMemoryIds: [] })}</act>`;
    const choices = (x: JobHarness) => (x.db.prepare("SELECT COUNT(*) AS n FROM cards WHERE type = 'choice'").get() as { n: number }).n;
    h = jobHarness({ script: [{ match: { purpose: 'intake' }, reply: ask }], features: BATCH_1 });
    h.userSays('Book a table for 2 tonight at a cafe in Delhi');
    await h.settle();
    expect(fooTexts(h)).toEqual([t('thread.feature_off.jobs')]);
    expect(choices(h)).toBe(0);
    h.close();
    h = jobHarness({ script: [{ match: { purpose: 'intake' }, reply: ask }] });
    h.userSays('Book a table for 2 tonight at a cafe in Delhi');
    await h.settle();
    expect(choices(h)).toBe(1);
  });

  it('batch 1 still chats: "hi" gets the reply', async () => {
    h = jobHarness({
      script: [{ match: { purpose: 'intake' }, reply: envelope('Hi! How can I help?', { kind: 'reply' }) }],
      features: BATCH_1,
    });
    h.userSays('hi');
    await h.settle();
    expect(fooTexts(h)).toEqual(['Hi! How can I help?']);
  });

  it('jobs off: "What can you do?" gets the sentence and no Capabilities card (every row is a task)', async () => {
    const tagged = `<say>I can chat with you about anything.</say><act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [], tags: ['intent_capabilities'] })}</act>`;
    const cards = (x: JobHarness) => (x.db.prepare("SELECT COUNT(*) AS n FROM cards WHERE type = 'kit'").get() as { n: number }).n;
    h = jobHarness({ script: [{ match: { purpose: 'intake' }, reply: tagged }], features: BATCH_1 });
    h.userSays('What can you do?');
    await h.settle();
    expect(fooTexts(h)).toEqual(['I can chat with you about anything.']);
    expect(cards(h)).toBe(0);
    h.close();
    h = jobHarness({ script: [{ match: { purpose: 'intake' }, reply: tagged }] });
    h.userSays('What can you do?');
    await h.settle();
    expect(cards(h)).toBe(1);
  });

  it('"shipped" reads resources/features.json, which ships batch 1 (no job)', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN)], features: 'shipped' });
    h.userSays('Find bills due this week');
    await h.settle();
    expect(fooTexts(h)).toEqual([t('thread.feature_off.jobs')]);
  });

  it('with no list every feature is on: the same ask starts its job', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN)] });
    h.userSays('Find bills due this week');
    await h.settle();
    expect(count(h, 'jobs')).toBe(1);
    expect(fooTexts(h)).not.toContain(t('thread.feature_off.jobs'));
  });
});
