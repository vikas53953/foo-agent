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
6. **Check-ins start from GitHub, not from messages.** Ticket "ready" messages reached the P1 and R1 leads 6 to 34 minutes late, and R1 T4's never arrived. Each check-in first lists open PRs into the milestone branch: head SHA, the last `Ready: <sha>` comment, check state, mergeable. Keep one `send_later` armed (45 to 60 min; arm the next one first) and `subscribe_pr_activity` on each ticket PR once. At each check-in also read your used tokens (`get_session`); at about 180k write `/mnt/project-files/handoff/<M>-lead.md` (branch, open PRs, pending asks, lessons) and ask the coordinator for a fresh lead.
7. **Keep the known-failures list** in `docs/known-red.tsv` (match, where, symptom, first seen, owner, fix) and update it after each merge; `pnpm ci:verdict` reads it. Tickets compare against it instead of each rebuilding the base to prove a red test is not theirs (P1 tickets spent 15 to 25 minutes each on that). PERF-04 is always red in the cloud container (software renderer).
8. **Review and merge each ticket PR** when its agent says it is green:
   - `foo-review` (Opus + Sonnet on the ticket diff, findings bucketed);
   - check that its foo-verify proof block is in the PR and shows the ticket working;
   - check that the fast checks are green on it.

   Act-on findings go back to the ticket agent. When it is clean, merge **the exact SHA the ticket reported** with `pnpm merge:ticket <sha> --cr CR-nnnn` (a `--no-ff` merge commit, never fast-forward and amend: GitHub then never marks the PR merged, as with R1 #72), then update the ticket's **Status** in the map. It combines `spec/trace.csv`, `docs/decisions/*.tsv` and the copy-pending lists row by row, regenerates `spec/SPEC-MANIFEST.json`, runs the trace and copy checks, and stops with the merge in progress only on real source conflicts. Never `git stash` while a merge is in progress (it drops the merge).
9. **Report newly unblocked tickets** to the coordinator after each merge, so their threads start at once. Tell running ticket agents to merge the milestone branch into their own branch when a ticket they depend on, or share a hot file with, has landed. Send a 3-line IST status to Vikas's thread at each wave boundary: done, waiting on, needs from you.
10. **Close-out** (`foo-review` milestone mode), once every ticket is merged, **before** the milestone PR leaves draft (every push to a non-draft PR restarts the Windows shards and the golden lane, about 40 minutes each):
   - `pnpm perf:pair origin/main` on the merged branch (P1's chat-switch slowdown, PERF-03, was found only after the PR opened and cost about 90 minutes);
   - two-axis review (Standards, Spec) beside the fidelity checker;
   - a scan for leaked timers (`setTimeout`, `addEventListener`, `requestAnimationFrame` without cleanup), unused exports, casts and raw values;
   - a `typescript-best-practices` pass and comment clean-up on the whole diff;
   - act on the findings, then mark the milestone PR ready for full CI.

   If a sibling milestone must land on main first, do all of this while it closes out, and merge its final main once rather than after each of its pushes.
11. **Milestone PR body:**
   - Before/After;
   - the ticket list with each proof block;
   - the review verdicts;
   - the decision log link;
   - the side-by-side compare page and the installer for Vikas, as every milestone has had.
12. **Merge** when CI and the checker are green (Vikas's standing rule), log it, and update the mission board.

Ticket brief (the lead writes it into the map; the coordinator pastes it into the ticket thread). Fill every field; a field you cannot fill means the ticket isn't ready yet.

```
GOAL        ticket NN in one sentence, from the user's side
BASE        milestone branch claude/foo-m<n>-…; own branch claude/foo-m<n>-tNN-<slug>; draft PR into the milestone branch
OWNS        files it may write (no overlap with any ticket running at the same time); files it may not touch
CONTEXT     /mnt/project-files/foo/prep/M<n>-tickets.md section NN, the spec sections it cites, upstream tickets' PRs
ACCEPTANCE  the ticket's checkboxes (test-first), plus: foo-verify journey test/verify/<NN-slug>.journey.ts PASS
VERIFY      pnpm check:fast && pnpm spec:verify && pnpm check:copy && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
            then xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/<NN-slug>.journey.ts
FORBIDDEN   merging its own PR; rebase or force-push of shared branches; files outside OWNS; spec/ or golden/ edits
            without the ticket's CR; new screens, words or flows the spec does not have
DONE        local checks + proof green at head, milestone branch merged in, PR mergeable; `Ready: <sha>` PR comment
            and a message to the lead (send_message) with the PR link and head SHA
STANDING    CLAUDE.md, docs/build-method.md, .claude/skills/foo-playbooks/playbooks/ticket.md
```

**Reply:**
- tickets merged out of the total, with each PR's link and proof;
- the milestone PR link;
- the review verdicts;
- decisions taken on Vikas's behalf, with the log link;
- what is left.
