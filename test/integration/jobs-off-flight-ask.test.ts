// Spec: CR-0054 (a switched-off feature's kind gets that feature's line), 08-2 §5.3.4 (the flight scope card is part of jobs).
// Real Claude on the batch-1 build (run 40663528915, B15): "book me a flight to Goa on Sat 12 Dec" got the flight scope card
// ("I can find and compare flights… Compare flights") with jobs switched off, a promise batch 1 can't keep.
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import { jobHarness, type JobHarness } from './jobs/jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const BATCH_1 = 'install,ai,name,chat,settings';
const JOB = `<say></say>\n<act>${JSON.stringify({
  decision: {
    kind: 'job',
    title: 'Flight to Goa',
    plan: [{ phraseKey: 'check_site', slots: { site: 'flights' }, route: 'browser' }],
    routeHint: ['browser'],
    needsApps: [],
  },
  usedMemoryIds: [],
})}</act>`;

describe('jobs off · a flight booking ask gets the jobs-off line, never the flight scope card', () => {
  it('"book me a flight to Goa on Sat 12 Dec" with jobs off', async () => {
    h = jobHarness({ script: [{ match: { purpose: 'intake' }, reply: JOB }], features: BATCH_1 });
    h.userSays('book me a flight to Goa on Sat 12 Dec');
    await h.settle();
    expect(h.cards('choice')).toEqual([]);
    const foo = h.db.prepare("SELECT text FROM messages WHERE author_kind = 'foo' AND kind = 'text'").all() as { text: string }[];
    expect(foo.map((m) => m.text)).toEqual([t('thread.feature_off.jobs')]);
  });
});
