// Spec: 08-1 §4.3.10 (`connections`: masked account_label, sha256 account_hash, vault_name `wa-session` per CR-0012 pick 7,
// status machine: linkStart → connecting, `wa.linked` → connected, 3 failed links → disconnected + WA_LINK_FAILED,
// `loggedOut` → unlinked, Unlink → row deleted; at startup every connecting row → disconnected), §2.1 row wa-bridge (forked
// only when a whatsapp row exists), §2.4.1 (chats and connections are written by main only), §4.6 rule 3 (wa_messages and
// wa_contacts are hard-deleted on unlink or read=false), 08-3 §16.4.3 (every group → one wa_mirror chat, muted 'forever';
// Hide from foo = archived + hiddenJids), 08-1 §3.2 `chat:archive` (wa_mirror only, else VALIDATION), 06-3 C-11 (Activity
// `disconnected` "Disconnected WhatsApp"), 08-0 §G.4 (`connected` "Connected {app} ({account})"). Main's WhatsApp writes;
// Electron-free so unit tests run them on a migrated db.
import { t } from '../../shared/copy/t';
import { fail, ok, type Result } from '../../shared/errors';
import { newId } from '../../shared/ids';
import type { Settings } from '../../shared/settings';
import type { ConnectionRow } from '../../shared/types';
import type { ActivityOpRow, WaReport } from '../../engine/protocol';
import { connectionRow, type DbRow } from '../db/rows';
import { applyDbOps } from '../engine-supervisor/engineHost';
import { WA_RETENTION_MS } from '../../shared/waBridge';
import type { Db } from '../store/db';

export interface SettingsLike {
  get(): Settings;
  update(fn: (s: Settings) => Settings): void;
}

export interface WaEffects {
  /** The whatsapp row after the change (for `connection:upsert`). */
  connection?: ConnectionRow;
  /** Mirror chats created or changed (for `chat:upsert`). */
  chatIds: string[];
  /** Mirror chats removed (for `chat:removed`). */
  removedChatIds: string[];
}

/** 08-1 §4.3.10 `vault_name` for the whatsapp row (CR-0012 pick 7). */
export const WA_VAULT_NAME = 'wa-session';
const GRANTED = { read: true, draft: true, send: true, calendarWrite: false, contactsRead: false };
/** A row made at linkStart, before the account is known (UNIQUE(app, account_hash) needs a value). */
const PENDING_HASH = 'pending';

const waRow = (db: Db): DbRow | undefined =>
  db.prepare("SELECT * FROM connections WHERE app = 'whatsapp' ORDER BY connected_at DESC LIMIT 1").get() as DbRow | undefined;

function activity(
  db: Db,
  row: Omit<
    ActivityOpRow,
    | 'actor'
    | 'chatId'
    | 'chatTitle'
    | 'jobId'
    | 'approvalId'
    | 'paymentId'
    | 'routineId'
    | 'toLabel'
    | 'fromLabel'
    | 'amountPaise'
    | 'approvedHow'
    | 'ruleText'
    | 'proofKind'
    | 'proofRef'
    | 'outcome'
  >,
  now: number,
  dataDir?: string,
): void {
  const full: ActivityOpRow = {
    actor: 'you',
    chatId: null,
    chatTitle: null,
    jobId: null,
    approvalId: null,
    paymentId: null,
    routineId: null,
    toLabel: null,
    fromLabel: null,
    amountPaise: null,
    approvedHow: 'user',
    ruleText: null,
    proofKind: null,
    proofRef: null,
    outcome: 'done',
    ...row,
  };
  const r = applyDbOps(db, [{ op: 'activity', row: full }], { now, ...(dataDir ? { dataDir } : {}) });
  if (!r.result.ok) throw new Error(`activity ${r.result.error.kind}`);
}

function setStatus(db: Db, id: string, status: ConnectionRow['status'], errorKind: string | null): void {
  db.prepare('UPDATE connections SET status = ?, last_error_kind = ?, rev = rev + 1 WHERE id = ?').run(status, errorKind, id);
}

const rowById = (db: Db, id: string) => connectionRow(db.prepare('SELECT * FROM connections WHERE id = ?').get(id) as DbRow);

