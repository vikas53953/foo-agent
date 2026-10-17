// Spec: 08-1 §3 (IPC contract: sender check + zod validation, `Result<T>` replies), §3.1 (platform info), §3.2 (the
// invoke rows M1 builds), §3.3 (events are patches; every *Row carries its rev), 08-0 §B.5; 08-3 §22.8 (test:* refused
// outside test runs, through ChannelGuard).
import { app, BrowserWindow, ipcMain, net, shell, systemPreferences, type IpcMainEvent } from 'electron';
import { z } from 'zod';
import { t } from '../../shared/copy/t';
import { fail, ok, type Result } from '../../shared/errors';
import type { EventChannel, EventPayload, InvokeChannel, InvokeIn, InvokeOut, PlatformInfo } from '../../shared/ipc';
import { PROVIDER_IDS, settingsSchema, WRITABLE_PATHS, type Settings } from '../../shared/settings';
import type { WindowsSettingsPage } from '../../shared/types';
import { deps } from '../deps';
import type { NetMonitor } from '../net/netMonitor';
import type { SettingsStore } from '../settings/Settings';
import type { Db } from '../store/db';
import {
  aiStatus,
  bootstrap,
  chatOpen,
  chatRowById,
  listChats,
  markRead,
  messageList,
  pinChat,
  publicSettings,
  spendSummary,
  type ListContext,
} from '../store/queries';
import { ChannelGuard } from './guard';
import { isTrustedUrl } from '../windows/protocol';

const trusted = (e: IpcMainEvent) => !!e.senderFrame && isTrustedUrl(e.senderFrame.url);

function reducedMotion(): boolean {
  try {
    return systemPreferences.getAnimationSettings().prefersReducedMotion;
  } catch {
    return false;
  }
}

let guard: ChannelGuard | null = null;

/** Every invoke channel registers through this guard: sender-checked, and test:* refused unless FOO_TEST runs. */
export function channels(): ChannelGuard {
  guard ??= new ChannelGuard(ipcMain, (url) => isTrustedUrl(url));
  return guard;
}

/** Sends an event (08-1 §3.3) to foo's windows. */
export function emit<E extends EventChannel>(event: E, payload: EventPayload[E]): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(event, payload);
}

export interface AppContext {
  db: Db;
  settings: SettingsStore;
  net: NetMonitor;
  /** The network probe: Electron's net.isOnline() in production, the injected Net in test runs. */
  probe: () => boolean;
}

export function listContext(settings: Settings): ListContext {
  return { now: deps.clock.now(), agentName: settings.identity.agentName, draftPrefix: t('chatlist.row.preview.draft') };
}

export const electronProbe = () => net.isOnline();

const empty = z.object({}).strict();
const chatId = z.string().min(1).max(80);
const SETTINGS_PAGE: Record<WindowsSettingsPage, string> = {
  notifications: 'ms-settings:notifications',
  'privacy-microphone': 'ms-settings:privacy-microphone',
  startupapps: 'ms-settings:startupapps',
  signin: 'ms-settings:signinoptions',
  storagesense: 'ms-settings:storagesense',
  dateandtime: 'ms-settings:dateandtime',
};

/** One zod schema per invoke channel (08-1 §3.1.1: a payload that fails zod is IPC_REJECTED). */
export const SCHEMAS: { [C in InvokeChannel]: z.ZodType<InvokeIn[C]> } = {
  'app:getBootstrap': empty as z.ZodType<Record<string, never>>,
  'app:quit': z.object({ confirm: z.boolean(), whenPaymentDone: z.boolean().optional() }).strict(),
  'app:openWindowsSettings': z
    .object({ page: z.enum(['notifications', 'privacy-microphone', 'startupapps', 'signin', 'storagesense', 'dateandtime']) })
    .strict(),
  'chat:list': z.object({ filter: z.enum(['all', 'needs_you', 'working', 'done']).optional(), q: z.string().max(200).optional() }).strict(),
  'chat:open': z.object({ chatId }).strict(),
  'chat:markRead': z.object({ chatId, upToSeq: z.number().int().min(0) }).strict(),
  'chat:pin': z.object({ chatId, on: z.boolean() }).strict(),
  'chat:mute': z.object({ chatId, until: z.union([z.number().int(), z.literal('forever'), z.null()]) }).strict(),
  'message:list': z.object({ chatId, beforeSeq: z.number().int().optional(), limit: z.number().int().min(1).max(200) }).strict(),
  'settings:get': empty as z.ZodType<Record<string, never>>,
  'settings:set': z.object({ path: z.enum(WRITABLE_PATHS), value: z.unknown() }).strict() as z.ZodType<{ path: string; value: unknown }>,
  'ai:verify': z.object({ providerId: z.enum(PROVIDER_IDS) }).strict(),
  'notifications:status': empty as z.ZodType<Record<string, never>>,
};

