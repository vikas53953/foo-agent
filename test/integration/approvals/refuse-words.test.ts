// Spec: 08-0 §G.3 and 08-2 §9.4 (`never` on a permission row or an app refuses with "I'm not allowed to {row}. You can
// change that in Settings → Permissions."), G-M5-38 (the row and the app read as words, never the settings key).
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, jobIntake, step, tool, type JobHarness } from '../jobs/jobHarness';
import { gateTools, permissive } from './gateFlow';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const texts = (x: JobHarness) =>
  x
    .messages()
    .filter((m) => m.kind === 'text' && m.author_kind === 'foo')
    .map((m) => m.text);

const plan = [{ phraseKey: 'read_email' }, { phraseKey: 'look_for', slots: { what: 'old newsletters' } }];

describe('refusal line words (G-M5-38)', () => {
  it('a row set to never reads as words: "I’m not allowed to delete things."', async () => {
    h = jobHarness({
      script: [jobIntake(plan, { title: 'Clear newsletters' }), tool('fake.delete', {}), step({ kind: 'done', result: 'Done.' })],
      tools: { extra: gateTools() },
      settings: (s) => {
        const v = permissive()(s);
        return { ...v, permissions: { ...v.permissions, actions: { ...v.permissions.actions, delete: 'never' } } };
      },
    });
    h.userSays('Delete the old newsletters in my email');
    await h.settle();
    expect(texts(h)).toContain('I’m not allowed to delete things. You can change that in Settings → Permissions.');
  });

  it('an app set to never reads as its name: "I’m not allowed to use Gmail."', async () => {
    h = jobHarness({
      script: [
        jobIntake(plan, { title: 'Email Priya' }),
        tool('gmail.send', { to: 'priya@example.com' }),
        step({ kind: 'done', result: 'Done.' }),
      ],
      tools: { extra: gateTools() },
      settings: (s) => {
        const v = permissive()(s);
        return { ...v, permissions: { ...v.permissions, apps: { ...v.permissions.apps, gmail: 'never' } } };
      },
    });
    h.userSays('Send Priya an email about Goa');
    await h.settle();
    expect(texts(h)).toContain('I’m not allowed to use Gmail. You can change that in Settings → Permissions.');
  });
});
