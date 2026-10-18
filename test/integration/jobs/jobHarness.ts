// Shared harness for the M4 runner tests: the real Engine (chat lane + JobRunner + ToolLayer) and main's EngineBridge over a
// temp SQLite db, with the FOO_FAKE_AI script and the fake tools of test/fakes/tools. 08-2 §5 (job runner), 08-3 §22.3.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { envelope, makeHarness, verified, type FakeLineIn, type Harness, type HarnessOptions } from '../../unit/m3-engine-helpers';
import { fakeTools, type FakeToolLog, type FakeToolOptions } from '../../fakes/tools';
import { sendMessage } from '../../../src/main/store/composerQueries';
import { newId } from '../../../src/shared/ids';
import type { Settings } from '../../../src/shared/settings';

export { envelope, verified };

/** A FOO/1 step reply (08-4 §25.3). */
export function stepAct(decision: Record<string, unknown>, say = ''): string {
  return `<say>${say}</say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
}
export const step = (decision: Record<string, unknown>, extra: Partial<FakeLineIn> = {}): FakeLineIn => ({
  match: { purpose: 'step' },
  reply: stepAct(decision),
  ...extra,
});
export const tool = (name: string, args: Record<string, unknown>, extra: Partial<FakeLineIn> = {}) =>
  step({ kind: 'tool', call: { tool: name, args }, why: 'next' }, extra);
export const stepDone = (idx: number, extra: Partial<FakeLineIn> = {}) => step({ kind: 'step_done', idx }, extra);

export interface PlanStepIn {
  phraseKey: string;
  slots?: Record<string, string>;
  route?: string;
}
/** An intake reply deciding `job` (08-4 §25.2). */
export function jobIntake(
  plan: PlanStepIn[],
  o: { title?: string; estimate?: { minutes?: number; tokens?: number }; match?: string } = {},
): FakeLineIn {
  return {
    match: { purpose: 'intake', ...(o.match ? { promptIncludes: o.match } : {}) },
    reply: envelope('', {
      kind: 'job',
      title: o.title ?? 'A job',
      plan: plan.map((p) => ({ phraseKey: p.phraseKey, slots: p.slots ?? {}, route: p.route ?? 'api' })),
      ...(o.estimate ? { estimate: o.estimate } : {}),
      routeHint: ['api'],
      needsApps: [],
    }),
  };
}

export const BILLS_PLAN: PlanStepIn[] = [{ phraseKey: 'read_email' }, { phraseKey: 'look_for', slots: { what: 'bills due this week' } }];

/** A 6-step job, each turn held 600 ms so the 1.5 s checklist exists (ART-17, ART-22). */
export const SIX_STEPS: PlanStepIn[] = [
  { phraseKey: 'read_email' },
  { phraseKey: 'look_for', slots: { what: 'bills' } },
  { phraseKey: 'check_site', slots: { site: 'stay.example' } },
  { phraseKey: 'compare', slots: { what: 'stays' } },
  { phraseKey: 'check_calendar' },
  { phraseKey: 'make_file', slots: { what: 'a list' } },
];
const slow = { delayMs: 600 };
export const sixStepScript = (): FakeLineIn[] => [
  jobIntake(SIX_STEPS, { estimate: { minutes: 2 } }),
  tool('gmail.search', { query: 'bill' }, slow),
  ...[0, 1, 2, 3, 4, 5].map((i) => stepDone(i, slow)),
  step({ kind: 'done', result: 'Here is your list.', unverified: true }, slow),
];

export interface JobHarness extends Harness {
  calls: FakeToolLog[];
  /** Settles the chat lane and the runner, advancing the fake clock by `stepMs` per round. */
  settle(stepMs?: number): Promise<void>;
  jobs(): Record<string, unknown>[];
  job(id?: string): Record<string, unknown>;
  steps(jobId?: string): Record<string, unknown>[];
  cards(type?: string): Record<string, unknown>[];
  toolCalls(jobId?: string): Record<string, unknown>[];
  /** A card answer as main relays it (card.answered). */
  answer(cardId: string, choice?: string): void;
  mirror(jobId: string, file: 'state.json' | 'plan.md'): string | null;
  /**
   * A helper chat of its own (made once per name). One chat with a live job steers its next message into that job (08-2
   * §5.2), so tests that need several jobs at once start each in its own chat.
   */
  chat(name: string): string;
  /** userSays in another chat. */
  userSaysIn(chatId: string, text: string): string;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** One macrotask turn. Windows timers fire every ~15.6 ms, so settle() yields with setImmediate rather than a 1 ms sleep. */
const tick = () => new Promise<void>((r) => setImmediate(r));
const ticks = async (n: number) => {
  for (let i = 0; i < n; i++) await tick();
};

export function jobHarness(
  o: { script: FakeLineIn[]; tools?: FakeToolOptions; settings?: (s: Settings) => Settings } & Omit<
    Partial<HarnessOptions>,
    'script' | 'tools' | 'settings'
  >,
): JobHarness {
  const ft = fakeTools(o.tools);
  const h = makeHarness({ ...o, settings: o.settings ?? verified(), tools: ft.tools });
  const all = (sql: string, ...args: unknown[]) => h.db.prepare(sql).all(...args) as Record<string, unknown>[];
  const firstJob = () => String(all('SELECT id FROM jobs ORDER BY created_at, id')[0]?.id ?? '');
  const dataDir = path.join(h.dir, 'data');
  const chats = new Map<string, string>();
  const jh: JobHarness = Object.assign(h, {
    calls: ft.calls,
    async settle(stepMs = 250) {
      for (let round = 0; round < 800; round++) {
        await realSleep(1);
        await ticks(8);
        let done = false;
        const p = Promise.all([h.engine.lane.idle(), h.engine.jobs.idle()]).then(() => (done = true));
        await Promise.race([p, ticks(24)]);
        if (!done) await Promise.race([p, realSleep(3)]);
        if (done) {
          await realSleep(1);
          await ticks(8);
          let again = false;
          const q = Promise.all([h.engine.lane.idle(), h.engine.jobs.idle()]).then(() => (again = true));
          await Promise.race([q, ticks(24)]);
          if (!again) await Promise.race([q, realSleep(3)]);
          if (again) return;
        }
        h.clock.advance(stepMs);
      }
      throw new Error('engine never settled');
    },
    jobs: () => all('SELECT * FROM jobs ORDER BY created_at, id'),
    job: (id?: string) => all('SELECT * FROM jobs WHERE id = ?', id ?? firstJob())[0]!,
    steps: (jobId?: string) => all('SELECT * FROM steps WHERE job_id = ? ORDER BY idx', jobId ?? firstJob()),
    cards: (type?: string) =>
      type ? all('SELECT * FROM cards WHERE type = ? ORDER BY created_at, id', type) : all('SELECT * FROM cards ORDER BY created_at, id'),
    toolCalls: (jobId?: string) => all('SELECT * FROM tool_calls WHERE job_id = ? ORDER BY started_at, id', jobId ?? firstJob()),
    answer(cardId: string, choice?: string) {
      h.bridge.send('card.answered', { cardId, ...(choice ? { choice } : {}), resolvedBy: 'tap' });
    },
    chat(name: string) {
      const known = chats.get(name);
      if (known) return known;
      const now = h.clock.now();
      const chatId = `c_${name}`;
      const helperId = `h_${name}`;
      // The chat and its helper point at each other; the FKs are deferred to the end of the transaction.
      h.db.transaction(() => {
        h.db
          .prepare("INSERT INTO chats (id, kind, helper_id, title, last_activity_at, created_at) VALUES (?, 'helper', ?, ?, ?, ?)")
          .run(chatId, helperId, name, now, now);
        h.db
          .prepare(
            `INSERT INTO helpers (id, name, job_text, face_ref, color_token, allowed_apps, chat_id, created_at)
             VALUES (?, ?, 'Test helper', 'face:default', '--h-teal', '{}', ?, ?)`,
          )
          .run(helperId, name, chatId, now);
      })();
      chats.set(name, chatId);
      return chatId;
    },
    userSaysIn(chatId: string, text: string) {
      h.clock.advance(1_000);
      const r = sendMessage(
        h.db,
        { chatId, clientId: newId('k', h.clock.now()), text },
        { now: h.clock.now(), newId: () => newId('m', h.clock.now()), waiting: false, attachment: () => undefined },
      );
      if (!r.ok) throw new Error(`sendMessage: ${r.reason}`);
      h.bridge.send('user.message', { messageId: r.messageId, chatId });
      return r.messageId;
    },
    mirror(jobId: string, file: 'state.json' | 'plan.md') {
      const f = path.join(dataDir, 'jobs', jobId, file);
      return existsSync(f) ? readFileSync(f, 'utf8') : null;
    },
  });
  const close = h.close.bind(h);
  jh.close = () => {
    h.engine.jobs.cancelAll();
    close();
  };
  return jh;
}

/** Every value a db.tx set on one message's column, in order (badge sequence, ART-16). */
export function badgeSets(h: Harness, messageId: string): unknown[] {
  const out: unknown[] = [];
  for (const t of h.txs)
    if (t.ok)
      for (const op of t.ops)
        if (op.op === 'update' && op.table === 'messages' && op.id === messageId && 'badge' in op.set) out.push(op.set.badge);
  return out;
}
