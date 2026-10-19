// Spec: 08-3 §16.1 (one Google sign-in creates or updates the three rows gmail, gcal, contacts sharing `vault_name`
// 'foo/conn_token/google'; `connection:connect` returns `{ connectionId, status: 'connecting' }` at once after the browser was
// opened; progress and the final rows on `connection:upsert`; OAUTH_DENIED / OAUTH_TIMEOUT / NET_OFFLINE as `lastErrorKind`;
// granted map; one account, X-73), §16.1.1 (Reconnect: select_account + login_hint), §16.1.2 (Calendar / Contacts Turn off /
// on are settings, not rows), §16.1 Limits + §16.7 + C-10 (Disconnect Google: revoke now or when back online, delete the three
// rows and `contacts_index`, token deleted with the last row), §21.2 (`invalid_grant` → the three rows `needs_signin`); 08-1
// §2.4 (main writes `connections` and `contacts_index`; the engine never does; one `connection.cmd` per connection:* call),
// §3.2 rows connection:list/connect/disconnect, §3.3 connection:upsert; 08-0 §G.4 activity `connected` / `disconnected` /
// `setting_changed`, §G.12; 06-3 §9.4 summaries; 0001 `connections` comment (startup: connecting → disconnected).
import { createHash } from 'node:crypto';
import { t } from '../../shared/copy/t';
import { fail, ok, type Result } from '../../shared/errors';
import { newId } from '../../shared/ids';
import type { Settings } from '../../shared/settings';
import type { ConnectionRow } from '../../shared/types';
import { nextStatus } from '../../engine/connections/machine';
import {
  buildAuthUrl,
  createGoogleAccess,
  exchangeCode,
  GOOGLE_APPS,
  GOOGLE_VAULT_NAME,
  grantedFromScope,
  pkcePair,
  revokeToken,
  scopeList,
  type GoogleApp,
  type GoogleClient,
  type GoogleEndpoints,
  type Granted,
  type GrantedFlag,
} from '../../engine/tools/connectors/google';
import { maskEmail } from '../../shared/redactor';
import type { ConnTokenStore, GoogleAccess, HttpFetch } from '../../engine/tools/connectors/types';
import { applyDbOps } from '../engine-supervisor/engineHost';
import { connectionRow, type DbRow } from '../db/rows';
import type { Db } from '../store/db';
import type { Loopback } from '../windows/oauthLoopback';

export type ConnectionCmd = {
  target: 'google' | 'outlook' | 'whatsapp';
  cmd: 'connect' | 'reconnect' | 'disconnect' | 'linkStart' | 'linkCancel' | 'unlink';
  connectionId?: string;
  scopes?: GoogleApp[];
};

export interface GoogleConnectionsDeps {
  db: Db;
  now: () => number;
  http: HttpFetch;
  endpoints: GoogleEndpoints;
  tokens: ConnTokenStore;
  client: () => GoogleClient | null;
  online: () => boolean;
  openLoopback: (state: string) => Promise<Loopback>;
  /** `app:openExternal { target: 'google_signin' }` rules (08-1 §3.2): a URL main built, host accounts.google.com. */
  openExternal: (url: string) => Promise<void>;
  emit: (row: ConnectionRow) => void;
  engineCmd: (cmd: ConnectionCmd) => void;
  /** {DATA}: the activity.jsonl line goes with the activity row (08-1 §4.1). */
  dataDir?: string;
  log?: (evt: string, kind?: string) => void;
}

const NOT_ALLOWED: Granted = { read: false, draft: false, send: false, calendarWrite: false, contactsRead: false };
/** The permission that makes each app's row useful (for its `connected` activity row). */
const APP_FLAG: Record<GoogleApp, GrantedFlag> = { gmail: 'read', gcal: 'calendarWrite', contacts: 'contactsRead' };
const appName = (app: GoogleApp): string =>
  app === 'gmail'
    ? t('settings.connections.app.gmail')
    : app === 'gcal'
      ? t('settings.connections.app.calendar')
      : t('settings.connections.app.contacts');

