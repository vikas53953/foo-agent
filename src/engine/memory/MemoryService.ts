// Spec: 08-3 §12.2 (files are the truth; writes atomic through main's `file.write`; brace-less lines get id + brace at
// reindex, the file rewritten once), §12.3 (an edit makes the fact `you said · {today}`), §12.4 (placement is the engine's:
// helper notes, `people\{slug}.md`, `preferences\{topic}.md`, else `about-you.md`; chat scope = about-you + `chat:{chatId}`;
// manual add = one classify turn, `said`, origin `manual`, scope `global`), §12.4.1 (sensitive rule on every add, update and
// manual edit), §12.6 (forget + tombstone + 5 s undo restoring the exact line at its place; forgetBySource; forgetAll keeps
// identity.md and deletes helpers' notes), §12.8 (functions), 08-1 §2.5 (parsing in the worker; rows as one `db.tx`), §3.2
// memory rows (results and VALIDATION / TOO_LATE / CONFIRM_MISMATCH), §3.3 `memory:changed`, 08-0 §G.4 (`forgot_facts`, count
// only), CR-0010 G-M6-01 (`memory.cmd`), G-M6-06 (the page's add ignores `privacy.rememberOn`), G-M6-10 (a single page forget
// writes no activity row; a chip forget and the bulk forgets do).
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { EngineFact } from '../../main/db/queries';
import type { Clock } from '../../shared/clock';
import { t } from '../../shared/copy/t';
import { fail, ok, type Result } from '../../shared/errors';
import { uuid7 } from '../../shared/ids';
import type { MemoryCategory, MemoryFactView, MemoryKind, MemoryOrigin, MemoryProvenance, MemoryScope } from '../../shared/types';
import { activityRow } from '../jobs/stopFlow';
import type { DbOp, MainLink, MemoryCmdPayload } from '../protocol';
import { classifyFact, type ClassifyTurn } from './classifyFact';
import {
  ABOUT_YOU_FILE,
  ORIGIN_LABELS,
  validateAdd,
  writeMemoryFile,
  type MemoryDoc,
  type MemoryFact,
  type ParseResult,
} from './fileFormat';
import { factHash } from './hash';
import type { MemoryPort } from './MemoryPort';
import type { ParseWorker } from './parseWorker';
import { indexOps, type KeptColumns } from './reindex';
import { isSensitive, sensitiveRule } from './sensitive';
import { slug, topicOf } from './slug';
import { liftTombstoneOp, tombstoneOp, tombstonesText, TOMBSTONES_FILE } from './tombstones';

export const UNDO_MS = 5_000;
const IDENTITY_FILE = 'memory/identity.md';
const ABOUT_YOU_TITLE = '# About you';

export interface MemoryServiceDeps {
  link: MainLink;
  clock: Clock;
  dataDir: string;
  timeZone: () => string;
  newFactId: () => string;
  parser: () => ParseWorker;
  /** The manual-add classify turn; null = the §12.4 fallback (kind fact, category other). */
  classify: ClassifyTurn | null;
  log: (evt: string, kind?: string) => void;
}

/** A fact to learn from chat, a review or a job (T5): placement, the sensitive rule and tombstones are applied here. */
export interface LearnOp {
  text: string;
  provenance: MemoryProvenance;
  originKind: MemoryOrigin;
  /** The full reference kept in `memory_index.origin` (`chat:{chatId}/{messageId}`, `gmail:{id}`, …). */
  origin: string;
  reason?: string | null;
  category: MemoryCategory;
  kind: MemoryKind;
  person?: string;
  scope: MemoryScope;
  /** scope 'chat': the chat; scope 'helper': the helper whose notes take it. */
  chatId?: string | null;
  helperId?: string | null;
  private: boolean;
  /** `contacts_index` names, for the contact-details rule. */
  contacts?: readonly string[];
}
export type LearnResult = { factId: string } | { skipped: 'tombstone' | 'sensitive' | 'invalid' };

