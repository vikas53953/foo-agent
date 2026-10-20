// Spec: 08-2 §8.3.11 (a recipe is saved after a job reaches DONE with proof, one row per domain + goal; a later job's step turn
// gets the saved steps that match on its page; a miss → normal snapshot and AI choice, then the recipe updates on the next
// DONE), 08-1 §4.3.13 (`site_recipes`, UNIQUE (domain, goal), `rcp_` ids), §2.4.1 `siteRecipe`, AT-144. The goal is the job's
// first allowed verb (book, pay, …) or `look`: one recipe per site and kind of job.
import type { DbOp, DbTxReply } from '../../../protocol';
import type { Result } from '../../../../shared/errors';
import { domainOf } from '../siteNotes';
import { replayLines, stepsJson, type RecipeRecorder, type RecipeStep } from './recipe';

interface SavedRecipe {
  id: string;
  urlPattern: string;
  steps: RecipeStep[];
  successCount: number;
  lastFailAt: number | null;
}

export interface RecipeBookDeps {
  recorder: RecipeRecorder;
  query<T>(q: string, ...args: unknown[]): Promise<T | null>;
  tx(ops: DbOp[]): Promise<Result<DbTxReply>>;
  newId(): string;
  now(): number;
  pageUrl(jobId: string): string | null;
  log(event: string, kind?: string): void;
}

export const goalOf = (doVerbs: readonly string[]): string => doVerbs[0] ?? 'look';

export class RecipeBook {
  constructor(private readonly d: RecipeBookDeps) {}

  /** DONE with proof: the steps this job took, saved (or updated) for its site and goal. */
  async saveOnDone(jobId: string, doVerbs: readonly string[]): Promise<void> {
    const draft = this.d.recorder.draft(jobId);
    const domain = draft ? domainOf(draft.urlPattern) : null;
    if (!draft || !domain) return;
    const goal = goalOf(doVerbs);
    const old = await this.d.query<SavedRecipe>('siteRecipe', domain, goal);
    const r = await this.d.tx([
      {
        op: 'insert',
        table: 'site_recipes',
        row: {
          id: old?.id ?? this.d.newId(),
          domain,
          goal,
          url_pattern: draft.urlPattern,
          steps_json: stepsJson(draft.steps),
          success_count: (old?.successCount ?? 0) + 1,
          last_ok_at: this.d.now(),
          last_fail_at: old?.lastFailAt ?? null,
        },
      },
    ]);
    if (!r.ok) this.d.log('site_recipes.write_failed', r.error.kind);
  }

  /** The step turn's replay lines: the saved steps found by role + name on the job's page now. */
  async lines(jobId: string, doVerbs: readonly string[]): Promise<string[]> {
    const domain = domainOf(this.d.pageUrl(jobId));
    if (!domain) return [];
    const saved = await this.d.query<SavedRecipe>('siteRecipe', domain, goalOf(doVerbs));
    return saved ? replayLines(this.d.recorder.match(jobId, saved)) : [];
  }
}
