// Spec: 04 §19.4 (cut-off reply: partial text stays, Try again), 08-2 §7.2 part 7 (Conversation: completed messages only).
// Gate 10 (a52aa85) G3 s12 and QA5 s26: a question whose reply was cut off, and that the user moved on from, was sent to
// the AI with the next turn, so the next reply answered both. The real Engine over a temp SQLite db, as in AT-074.
import { afterEach, describe, expect, it } from 'vitest';
import { intake, makeHarness, verified, type Harness } from '../unit/m3-engine-helpers';

let h: Harness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const reply = (say: string) => `<say>${say}</say><act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`;
const BATCH_1 = 'install,ai,name,chat,settings';

async function twoTurns(cutOff: boolean): Promise<string> {
  h = makeHarness({
    script: [intake(reply('Shelly, Moti, Speedy.')), intake(reply('15'))],
    settings: verified(),
    tools: {},
    features: BATCH_1,
  });
  await h.idle();
  h.userSays('Ek kachhua ke liye 3 naam batao');
  await h.idle();
  if (cutOff) h.db.prepare("UPDATE messages SET status = 'failed', text = '' WHERE author_kind = 'foo' AND kind = 'text'").run();
  h.userSays('7 aur 8 ka jod? sirf number');
  await h.idle();
  const turns = h.turnsJsonl().filter((x) => x.purpose === 'intake');
  expect(turns).toHaveLength(2);
  return `${String(turns[1]!.system)}\n${String(turns[1]!.prompt)}`;
}

describe('a cut-off question the user moved on from', () => {
  it('is not sent to the AI with the next message', async () => {
    expect(await twoTurns(true)).not.toContain('kachhua');
  });
  it('an answered question still is', async () => {
    expect(await twoTurns(false)).toContain('kachhua');
  });
});