const isGoogle = (app: string): app is GoogleApp => (GOOGLE_APPS as readonly string[]).includes(app);
const hash = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

interface Running {
  loopback: Loopback;
  apps: GoogleApp[];
  /** Status of each row before this sign-in (undefined: the row was created by it). */
  before: Map<string, ConnectionRow['status']>;
}

export class GoogleConnections {
  private running: Running | null = null;
  /** The signed-in address (RAM only): Reconnect's login_hint and "Open in Gmail" authuser. */
  private email: string | null = null;
  /** A token Disconnect could not revoke while offline; revoked when back online (C-10). */
  private pendingRevoke: string | null = null;
  private accessCache: (GoogleAccess & { forget(): void }) | null = null;

  constructor(private d: GoogleConnectionsDeps) {}

  available(): boolean {
    return this.d.client() !== null;
  }

  // ------------------------------------------------------------------ rows
  private rowOf(app: GoogleApp): DbRow | undefined {
    return this.d.db.prepare('SELECT * FROM connections WHERE app = ?').get(app) as DbRow | undefined;
  }

  private emitRow(id: string): void {
    const r = this.d.db.prepare('SELECT * FROM connections WHERE id = ?').get(id) as DbRow | undefined;
    if (r) this.d.emit(connectionRow(r));
  }

  /** connection:list: every row a surface shows (a `disconnected` row is history, 08-1 §3.2). */
  list(): ConnectionRow[] {
    return (this.d.db.prepare("SELECT * FROM connections WHERE status != 'disconnected' ORDER BY connected_at").all() as DbRow[]).map(
      connectionRow,
    );
  }

  /** 0001 comment: 'connecting' is never kept past exit. Run once at startup, before any window. */
  startup(): void {
    const ids = this.d.db.prepare("SELECT id, status FROM connections WHERE status = 'connecting'").all() as DbRow[];
    for (const r of ids) {
      const to = nextStatus('connecting', 'app_start');
      this.d.db.prepare('UPDATE connections SET status = ?, rev = rev + 1 WHERE id = ?').run(to, r.id);
    }
  }

  private activity(event: 'connected' | 'disconnected', summary: string, fields: Record<string, unknown>): void {
    applyDbOps(
      this.d.db,
      [
        {
          op: 'activity',
          row: {
            kind: 'connected',
            event,
            actor: 'user',
            chatId: null,
            chatTitle: null,
            jobId: null,
            approvalId: null,
            paymentId: null,
            routineId: null,
            summary,
            toLabel: null,
            fromLabel: null,
            amountPaise: null,
            approvedHow: null,
            ruleText: null,
            proofKind: null,
            proofRef: null,
            outcome: 'done',
            fields,
          },
        },
      ],
      { now: this.d.now(), dataDir: this.d.dataDir },
    );
  }

