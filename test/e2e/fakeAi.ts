// The fake AI for E2E runs (08-3 §22.3): a JSON Lines script under the run's own folder, passed as FOO_FAKE_AI, and the
// requests the fake recorded in {DATA}/test/turns.jsonl. Replies are full FOO/1 envelopes (08-2 §7.3: <say> then <act>).
// No test reaches a real AI or the network: a FOO_TEST run starts the engine only with FOO_FAKE_AI (08-2 §1 rule 5).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ElectronApplication } from '@playwright/test';
import { launch, testDirs } from './launch';

export interface FakeLine {
  match: { purpose: string; promptIncludes?: string; chatId?: string };
  reply?: string;
  delayMs?: number;
  /** CR-0007: streamed piece by piece on the clock. */
  chunks?: { text: string; delayMs?: number }[];
  error?: string;
  once?: boolean;
}

export interface FakeTurn {
  turnId: string;
  purpose: string;
  prompt: string;
  matchedLine: number | null;
  noMatch?: true;
}

type IntakeDecision = { kind: 'reply' } | { kind: 'react'; emoji: '👍' | '❤️' };

/** A FOO/1 intake reply (08-4 §25.2 IntakeAct). */
export function envelope(say: string, decision: IntakeDecision = { kind: 'reply' }): string {
  return `<say>${say}</say>\n<act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
}

/** An intake line that answers the user message containing `prompt`. */
export function intake(prompt: string, say: string, o: { decision?: IntakeDecision; delayMs?: number; error?: string } = {}): FakeLine {
  const line: FakeLine = { match: { purpose: 'intake', promptIncludes: prompt }, reply: envelope(say, o.decision) };
  if (o.delayMs !== undefined) line.delayMs = o.delayMs;
  if (o.error !== undefined) line.error = o.error;
  return line;
}

/** `Reply with the word ready` (08-2 §6.6); reusable, so every verify passes. */
export const VERIFY_OK: FakeLine = { match: { purpose: 'verify' }, reply: 'ready', once: false };

/** Writes the script next to the run's data folder and launches with FOO_FAKE_AI pointing at it. */
export async function launchWithFakeAi(
  lines: FakeLine[],
  o: { dirs?: ReturnType<typeof testDirs>; args?: string[] } = {},
): Promise<{ app: ElectronApplication; dirs: ReturnType<typeof testDirs>; script: string }> {
  const dirs = o.dirs ?? testDirs();
  const script = join(dirname(dirs.FOO_DATA_DIR), 'fake-ai.jsonl');
  mkdirSync(dirname(script), { recursive: true });
  writeFileSync(script, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const app = await launch(dirs, o.args ?? [], { FOO_FAKE_AI: script });
  return { app, dirs, script };
}

/** Every request the fake recorded in this run. */
export function fakeTurns(dirs: ReturnType<typeof testDirs>): FakeTurn[] {
  const file = join(dirs.FOO_DATA_DIR, 'test', 'turns.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as FakeTurn);
}
