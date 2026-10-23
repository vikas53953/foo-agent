// Spec: 09-windows §9.3 and 08-1 §4.1–§4.3 (post-upgrade fixture integrity and running-job preservation).
// Read-only verifier for lane-e-upgrade.ps1. It checks the exact fixture IDs written by lane-e-upgrade-seed.ts and emits
// evidence; it never opens a real profile or touches Credential Manager.
import Database from 'better-sqlite3';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (process.argv.includes('--help')) {
  console.log('lane-e-upgrade-verify: read-only verification of chats, memory and the working job in an explicit fixture database.');
  process.exit(0);
}

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (!key?.startsWith('--') || value === undefined)
    throw new Error('usage: lane-e-upgrade-verify.ts --data <dir> --seed <dir> --out <dir>');
  args.set(key.slice(2), value);
}
const dataDir = resolve(args.get('data') ?? '');
const seedDir = resolve(args.get('seed') ?? '');
const outDir = resolve(args.get('out') ?? '');
if (!process.env.RUNNER_TEMP) throw new Error('BLOCKED: RUNNER_TEMP is required for isolated fixture paths');
const runnerTemp = resolve(process.env.RUNNER_TEMP);
const inside = (path: string): boolean => path.toLowerCase().startsWith(`${runnerTemp.toLowerCase()}\\`);
if (!inside(dataDir) || !inside(seedDir) || !inside(outDir)) throw new Error('BLOCKED: fixture paths must be below RUNNER_TEMP');
const seedFile = join(seedDir, 'lane-e-upgrade-seed.json');
const dbFile = join(dataDir, 'data', 'foo.db');
if (!existsSync(seedFile) || !existsSync(dbFile)) throw new Error('BLOCKED: seed manifest or upgraded database is missing');

const seed = JSON.parse(readFileSync(seedFile, 'utf8')) as {
  ids: { chats: string[]; messages: string[]; memory: string; job: string; step: string };
};
const db = new Database(dbFile, { readonly: true });
try {
  const quick = db.pragma('quick_check', { simple: true });
  if (quick !== 'ok') throw new Error(`database quick_check=${String(quick)}`);
  const fk = db.pragma('foreign_key_check') as unknown[];
  if (fk.length > 0) throw new Error(`foreign_key_check returned ${fk.length} rows`);
  const count = (table: string, id: string) => {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE id = ?`).get(id) as { n?: number } | undefined;
    return Number(row?.n ?? 0);
  };
  for (const id of seed.ids.chats) if (count('chats', id) !== 1) throw new Error(`chat was lost: ${id}`);
  for (const id of seed.ids.messages) if (count('messages', id) !== 1) throw new Error(`message was lost: ${id}`);
  if (count('memory_index', seed.ids.memory) !== 1) throw new Error('memory fact was lost');
  if (count('jobs', seed.ids.job) !== 1) throw new Error('running job was lost');
  if (count('steps', seed.ids.step) !== 1) throw new Error('running job step was lost');
  const job = db.prepare('SELECT state, current_step_idx, step_count FROM jobs WHERE id = ?').get(seed.ids.job) as {
    state: string;
    current_step_idx: number | null;
    step_count: number;
  };
  if (!['working', 'waiting', 'needs_you'].includes(job.state)) throw new Error(`running job became terminal: ${job.state}`);
  if (job.step_count !== 1 || job.current_step_idx !== 0) throw new Error(`running job cursor changed: ${JSON.stringify(job)}`);
  const memory = readFileSync(join(dataDir, 'memory', 'about-you.md'), 'utf8');
  if (!memory.includes(seed.ids.memory) || !memory.includes('Fixture remembers tea')) throw new Error('memory mirror was lost');

  mkdirSync(outDir, { recursive: true });
  const report = {
    result: 'pass',
    quickCheck: quick,
    foreignKeyRows: fk.length,
    preserved: {
      chats: seed.ids.chats,
      messages: seed.ids.messages,
      memory: seed.ids.memory,
      job: seed.ids.job,
    },
    resumedJob: job,
  };
  writeFileSync(join(outDir, 'lane-e-upgrade-verify.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report));
} finally {
  db.close();
}