  // ------------------------------------------------------------------ connect
  /** connection:connect { app: 'google', scopes? }: returns at once; the sign-in finishes on connection:upsert. */
  async connect(scopes: GoogleApp[] | undefined): Promise<Result<{ connectionId: string; status: 'connecting' }>> {
    const client = this.d.client();
    if (!client) return fail('VALIDATION', 'google_unavailable');
    if (!this.d.online()) return fail('NET_OFFLINE');
    const apps = scopeList(scopes);
    const reconnect = GOOGLE_APPS.some((a) => this.rowOf(a)?.status === 'needs_signin');
    this.running?.loopback.close(); // Reopen: a new sign-in replaces the one still waiting
    const pk = pkcePair();
    let loopback: Loopback;
    try {
      loopback = await this.d.openLoopback(pk.state);
    } catch {
      return fail('UNKNOWN', 'no_loopback_port');
    }
    const now = this.d.now();
    const before = new Map<string, ConnectionRow['status']>();
    let first: string | null = null;
    for (const app of GOOGLE_APPS) {
      const row = this.rowOf(app);
      // Every existing row's status is kept, so an incremental "Allow" does not re-announce the apps already connected.
      if (row) before.set(String(row.id), row.status as ConnectionRow['status']);
      if (!apps.includes(app) && !(row && reconnect)) continue;
      let id: string;
      if (row) {
        id = String(row.id);
        this.d.db.prepare("UPDATE connections SET status = 'connecting', last_error_kind = NULL, rev = rev + 1 WHERE id = ?").run(id);
      } else {
        id = newId('cn', now);
        this.d.db
          .prepare(
            `INSERT INTO connections (id, app, account_label, account_hash, granted, status, vault_name, connected_at)
             VALUES (?, ?, '', ?, ?, 'connecting', ?, ?)`,
          )
          .run(id, app, `pending:${app}`, JSON.stringify(NOT_ALLOWED), GOOGLE_VAULT_NAME, now);
      }
      first ??= id;
      this.emitRow(id);
    }
    const running: Running = { loopback, apps, before };
    this.running = running;
    const url = buildAuthUrl({
      client,
      redirectUri: loopback.redirectUri,
      scopes: apps,
      challenge: pk.challenge,
      state: pk.state,
      mode: reconnect ? 'reconnect' : 'consent',
      loginHint: reconnect ? (this.email ?? undefined) : undefined,
    });
    this.d.engineCmd({ target: 'google', cmd: reconnect ? 'reconnect' : 'connect', scopes: apps });
    try {
      await this.d.openExternal(url);
    } catch {
      loopback.close();
      this.endSignIn(running, 'OAUTH_DENIED');
      return fail('UNKNOWN', 'open_external_failed');
    }
    void loopback.result.then((outcome) => {
      if (this.running !== running) return;
      if (outcome.kind === 'cancelled') return;
      if (outcome.kind === 'timeout') return this.endSignIn(running, 'OAUTH_TIMEOUT');
      if (outcome.kind === 'denied') return this.endSignIn(running, 'OAUTH_DENIED');
      void this.finishCode(running, client, outcome.code, pk.verifier).catch(() => this.endSignIn(running, 'OAUTH_DENIED'));
    });
    return ok({ connectionId: first ?? '', status: 'connecting' as const });
  }

  /** A sign-in that did not finish: rows go back to what they were (a new row ends `disconnected`) with `lastErrorKind`. */
  private endSignIn(running: Running, kind: 'OAUTH_DENIED' | 'OAUTH_TIMEOUT' | 'NET_OFFLINE'): void {
    this.running = null;
    this.d.log?.('google.signin', kind);
    const rows = this.d.db.prepare("SELECT id FROM connections WHERE status = 'connecting'").all() as DbRow[];
    for (const r of rows) {
      const id = String(r.id);
      if (!isGoogle(String((this.d.db.prepare('SELECT app FROM connections WHERE id = ?').get(id) as DbRow).app))) continue;
      const to = running.before.get(id) ?? nextStatus('connecting', 'denied');
      this.d.db.prepare('UPDATE connections SET status = ?, last_error_kind = ?, rev = rev + 1 WHERE id = ?').run(to, kind, id);
      this.emitRow(id);
    }
  }

