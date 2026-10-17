// Spec: 08-3 §22.8 (IPC test channels, test builds only), §22.2 (fake Clock, Net online toggle), §22.9 (seed sets),
// 11-fidelity §11.2.3 (theme forced through the test channel, clock pinned to X-10). This folder is left out of the
// packaged app (electron-builder.yml), and ChannelGuard refuses every test:* channel unless FOO_TEST=1 and the
// FOO_*_DIR overrides are set.
import { nativeTheme } from 'electron';
import { z } from 'zod';
import { TEST_EPOCH_MS, type FakeClock } from '../../shared/clock';
import { SEED_SETS, type ClockReply, type SeedReply, type SeedSet } from '../../shared/ipc';
import { deps } from '../deps';
import { channels } from '../ipc/IpcRouter';
import type { SettingsStore } from '../settings/Settings';

/** Seed registry (08-3 §22.9). M1 replaces these stubs with loaders for test/seed/{set}.sql.gz. */
export const SEEDS: Record<SeedSet, () => SeedReply> = {
  demo: () => ({ set: 'demo', loaded: false, note: 'stub: the demo seed arrives with M1 (test/seed/ux-world.ts)' }),
  'ux-world': () => ({ set: 'ux-world', loaded: false, note: 'stub: generated from the walkthrough in M1' }),
  perf: () => ({ set: 'perf', loaded: false, note: 'stub: the perf seed arrives with M1 (test/seed/perf.ts)' }),
};

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

export function registerTestHooks(settings: SettingsStore, clock: FakeClock): string[] {
  const guard = channels();
  const reply = (): ClockReply => ({ now: clock.now(), iso: new Date(clock.now()).toISOString() });

  guard.handle('test:clock', (raw: unknown) => {
    const arg = clockArg.parse(raw);
    if (arg?.set !== undefined) clock.set(typeof arg.set === 'string' ? Date.parse(arg.set) : arg.set);
    if (arg?.advance !== undefined) clock.advance(arg.advance);
    return reply();
  });
  guard.handle('test:seed', (raw: unknown) => SEEDS[seedArg.parse(raw).set]());
  guard.handle('test:setOnline', (raw: unknown) => {
    deps.net.online = onlineArg.parse(raw).online;
    return { online: deps.net.online };
  });
  guard.handle('test:theme', (raw: unknown) => {
    const { theme } = themeArg.parse(raw);
    nativeTheme.themeSource = theme === 'system' ? settings.get().appearance.theme : theme;
    return { themeSource: nativeTheme.themeSource };
  });
  guard.handle('test:reset', () => {
    clock.reset(TEST_EPOCH_MS);
    deps.net.online = true;
    nativeTheme.themeSource = settings.get().appearance.theme;
    return reply();
  });
  return guard.registered;
}
