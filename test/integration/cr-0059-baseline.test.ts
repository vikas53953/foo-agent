// Spec: CR-0059 (X-216) rows 1 and 6: Try again on foo's finished answer rewrites that answer in place (04 §17.1),
// keeping the old words in `earlier_text` and the chat's preview fresh; with `jobs` off, intake is told foo cannot do tasks
// yet (JOBS_OFF_LINE). The real Engine over a temp SQLite db, as in AT-074.
import { afterEach, describe, expect, it } from 'vitest';
import { JOBS_OFF_LINE } from '../../src/engine/prompt/PromptBuilder';
import { t } from '../../src/shared/copy/t';
import { intake, makeHarness, verified, type Harness } from '../unit/m3-engine-helpers';

let h: Harness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const reply = (say: string) => `<say>${say}</say><act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`;
const BATCH_1 = 'install,ai,name,chat,settings';

type Row = { id: string; text: string; status: string; earlier_text: string | null };
const fooAnswers = (x: Harness) =>
  x.db
    .prepare("SELECT id, text, status, earlier_text FROM messages WHERE author_kind = 'foo' AND kind = 'text' ORDER BY seq")
    .all() as Row[];

describe('CR-0059 · the batch-1 baseline', () => {
  it('Try again on a finished answer rewrites the same bubble and keeps the earlier answer', async () => {
    h = makeHarness({
      script: [intake(reply('First answer.')), intake(reply('Second answer.'))],
      settings: verified(),
      tools: {},
      features: BATCH_1,
    });
    await h.idle();
    h.userSays('Tell me something');
    await h.idle();
    const [first] = fooAnswers(h);
    expect(first).toMatchObject({ text: 'First answer.', status: 'complete', earlier_text: null });
    const chatId = (h.db.prepare('SELECT chat_id FROM messages WHERE id = ?').get(first!.id) as { chat_id: string }).chat_id;
    const revBefore = (h.db.prepare('SELECT rev FROM chats WHERE id = ?').get(chatId) as { rev: number }).rev;

    h.send('reply.rewrite', { messageId: first!.id });
    await h.idle();

    const after = fooAnswers(h);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: first!.id, text: 'Second answer.', status: 'complete', earlier_text: 'First answer.' });
    // The chat row takes a new rev, so the window accepts the fresh preview (a same-rev chat:upsert is dropped).
    expect((h.db.prepare('SELECT rev FROM chats WHERE id = ?').get(chatId) as { rev: number }).rev).toBeGreaterThan(revBefore);
  });

  it('a streamed rewrite lands whole in the same bubble', async () => {
    const chunks = (a: string, b: string) => ({
      chunks: [
        { text: `<say>${a}` },
        { text: `${b}</say><act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`, delayMs: 300 },
      ],
    });
    h = makeHarness({
      script: [intake('', chunks('First part. ', 'First end.')), intake('', chunks('Second part. ', 'Second end.'))],
      settings: verified(),
      tools: {},
    });
    await h.idle();
    h.userSays('Tell me something');
    await h.idle();
    const [first] = fooAnswers(h);
    expect(first!.text).toBe('First part. First end.');
    h.send('reply.rewrite', { messageId: first!.id });
    await h.idle();
    expect(fooAnswers(h)).toEqual([
      { id: first!.id, text: 'Second part. Second end.', status: 'complete', earlier_text: 'First part. First end.' },
    ]);
  });

  it('a rewrite that fails leaves the old answer exactly as it was and says so in one line', async () => {
    h = makeHarness({ script: [intake(reply('Keep me.')), intake('', { error: 'AI_TIMEOUT' })], settings: verified(), tools: {} });
    await h.idle();
    h.userSays('Tell me something');
    await h.idle();
    const [first] = fooAnswers(h);
    h.send('reply.rewrite', { messageId: first!.id });
    await h.idle();
    const answers = fooAnswers(h);
    expect(answers[0]).toEqual({ id: first!.id, text: 'Keep me.', status: 'complete', earlier_text: null });
    // One line says so, so the tap never looks like it did nothing.
    expect(answers.slice(1).map((a) => a.text)).toEqual([t('thread.rewrite.kept')]);
  });

  it('a rewrite is only ever a new answer in words: a memory decision saves nothing', async () => {
    const remember = `<say>New words.</say><act>${JSON.stringify({ decision: { kind: 'memory', op: 'remember', text: 'Likes tea' }, usedMemoryIds: [] })}</act>`;
    h = makeHarness({ script: [intake(reply('Old words.')), intake(remember)], settings: verified(), tools: {} });
    await h.idle();
    h.userSays('Tell me something');
    await h.idle();
    const [first] = fooAnswers(h);
    h.send('reply.rewrite', { messageId: first!.id });
    await h.idle();
    expect(fooAnswers(h)).toEqual([{ id: first!.id, text: 'New words.', status: 'complete', earlier_text: 'Old words.' }]);
    expect((h.db.prepare('SELECT COUNT(*) AS n FROM memory_index').get() as { n: number }).n).toBe(0);
  });

  it('with jobs off, intake is told foo cannot do tasks yet; with every feature on, it is not', async () => {
    const intakeText = async (features?: string) => {
      h = makeHarness({ script: [intake(reply('No, I have not.'))], settings: verified(), tools: {}, ...(features ? { features } : {}) });
      await h.idle();
      h.userSays('Did you book my cab?');
      await h.idle();
      const turn = h.turnsJsonl().filter((t) => t.purpose === 'intake')[0]!;
      const text = String(turn.system) + String(turn.prompt);
      h.close();
      h = null;
      return text;
    };
    expect(await intakeText(BATCH_1)).toContain(JOBS_OFF_LINE);
    expect(await intakeText()).not.toContain(JOBS_OFF_LINE);
  });
});