  private async finishCode(running: Running, client: GoogleClient, code: string, verifier: string): Promise<void> {
    const r = await exchangeCode(this.d.http, this.d.endpoints, { client, code, verifier, redirectUri: running.loopback.redirectUri });
    if (this.running !== running) return;
    if (!r.ok) return this.endSignIn(running, r.error.kind === 'NET_OFFLINE' ? 'NET_OFFLINE' : 'OAUTH_DENIED');
    this.running = null;
    const now = this.d.now();
    const { email, scope, refreshToken } = r.value;
    const old = await this.d.tokens.read(GOOGLE_VAULT_NAME);
    const oldHash = (this.rowOf('gmail') ?? this.rowOf('gcal') ?? this.rowOf('contacts'))?.account_hash;
    await this.d.tokens.write(GOOGLE_VAULT_NAME, { refresh_token: refreshToken, scope, issued_at: now });
    // Google's revoke ends the whole user + client grant, so the old token is revoked only when a different account signed in;
    // the same account's incremental consent ("Allow sending") just replaces it.
    const otherAccount = typeof oldHash === 'string' && !oldHash.startsWith('pending:') && oldHash !== hash(email);
    if (old && old.refresh_token !== refreshToken && otherAccount) void revokeToken(this.d.http, this.d.endpoints, old.refresh_token);
    this.email = email;
    this.accessCache?.forget();
    const granted = grantedFromScope(scope);
    const label = maskEmail(email);
    for (const app of GOOGLE_APPS) {
      const row = this.rowOf(app);
      if (!row) continue;
      const wasConnected = running.before.get(String(row.id)) === 'connected';
      this.d.db
        .prepare(
          `UPDATE connections SET status = 'connected', account_label = ?, account_hash = ?, granted = ?, last_ok_at = ?,
             last_error_kind = NULL, connected_at = CASE WHEN ? THEN connected_at ELSE ? END, rev = rev + 1 WHERE id = ?`,
        )
        .run(label, hash(email), JSON.stringify(granted), now, wasConnected ? 1 : 0, now, row.id);
      this.emitRow(String(row.id));
      if (!wasConnected && granted[APP_FLAG[app]])
        this.activity('connected', t('activity.summary.connected', { app: appName(app), account: label }), {
          app,
          account: label,
          granted,
        });
    }
  }

  // ------------------------------------------------------------------ disconnect (C-10)
  async disconnect(connectionId: string): Promise<Result<void>> {
    const row = this.d.db.prepare('SELECT * FROM connections WHERE id = ?').get(connectionId) as DbRow | undefined;
    if (!row) return fail('NOT_FOUND');
    if (!isGoogle(String(row.app))) return fail('VALIDATION', 'not_google');
    this.running?.loopback.close();
    this.running = null;
    this.d.engineCmd({ target: 'google', cmd: 'disconnect', connectionId });
    const stored = await this.d.tokens.read(GOOGLE_VAULT_NAME);
    this.accessCache?.forget();
    this.email = null;
    const rows = this.d.db.prepare("SELECT * FROM connections WHERE app IN ('gmail','gcal','contacts')").all() as DbRow[];
    this.d.db.transaction(() => {
      this.d.db.prepare('DELETE FROM contacts_index').run();
      this.d.db.prepare("DELETE FROM connections WHERE app IN ('gmail','gcal','contacts')").run();
    })();
    await this.d.tokens.delete(GOOGLE_VAULT_NAME);
    for (const r of rows) this.d.emit({ ...connectionRow(r), status: 'disconnected', rev: Number(r.rev) + 1 });
    this.activity('disconnected', t('activity.summary.disconnected_google'), { app: 'google' });
    if (stored) {
      const revoked = this.d.online() && (await revokeToken(this.d.http, this.d.endpoints, stored.refresh_token));
      this.pendingRevoke = revoked ? null : stored.refresh_token;
    }
    return ok(undefined);
  }

  /** C-10 "access revoked at Google (now, or when back online)". */
  async onOnline(): Promise<void> {
    const token = this.pendingRevoke;
    if (token && (await revokeToken(this.d.http, this.d.endpoints, token))) this.pendingRevoke = null;
  }

  // ------------------------------------------------------------------ expiry and scopes (§16.1 Tokens)
  /** `invalid_grant`: all three rows `needs_signin`, with the kind on the row (08-3 §21.2). */
  markLost(kind: 'CONN_EXPIRED' | 'CONN_REVOKED'): void {
    for (const app of GOOGLE_APPS) {
      const row = this.rowOf(app);
      const to = row ? nextStatus(row.status as ConnectionRow['status'], 'expired') : null;
      if (!row || !to) continue;
      this.d.db.prepare('UPDATE connections SET status = ?, last_error_kind = ?, rev = rev + 1 WHERE id = ?').run(to, kind, row.id);
      this.emitRow(String(row.id));
    }
  }

