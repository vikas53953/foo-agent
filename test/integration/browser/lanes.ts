// Shared harness for the M9 T7 sign-in lane tests (08-2 §8.4, §8.3.3; 06-3 §11.2 take over): the real browser tools over
// playwright-core (headless Chromium in the container, Chrome / Edge on CI) with the sign-in lanes as their capture guard, the
// T2 sign-in and CAPTCHA sites served on 127.0.0.1 (their handlers, plain HTTP), a fake clock for the 1 s poll and the 10 min /
// 2 h timers, and a recording stand-in for the runner and the main link.
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Page } from 'playwright-core';
import { FakeClock } from '../../../src/shared/clock';
import { settingsDefaults } from '../../../src/shared/settingsDefaults';
import type { JobRow } from '../../../src/shared/types';
import { Redactor } from '../../../src/engine/redact/Redactor';
import type { RunnerCore } from '../../../src/engine/jobs/JobRunner';
import type { DbOp } from '../../../src/engine/protocol';
import type { NeedsUserCard, ToolOutcome } from '../../../src/engine/tools/ToolLayer';
import { SigninLanes, type LaneDeps } from '../../../src/engine/tools/browser/signinLanes';
import { TakeOver } from '../../../src/engine/tools/browser/takeover';
import { createBrowserTools, type BrowserRuntime } from '../../../src/engine/tools/browser/tools';
import type { ToolRegistry } from '../../../src/engine/tools/ToolLayer';
import type { Toggles } from '../../sites/site';
import { serveLaneSites } from './laneSites';

export interface Sent {
  kind: string;
  payload: Record<string, unknown>;
}

export interface LaneHarness {
  tools: ToolRegistry;
  runtime: BrowserRuntime;
  lanes: SigninLanes;
  takeOver: TakeOver;
  clock: FakeClock;
  redactor: Redactor;
  /** The sign-in site on http://127.0.0.1:{port}, the CAPTCHA site on http://localhost:{port}. */
  signin(path?: string): string;
  captcha(path?: string): string;
  toggles: { signin: Toggles; captcha: Toggles };
  counts: Record<string, number>;
  /** Everything the lanes sent main (ui.patch, signin.banner, notify). */
  sent: Sent[];
  ops: DbOp[];
  answers: { cardId: string; answer?: unknown; resolvedBy: string }[];
  stops: { jobId: string; reason: string; report: boolean }[];
  needsYou: NeedsUserCard[];
  halted: string[];
  launched: string[];
  /** The saved login `vault.use('fill_login')` returns (null → VAULT_MISSING). */
  login: { u: string; p: string } | null;
  vaultCalls: Record<string, unknown>[];
  /** Cards main would return for `cardById` (id → type), for a lanes object that lost its pauses (restart). */
  cards: Record<string, string>;
  /** `suggestionState` answers by key (CR-0030 pick 4: `save_login:{site}`); a missing key was never offered. */
  suggestions: Record<string, string>;
  job: JobRow;
  run(tool: string, args?: Record<string, unknown>): Promise<ToolOutcome>;
  page(): Promise<Page>;
  /** Posts the card the way the runner does (NEEDS_YOU, then the hook). */
  post(card: NeedsUserCard): Promise<string>;
  /** Waits for the lanes to finish taking up the last card (the hook runs after NEEDS_YOU). */
  begun(): Promise<void>;
  /** Advances the fake clock in 500 ms steps, letting each poll tick reach the browser. */
  pump(ms: number): Promise<void>;
  /** Pumps until `cond` holds (at most `ms` of fake time); false when it never did. */
  until(cond: () => boolean, ms?: number): Promise<boolean>;
  close(): Promise<void>;
}