/** One `wa.report` from the engine. */
export function applyWaReport(db: Db, settings: SettingsLike, r: WaReport, now: number, dataDir?: string): WaEffects {
  const fx: WaEffects = { chatIds: [], removedChatIds: [] };
  const cur = waRow(db);
  switch (r.event) {
    case 'status': {
      if (r.status === 'connecting') {
        if (!cur) {
          const id = newId('cn', now);
          db.prepare(
            `INSERT INTO connections (id, app, account_label, account_hash, granted, status, vault_name, connected_at)
             VALUES (?, 'whatsapp', '', ?, ?, 'connecting', ?, ?)`,
          ).run(id, PENDING_HASH, JSON.stringify(GRANTED), WA_VAULT_NAME, now);
          fx.connection = rowById(db, id);
        } else if (cur.status === 'disconnected') {
          setStatus(db, String(cur.id), 'connecting', null);
          fx.connection = rowById(db, String(cur.id));
        }
        return fx;
      }
      if (!cur) return fx;
      // A failed link touches only a row that is not linked; a dropped link touches only a linked one.
      const linking = cur.status === 'connecting' || cur.status === 'disconnected';
      if (r.status === 'disconnected' ? !linking : linking) return fx;
      setStatus(db, String(cur.id), r.status, r.errorKind);
      fx.connection = rowById(db, String(cur.id));
      return fx;
    }
    case 'linked': {
      db.transaction(() => {
        db.prepare("DELETE FROM connections WHERE app = 'whatsapp' AND account_hash != ?").run(r.accountHash);
        db.prepare(
          `INSERT INTO connections (id, app, account_label, account_hash, granted, status, vault_name, connected_at, last_ok_at)
           VALUES (?, 'whatsapp', ?, ?, ?, 'connected', ?, ?, ?)
           ON CONFLICT (app, account_hash) DO UPDATE SET account_label = excluded.account_label, status = 'connected',
             last_error_kind = NULL, connected_at = excluded.connected_at, last_ok_at = excluded.last_ok_at, rev = rev + 1`,
        ).run(newId('cn', now), r.accountLabel, r.accountHash, JSON.stringify(GRANTED), WA_VAULT_NAME, now, now);
      })();
      fx.connection = connectionRow(waRow(db)!);
      activity(
        db,
        { kind: 'connected', event: 'connected', summary: t('activity.summary.connected_whatsapp', { account: r.accountLabel }) },
        now,
        dataDir,
      );
      return fx;
    }
    case 'groups': {
      const hidden = new Set(settings.get().connections.whatsapp.hiddenJids);
      const created: string[] = [];
      db.transaction(() => {
        for (const g of r.groups) {
          const have = db
            .prepare("SELECT id, title FROM chats WHERE kind = 'wa_mirror' AND wa_jid = ? AND deleted_at IS NULL")
            .get(g.jid) as { id: string; title: string } | undefined;
          if (have) {
            if (g.title && have.title !== g.title) {
              db.prepare('UPDATE chats SET title = ?, rev = rev + 1 WHERE id = ?').run(g.title, have.id);
              fx.chatIds.push(have.id);
            }
            continue;
          }
          const id = newId('c', now);
          db.prepare(
            `INSERT INTO chats (id, kind, title, wa_jid, archived, last_activity_at, created_at) VALUES (?, 'wa_mirror', ?, ?, ?, ?, ?)`,
          ).run(id, g.title, g.jid, hidden.has(g.jid) ? 1 : 0, now, now);
          created.push(id);
          fx.chatIds.push(id);
        }
      })();
      if (created.length)
        settings.update((s) => ({
          ...s,
          notifications: {
            ...s.notifications,
            mutedChats: { ...s.notifications.mutedChats, ...Object.fromEntries(created.map((id) => [id, 'forever' as const])) },
          },
        }));
      return fx;
    }
  }
}

/** `connections.whatsapp.read=false` (08-3 §16.4) and part of Unlink: the stored messages and names go. */
export function deleteWaData(db: Db): void {
  db.transaction(() => {
    db.prepare('DELETE FROM wa_messages').run();
    db.prepare('DELETE FROM wa_contacts').run();
  })();
}

/** 06-3 C-11 Unlink: the row, the stored messages and names, and the mirror chats go; Activity `disconnected`. */
export function unlinkWhatsApp(db: Db, now: number, dataDir?: string): WaEffects {
  const cur = waRow(db);
  const removed = db.prepare("SELECT id FROM chats WHERE kind = 'wa_mirror' AND deleted_at IS NULL").pluck().all() as string[];
  db.transaction(() => {
    deleteWaData(db);
    db.prepare("UPDATE chats SET deleted_at = ?, rev = rev + 1 WHERE kind = 'wa_mirror' AND deleted_at IS NULL").run(now);
    db.prepare("DELETE FROM connections WHERE app = 'whatsapp'").run();
  })();
  const fx: WaEffects = { chatIds: [], removedChatIds: removed };
  if (cur) {
    fx.connection = { ...connectionRow(cur), status: 'disconnected', rev: Number(cur.rev) + 1 };
    if (cur.status !== 'connecting' && cur.status !== 'disconnected')
      activity(db, { kind: 'connected', event: 'disconnected', summary: t('activity.summary.disconnected_whatsapp') }, now, dataDir);
  }
  return fx;
}

/** 08-1 §3.2 `chat:archive`: archived and hiddenJids move together; only wa_mirror chats. */
export function archiveMirror(db: Db, settings: SettingsLike, chatId: string, on: boolean): Result<void> {
  const c = db.prepare('SELECT kind, wa_jid FROM chats WHERE id = ? AND deleted_at IS NULL').get(chatId) as
    { kind: string; wa_jid: string | null } | undefined;
  if (!c || c.kind !== 'wa_mirror' || !c.wa_jid) return fail('VALIDATION');
  const jid = c.wa_jid;
  db.prepare('UPDATE chats SET archived = ?, rev = rev + 1 WHERE id = ?').run(on ? 1 : 0, chatId);
  settings.update((s) => {
    const rest = s.connections.whatsapp.hiddenJids.filter((j) => j !== jid);
    return {
      ...s,
      connections: { ...s.connections, whatsapp: { ...s.connections.whatsapp, hiddenJids: on ? [...rest, jid] : rest } },
    };
  });
  return ok(undefined);
}

/** 08-1 §4.3.10: a link attempt never survives a restart. */
export function startupWhatsApp(db: Db, now: number): void {
  db.prepare("UPDATE connections SET status = 'disconnected', rev = rev + 1 WHERE app = 'whatsapp' AND status = 'connecting'").run();
  db.prepare('DELETE FROM wa_messages WHERE at < ?').run(now - WA_RETENTION_MS);
}

/** 08-1 §2.1: fork the bridge at startup only for a linked row (`error` = linked, the bridge gave up after 4 crashes). */
export function bridgeWanted(db: Db): boolean {
  return db.prepare("SELECT 1 FROM connections WHERE app = 'whatsapp' AND status IN ('connected', 'error')").get() !== undefined;
}