  /** 403 scope refusal, or a refresh whose scope lost a permission: the granted map on all three rows. */
  private setGranted(next: (g: Granted) => Granted): void {
    for (const app of GOOGLE_APPS) {
      const row = this.rowOf(app);
      if (!row) continue;
      const g = connectionRow(row).granted;
      const n = next(g);
      if (JSON.stringify(n) === JSON.stringify(g)) continue;
      this.d.db.prepare('UPDATE connections SET granted = ?, rev = rev + 1 WHERE id = ?').run(JSON.stringify(n), row.id);
      this.emitRow(String(row.id));
    }
  }

  scopeMissing(flag: GrantedFlag): void {
    this.setGranted((g) => ({ ...g, [flag]: false, ...(flag === 'draft' || flag === 'send' ? { draft: false, send: false } : {}) }));
  }

  /** The Google side of 08-3 §16.1.3 for main-side callers (T4's connectors take the same seam). */
  access(): GoogleAccess {
    this.accessCache ??= createGoogleAccess({
      http: this.d.http,
      endpoints: this.d.endpoints,
      client: this.d.client,
      tokens: this.d.tokens,
      email: () => this.email,
      onLost: (kind) => this.markLost(kind),
      onScopeMissing: async (flag) => this.scopeMissing(flag),
      onScope: (scope) => this.setGranted(() => grantedFromScope(scope)),
    });
    return this.accessCache;
  }

  // ------------------------------------------------------------------ settings (§16.1.2, §16.7)
  /** Calendar / Contacts Turn off / on: activity `setting_changed`; Contacts off deletes `contacts_index` at once. */
  settingsChanged(prev: Settings, next: Settings): void {
    for (const key of ['calendarOn', 'contactsOn'] as const) {
      const a = prev.connections.google[key];
      const b = next.connections.google[key];
      if (a === b) continue;
      const setting = key === 'calendarOn' ? t('settings.connections.app.calendar') : t('settings.connections.app.contacts');
      if (key === 'contactsOn' && !b) this.d.db.prepare('DELETE FROM contacts_index').run();
      applyDbOps(
        this.d.db,
        [
          {
            op: 'activity',
            row: {
              kind: 'changed',
              event: 'setting_changed',
              actor: 'user',
              chatId: null,
              chatTitle: null,
              jobId: null,
              approvalId: null,
              paymentId: null,
              routineId: null,
              summary: t('activity.summary.setting_changed', { setting, value: b ? 'on' : 'off' }),
              toLabel: null,
              fromLabel: null,
              amountPaise: null,
              approvedHow: null,
              ruleText: null,
              proofKind: null,
              proofRef: null,
              outcome: 'done',
              fields: { path: `connections.google.${key}`, value: b },
            },
          },
        ],
        { now: this.d.now(), dataDir: this.d.dataDir },
      );
    }
  }

  /** C-10 body: the routines that use Gmail, Calendar or Contacts (an `on_email` trigger, a Google tool, or Bill watch). */
  routinesUsingGoogle(): { title: string; app: GoogleApp }[] {
    const rows = this.d.db
      .prepare("SELECT title, builtin, task_spec, schedule FROM routines WHERE state != 'deleted' ORDER BY created_at")
      .all() as DbRow[];
    const out: { title: string; app: GoogleApp }[] = [];
    for (const r of rows) {
      const text = `${String(r.task_spec)} ${String(r.schedule)}`;
      const app: GoogleApp | null =
        r.builtin === 'bill_watch' || /on_email|gmail\./.test(text)
          ? 'gmail'
          : /gcal\./.test(text)
            ? 'gcal'
            : /contacts\./.test(text)
              ? 'contacts'
              : null;
      if (app) out.push({ title: String(r.title), app });
    }
    return out;
  }
}