export async function laneHarness(): Promise<LaneHarness> {
  const { counts, toggles, port, close: closeSites } = await serveLaneSites();

  const dataDir = mkdtempSync(join(tmpdir(), 'foo-lanes-'));
  const real = resolve(__dirname, '../../../resources');
  const resourcesDir = join(dataDir, 'resources');
  mkdirSync(resourcesDir);
  for (const f of ['no-capture-hosts.json', 'handback-sites.json']) copyFileSync(join(real, f), join(resourcesDir, f));
  const clock = new FakeClock();
  const redactor = new Redactor({ clock, log: () => undefined });
  const settings = structuredClone(settingsDefaults);

  const sent: Sent[] = [];
  const ops: DbOp[] = [];
  const answers: LaneHarness['answers'] = [];
  const stops: LaneHarness['stops'] = [];
  const needsYou: NeedsUserCard[] = [];
  const halted: string[] = [];
  const launched: string[] = [];
  const vaultCalls: Record<string, unknown>[] = [];
  let seq = 0;
  let begun: Promise<void> = Promise.resolve();
  const job = {
    id: 'job_1',
    chatId: 'c_1',
    ownerId: null,
    title: 'Train booking',
    state: 'working',
  } as unknown as JobRow;

  let runtime: BrowserRuntime | null = null;
  const h = {} as LaneHarness;
  const deps: LaneDeps = {
    clock,
    link: {
      request: async <T>(kind: string, payload: unknown) => {
        if (kind === 'vault.use') {
          vaultCalls.push(payload as Record<string, unknown>);
          return (h.login
            ? { ok: true, value: JSON.stringify(h.login) }
            : { ok: false, error: { kind: 'VAULT_MISSING' } }) as unknown as import('../../../src/shared/errors').Result<T>;
        }
        if (kind === 'db.tx') {
          ops.push(...(payload as { ops: DbOp[] }).ops);
          return { ok: true, value: { ids: [], revs: [] } } as unknown as import('../../../src/shared/errors').Result<T>;
        }
        return { ok: false, error: { kind: 'UNKNOWN' } } as unknown as import('../../../src/shared/errors').Result<T>;
      },
      send: (kind, payload) => void sent.push({ kind, payload: payload as Record<string, unknown> }),
    },
    window: (jobId) => runtime?.browser.window(jobId),
    openWindow: async (jobId) => (await runtime!.browser.openWindow(jobId)).ok,
    masker: { apply: (p) => runtime!.masker.apply(p), remove: (p) => runtime!.masker.remove(p) },
    reread: (jobId) => runtime?.stepStarted(jobId),
    secret: (handle) => redactor.registry.valueOf(handle),
    forget: (handle) => redactor.registry.remove([handle]),
    agentName: () => 'foo',
    log: () => undefined,
  };
  const lanes = new SigninLanes(deps);
  const takeOver = new TakeOver(deps, lanes);
  const tx = async (o: DbOp[]) => {
    ops.push(...o);
    return { ok: true as const, value: { ids: [], revs: [] } };
  };
  const core = {
    tx,
    job: async () => job,
    textOp: (_j: unknown, text: string): DbOp => ({ op: 'insert', table: 'messages', row: { id: `m_${++seq}`, kind: 'text', text } }),
    cardOps: (chatId: string, type: string, state: string, payload: Record<string, unknown>) => {
      const cardId = `k_${++seq}`;
      return {
        cardId,
        messageId: `m_${seq}`,
        ops: [{ op: 'insert', table: 'cards', row: { id: cardId, chat_id: chatId, type, state, payload } }],
      };
    },
    needsYou: async (_j: JobRow, card: NeedsUserCard) => {
      needsYou.push(card);
      const cardId = `k_${++seq}`;
      begun = lanes.begin(job, cardId, card);
      return cardId;
    },
    query: async (q: string, id: string) =>
      q === 'cardById' && h.cards[id] ? { id, type: h.cards[id] } : q === 'suggestionState' ? (h.suggestions[id] ?? null) : null,
    // CR-0030 pick 3: the checklist's "You took over" row (the real one reads the steps; here a marker op).
    tookOverOps: async () => [{ op: 'update', table: 'cards', id: 'k_checklist', set: { payload: { tookOver: [1] } } }],
    halt: (id: string) => void halted.push(id),
    launch: (id: string) => void launched.push(id),
  } as unknown as RunnerCore;
  const runner = {
    core,
    onCardAnswered: async (a: { cardId: string; answer?: unknown; resolvedBy: string }) => void answers.push(a),
    stop: async (jobId: string, reason: 'window_closed' | 'signin_timeout', report: boolean) => {
      stops.push({ jobId, reason, report });
      lanes.jobEnded(jobId);
      takeOver.jobEnded(jobId);
    },
  };
  lanes.attach(runner, (id) => takeOver.has(id));
  takeOver.attach(runner);

  const built = createBrowserTools({
    dataDir,
    resourcesDir,
    platform: process.platform,
    env: { FOO_TEST_ALLOW_HOSTS: '127.0.0.1,localhost' },
    testRun: true,
    scrub: (t) => redactor.scrub(t).text,
    registryHit: (t) => redactor.registry.forms().some((f) => t.includes(f.form)),
    settings: () => settings,
    now: () => clock.now(),
    log: () => undefined,
    captureGuard: lanes,
    headless: true,
    timing: { idleMs: 150, settleMaxMs: 3_000, actionableMs: 2_000 },
  });
  runtime = built.runtime;
  const registry: ToolRegistry = { ...built.registry, 'job.needSignIn': lanes.tool() };
  const ac = new AbortController();

  Object.assign(h, {
    tools: registry,
    runtime,
    lanes,
    takeOver,
    clock,
    redactor,
    signin: (p = '/login') => `http://127.0.0.1:${port}${p}`,
    captcha: (p = '/') => `http://localhost:${port}${p}`,
    toggles,
    counts,
    sent,
    ops,
    answers,
    stops,
    needsYou,
    halted,
    launched,
    login: null,
    vaultCalls,
    cards: {},
    suggestions: {},
    job,
    async run(tool: string, args: Record<string, unknown> = {}) {
      const def = registry[tool];
      if (!def) throw new Error(`no tool ${tool}`);
      return def.run(args, { jobId: job.id, signal: ac.signal, now: clock.now() });
    },
    async page() {
      const w = await runtime!.browser.openWindow(job.id);
      if (!w.ok) throw new Error(w.error.kind);
      return runtime!.page(job.id)!;
    },
    async post(card: NeedsUserCard) {
      const cardId = (await core.needsYou(job, card)) as string;
      await begun;
      return cardId;
    },
    async begun() {
      await begun;
    },
    async pump(ms: number) {
      for (let t = 0; t < ms; t += 500) {
        clock.advance(500);
        await new Promise((r) => setTimeout(r, 60));
      }
    },
    async until(cond: () => boolean, ms = 20_000) {
      for (let t = 0; t < ms && !cond(); t += 500) {
        clock.advance(500);
        await new Promise((r) => setTimeout(r, 60));
      }
      return cond();
    },
    async close() {
      ac.abort();
      lanes.jobEnded(job.id);
      takeOver.jobEnded(job.id);
      await runtime!.browser.shutdown();
      await closeSites();
      rmSync(dataDir, { recursive: true, force: true });
    },
  } satisfies Partial<LaneHarness>);
  return h;
}

/** The ops that set a card's state, in order. */
export const cardStates = (ops: DbOp[], cardId: string): string[] =>
  ops.flatMap((o) => (o.op === 'update' && o.table === 'cards' && o.id === cardId && typeof o.set.state === 'string' ? [o.set.state] : []));

/** The `signin.banner` reports for the job, as `op[:mode]`. */
export const bannerOps = (sent: Sent[]): string[] =>
  sent
    .filter((s) => s.kind === 'signin.banner' && s.payload.op !== 'bounds')
    .map((s) => `${String(s.payload.op)}${s.payload.mode ? `:${String(s.payload.mode)}` : ''}`);

export const liveStates = (sent: Sent[]): string[] =>
  sent
    .filter((s) => s.kind === 'ui.patch' && s.payload.event === 'live:state')
    .map((s) => String((s.payload.payload as { state: string }).state));
