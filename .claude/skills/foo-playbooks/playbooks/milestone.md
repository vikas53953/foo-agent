### Milestone lead (M4 onward)

**You lead the milestone; you don't write every line of code. Map it, hand out tickets, review and merge each ticket PR, then close it out.** Sources: pstack `orchestrate` (trimmed) and Matt Pocock `implement-spec`. Vikas chose this on 2026-10-18: "Tickets from M4" at 14:55Z, then at 16:46Z **each ticket gets its own thread with a dedicated agent, all running in parallel**.

Who does what:

| Role | Who | Does |
| --- | --- | --- |
| Lead | the milestone thread (this playbook) | ticket map, milestone branch, reviews and merges each ticket PR, reports newly unblocked tickets, final PR to main |
| Coordinator | the project's channel session | starts one thread per ready ticket, briefed from the map |
| Ticket agent | one thread per ticket (`playbooks/ticket.md`) | builds one ticket on its own branch, opens a draft PR **into the milestone branch**, messages the lead when it is green |

1. **Read only what you need:** the milestone pack (`/mnt/project-files/foo/prep/M<n>.md`), `00-common.md`, and the spec sections the pack cites. Run `git log origin/main -- spec/constitution` for changes since the last milestone.
2. **Write the ticket map before any code** (`foo-tickets`) to `/mnt/project-files/foo/prep/M<n>-tickets.md`. Aim for 4 to 8 thin vertical tickets. Each one has **Blocked by**, **owned files** (no overlap between tickets that can run at the same time), test-first acceptance, and its own foo-verify journey. A CR the milestone needs (trace rows, BP ids) is ticket 01, and it blocks the tickets that need it.
3. **Review the map** with one independent reviewer against the pack and the spec. It looks for missing requirements, wrong blocking edges, overlapping owned files, and tickets that are horizontal layers. Fix what it finds, then log the verdict as `approved on Vikas's behalf`.
4. **Push the milestone branch** `claude/foo-m<n>-…` from `origin/main`, with the map's prefactor or CR ticket if you do that one yourself. Open the milestone PR to main as a **draft** (ci.yml runs the Windows lanes only on non-draft PRs).
5. **Hand out the frontier.** Send the coordinator (`send_message`) the list of tickets that are ready now, each with its section of the map and its base branch. The coordinator starts one thread per ticket. Every ready ticket runs at once; the only limit is that two running tickets never own the same file. Shared files (`src/shared/testids.ts`, `en-IN.json`, `types.ts`, `ipc.ts`, `spec/trace.csv`, `PROJECT-MAP.md`) belong to one ticket at a time, as the map says.
6. **Review and merge each ticket PR** when its agent says it is green:
   - `foo-review` (Opus + Sonnet on the ticket diff, findings bucketed);
   - check that its foo-verify proof block is in the PR and shows the ticket working;
   - check that the fast checks are green on it.

   Act-on findings go back to the ticket agent. When it is clean, merge into the milestone branch with a merge commit (no rebase), then update the ticket's **Status** in the map.
7. **Report newly unblocked tickets** to the coordinator after each merge, so their threads start at once. Tell running ticket agents to merge the milestone branch into their own branch when a ticket they depend on, or share a neighbour file with, has landed.
8. **Close-out** (`foo-review` milestone mode), once every ticket is merged:
   - two-axis review (Standards, Spec) beside the fidelity checker;
   - a `typescript-best-practices` pass and comment clean-up on the whole diff;
   - act on the findings, then mark the milestone PR ready for full CI.
9. **Milestone PR body:**
   - Before/After;
   - the ticket list with each proof block;
   - the review verdicts;
   - the decision log link;
   - the side-by-side compare page and the installer for Vikas, as every milestone has had.
10. **Merge** when CI and the checker are green (Vikas's standing rule), log it, and update the mission board.

Ticket brief (the lead writes it into the map; the coordinator pastes it into the ticket thread). Fill every field; a field you cannot fill means the ticket isn't ready yet.

```
GOAL        ticket NN in one sentence, from the user's side
BASE        milestone branch claude/foo-m<n>-…; own branch claude/foo-m<n>-tNN-<slug>; draft PR into the milestone branch
OWNS        files it may write (no overlap with any ticket running at the same time); files it may not touch
CONTEXT     /mnt/project-files/foo/prep/M<n>-tickets.md section NN, the spec sections it cites, upstream tickets' PRs
ACCEPTANCE  the ticket's checkboxes (test-first), plus: foo-verify journey test/verify/<NN-slug>.journey.ts PASS
VERIFY      pnpm spec:verify && pnpm check:copy && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
            then xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/<NN-slug>.journey.ts
FORBIDDEN   merging its own PR; rebase or force-push of shared branches; files outside OWNS; spec/ or golden/ edits
            without the ticket's CR; new screens, words or flows the spec does not have
DONE        PR green with the proof block pasted; message the lead (send_message) with the PR link and head SHA
STANDING    CLAUDE.md, docs/build-method.md, .claude/skills/foo-playbooks/playbooks/ticket.md
```

**Reply:**
- tickets merged out of the total, with each PR's link and proof;
- the milestone PR link;
- the review verdicts;
- decisions taken on Vikas's behalf, with the log link;
- what is left.
