// Spec: 09-windows §9.3/§9.23, 08-1 §4.3 (upgrade fixture data: chats, memory, routine and a working job).
// This helper writes only to the explicitly supplied FOO_DATA_DIR. It is called after the previous release has started once
// so its migration-created schema is the one being exercised; no real profile, keyring or AI provider is read.
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (!key?.startsWith('--') || value === undefined) throw new Error(`usage: lane-e-upgrade-seed.ts --data <dir> --out <dir>`);
  args.set(key.slice(2), value);
}

const dataDir = resolve(args.get('data') ?? '');
const outDir = resolve(args.get('out') ?? '');
if (!dataDir || !outDir || dataDir === resolve('.') || outDir === resolve('.')) {
  throw new Error('BLOCKED: --data and --out must be explicit fixture directories');
}
if (!process.env.RUNNER_TEMP) throw new Error('BLOCKED: RUNNER_TEMP is required for isolated fixture paths');
const runnerTemp = resolve(process.env.RUNNER_TEMP);
const inside = (path: string): boolean => path.toLowerCase().startsWith(`${runnerTemp.toLowerCase()}\\`);
if (!inside(dataDir) || !inside(outDir)) throw new Error('BLOCKED: --data and --out must be below RUNNER_TEMP');
const dbFile = join(dataDir, 'data', 'foo.db');
if (!existsSync(dbFile)) throw new Error(`BLOCKED: previous release did not create ${dbFile}`);

const now = Date.now();
const factText = 'Fixture remembers tea';
const factId = 'f_0199aaaa-0000-7000-8000-000000000001';
const factHash = createHash('sha256').update(factText.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase()).digest('hex');
const chatA = 'c_lane_e_upgrade_a';
const chatB = 'c_lane_e_upgrade_b';
const messageA = 'm_lane_e_upgrade_a';
const messageB = 'm_lane_e_upgrade_b';
const jobId = 'j_lane_e_upgrade_running';
const stepId = 's_lane_e_upgrade_running';
const routineId = 'r_lane_e_upgrade_hourly';

const db = new Database(dbFile);
try {
  db.pragma('foreign_keys = ON');
  const check = db.pragma('quick_check', { simple: true });
  if (check !== 'ok') throw new Error(`BLOCKED: previous release database quick_check=${String(check)}`);

  const exists = (table: string, id: string): boolean => Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id));
  for (const [table, id] of [
    ['chats', chatA],
    ['chats', chatB],
    ['messages', messageA],
    ['messages', messageB],
    ['jobs', jobId],
    ['steps', stepId],
    ['routines', routineId],
    ['memory_index', factId],
  ] as const) {
    if (exists(table, id)) throw new Error(`fixture id already exists: ${table}/${id}`);
  }

  const seed = db.transaction(() => {
    db.prepare(
      `INSERT INTO chats (id, kind, title, pinned, archived, unread_count, last_activity_at, next_seq, created_at)
       VALUES (?, 'foo', ?, 0, 0, 0, ?, 2, ?)`,
    ).run(chatA, 'Upgrade fixture chat A', now, now);
    db.prepare(
      `INSERT INTO chats (id, kind, title, pinned, archived, unread_count, last_activity_at, next_seq, created_at)
       VALUES (?, 'foo', ?, 0, 0, 0, ?, 2, ?)`,
    ).run(chatB, 'Upgrade fixture chat B', now, now);
    db.prepare(
      `INSERT INTO messages (id, chat_id, seq, author_kind, kind, text, status, badge, created_at)
       VALUES (?, ?, 1, 'user', 'text', ?, 'sent', 'done', ?)`,
    ).run(messageA, chatA, 'Fixture chat survives upgrade', now);
    db.prepare(
      `INSERT INTO messages (id, chat_id, seq, author_kind, kind, text, status, created_at)
       VALUES (?, ?, 1, 'foo', 'text', ?, 'complete', ?)`,
    ).run(messageB, chatB, 'Fixture reply survives upgrade', now + 1);
    db.prepare('UPDATE chats SET last_message_id = ? WHERE id = ?').run(messageA, chatA);
    db.prepare('UPDATE chats SET last_message_id = ? WHERE id = ?').run(messageB, chatB);

    db.prepare(
      `INSERT INTO memory_index
       (id, file, line_no, scope, chat_id, text, provenance, origin, origin_kind, reason, kind, private, learned_at, hash)
       VALUES (?, 'memory/about-you.md', 2, 'global', NULL, ?, 'said', 'chat:fixture', 'chat', NULL, 'fact', 0, ?, ?)`,
    ).run(factId, factText, now, factHash);
    db.prepare(
      `INSERT INTO routines
       (id, owner_chat_id, title, what_text, task_spec, schedule, tz, active_from, active_to, state, created_from,
        next_run_at, created_at, updated_at)
       VALUES (?, ?, 'Fixture hourly routine', 'Checks the fixture', ?, ?, 'Asia/Kolkata', '0600', '2300', 'on', 'asked', ?, ?, ?)`,
    ).run(routineId, chatA, '{"kind":"read_only","text":"Check fixture"}', '{"kind":"interval","minutes":60}', now + 60 * 60_000, now, now);
    db.prepare(
      `INSERT INTO jobs
       (id, chat_id, origin_chat_id, owner_kind, title, origin, user_message_id, intent, do_verbs, state, plan_version,
        current_step_idx, step_count, created_at, started_at, last_progress_at)
       VALUES (?, ?, ?, 'foo', 'Fixture running job', 'user', ?, 'read_only', '[]', 'working', 1, 0, 1, ?, ?, ?)`,
    ).run(jobId, chatA, chatA, messageA, now, now, now);
    db.prepare(
      `INSERT INTO steps (id, job_id, idx, phrase_key, slots, state, attempts, started_at)
       VALUES (?, ?, 0, 'freeform', ?, 'running', 1, ?)`,
    ).run(stepId, jobId, '{"text":"Check fixture"}', now);
  });
  seed();

  mkdirSync(join(dataDir, 'memory'), { recursive: true });
  const memory = `# About you\n- ${factText}  {you said · 2026-10-22 · chat · ${factId}}\n`;
  writeFileSync(join(dataDir, 'memory', 'about-you.md'), memory, 'utf8');
  mkdirSync(outDir, { recursive: true });
  const snapshot = {
    fixture: 'lane-e-upgrade',
    dataDir,
    createdAt: now,
    ids: { chats: [chatA, chatB], messages: [messageA, messageB], memory: factId, routine: routineId, job: jobId, step: stepId },
    expected: { chatCountAtLeast: 2, memoryCountAtLeast: 1, routineCountAtLeast: 1, runningJob: jobId },
  };
  writeFileSync(join(outDir, 'lane-e-upgrade-seed.json'), JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(JSON.stringify(snapshot));
} finally {
  db.close();
}
