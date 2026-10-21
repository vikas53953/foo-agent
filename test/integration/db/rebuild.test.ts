// Spec: AT-118a (foo.db fails quick_check at startup → renamed foo-damaged-{yyyy-mm-dd-HHmm}.db, a fresh database rebuilt
// from the mirrors, one DB_REBUILT error card in the new foo chat; an approval rebuilt as RUNNING with submitted_at becomes
// CHECKING), 08-1 §4.1.1 (tombstones for referenced chats / messages / cards; foreign_key_check empty), §4.1.2 (mirrors).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import { openDb } from '../../../src/main/store/db';
import { openDbOrRebuild } from '../../../src/main/store/rebuild';
import { TEST_EPOCH_MS } from '../../../src/shared/clock';
import { BILLS_PLAN, jobHarness, jobIntake, stepDone, tool, type JobHarness } from '../jobs/jobHarness';

let h: JobHarness | null = null;
let dir: string | null = null;
afterEach(() => {
  h?.close();
  h = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

/** Lets the engine run until `ready` holds (at most 10 s): a fixed 80 ms was too short on a busy Windows runner. */
const until = async (ready: () => boolean, what: string) => {
  for (const end = Date.now() + 10_000; !ready(); await new Promise((r) => setTimeout(r, 2)))
    if (Date.now() > end) throw new Error(`never: ${what}`);
};

/** A real job's mirrors (one step done, one running), copied to a fresh {DATA} folder. */
async function mirrorsOfARunningJob(): Promise<{ data: string; jobId: string; steps: string[] }> {
  h = jobHarness({ script: [jobIntake(BILLS_PLAN), stepDone(0), tool('gmail.search', { query: 'bill' }, { delayMs: 60_000 })] });
  h.userSays('Find bills due this week');
  const run = h;
  await until(() => !!run.job(), 'the job is made');
  h.clock.advance(2_000);
  await until(() => run.job()?.state === 'working' && run.steps().some((s) => s.state === 'done'), 'step 1 done, the job working');
  const jobId = String(h.job().id);
  const steps = h.steps().map((s) => String(s.state));
  dir = mkdtempSync(path.join(os.tmpdir(), 'foo-rebuild-'));
  const data = path.join(dir, 'foo');
  mkdirSync(path.join(data, 'jobs', jobId), { recursive: true });
  const state = JSON.parse(h.mirror(jobId, 'state.json')!) as Record<string, unknown>;
  state.approvals = [
    {
      id: 'ap_1',
      cardId: 'k_approval',
      jobId,
      chatId: h.chatId,
      verb: 'send',
      hardLimit: true,
      fields: { to: 'someone' },
      fieldsHash: 'x',
      state: 'RUNNING',
      expiresAt: TEST_EPOCH_MS + 3_600_000,
      submittedAt: TEST_EPOCH_MS,
      createdAt: TEST_EPOCH_MS,
    },
  ];
  writeFileSync(path.join(data, 'jobs', jobId, 'state.json'), JSON.stringify(state));
  writeFileSync(
    path.join(data, 'activity.jsonl'),
    `${JSON.stringify({ id: 'act_1', at: TEST_EPOCH_MS, kind: 'sent', event: 'sent_email', actor: 'foo', chatId: h.chatId, jobId, summary: 'Sent an email', outcome: 'done' })}\n`,
  );
  return { data, jobId, steps };
}

describe('AT-118a · damaged foo.db is rebuilt from the mirrors', () => {
  it('quick_check fails → renamed, rebuilt, one DB_REBUILT card in the new foo chat, RUNNING approval → CHECKING', async () => {
    const { data, jobId, steps } = await mirrorsOfARunningJob();
    const file = path.join(data, 'data', 'foo.db');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.alloc(8192, 0x5a)); // not a database
    const now = new Date(2026, 9, 18, 9, 41).getTime();
    const logged: [string, string][] = [];
    const { db, damagedFile } = openDbOrRebuild(file, {
      dataDir: data,
      now,
      agentName: 'foo',
      log: (evt, detail) => logged.push([evt, detail]),
    });
    try {
      // 08-3 §19.1: the log gets a code, never the driver's message text.
      expect(logged[0]).toEqual(['DB_REBUILT', 'SQLITE_NOTADB']);
      expect(logged.some(([, d]) => /not a database|file is/iu.test(d))).toBe(false);
      expect(damagedFile).toBe(path.join(data, 'data', 'foo-damaged-2026-10-18-0941.db'));
      expect(existsSync(damagedFile!)).toBe(true);
      expect(readFileSync(damagedFile!)[0]).toBe(0x5a);
      expect(db.pragma('foreign_key_check')).toEqual([]);
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as Record<string, unknown>;
      expect(job.state).toBe('working');
      expect(db.prepare('SELECT state FROM steps WHERE job_id = ? ORDER BY idx').pluck().all(jobId) as string[]).toEqual(steps);
      expect(db.prepare("SELECT state FROM approvals WHERE id = 'ap_1'").pluck().get()).toBe('CHECKING');
      expect(db.prepare("SELECT summary FROM activity WHERE id = 'act_1'").pluck().get()).toBe('Sent an email');
      // The job's old chat and bubble are tombstones; the new foo chat is live and holds the one card.
      const old = db.prepare('SELECT deleted_at FROM chats WHERE id = ?').get(job.chat_id) as { deleted_at: number };
      expect(old.deleted_at).toBe(now);
      const live = db.prepare("SELECT id FROM chats WHERE kind = 'foo' AND deleted_at IS NULL").pluck().all() as string[];
      expect(live).toHaveLength(1);
      const cards = db.prepare("SELECT * FROM cards WHERE type = 'error' AND deleted_at IS NULL").all() as Record<string, unknown>[];
      expect(cards).toHaveLength(1);
      expect(cards[0]!.chat_id).toBe(live[0]);
      expect(JSON.parse(String(cards[0]!.payload))).toEqual({
        variant: 'error',
        kind: 'DB_REBUILT',
        whatHappened: t('errors.db_rebuilt.what_happened'),
        whatIsSafe: t('errors.db_rebuilt.what_is_safe'),
        button: { label: t('errors.db_rebuilt.button'), action: { kind: 'dismiss' } },
      });
    } finally {
      db.close();
    }
  });

  it('a healthy database opens as it is (no rename, no card)', () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'foo-rebuild-'));
    const file = path.join(dir, 'data', 'foo.db');
    openDb(file).close();
    const { db, damagedFile } = openDbOrRebuild(file, { dataDir: dir, now: TEST_EPOCH_MS, agentName: 'foo' });
    db.close();
    expect(damagedFile).toBeNull();
    expect(readdirSync(path.dirname(file)).some((f) => f.startsWith('foo-damaged-'))).toBe(false);
  });
});
