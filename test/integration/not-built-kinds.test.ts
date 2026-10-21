// Spec: CR-0042 (X-200), 08-4 §25.5 item 5a: the intake kinds whose milestone is not built yet (routine: M7; catch_up:
// 12-2 §12.27; handoff: M13) each get one honest line saying what foo cannot do yet, never "I didn't get that". Real-AI run
// 13 (Claude CLI): "Every weekday at 8 AM tell me the weather in Delhi" got "I didn't get that. Say it another way?". The
// routine and catch_up replies below are the CLI's real intake answers. (The `setting` kind is built by CR-0043.)
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import { envelope, jobHarness, type JobHarness } from './jobs/jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const REAL_WEATHER_ROUTINE =
  '<say></say>\n<act>{"decision":{"kind":"routine","draft":{"title":"Delhi weather","whatText":"Every weekday at 8:00 AM, I tell you the weather in Delhi.","task":{"prompt":"Look up today\'s weather in Delhi and tell the user in one or two short lines: temperature now, the high and low for the day, and whether it will rain.","tools":["look_web"]},"schedule":{"kind":"daily","at":"08:00","days":[1,2,3,4,5]},"tz":"Asia/Kolkata","whereChatId":"current","deliverToast":true}},"usedMemoryIds":[]}</act>';
const REAL_CATCH_UP = '<say></say>\n<act>{"decision":{"kind":"catch_up","source":{"kind":"gmail"}},"usedMemoryIds":[]}</act>';

const fooTexts = (x: JobHarness) =>
  (x.db.prepare("SELECT text FROM messages WHERE author_kind = 'foo' AND kind = 'text'").all() as { text: string }[]).map((m) => m.text);

async function said(reply: string, ask: string): Promise<string[]> {
  h = jobHarness({ script: [{ match: { purpose: 'intake' }, reply }] });
  h.userSays(ask);
  await h.settle();
  return fooTexts(h);
}

describe('CR-0042 · an intake kind that is not built yet says so, never "I didn\'t get that"', () => {
  it('run 13: "Every weekday at 8 AM tell me the weather in Delhi" (routine)', async () => {
    expect(await said(REAL_WEATHER_ROUTINE, 'Every weekday at 8 AM tell me the weather in Delhi')).toEqual([t('thread.not_built.routine')]);
  });

  it('"Catch me up on my email" (catch_up)', async () => {
    expect(await said(REAL_CATCH_UP, 'Catch me up on my email')).toEqual([t('thread.not_built.catch_up')]);
  });

  it('a hand-off to a helper (handoff)', async () => {
    const handoff = envelope('', { kind: 'handoff', helperId: 'h_trips', task: 'Plan a Goa trip' });
    expect(await said(handoff, 'Ask Trips to plan a Goa trip')).toEqual([t('thread.not_built.handoff')]);
  });

  it('a routine whose words already showed still gets the line after them', async () => {
    // Fable review: a `<say>` that leaked past the gate (PROTOCOL_SAY_LEAK) used to end the turn as a promise and nothing more.
    const leak = envelope('Sure, every weekday at 8 I will tell you the weather in Delhi.', {
      kind: 'routine',
      draft: JSON.parse(REAL_WEATHER_ROUTINE.slice(REAL_WEATHER_ROUTINE.indexOf('{'), REAL_WEATHER_ROUTINE.lastIndexOf('}') + 1)).decision
        .draft,
    });
    const texts = await said(leak, 'Every weekday at 8 AM tell me the weather in Delhi');
    expect(texts.at(-1)).toBe(t('thread.not_built.routine'));
  });

  it('`setting` is not on this list: until CR-0043 it still gets "I didn\'t get that"', async () => {
    const setting = envelope('', { kind: 'setting', path: 'appearance.theme', value: 'dark' });
    expect(await said(setting, 'Switch to dark mode')).toEqual([t('thread.reply.empty')]);
  });

  it('none of them says "I didn\'t get that"', () => {
    for (const key of ['routine', 'catch_up', 'handoff'] as const) expect(t(`thread.not_built.${key}`)).not.toBe(t('thread.reply.empty'));
  });
});
