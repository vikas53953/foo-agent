// Spec: 08-3 §22.8 (IPC test channels, test builds only), §22.2 (fake Clock, Net online toggle), §22.9 (seed sets),
// 11-fidelity §11.2.3 (theme forced through the test channel, clock pinned to X-10). This folder is left out of the
// packaged app (electron-builder.yml), and ChannelGuard refuses every test:* channel unless FOO_TEST=1 and the
// FOO_*_DIR overrides are set.
import { nativeTheme } from 'electron';
import { z } from 'zod';
import { TEST_EPOCH_MS, type FakeClock } from '../../shared/clock';
import { SEED_SETS, type ClockReply, type SeedReply, type SeedSet } from '../../shared/ipc';
import type { JobState } from '../../shared/types';
import { deps } from '../deps';
import { channels, emit, listContext, type AppContext } from '../ipc/IpcRouter';
import { aiStatus, chatRowById, chatRows, fooChatId, jobRows, publicSettings, recomputePill, spendSummary } from '../store/queries';
import { writeSeedMedia } from './seed/media';
import { m9SigninSettings, seedM9Signin } from './seed/m9Signin';
import { seedPerf } from './seed/perf';
import { seedUxWorld, uxWorldSettings } from './seed/uxWorld';

const JOB_STATES = [
  'queued',
  'working',
  'needs_you',
  'waiting',
  'done',
  'done_unverified',
  'failed',
  'cancelled',
] as const satisfies readonly JobState[];
const TERMINAL: readonly JobState[] = ['done', 'done_unverified', 'failed', 'cancelled'];

const clockArg = z
  .object({
    set: z.union([z.string().datetime({ offset: true }), z.number().finite()]).optional(),
    advance: z.number().finite().min(0).optional(),
  })
  .strict()
  .optional();
const seedArg = z.object({ set: z.enum(SEED_SETS) }).strict();
const onlineArg = z.object({ online: z.boolean() }).strict();
const themeArg = z.object({ theme: z.enum(['light', 'dark', 'system']) }).strict();
const jobStateArg = z.object({ jobId: z.string().min(1), state: z.enum(JOB_STATES) }).strict();

/** Seed registry (08-3 §22.9). Rows are generated into the open foo.db through the real schema; open windows get them as patches. */
export function seeds(ctx: AppContext, clock: FakeClock): Record<SeedSet, () => SeedReply> {
  const demo =
    (set: SeedSet, o: { ch8Live?: boolean } = {}) =>
    (): SeedReply => {
      const r = seedUxWorld(ctx.db, clock.now(), o);
      writeSeedMedia(ctx.dataDir, r.media);
      ctx.settings.update((s) => uxWorldSettings(s, r.refs, clock.now()));
      return { set, loaded: true, chats: r.chats, messages: r.messages, refs: r.refs };
    };
  return {
    demo: demo('demo'),
    'ux-world': demo('ux-world'),
    'ux-world-ch8-live': demo('ux-world-ch8-live', { ch8Live: true }),
    perf: () => {
      const r = seedPerf(ctx.db, clock.now());
      writeSeedMedia(ctx.dataDir, r.media);
      ctx.settings.update((s) => uxWorldSettings(s, r.refs, clock.now()));
      return { set: 'perf', loaded: true, chats: r.chats, messages: r.messages, refs: r.refs };
    },
    // M9 T6: sign-in cards in two lanes, a signed-in summary and two handoff markers.
    'm9-signin': () => {
      const r = seedM9Signin(ctx.db, clock.now());
      ctx.settings.update((s) => m9SigninSettings(s, r.refs, clock.now()));
      return { set: 'm9-signin', loaded: true, chats: r.chats, messages: r.messages, refs: r.refs };
    },
  };
}

/** After a seed: the open windows get the new world as ordinary patches (no reload, so the test's page stays usable). */
function republish(ctx: AppContext, oldChatIds: string[]): void {
  const s = ctx.settings.get();
  const lc = listContext(s);
  const rows = chatRows(ctx.db, lc);
  const live = new Set(rows.map((r) => r.id));
  for (const id of oldChatIds) if (!live.has(id)) emit('chat:removed', { chatId: id });
  for (const r of rows) emit('chat:upsert', r);
  emit('settings:changed', publicSettings(s));
  emit('ai:status', aiStatus(s, ctx.net.offline));
  emit('spend:update', spendSummary(ctx.db, s, lc.now));
  const open = s.window.lastChatId ?? fooChatId(ctx.db);
  if (open) emit('navigate', { view: { kind: 'chat', chatId: open } });
}

export function registerTestHooks(ctx: AppContext, clock: FakeClock): string[] {
  const guard = channels();
  const reply = (): ClockReply => ({ now: clock.now(), iso: new Date(clock.now()).toISOString() });
  const registry = seeds(ctx, clock);

  guard.handle('test:clock', (raw: unknown) => {
    const arg = clockArg.parse(raw);
    if (arg?.set !== undefined) clock.set(typeof arg.set === 'string' ? Date.parse(arg.set) : arg.set);
    if (arg?.advance !== undefined) clock.advance(arg.advance);
    ctx.engine?.send('test.clock', { now: clock.now() });
    return reply();
  });
  guard.handle('test:seed', (raw: unknown) => {
    const set = seedArg.parse(raw).set;
    const oldChatIds = (ctx.db.prepare('SELECT id FROM chats').pluck().all() as string[]).slice();
    const out = registry[set]();
    republish(ctx, oldChatIds);
    return out;
  });
  guard.handle('test:setOnline', (raw: unknown) => {
    deps.net.online = onlineArg.parse(raw).online;
    ctx.net.report(deps.net.online);
    return { online: deps.net.online };
  });
  guard.handle('test:jobState', (raw: unknown) => {
    const { jobId, state } = jobStateArg.parse(raw);
    const now = clock.now();
    const row = ctx.db.prepare('SELECT chat_id FROM jobs WHERE id = ?').get(jobId) as { chat_id: string } | undefined;
    if (!row) throw new Error('no such job');
    ctx.db
      .prepare('UPDATE jobs SET state = ?, last_progress_at = ?, finished_at = ?, rev = rev + 1 WHERE id = ?')
      .run(state, now, TERMINAL.includes(state) ? now : null, jobId);
    recomputePill(ctx.db, row.chat_id, now);
    const [job] = jobRows(ctx.db, 'id = ?', [jobId], now);
    if (job) emit('job:upsert', job);
    const chat = chatRowById(ctx.db, listContext(ctx.settings.get()), row.chat_id);
    if (chat) emit('chat:upsert', chat);
    return { chatId: row.chat_id };
  });
  guard.handle('test:theme', (raw: unknown) => {
    const { theme } = themeArg.parse(raw);
    nativeTheme.themeSource = theme === 'system' ? ctx.settings.get().appearance.theme : theme;
    return { themeSource: nativeTheme.themeSource };
  });
  guard.handle('test:reset', () => {
    clock.reset(TEST_EPOCH_MS);
    ctx.engine?.send('test.reset', {});
    ctx.engine?.send('test.clock', { now: clock.now() });
    deps.net.online = true;
    ctx.net.report(true);
    nativeTheme.themeSource = ctx.settings.get().appearance.theme;
    return reply();
  });
  return guard.registered;
}