type Handler<C extends InvokeChannel> = (req: InvokeIn[C]) => Result<InvokeOut[C]> | Promise<Result<InvokeOut[C]>>;

/** Registers one channel: zod-validated, sender-checked, always answering with a Result. */
export function handle<C extends InvokeChannel>(channel: C, fn: Handler<C>): void {
  channels().handle(channel, async (raw: unknown) => {
    const parsed = SCHEMAS[channel].safeParse(raw ?? {});
    if (!parsed.success) {
      console.warn(`IPC_REJECTED ${channel}: payload failed validation`);
      return fail('IPC_REJECTED');
    }
    try {
      return await fn(parsed.data);
    } catch (e) {
      console.error(`ipc ${channel}`, e);
      return fail('UNKNOWN');
    }
  });
}

function setPath(s: Settings, path: string, value: unknown): Settings {
  const [head, key] = path.split('.') as [keyof Settings, string];
  const section = s[head] as Record<string, unknown>;
  return { ...s, [head]: { ...section, [key]: value } } as Settings;
}

export function registerIpc(ctx: AppContext): void {
  const { db, settings } = ctx;
  const now = () => deps.clock.now();
  const emitChat = (id: string) => {
    const row = chatRowById(db, listContext(settings.get()), id);
    if (row) emit('chat:upsert', row);
  };
  const emitSettings = () => emit('settings:changed', publicSettings(settings.get()));

  ipcMain.on('app:platform', (e) => {
    if (!trusted(e)) {
      e.returnValue = null;
      return;
    }
    const info: PlatformInfo = {
      os: process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux',
      reducedMotion: reducedMotion(),
      animations: settings.get().appearance.animations,
      now: now(),
    };
    e.returnValue = info;
  });

  ctx.net.onChange((online) => {
    emit('net:state', { online });
    emit('ai:status', aiStatus(settings.get(), ctx.net.offline));
  });

  handle('app:getBootstrap', () => {
    const s = settings.get();
    return ok(bootstrap(db, { ...listContext(s), settings: s, offline: ctx.net.offline }));
  });
  handle('app:quit', ({ confirm }) => {
    const runningJobs = db
      .prepare("SELECT COUNT(*) FROM jobs WHERE state IN ('queued','working','needs_you','waiting')")
      .pluck()
      .get() as number;
    const quitting = runningJobs === 0 || confirm;
    if (quitting) setImmediate(() => app.quit());
    return ok({ quitting, runningJobs, paymentInFlight: null });
  });
  handle('app:openWindowsSettings', async ({ page }) => {
    await shell.openExternal(SETTINGS_PAGE[page]);
    return ok(undefined);
  });
  handle('chat:list', ({ filter, q }) => ok(listChats(db, listContext(settings.get()), filter ?? 'all', q ?? '')));
  handle('chat:open', ({ chatId: id }) => {
    const r = chatOpen(db, id, now());
    return r ? ok(r) : fail('NOT_FOUND');
  });
  handle('chat:markRead', ({ chatId: id, upToSeq }) => {
    if (markRead(db, id, upToSeq)) emitChat(id);
    return ok(undefined);
  });
  handle('chat:pin', ({ chatId: id, on }) => {
    const r = pinChat(db, id, on, now());
    if (!r.ok) return fail(r.reason === 'not_found' ? 'NOT_FOUND' : 'VALIDATION', r.reason);
    const row = chatRowById(db, listContext(settings.get()), id)!;
    emit('chat:upsert', row);
    return ok(row);
  });
  handle('chat:mute', ({ chatId: id, until }) => {
    settings.update((s) => {
      const muted = { ...s.notifications.mutedChats };
      if (until === null) delete muted[id];
      else muted[id] = until;
      return { ...s, notifications: { ...s.notifications, mutedChats: muted } };
    });
    emitSettings();
    return ok(undefined);
  });
  handle('message:list', ({ chatId: id, beforeSeq, limit }) => ok(messageList(db, id, limit, beforeSeq)));
  handle('settings:get', () => ok(publicSettings(settings.get())));
  handle('settings:set', ({ path, value }) => {
    const next = setPath(settings.get(), path, value);
    if (!settingsSchema.safeParse(next).success) return fail('VALIDATION');
    settings.update(() => next);
    emitSettings();
    return ok({ settings: publicSettings(settings.get()), changeId: null });
  });
  handle('ai:verify', ({ providerId }) => {
    // M1 has no AI engine (M3): "Try again" re-tests the network now; the engine adds the real check.
    ctx.net.report(ctx.probe());
    emit('ai:status', aiStatus(settings.get(), ctx.net.offline));
    emit('spend:update', spendSummary(db, settings.get(), now()));
    return ok({ ok: false, providerId, kind: ctx.net.rawOnline ? 'UNKNOWN' : 'NET_OFFLINE' });
  });
  handle('notifications:status', () => ok({ windowsAllowed: true, focusAssist: false }));
}
