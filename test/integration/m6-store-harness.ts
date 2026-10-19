// M6 T3 harness: MemoryService against main's real handlers (applyDbOps, the named queries, writeDataFile) over a temp
// {DATA} and an in-memory SQLite db with the real schema. Seam: `memory.cmd` in → `db.tx` + `file.write` out (08-1 §2.4).
import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { DbOp, MainLink, NamedQuery } from '../../src/engine/protocol';
import { parseMemoryFile } from '../../src/engine/memory/fileFormat';
import { MemoryService } from '../../src/engine/memory/MemoryService';
import type { ParseWorker } from '../../src/engine/memory/parseWorker';
import type { ClassifyTurn } from '../../src/engine/memory/classifyFact';
import { applyDbOps, runNamedQuery, writeDataFile } from '../../src/main/engine-supervisor/engineHost';
import { migrate, type Db } from '../../src/main/store/db';
import { FakeClock, TEST_EPOCH_MS } from '../../src/shared/clock';
import { newId } from '../../src/shared/ids';
import type { Result } from '../../src/shared/errors';

export const DAY = 86_400_000;

export interface StoreHarness {
  svc: MemoryService;
  db: Db;
  clock: FakeClock;
  dataDir: string;
  txs: DbOp[][];
  writes: string[];
  changed: string[][];
  logs: string[];
  read(file: string): string;
  put(file: string, text: string): void;
  rows(): Record<string, unknown>[];
  tombstones(): Record<string, unknown>[];
}

/** Parses in the test's own thread (the worker path has its own test in m6-store.test.ts). */
export const inlineParser = (clock: FakeClock): ParseWorker => ({
  parse: (text, o) => Promise.resolve(parseMemoryFile(text, { ...o, newId: () => newId('f', clock.now()) })),
  close: () => Promise.resolve(),
});

export function storeHarness(o: { classify?: ClassifyTurn; parser?: ParseWorker } = {}): StoreHarness {
  const dataDir = join(mkdtempSync(join(tmpdir(), 'foo-m6-store-')), 'data');
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const clock = new FakeClock(TEST_EPOCH_MS);
  const txs: DbOp[][] = [];
  const writes: string[] = [];
  const changed: string[][] = [];
  const logs: string[] = [];
  const link: MainLink = {
    request<T>(kind: string, payload: unknown): Promise<Result<T>> {
      if (kind === 'db.tx') {
        const ops = (payload as { ops: DbOp[] }).ops;
        txs.push(ops);
        return Promise.resolve(applyDbOps(db, ops, { now: clock.now(), dataDir }).result as Result<T>);
      }
      if (kind === 'db.query') {
        const p = payload as { q: NamedQuery; args: unknown[] };
        return Promise.resolve(runNamedQuery(db, p.q, p.args, clock.now()) as Result<T>);
      }
      if (kind === 'file.write') {
        const p = payload as { relPath: string; text: string };
        writes.push(p.relPath);
        return Promise.resolve(writeDataFile(dataDir, p.relPath, p.text) as Result<T>);
      }
      throw new Error(`unexpected request ${kind}`);
    },
    send(kind, payload) {
      const p = payload as { event?: string; payload?: { factIds: string[] } };
      if (kind === 'ui.patch' && p.event === 'memory:changed') changed.push(p.payload!.factIds);
    },
  };
  const svc = new MemoryService({
    link,
    clock,
    dataDir,
    timeZone: () => 'Asia/Kolkata',
    newFactId: () => newId('f', clock.now()),
    parser: () => o.parser ?? inlineParser(clock),
    classify: o.classify ?? null,
    log: (evt) => logs.push(evt),
  });
  const path = (file: string) => join(dataDir, ...file.split('/'));
  return {
    svc,
    db,
    clock,
    dataDir,
    txs,
    writes,
    changed,
    logs,
    read: (file) => readFileSync(path(file), 'utf8'),
    put: (file, text) => {
      mkdirSync(dirname(path(file)), { recursive: true });
      writeFileSync(path(file), text);
    },
    rows: () => db.prepare('SELECT * FROM memory_index ORDER BY file, line_no').all() as Record<string, unknown>[],
    tombstones: () => db.prepare('SELECT * FROM memory_tombstones ORDER BY forgotten_at').all() as Record<string, unknown>[],
  };
}

/** A full fact id the parser accepts (`f_` + UUIDv7). */
export const fid = (n: number) => `f_0192${String(n).padStart(4, '0')}-0000-7000-8000-000000000000`;
