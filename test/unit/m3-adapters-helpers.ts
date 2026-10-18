// Shared test scaffolding for the M3 adapter tests (08-3 §22.3: fake CLIs, captured fixtures, never real providers).
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { systemClock, type Clock } from '../../src/shared/clock';
import type { ProviderId } from '../../src/shared/types';
import type { AdapterDeps } from '../../src/engine/ai/deps';
import { nodeAiFs } from '../../src/engine/ai/index';
import { CliLimiter } from '../../src/engine/ai/lanes';
import { loadPricing } from '../../src/engine/ai/models';
import type { TurnRequest, TurnSink } from '../../src/engine/ai/types';

export const ROOT = path.resolve(__dirname, '../..');
export const FIX = path.join(ROOT, 'test/fixtures/cli-captures');
export const FAKE_CLI = path.join(ROOT, 'test/fakes/fake-cli');

export const fixture = (p: string): string => readFileSync(path.join(FIX, p), 'utf8');
export const fixtureLines = (p: string): string[] => fixture(p).split(/\r?\n/);
export const pricing = loadPricing(JSON.parse(readFileSync(path.join(ROOT, 'resources/pricing.json'), 'utf8')));

export function tmp(prefix = 'foo-m3-'): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

export interface TestDeps extends AdapterDeps {
  root: string;
  home: string;
  bin: string;
}

/** Deps on a fresh temp tree. `which(name)` finds `{bin}/{name}.cmd`, an npm-style shim to the fake CLI. */
export function makeDeps(over: Partial<AdapterDeps> = {}, env: Record<string, string> = {}): TestDeps {
  const root = tmp();
  const home = path.join(root, 'home');
  const bin = path.join(root, 'bin');
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  copyFileSync(path.join(FAKE_CLI, 'fake-cli-core.mjs'), path.join(bin, 'fake-cli-core.mjs'));
  for (const n of ['claude', 'codex', 'gemini']) {
    copyFileSync(path.join(FAKE_CLI, `fake-${n}.mjs`), path.join(bin, `fake-${n}.mjs`));
    writeFileSync(path.join(bin, `${n}.cmd`), `@ECHO off\r\nSET dp0=%~dp0\r\n"%_prog%"  "%dp0%\\fake-${n}.mjs" %*\r\n`);
  }
  const deps: TestDeps = {
    root,
    home,
    bin,
    clock: systemClock,
    fetch: (() => Promise.reject(new Error('network is off in tests'))) as unknown as typeof fetch,
    paths: { LOCAL: path.join(root, 'local'), DATA: path.join(root, 'data') },
    env: { PATH: process.env.PATH ?? '', HOME: home, USERPROFILE: home, ...env },
    platform: process.platform,
    getKey: async () => null,
    which: async (name) => {
      const p = path.join(bin, `${name}.cmd`);
      return (await nodeAiFs.exists(p)) ? p : null;
    },
    fs: nodeAiFs,
    pricing,
    execPath: process.execPath,
    timeZone: 'Asia/Kolkata',
    cliLimiter: new CliLimiter(4),
    ...over,
  };
  return deps;
}

export function req(over: Partial<TurnRequest> = {}): TurnRequest {
  return {
    turnId: 't-1',
    purpose: 'intake',
    system: 'SYSTEM TEXT',
    prompt: 'PROMPT TEXT with "quotes" & spaces',
    maxOutputTokens: 1200,
    timeoutMs: 20_000,
    temperature: 0.4,
    stream: true,
    ...over,
  };
}

export function sink(): TurnSink & { text: string[]; sessions: string[] } {
  const s = {
    text: [] as string[],
    sessions: [] as string[],
    onText: (d: string) => void s.text.push(d),
    onSession: (id: string) => void s.sessions.push(id),
  };
  return s;
}

export function readDump(p: string): {
  argv: string[];
  stdin: string;
  cwd: string;
  env: Record<string, string>;
  systemFile?: { path: string; existed: boolean; text: string | null };
  grandchildPid?: number;
  pid: number;
} {
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function waitFor(fn: () => boolean, ms = 5000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** A Response whose body arrives in small chunks (exercises line and UTF-8 splitting). */
export function streamResponse(body: string, init: ResponseInit = { status: 200 }, chunk = 7): Response {
  const bytes = Buffer.from(body, 'utf8');
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += chunk) c.enqueue(new Uint8Array(bytes.subarray(i, i + chunk)));
      c.close();
    },
  });
  return new Response(stream, init);
}

export interface FetchCall {
  url: string;
  init: RequestInit;
  body: unknown;
}

export function fakeFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>): {
  fetch: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
    return respond(url, init);
  }) as typeof fetch;
  return { fetch: f, calls };
}

export const keyFor =
  (keys: Partial<Record<ProviderId, string>>) =>
  async (p: ProviderId): Promise<string | null> =>
    keys[p] ?? null;

export type { Clock };
