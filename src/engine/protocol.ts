// Spec: 08-1 §2.4 (main ⇄ engine messages: `{ id, kind, payload }`, requests answered `{ re, result: Result<T> }`, every
// payload zod-checked on receipt), §2.4.1 (DbOp, db.tx one transaction, NamedQuery), 08-0 §G.6 (one MessageChannelMain).
// M3 carries the rows the chat lane and the your-AI service need; later milestones add theirs with the same names.
// GAP (GAPS.md 2026-10-18 "reactions not in WritableTable"): foo's reaction (08-4 §25.2 kind 'react', AT-027) needs a row in
// `reactions`, which 08-1 §2.4.1 lists neither as writable nor as main-only; M3 adds `reactions` to the engine's inserts.
import { z } from 'zod';
import { PROVIDER_IDS } from '../shared/settings';
import type { Result } from '../shared/errors';
import type { EventChannel, EventPayload } from '../shared/ipc';
import type { ProviderId, AiStatus, ErrorKind } from '../shared/types';
import type { Settings } from '../shared/settings';

export interface Envelope<K extends string = string, P = unknown> {
  id: string;
  kind: K;
  payload: P;
}
export interface Reply<T = unknown> {
  re: string;
  result: Result<T>;
}

// ---- main → engine (08-1 §2.4 MainToEngine, the rows M3 uses) ----
export type AiCmd = 'detect' | 'verify' | 'choose' | 'signIn';
export const mainToEngineSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('user.message'), payload: z.object({ messageId: z.string(), chatId: z.string() }).strict() }),
  z.object({ id: z.string(), kind: z.literal('net'), payload: z.object({ online: z.boolean() }).strict() }),
  z.object({
    id: z.string(),
    kind: z.literal('settings.changed'),
    payload: z.object({ paths: z.array(z.string()), settings: z.unknown() }).strict(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('ai.cmd'),
    payload: z
      .object({
        cmd: z.enum(['detect', 'verify', 'choose', 'signIn']),
        providerId: z.enum(PROVIDER_IDS).optional(),
        backup: z.enum(PROVIDER_IDS).nullable().optional(),
      })
      .strict(),
  }),
  /** Not in 08-1 §2.4 (gap, implementation-notes "M3"): 04 §19.4 "Try again" on a cut-off foo reply re-runs its turn. */
  z.object({ id: z.string(), kind: z.literal('reply.retry'), payload: z.object({ messageId: z.string() }).strict() }),
  // FOO_TEST runs only (08-3 §22): the engine's fake clock follows main's, and test:reset cancels every turn.
  z.object({ id: z.string(), kind: z.literal('test.reset'), payload: z.object({}).strict() }),
  z.object({ id: z.string(), kind: z.literal('test.clock'), payload: z.object({ now: z.number() }).strict() }),
]);
export type MainToEngine = z.infer<typeof mainToEngineSchema>;

// ---- engine → main ----
export const WRITABLE_TABLES = ['messages', 'ai_turns', 'reactions'] as const;
export type WritableTable = (typeof WRITABLE_TABLES)[number];

/** 08-1 §2.4.1 DbOp (the ops M3 needs). Main fills `seq` and the chat's derived columns for a message insert (§4.6 rule 7). */
export type DbOp =
  | { op: 'insert'; table: WritableTable; row: Record<string, unknown>; redact?: string[] }
  | { op: 'update'; table: 'messages'; id: string; set: Record<string, unknown>; expectRev?: number }
  | { op: 'delete'; table: 'reactions'; id: string };

const dbOpSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('insert'),
      table: z.enum(WRITABLE_TABLES),
      row: z.record(z.string(), z.unknown()),
      redact: z.array(z.string()).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('update'),
      table: z.literal('messages'),
      id: z.string(),
      set: z.record(z.string(), z.unknown()),
      expectRev: z.number().optional(),
    })
    .strict(),
  z.object({ op: z.literal('delete'), table: z.literal('reactions'), id: z.string() }).strict(),
]);

export const NAMED_QUERY_NAMES = ['chatOpen', 'messagesBefore', 'messageById', 'messagesQueued', 'helpers.byId'] as const;
export type NamedQuery = (typeof NAMED_QUERY_NAMES)[number];

export interface UiPatch<E extends EventChannel = EventChannel> {
  event: E;
  payload: EventPayload[E];
}

export const engineToMainSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('db.tx'), payload: z.object({ ops: z.array(dbOpSchema).min(1) }).strict() }),
  z.object({
    id: z.string(),
    kind: z.literal('db.query'),
    payload: z.object({ q: z.enum(NAMED_QUERY_NAMES), args: z.array(z.unknown()) }).strict(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('ui.patch'),
    payload: z.object({ event: z.string(), payload: z.unknown() }).strict(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('log'),
    payload: z
      .object({
        t: z.number(),
        lvl: z.enum(['info', 'warn', 'error', 'debug']),
        mod: z.string(),
        evt: z.string(),
        kind: z.string().optional(),
        ms: z.number().optional(),
        ids: z.object({ chatId: z.string().optional(), jobId: z.string().optional() }).strict().optional(),
      })
      .strict(),
  }),
  /** The engine's answer to `ai.cmd`: main stores the chosen/verified provider in settings.json (main owns settings). */
  z.object({
    id: z.string(),
    kind: z.literal('ai.state'),
    payload: z
      .object({
        providers: z.record(
          z.string(),
          z.object({ kind: z.enum(['plan', 'key', 'local']), lastVerifiedAt: z.number().optional(), lastVerifyOk: z.boolean().optional() }),
        ),
        primary: z.enum(PROVIDER_IDS).nullable().optional(),
        backup: z.enum(PROVIDER_IDS).nullable().optional(),
      })
      .strict(),
  }),
]);
export type EngineToMain = z.infer<typeof engineToMainSchema>;
export type DbTxReply = { ids: string[]; revs: number[] };

/** The engine side of the port (in production a MessagePort; in tests a direct call into main's handlers). */
export interface MainLink {
  request<T>(kind: 'db.tx' | 'db.query', payload: unknown): Promise<Result<T>>;
  send(kind: 'ui.patch' | 'log' | 'ai.state', payload: unknown): void;
}

export interface EngineSettingsView {
  settings: Settings;
  aiStatus: AiStatus;
}

export type { ProviderId, ErrorKind };
