// Spec: CR-0054 (X-211), 08-4 §25.5 item 5b: with memory off no fact is read into a turn, even one saved by an earlier
// build with memory on (independent review of PR #145). The real Engine over a temp SQLite db, as in AT-074.
import { afterEach, describe, expect, it } from 'vitest';
import { intake, makeHarness, verified, type Harness } from '../unit/m3-engine-helpers';

let h: Harness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const reply = (say: string) => `<say>${say}</say><act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`;

async function promptFor(features: string | undefined): Promise<{ system: string; prompt: string }> {
  h = makeHarness({ script: [intake(reply('I do not know.'))], settings: verified(), tools: {}, ...(features ? { features } : {}) });
  await h.idle();
  const added = await h.engine.memory.cmd({ cmd: 'add', text: 'Brother Rohit lives in Pune' });
  if (!added.ok) throw new Error(added.error.kind);
  h.userSays('Where does my brother live?');
  await h.idle();
  const turn = h.turnsJsonl().filter((t) => t.purpose === 'intake')[0]!;
  return { system: String(turn.system), prompt: String(turn.prompt) };
}

describe('CR-0054 · memory off reads no fact into a turn', () => {
  it('batch 1: a saved fact is in neither the system part nor the prompt', async () => {
    const t = await promptFor('install,ai,name,chat,settings');
    expect(t.system + t.prompt).not.toContain('Brother Rohit lives in Pune');
  });

  it('every feature on: the same fact is offered', async () => {
    const t = await promptFor(undefined);
    expect(t.system + t.prompt).toContain('Brother Rohit lives in Pune');
  });
});
