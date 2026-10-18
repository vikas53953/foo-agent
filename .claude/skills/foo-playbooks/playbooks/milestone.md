### Milestone (M4 onward)

**You own the milestone, not every line of code. Map it, hand out tickets, keep the branch green, close it out.** Source: pstack `orchestrate` (trimmed) + Matt Pocock `implement-spec`. Chosen by Vikas 2026-10-18 ("Tickets from M4").

1. **Read only what you need:** the milestone pack (`/mnt/project-files/foo/prep/M<n>.md`), `00-common.md`, and the spec sections the pack cites. `git log origin/main -- spec/constitution` since the last milestone.
2. **Ticket map before any code** (`foo-tickets`): 4 to 8 thin vertical tickets in `docs/tickets/M<n>/`, each with **Blocked by**, each fitting one fresh session, each demoable alone with its own foo-verify journey. A CR the milestone needs (trace rows, BP ids) is ticket 01 and blocks the tickets that need it.
3. **Review the map** with one independent reviewer against the pack and spec (approve-on-Vikas's-behalf rule): missing requirements, wrong blocking edges, tickets that are horizontal layers. Fix, log the verdict, commit the map.
4. **Create the milestone branch** `claude/foo-m<n>-…` from `origin/main`, open it as a **draft** PR after the map commit (ci.yml runs the Windows lanes only on non-draft PRs).
5. **Run the frontier** (tickets whose blockers are merged into the milestone branch). At most **3 helpers at once**, each in its own worktree on its own branch off the milestone branch, each owning disjoint files. Shared files (`src/shared/testids.ts`, `en-IN.json`, `types.ts`, `ipc.ts`, `PROJECT-MAP.md`, `spec/trace.csv`) are changed by **one ticket at a time**: name the owner in the brief, or serialize. Helper brief = the template below.
6. **Land each ticket** as it verifies: merge its branch into the milestone branch (merge commit, no rebase), run the fast checks, push. Re-read its proof block; a ticket without one is not done.
7. **Close-out** (`foo-review` milestone mode): two-axis review (Standards, Spec) beside the fidelity checker; `typescript-best-practices` pass and comment clean-up on the diff; act on findings; then mark the PR ready for full CI.
8. **PR body:** Before/After, the ticket list with each proof block, the review verdicts, the decision log link. Plus the side-by-side compare page for Vikas, as every milestone has had.
9. **Merge** when CI and the checker are green (Vikas's standing rule), log it, update the mission board.

Helper brief (fill every field; a field you cannot fill is a ticket not ready yet):

```
GOAL        ticket NN in one sentence, from the user's side
SCOPE       files it may write; files it may not; its branch/worktree off claude/foo-m<n>-…
CONTEXT     docs/tickets/M<n>/NN-*.md, the spec sections it cites, upstream tickets' proof blocks
ACCEPTANCE  the ticket's checkboxes, plus: foo-verify journey test/verify/<NN-slug>.journey.ts PASS
VERIFY      pnpm spec:verify && pnpm check:copy && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
            then xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/<NN-slug>.journey.ts
FORBIDDEN   no merges, rebases or force-pushes; nothing outside SCOPE; no spec/ or golden/ edits without the ticket's CR;
            no new screens, words or flows the spec does not have; no mcp__hearthbot__ tools
REPORT      branch, head SHA, what you ran (paste output tails), the proof block, deviations, implementation-notes lines
STANDING    CLAUDE.md, docs/build-method.md, playbooks/ticket.md
```

**Reply:** tickets done / total, the PR link, proof per ticket, review verdicts, decisions taken on Vikas's behalf (with the log link), what is left.
