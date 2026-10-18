// Shared harness for the M3 in-process engine tests: the real Engine (chat lane, your-AI service, prompt modules, fake AI
// adapter) talking to main's real EngineBridge over a direct-call MainLink, backed by a migrated temp SQLite db.
// 08-3 §22.3: every turn goes to the FOO_FAKE_AI script; nothing here reaches a real provider or the network.
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Engine } from '../../src/engine/Engine';
import type { DbOp, MainLink, MainToEngine } from '../../src/engine/protocol';
import { EngineBridge } from '../../src/main/engine-supervisor/EngineBridge';
import { migrate, type Db } from '../../src/main/store/db';
import { sendMessage } from '../../src/main/store/composerQueries';
import { ensureFooChat } from '../../src/main/store/queries';
import { FakeClock, TEST_EPOCH_MS } from '../../src/shared/clock';
import type { Result } from '../../src/shared/errors';
import { newId } from '../../src/shared/ids';
import { settingsSchema, type Settings } from '../../src/shared/settings';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import type { ProviderId } from '../../src/shared/types';

export const ROOT = path.resolve(__dirname, '../..');
export const RESOURCES = path.join(ROOT, 'resources');

/** One FOO_FAKE_AI script line (08-3 §22.3). */
export interface FakeLineIn {
  match: { purpose: string; promptIncludes?: string; chatId?: string };
  reply?: string;
  delayMs?: number;
  error?: string;
  once?: boolean;
  usage?: Record<string, number | null>;
}

