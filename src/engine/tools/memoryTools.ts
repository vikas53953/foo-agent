// Spec: 08-2 §8.2 (`memory.search { query }`, class read, FTS over `memory_index`; `memory.propose` = one `MemoryReviewAct`
// `add` op, class prepare, origin set by the engine to `job`, through 08-3 §12.4 and §12.4.1 (sensitive rule, tombstones,
// dedupe), never saved while `chats.private=1`, at most one call per turn), 08-4 §27.1 (the two descriptions, exact), 08-3
// §12.4.2 (the chip, or the `memory_confirm` card with `privacy.askBeforeRemembering`), CR-0010 G-M6-06 (`privacy.rememberOn`
// off blocks `memory.propose`).
import { z } from 'zod';
import type { Settings } from '../../shared/settings';
import type { JobRow } from '../../shared/types';
import type { EngineChat, EngineFact, EngineMessage } from '../../main/db/queries';
import type { LearnOp } from '../memory/MemoryService';
import { ftsMatch } from '../memory/retrieval';
import type { MemoryChips } from '../memory/chips';
import { askRemember, provenanceOk, ReviewAddOp, saveAndChip, type ReviewDeps, type ReviewMemory } from '../memory/review';
import type { ToolDef, ToolOutcome, ToolRegistry } from './ToolLayer';

const SEARCH_MAX = 8;

const searchArgs = z.object({ query: z.string().trim().min(1).max(200) }).strict();
/** The same object as one `MemoryReviewAct` add op, without the `op` tag. */
const proposeArgs = ReviewAddOp.omit({ op: true }).strict();

export interface MemoryToolDeps extends Pick<ReviewDeps, 'tx' | 'newId' | 'clock' | 'log'> {
  memory: Pick<ReviewMemory, 'learn'>;
  chips: Pick<MemoryChips, 'saved'>;
  settings(): Settings;
  query<T>(q: string, ...args: unknown[]): Promise<T | null>;
}

const err = (errorKind: 'VALIDATION' | 'PRIVATE_BLOCKED' | 'NOT_FOUND', reason?: string): ToolOutcome => ({
  kind: 'error',
  errorKind,
  ...(reason ? { result: { reason } } : {}),
});

/** The two memory step tools, keyed by name, for the ToolLayer registry. */
export function memoryTools(d: MemoryToolDeps): ToolRegistry {
  /** jobId → the step turn that already proposed (§8.2: at most one call per turn). */
  const proposed = new Map<string, string | null>();

  const search: ToolDef = {
    name: 'memory.search',
    actionClass: 'read',
    args: '{ query }',
    description: 'Search what foo knows about the user.',
    async run(args, ctx) {
      const a = searchArgs.safeParse(args);
      if (!a.success) return err('VALIDATION');
      const job = await d.query<JobRow>('jobById', ctx.jobId);
      if (!job) return err('NOT_FOUND');
      const match = ftsMatch(a.data.query);
      const hits = match ? ((await d.query<EngineFact[]>('memorySearch', job.chatId, match, SEARCH_MAX, [])) ?? []) : [];
      return { kind: 'ok', result: { facts: hits.map((f) => ({ id: f.id, text: f.text, provenance: f.provenance })) } };
    },
  };

  const propose: ToolDef = {
    name: 'memory.propose',
    actionClass: 'prepare',
    args: '{ scope, text, provenance, evidenceMessageIds, reason?, category, kind, person?, private }',
    description: 'Suggest a fact to remember about the user, with the message ids that show it.',
    async run(args, ctx) {
      const a = proposeArgs.safeParse(args);
      if (!a.success) return err('VALIDATION');
      const op = a.data;
      if (op.kind === 'person' && !op.person) return err('VALIDATION');
      const job = await d.query<JobRow>('jobById', ctx.jobId);
      if (!job) return err('NOT_FOUND');
      const turn = ctx.turnId ?? null;
      if (proposed.has(job.id) && proposed.get(job.id) === turn) return err('VALIDATION', 'one memory.propose per turn');
      proposed.set(job.id, turn);
      const chat = await d.query<EngineChat>('chatOpen', job.chatId);
      if (!chat || chat.private) return err('PRIVATE_BLOCKED');
      if (!d.settings().privacy.rememberOn) return { kind: 'ok', result: { saved: false } };
      const evidence = await Promise.all(op.evidenceMessageIds.map((id) => d.query<EngineMessage>('messageById', id)));
      const byId = new Map(evidence.filter((m): m is EngineMessage => !!m && m.chatId === job.chatId).map((m) => [m.id, m]));
      if (!provenanceOk(op, byId)) return err('VALIDATION', 'provenance');
      const learn: LearnOp = {
        text: op.text,
        provenance: op.provenance,
        originKind: 'job',
        origin: `job:${job.id}`,
        reason: op.reason ?? null,
        category: op.category,
        kind: op.kind,
        ...(op.person ? { person: op.person } : {}),
        scope: op.scope === 'helper' && !chat.helperId ? 'global' : op.scope,
        chatId: chat.id,
        helperId: chat.helperId,
        private: op.private,
      };
      if (d.settings().privacy.askBeforeRemembering) {
        await askRemember(d, chat.id, learn, chat.helperId);
        return { kind: 'ok', result: { saved: false, asked: true } };
      }
      const last = (await d.query<EngineMessage[]>('messagesBefore', chat.id, null, 1)) ?? [];
      const factId = await saveAndChip(d, chat.id, last[0]?.id ?? null, learn);
      return { kind: 'ok', result: { saved: factId !== null } };
    },
  };

  return { [search.name]: search, [propose.name]: propose };
}
