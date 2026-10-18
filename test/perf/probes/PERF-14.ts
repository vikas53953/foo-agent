// Spec: 10-acceptance-2 §E PERF-14 (SQLite single-row write < 5 ms: one `DbOp` single-row insert/update in main →
// transaction committed), 08-3 §20 (X-130), 08-1 §2.4.1 (db.tx = one transaction through applyDbOps). Runs main's own built
// code (`openDb` + `applyDbOps` from out/main) on a copy of the perf data's foo.db, in Electron's Node (ELECTRON_RUN_AS_NODE)
// so better-sqlite3 is the same binary the app loads. One run = one single-row update of a message, timed to commit.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import electronPath from 'electron';
import type { ProcessProbe, Sample } from './types';

const WARM_UP = 5;

/** The program Electron's Node runs: plain CommonJS, because it loads the built main bundle as the app does. */
const program = (outMain: string, dbFile: string, runs: number) => `
const { openDb } = require(${JSON.stringify(join(outMain, 'main', 'store', 'db.js'))});
const { applyDbOps } = require(${JSON.stringify(join(outMain, 'main', 'engine-supervisor', 'engineHost.js'))});
const db = openDb(${JSON.stringify(dbFile)});
const rows = db.prepare("SELECT id, text FROM messages WHERE kind = 'text' ORDER BY rowid DESC LIMIT ?").all(${runs + WARM_UP});
if (rows.length < ${runs + WARM_UP}) throw new Error('perf data has too few text messages');
const out = [];
rows.forEach((m, i) => {
  const t0 = process.hrtime.bigint();
  const r = applyDbOps(db, [{ op: 'update', table: 'messages', id: m.id, set: { text: m.text + ' ' } }]).result;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (!r.ok) throw new Error('update failed: ' + JSON.stringify(r.error));
  if (i >= ${WARM_UP}) out.push({ ms, id: m.id });
});
db.close();
process.stdout.write(JSON.stringify(out));
`;

export const probe: ProcessProbe = {
  kind: 'process',
  id: 'PERF-14',
  measures: 'one DbOp single-row update in main → transaction committed',
  budget: { kind: 'lt', max: 5, unit: 'ms' },
  smoke: true,
  textScale: false,
  measureAll: async (runs, ctx): Promise<Sample[]> => {
    const src = join(ctx.perfData, 'data', 'foo.db');
    if (!existsSync(src)) throw new Error(`no foo.db in ${ctx.perfData}`);
    const tmp = mkdtempSync(join(tmpdir(), 'foo-perf14-'));
    try {
      const db = join(tmp, 'foo.db');
      copyFileSync(src, db);
      const script = join(tmp, 'perf14.cjs');
      writeFileSync(script, program(resolve(ctx.outMain), db, runs));
      const r = spawnSync(electronPath as unknown as string, [script], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        encoding: 'utf8',
        timeout: 120_000,
      });
      if (r.status !== 0) throw new Error(`PERF-14 program failed: ${r.stderr || r.error?.message || r.status}`);
      const out = JSON.parse(r.stdout) as { ms: number; id: string }[];
      return out.map((o) => ({ value: o.ms, trace: o }));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
};