/** A FOO/1 envelope (08-2 §7.3) for an intake reply. */
export function envelope(say: string, decision: Record<string, unknown> = { kind: 'reply' }): string {
  return `<say>${say}</say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
}
export const VERIFY_LINE: FakeLineIn = { match: { purpose: 'verify' }, reply: 'ready' };
export const intake = (reply: string, extra: Partial<FakeLineIn> = {}): FakeLineIn => ({ match: { purpose: 'intake' }, reply, ...extra });

export interface DbTxCall {
  ops: DbOp[];
  ok: boolean;
}
export interface UiPatch {
  event: string;
  payload: unknown;
}

export interface Harness {
  engine: Engine;
  bridge: EngineBridge;
  db: Db;
  clock: FakeClock;
  dir: string;
  chatId: string;
  settings: () => Settings;
  txs: DbTxCall[];
  patches: UiPatch[];
  logs: Record<string, unknown>[];
  aiStates: Record<string, unknown>[];
  /** Fire-and-forget message to the engine, as main sends it. */
  send<K extends MainToEngine['kind']>(kind: K, payload: Extract<MainToEngine, { kind: K }>['payload']): void;
  /** An ai.cmd request, answered through the bridge. */
  aiCmd<T>(cmd: 'detect' | 'verify' | 'choose', providerId?: ProviderId, backup?: ProviderId | null): Promise<Result<T>>;
  /** Stores a user message the way message:send does (main), then hands it to the engine. */
  userSays(text: string, opts?: { waiting?: boolean; notify?: boolean }): string;
  /** Lets the engine's async work settle, advancing the fake clock by `stepMs` per round, until the chat lane is idle. */
  idle(stepMs?: number): Promise<void>;
  turnsJsonl(): Record<string, unknown>[];
  message(id: string): Record<string, unknown>;
  messages(): Record<string, unknown>[];
  close(): void;
}

export interface HarnessOptions {
  script: FakeLineIn[];
  /** Applied to settingsDefaults before the first settings.changed. */
  settings?: (s: Settings) => Settings;
  /** Skip the initial settings.changed (the caller sends it). */
  noInitialSettings?: boolean;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Primary set and verified (lastVerifyOk true): the "your AI works" state after J2. */
export function verified(primary: ProviderId = 'claude-cli', backup: ProviderId | null = null) {
  return (s: Settings): Settings => ({
    ...s,
    ai: {
      ...s.ai,
      primary,
      backup,
      providers: {
        ...s.ai.providers,
        [primary]: { kind: 'plan', lastVerifiedAt: TEST_EPOCH_MS - 60_000, lastVerifyOk: true },
        ...(backup ? { [backup]: { kind: 'plan', lastVerifiedAt: TEST_EPOCH_MS - 60_000, lastVerifyOk: true } } : {}),
      },
    },
  });
}

export function makeHarness(o: HarnessOptions): Harness {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'foo-m3-engine-'));
  const dataDir = path.join(dir, 'data');
  const localDir = path.join(dir, 'local');
  const scriptPath = path.join(dir, 'fake-ai.jsonl');
  writeFileSync(scriptPath, o.script.map((l) => JSON.stringify(l)).join('\n') + '\n');

  const clock = new FakeClock(TEST_EPOCH_MS);
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const chatId = ensureFooChat(db, clock.now(), 'foo', newId('c', clock.now()));

  let current: Settings = settingsSchema.parse(
    (o.settings ?? ((s) => s))({
      ...structuredClone(settingsDefaults),
      locale: { timeZone: 'Asia/Kolkata', region: 'IN', currency: 'INR' },
    }),
  );
  const listeners = new Set<(s: Settings) => void>();
  const txs: DbTxCall[] = [];
  const patches: UiPatch[] = [];
  const logs: Record<string, unknown>[] = [];
  const aiStates: Record<string, unknown>[] = [];

  const bridge = new EngineBridge({
    db,
    settings: {
      get: () => current,
      update: (fn) => {
        current = settingsSchema.parse(fn(current));
        for (const l of listeners) l(current);
      },
    },
    emit: (event, payload) => patches.push({ event, payload }),
    emitMessage: () => undefined,
    emitChat: () => undefined,
    log: (line) => logs.push(line as Record<string, unknown>),
  });

  let seq = 0;
  // The engine side of the port: every message goes through the bridge exactly as the MessagePort would carry it.
  const link: MainLink = {
    async request<T>(kind: 'db.tx' | 'db.query', payload: unknown): Promise<Result<T>> {
      seq += 1;
      const reply = bridge.receive({ id: `e${seq}`, kind, payload });
      if (!reply) throw new Error(`no reply for ${kind}`);
      if (kind === 'db.tx') txs.push({ ops: (payload as { ops: DbOp[] }).ops, ok: reply.result.ok });
      return reply.result as Result<T>;
    },
    send(kind, payload) {
      seq += 1;
      if (kind === 'ai.state') aiStates.push(payload as Record<string, unknown>);
      const reply = bridge.receive({ id: `e${seq}`, kind, payload });
      if (reply && !reply.result.ok) throw new Error(`bridge rejected ${kind}: ${JSON.stringify(reply.result)}`);
    },
  };

  const engine = Engine.create({
    link,
    clock,
    env: { FOO_FAKE_AI: scriptPath, FOO_TEST: '1' },
    dataDir,
    localDir,
    resourcesDir: RESOURCES,
    execPath: process.execPath,
    testRun: true,
    fetch: (() => Promise.reject(new Error('network is not allowed in tests'))) as typeof fetch,
  });
  bridge.live = true;
  bridge.post = (msg) => {
    void engine.handle(msg).then((result) => {
      if (result !== undefined) bridge.receive({ re: msg.id, result });
    });
  };
  listeners.add((s) => bridge.send('settings.changed', { paths: [], settings: s }));
  if (!o.noInitialSettings) bridge.send('settings.changed', { paths: [], settings: current });

  const h: Harness = {
    engine,
    bridge,
    db,
    clock,
    dir,
    chatId,
    settings: () => current,
    txs,
    patches,
    logs,
    aiStates,
    send: (kind, payload) => bridge.send(kind as 'net', payload as { online: boolean }),
    aiCmd: <T>(cmd: 'detect' | 'verify' | 'choose', providerId?: ProviderId, backup?: ProviderId | null) =>
      bridge.request<T, 'ai.cmd'>('ai.cmd', {
        cmd,
        ...(providerId ? { providerId } : {}),
        ...(backup !== undefined ? { backup } : {}),
      }),
    userSays(text, opts = {}) {
      clock.advance(1_000);
      const r = sendMessage(
        db,
        { chatId, clientId: newId('k', clock.now()), text },
        { now: clock.now(), newId: () => newId('m', clock.now()), waiting: opts.waiting ?? false, attachment: () => undefined },
      );
      if (!r.ok) throw new Error(`sendMessage: ${r.reason}`);
      if (opts.notify !== false) bridge.send('user.message', { messageId: r.messageId, chatId });
      return r.messageId;
    },
    async idle(stepMs = 250) {
      let done = false;
      // Let queued work start (db requests, the drain after settings or verify) before waiting on the lane.
      for (let i = 0; i < 5; i++) await realSleep(1);
      for (let round = 0; round < 400 && !done; round++) {
        const p = engine.lane.idle().then(() => (done = true));
        await Promise.race([p, realSleep(2)]);
        if (!done) clock.advance(stepMs);
        else {
          // Idle may be momentary (a drain enqueues after its query): settle once more and re-check.
          for (let i = 0; i < 5; i++) await realSleep(1);
          done = false;
          const again = engine.lane.idle().then(() => (done = true));
          await Promise.race([again, realSleep(2)]);
        }
      }
      if (!done) throw new Error('chat lane never went idle');
    },
    turnsJsonl() {
      const f = path.join(dataDir, 'test', 'turns.jsonl');
      if (!existsSync(f)) return [];
      return readFileSync(f, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>);
    },
    message: (id) => db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown>,
    messages: () => db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY seq').all(chatId) as Record<string, unknown>[],
    close() {
      engine.lane.cancelAll();
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
  return h;
}

/** foo's messages in the chat (author_kind 'foo'). */
export function fooMessages(h: Harness): Record<string, unknown>[] {
  return h.messages().filter((m) => m.author_kind === 'foo');
}

/** Every value a db.tx set on one message's column, in order. */
export function setsOf(h: Harness, messageId: string, column: string): unknown[] {
  const out: unknown[] = [];
  for (const t of h.txs)
    for (const op of t.ops) if (op.op === 'update' && op.id === messageId && column in op.set) out.push(op.set[column]);
  return out;
}

export function count(h: Harness, table: string): number {
  return (h.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}
