// Spec: 08-1 §4.4.2 steps 1–5 (settings:set: zod → VALIDATION, 08-0 §A.2 → SETTING_LOCKED, write, change record; settings:undo
// { changeId } → the old value when the current one still equals `fields.new`, else TOO_LATE, no time limit; an AI op is
// accepted only for the 08-0 §A.3 allow-list), CR-0043 (X-201): the chat line's marker follows its undo (08-4 §25.6).
import { fail, ok, type Result } from '../../shared/errors';
import { settingLocked, settingsSchema, type Settings } from '../../shared/settings';
import { isChatSettingPath, settingRowLabel, settingValueLabel, type SettingLineData } from '../../shared/settingsByChat';
import { t } from '../../shared/copy/t';
import { applyDbOps } from '../engine-supervisor/engineHost';
import type { Db } from '../store/db';
import { changeRecordRow } from './changeRecord';

export interface SettingCtx {
  db: Db;
  settings: { get(): Settings; update(fn: (s: Settings) => Settings): void };
  dataDir?: string;
  now(): number;
}

export function getPath(s: Settings, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], s);
}

/** Copies each object on the path (M5: three-level paths such as `permissions.actions.send`). */
export function setPath(s: Settings, path: string, value: unknown): Settings {
  const set = (o: Record<string, unknown>, [k, ...rest]: string[]): Record<string, unknown> => ({
    ...o,
    [k!]: rest.length ? set(o[k!] as Record<string, unknown>, rest) : value,
  });
  return set(s as unknown as Record<string, unknown>, path.split('.')) as unknown as Settings;
}

/** 08-1 §4.4.2 steps 1–3. `notifications.quiet` from chat names only the parts the user said; the rest stay. */
export function applySetting(
  ctx: SettingCtx,
  path: string,
  value: unknown,
  actor: 'user' | 'foo',
): Result<{ changeId: string | null; old: unknown; value: unknown }> {
  const before = ctx.settings.get();
  const old = getPath(before, path);
  const full =
    path === 'notifications.quiet' && value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(old as object), ...(value as object) }
      : value;
  const next = setPath(before, path, full);
  if (!settingsSchema.safeParse(next).success) return fail('VALIDATION');
  if (settingLocked(path, full)) return fail('SETTING_LOCKED');
  ctx.settings.update(() => next);
  // What was stored (the schema drops unknown keys), so Undo's equality check compares like with like.
  const stored = getPath(ctx.settings.get(), path);
  const row = changeRecordRow(path, old, stored, actor);
  const tx = row ? applyDbOps(ctx.db, [{ op: 'activity', row }], { now: ctx.now(), dataDir: ctx.dataDir }).result : null;
  return ok({ changeId: tx?.ok ? (tx.value.ids[0] ?? null) : null, old, value: stored });
}

/** The engine's `settings.set` (§4.4.2 step 5): only the chat allow-list, as foo. */
export function applyChatSetting(ctx: SettingCtx, path: string, value: unknown) {
  if (!isChatSettingPath(path)) return fail('SETTING_LOCKED');
  return applySetting(ctx, path, value, 'foo');
}

/**
 * 08-1 §4.4.2 step 4. Also moves the chat line that carried this change (`why.settingLine.changeId`) to "Changed back: …" or
 * to too_late, and returns its id so main can tell the renderer.
 */
export function undoSetting(ctx: SettingCtx, changeId: string): Result<{ messageIds: string[] }> {
  // Review (trust): only a chat change of an allow-list path can be undone here; a row naming any other path (a forged
  // engine `activity` op, a permission, a cap) is never written back.
  const act = ctx.db
    .prepare("SELECT fields FROM activity WHERE id = ? AND kind = 'changed' AND event = 'setting_changed' AND actor = 'foo'")
    .get(changeId) as { fields: string | null } | undefined;
  const parsed = act?.fields ? (JSON.parse(act.fields) as { path?: string; old?: unknown; new?: unknown }) : null;
  const f = parsed?.path && isChatSettingPath(parsed.path) ? parsed : null;
  const lines = ctx.db
    .prepare("SELECT id, why FROM messages WHERE marker_kind = 'system_line' AND json_extract(why, '$.settingLine.changeId') = ?")
    .all(changeId) as { id: string; why: string }[];
  const mark = (state: 'undone' | 'too_late', text?: string) => {
    const open = lines.filter((l) => !(JSON.parse(l.why) as { settingLine: SettingLineData }).settingLine.state);
    const ops = open.map((l) => {
      const why = JSON.parse(l.why) as { settingLine: SettingLineData };
      return {
        op: 'update' as const,
        table: 'messages' as const,
        id: l.id,
        set: { why: { settingLine: { ...why.settingLine, state } }, ...(text ? { text } : {}) },
      };
    });
    if (ops.length) applyDbOps(ctx.db, ops, { now: ctx.now(), dataDir: ctx.dataDir });
    return open.map((l) => l.id);
  };
  if (!f?.path) return fail('TOO_LATE');
  const current = getPath(ctx.settings.get(), f.path);
  if (JSON.stringify(current) !== JSON.stringify(f.new)) {
    mark('too_late');
    return fail('TOO_LATE');
  }
  const r = applySetting(ctx, f.path, f.old, 'user');
  if (!r.ok) return r;
  const text = isChatSettingPath(f.path)
    ? t('thread.setting.undone', { row: settingRowLabel(f.path), value: settingValueLabel(f.path, f.old) })
    : undefined;
  return ok({ messageIds: mark('undone', text) });
}