interface Undo {
  file: string;
  at: number;
  fact: MemoryFact;
  kept: Partial<KeptColumns>;
  hash: string;
  originKind: MemoryOrigin;
  until: number;
}

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** 08-5 §3.6 view of one index row; labels as `memory:list` gives them. */
export function factView(r: EngineFact): MemoryFactView {
  const row: Omit<EngineFact, 'hash'> & { hash?: string } = { ...r };
  delete row.hash;
  return { ...row, fileLabel: r.file.replace(/^memory\//, ''), originLabel: r.originKind };
}

export class MemoryService implements MemoryPort {
  private queue: Promise<unknown> = Promise.resolve();
  /** sha256 of the text foo last wrote per file: the watcher ignores those events (pack Risk 2). */
  private readonly own = new Map<string, string>();
  private readonly undos = new Map<string, Undo>();

  constructor(private readonly d: MemoryServiceDeps) {}

  cmd(c: MemoryCmdPayload): Promise<Result<unknown>> {
    // A worker that died rejects its parse: the invoke answers UNKNOWN instead of hanging main's 30 s wait.
    return this.run(() => this.command(c)).catch((e: unknown) => fail('UNKNOWN', e instanceof Error ? e.message : String(e)));
  }

  private async command(c: MemoryCmdPayload): Promise<Result<unknown>> {
    switch (c.cmd) {
      case 'add':
        return this.add(c.text);
      case 'edit':
        return this.edit(c.factId, c.text);
      case 'setPrivate':
        return this.change(c.factId, (f) => ({ ...f, private: c.private }));
      case 'setKind':
        return this.setKind(c.factId, c.kind);
      case 'forget':
        return this.forgetOne(c.factId, false);
      case 'undo':
        return this.undo(c.undoToken);
      case 'forgetBySource':
        return this.forgetWhere((r) => r.originKind === c.source, c.source);
      case 'forgetAll':
        return this.forgetWhere((r) => r.file !== IDENTITY_FILE, null);
    }
  }

  tidy(): Promise<Result<unknown>> {
    return Promise.resolve(fail('UNKNOWN', 'memory tidy not built yet'));
  }

  /** Saves one learned fact (review, intake "remember", a job's note). */
  learn(op: LearnOp): Promise<Result<LearnResult>> {
    return this.run(async (): Promise<Result<LearnResult>> => {
      if (!validateAdd({ text: op.text, kind: op.kind, ...(op.person ? { person: op.person } : {}), category: op.category }).ok)
        return ok({ skipped: 'invalid' });
      const file = placeFact(op);
      const rule = sensitiveRule({ ...op, file });
      if (!rule.save) {
        this.d.log('memory.dropped_sensitive');
        return ok({ skipped: 'sensitive' });
      }
      if (await this.query<boolean>('memoryTombstoned', [factHash(op.text), op.originKind])) return ok({ skipped: 'tombstone' });
      const fact: MemoryFact = {
        id: this.d.newFactId(),
        text: op.text.trim(),
        provenance: op.provenance,
        date: this.today(),
        origin: op.originKind,
        reason: op.provenance === 'guessed' ? (op.reason ?? null) : null,
        kind: op.kind,
        private: rule.private,
        chatId: file === ABOUT_YOU_FILE && op.scope === 'chat' ? (op.chatId ?? null) : null,
      };
      const r = await this.append(file, fact, { origin: op.origin, category: op.category });
      return r.ok ? ok({ factId: fact.id }) : r;
    });
  }

  /** A forget from a chip (G-M6-10: logged `forgot_facts` with count 1). */
  forgetFromChip(factId: string): Promise<Result<{ undoToken: string }>> {
    return this.run(() => this.forgetOne(factId, true));
  }

  // M6 T5
  /**
   * A review `update` op (08-3 §12.4: supersede, never append) and a chip's Undo of one: the line's text changes in place,
   * dated today, its provenance kept. §12.4.1 runs first: a sensitive text on a `guessed` fact is dropped (VALIDATION, logged
   * `memory.dropped_sensitive`); on a `said` fact it turns `private` on.
   */
  update(factId: string, text: string): Promise<Result<MemoryFactView>> {
    return this.run(async (): Promise<Result<MemoryFactView>> => {
      const row = await this.row(factId);
      if (!row) return fail('NOT_FOUND');
      if (!validateAdd({ text, kind: 'fact' }).ok) return fail('VALIDATION');
      const rule = sensitiveRule({
        text,
        category: row.category ?? 'other',
        kind: row.kind,
        file: row.file,
        provenance: row.provenance,
        private: row.private,
      });
      if (!rule.save) {
        this.d.log('memory.dropped_sensitive');
        return fail('VALIDATION');
      }
      return this.change(factId, (f) => ({ ...f, text: text.trim(), date: this.today(), private: rule.private }));
    });
  }

  /** The watcher's call: one file changed on disk (Notepad). */
  fileChanged(file: string): Promise<void> {
    return this.run(() => this.reindexFile(file)).catch((e: unknown) =>
      this.d.log('memory.reindex_failed', e instanceof Error ? e.message : 'UNKNOWN'),
    );
  }

  private async reindexFile(file: string): Promise<void> {
    const text = await this.read(file);
    if (this.own.get(file) === sha(text)) return;
    // Someone else's text: the mark is spent, so a later Ctrl+Z back to foo's text is reindexed too.
    this.own.delete(file);
    const parsed = await this.parse(file, text);
    const rows = (await this.query<EngineFact[]>('memory.byFile', [file])) ?? [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    let rewrite = parsed.rewrite;
    // §12.4.1: a new or edited line that is sensitive is saved private.
    for (const e of parsed.doc.entries) {
      if (e.type !== 'fact' || e.fact.private || e.fact.provenance !== 'said') continue;
      const row = byId.get(e.fact.id);
      if (row && row.text === e.fact.text) continue;
      if (isSensitive({ text: e.fact.text, category: row?.category ?? 'other', kind: e.fact.kind, file })) {
        e.fact.private = true;
        rewrite = true;
      }
    }
    if (parsed.badLines.length) this.d.log('memory.parse', 'MEMORY_PARSE');
    const r = rewrite ? await this.commit(file, parsed.doc, { diskText: text }) : await this.index(file, parsed.facts, {});
    if (!r.ok) this.d.log('memory.reindex_failed', r.error.kind);
    else this.changed(r.value);
  }

  /** Every memory file on disk is reindexed once (edits made while foo was closed). */
  async reindexAll(): Promise<void> {
    for (const file of await this.listFiles()) await this.fileChanged(file);
  }

  // ---- commands ----

  private async add(text: string): Promise<Result<MemoryFactView>> {
    if (!validateAdd({ text, kind: 'fact' }).ok) return fail('VALIDATION');
    const cls = await classifyFact(text, this.d.classify);
    const file = placeFact({ ...cls, scope: 'global' });
    const rule = sensitiveRule({ text, category: cls.category, kind: cls.kind, file, provenance: 'said', private: false });
    const fact: MemoryFact = {
      id: this.d.newFactId(),
      text: text.trim(),
      provenance: 'said',
      date: this.today(),
      origin: 'manual',
      reason: null,
      kind: cls.kind,
      private: rule.save && rule.private,
      chatId: null,
    };
    const r = await this.append(file, fact, { origin: 'manual', category: cls.category });
    return r.ok ? this.view(fact.id) : r;
  }

  private async edit(factId: string, text: string): Promise<Result<MemoryFactView>> {
    const row = await this.row(factId);
    if (!row) return fail('NOT_FOUND');
    if (!validateAdd({ text, kind: 'fact' }).ok) return fail('VALIDATION');
    const sensitive = isSensitive({ text, category: row.category ?? 'other', kind: row.kind, file: row.file });
    return this.change(factId, (f) => ({
      ...f,
      text: text.trim(),
      provenance: 'said',
      date: this.today(),
      reason: null,
      private: f.private || sensitive,
    }));
  }

  /** Rewrites one line in place. */
  private async change(factId: string, fn: (f: MemoryFact) => MemoryFact): Promise<Result<MemoryFactView>> {
    const row = await this.row(factId);
    if (!row) return fail('NOT_FOUND');
    const { doc, text } = await this.load(row.file);
    const e = doc.entries.find((x) => x.type === 'fact' && x.fact.id === factId);
    if (!e || e.type !== 'fact') return fail('NOT_FOUND');
    e.fact = fn(e.fact);
    const r = await this.commit(row.file, doc, { diskText: text });
    if (!r.ok) return r;
    this.changed([factId]);
    return this.view(factId);
  }

  /** 08-1 §3.2 `memory:setKind`: the line moves to the kind's file (X-06); helper notes and chat-only facts keep their file. */
  private async setKind(factId: string, kind: MemoryKind): Promise<Result<MemoryFactView>> {
    const row = await this.row(factId);
    if (!row) return fail('NOT_FOUND');
    const target = kindFile(row, kind);
    if (target === row.file) return this.change(factId, (f) => ({ ...f, kind }));
    const src = await this.load(row.file);
    const at = src.doc.entries.findIndex((x) => x.type === 'fact' && x.fact.id === factId);
    const e = src.doc.entries[at];
    if (!e || e.type !== 'fact') return fail('NOT_FOUND');
    src.doc.entries.splice(at, 1);
    const moved = await this.append(target, { ...e.fact, kind }, row, false);
    if (!moved.ok) return moved;
    const r = await this.commit(row.file, src.doc, { diskText: src.text });
    if (!r.ok) return r;
    this.changed([factId]);
    return this.view(factId);
  }

  private async forgetOne(factId: string, fromChip: boolean): Promise<Result<{ undoToken: string }>> {
    const row = await this.row(factId);
    if (!row) return fail('NOT_FOUND');
    const { doc, text } = await this.load(row.file);
    const at = doc.entries.findIndex((x) => x.type === 'fact' && x.fact.id === factId);
    const e = doc.entries[at];
    if (!e || e.type !== 'fact') return fail('NOT_FOUND');
    doc.entries.splice(at, 1);
    const now = this.d.clock.now();
    // The line actually removed (an unindexed Notepad edit may differ from the row).
    const hash = factHash(e.fact.text);
    const extra: DbOp[] = [tombstoneOp(hash, row.originKind, now)];
    if (fromChip) extra.push(forgotActivity(1, row.originKind));
    const r = await this.commit(row.file, doc, { diskText: text, extra });
    if (!r.ok) return r;
    await this.writeTombstones();
    for (const [k, u] of this.undos) if (u.until < now) this.undos.delete(k);
    const undoToken = `undo_${uuid7(now, Math.random)}`;
    this.undos.set(undoToken, {
      file: row.file,
      at,
      fact: e.fact,
      kept: keptOf(row),
      hash,
      originKind: row.originKind,
      until: now + UNDO_MS,
    });
    this.changed([factId]);
    return ok({ undoToken });
  }

  private async undo(token: string): Promise<Result<MemoryFactView>> {
    const u = this.undos.get(token);
    this.undos.delete(token);
    if (!u || this.d.clock.now() > u.until) return fail('TOO_LATE');
    const { doc, text } = await this.load(u.file);
    if (u.file === ABOUT_YOU_FILE && doc.title === null && doc.entries.length === 0) doc.title = ABOUT_YOU_TITLE;
    doc.entries.splice(Math.min(u.at, doc.entries.length), 0, { type: 'fact', fact: u.fact });
    const r = await this.commit(u.file, doc, {
      diskText: text,
      kept: new Map([[u.fact.id, u.kept]]),
      extra: [liftTombstoneOp(u.hash, u.originKind)],
    });
    if (!r.ok) return r;
    await this.writeTombstones();
    this.changed([u.fact.id]);
    return this.view(u.fact.id);
  }

  /** forgetBySource (`source` set) and forgetAll (null): every matching line, tombstoned; one `forgot_facts` row. */
  private async forgetWhere(match: (r: EngineFact) => boolean, source: MemoryOrigin | null): Promise<Result<{ count: number }>> {
    const rows = ((await this.query<EngineFact[]>('memory.all', [])) ?? []).filter(match);
    const files = [...new Set(rows.map((r) => r.file))];
    const now = this.d.clock.now();
    let count = 0;
    for (const file of files) {
      const gone = rows.filter((r) => r.file === file);
      const ids = new Set(gone.map((r) => r.id));
      const { doc, text } = await this.load(file);
      if (source === null) {
        // forgetAll deletes the file (§12.6); main has no delete, so it is written empty.
        doc.title = null;
        doc.entries = [];
      } else doc.entries = doc.entries.filter((x) => x.type !== 'fact' || !ids.has(x.fact.id));
      const extra = gone.map((r) => tombstoneOp(factHash(r.text), r.originKind, now));
      const r = await this.commit(file, doc, { diskText: text, extra });
      if (!r.ok) return r;
      count += gone.length;
    }
    if (count > 0) {
      const r = await this.d.link.request('db.tx', { ops: [forgotActivity(count, source)] });
      if (!r.ok) return r;
      await this.writeTombstones();
      this.changed(rows.map((r) => r.id));
    }
    return ok({ count });
  }

  // ---- files and index ----

  /** Adds one line at the end of its file (the title `# About you` on a new about-you.md). */
  private async append(file: string, fact: MemoryFact, kept: Partial<KeptColumns>, announce = true): Promise<Result<unknown>> {
    const { doc, text } = await this.load(file);
    if (file === ABOUT_YOU_FILE && doc.title === null && doc.entries.length === 0) doc.title = ABOUT_YOU_TITLE;
    doc.entries.push({ type: 'fact', fact });
    const r = await this.commit(file, doc, { diskText: text, kept: new Map([[fact.id, keptOf(kept)]]) });
    if (r.ok && announce) this.changed([fact.id]);
    return r;
  }

  /** Writes the doc (only when its text changed), then indexes the written text. */
  private async commit(
    file: string,
    doc: MemoryDoc,
    o: { diskText: string; kept?: ReadonlyMap<string, Partial<KeptColumns>>; extra?: DbOp[] },
  ): Promise<Result<string[]>> {
    const text = writeMemoryFile(doc);
    if (text !== o.diskText) {
      this.own.set(file, sha(text));
      const w = await this.d.link.request('file.write', { relPath: file, text, atomic: true });
      if (!w.ok) return w;
    }
    const parsed = await this.parse(file, text);
    return this.index(file, parsed.facts, o);
  }

  private async index(
    file: string,
    facts: ParseResult['facts'],
    o: { kept?: ReadonlyMap<string, Partial<KeptColumns>>; extra?: DbOp[] },
  ): Promise<Result<string[]>> {
    const rows = (await this.query<EngineFact[]>('memory.byFile', [file])) ?? [];
    const known = new Set(rows.map((r) => r.id));
    const moved = new Map<string, EngineFact>();
    for (const f of facts) {
      if (known.has(f.id)) continue;
      const other = await this.row(f.id);
      if (other) moved.set(f.id, other);
    }
    const ops = [
      ...indexOps({ file, facts, rows, moved, ...(o.kept ? { kept: o.kept } : {}), now: this.d.clock.now(), today: this.today() }),
      ...(o.extra ?? []),
    ];
    if (ops.length === 0) return ok([]);
    const r = await this.d.link.request('db.tx', { ops });
    if (!r.ok) return r;
    return ok(
      ops.flatMap((op) =>
        op.op === 'insert' && op.table === 'memory_index'
          ? [String(op.row.id)]
          : op.op === 'update' || (op.op === 'delete' && op.table === 'memory_index')
            ? [op.id]
            : [],
      ),
    );
  }

  private async writeTombstones(): Promise<void> {
    const rows = (await this.query<Parameters<typeof tombstonesText>[0]>('memory.tombstones', [])) ?? [];
    const text = tombstonesText(rows);
    const r = await this.d.link.request('file.write', { relPath: TOMBSTONES_FILE, text, atomic: true });
    if (!r.ok) this.d.log('memory.tombstones_write_failed', r.error.kind);
  }

  private async load(file: string): Promise<{ doc: MemoryDoc; text: string }> {
    const text = await this.read(file);
    return { doc: (await this.parse(file, text)).doc, text };
  }

  private parse(file: string, text: string): Promise<ParseResult> {
    return this.d.parser().parse(text, { file, today: this.today() });
  }

  private async read(file: string): Promise<string> {
    try {
      return await readFile(join(this.d.dataDir, ...file.split('/')), 'utf8');
    } catch {
      return '';
    }
  }

  /** `memory/*.md`, `memory/people/*.md`, `memory/preferences/*.md`, `helpers/{h_id}/notes.md`. */
  private async listFiles(): Promise<string[]> {
    const md = async (rel: string) =>
      (await readdir(join(this.d.dataDir, ...rel.split('/'))).catch(() => [] as string[]))
        .filter((n) => n.endsWith('.md') && !n.startsWith('.'))
        .map((n) => `${rel}/${n}`);
    const helpers = (await readdir(join(this.d.dataDir, 'helpers')).catch(() => [] as string[])).filter((n) => n.startsWith('h_'));
    const notes: string[] = [];
    for (const h of helpers) if ((await md(`helpers/${h}`)).includes(`helpers/${h}/notes.md`)) notes.push(`helpers/${h}/notes.md`);
    return [...(await md('memory')), ...(await md('memory/people')), ...(await md('memory/preferences')), ...notes];
  }

  /** One fact as `memory:list` gives it (M6 T5: the chips read it before an Undo). */
  async view(factId: string): Promise<Result<MemoryFactView>> {
    const row = await this.row(factId);
    return row ? ok(factView(row)) : fail('NOT_FOUND');
  }

  private row(factId: string): Promise<EngineFact | null> {
    return this.query<EngineFact | null>('memory.byId', [factId]);
  }

  private async query<T>(q: string, args: unknown[]): Promise<T | null> {
    const r = await this.d.link.request<T>('db.query', { q, args });
    return r.ok ? r.value : null;
  }

  private changed(factIds: string[]): void {
    if (factIds.length) this.d.link.send('ui.patch', { event: 'memory:changed', payload: { factIds } });
  }

  private today(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: this.d.timeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      this.d.clock.now(),
    );
  }

  /** One command at a time: every change is read → write → index on one file. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/** §12.4 placement (the engine's, never the AI's). */
export function placeFact(op: {
  kind: MemoryKind;
  category: MemoryCategory;
  person?: string;
  scope: MemoryScope;
  helperId?: string | null;
}): string {
  if (op.scope === 'helper' && op.helperId) return `helpers/${op.helperId}/notes.md`;
  if (op.scope === 'chat') return ABOUT_YOU_FILE;
  if (op.kind === 'person' && op.person) {
    const s = slug(op.person);
    if (s) return `memory/people/${s}.md`;
  }
  if (op.kind === 'preference') return `memory/preferences/${topicOf(op.category)}.md`;
  return ABOUT_YOU_FILE;
}

/** `memory:setKind`'s target: helper notes and chat-only facts stay; `person` stays unless already in people\ (no name). */
function kindFile(row: EngineFact, kind: MemoryKind): string {
  if (row.file.startsWith('helpers/') || row.scope === 'chat') return row.file;
  if (kind === 'preference') return `memory/preferences/${topicOf(row.category ?? 'other')}.md`;
  if (kind === 'person') return row.file;
  return row.file.startsWith('memory/people/') || row.file.startsWith('memory/preferences/') ? ABOUT_YOU_FILE : row.file;
}

function keptOf(r: Partial<KeptColumns>): Partial<KeptColumns> {
  const out: Partial<KeptColumns> = {};
  if (r.origin !== undefined) out.origin = r.origin;
  if (r.category !== undefined) out.category = r.category;
  if (r.learnedAt !== undefined) out.learnedAt = r.learnedAt;
  if (r.lastUsedAt !== undefined) out.lastUsedAt = r.lastUsedAt;
  if (r.useCount !== undefined) out.useCount = r.useCount;
  return out;
}

/** 08-0 §G.4 `forgot_facts`: count only, never the fact text. forgetAll (no source) uses the page's "Forgot {count} things.". */
function forgotActivity(count: number, source: MemoryOrigin | null): DbOp {
  return {
    op: 'activity',
    row: activityRow({
      kind: 'changed',
      event: 'forgot_facts',
      actor: 'user',
      summary: source
        ? t('activity.forgot_facts.summary', { count, source: ORIGIN_LABELS[source] })
        : t('screen.memory.status.forgot_count', { count }),
      outcome: 'done',
    }),
  };
}
