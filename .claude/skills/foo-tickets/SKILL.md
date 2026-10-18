---
name: foo-tickets
description: Turn a foo milestone pack into a ticket map of 4 to 8 thin vertical tickets with blocking edges and owned files, so each ticket can be built in its own parallel thread and merged into one milestone branch. Use at the start of every milestone from M4 on, before any code.
---

# foo-tickets

Adapted for foo-agent from Matt Pocock's `to-tickets` and `implement-spec` (MIT; originals vendored as `matt-to-tickets`, `matt-implement-spec`; see `.claude/skills/NOTICE.md`). How the tickets are run is the Milestone playbook (`foo-playbooks`): **each ticket gets its own thread with a dedicated agent, all ready tickets in parallel** (Vikas, 2026-10-18 16:46Z), and the milestone lead reviews and merges each ticket PR into the milestone branch.

## 1. Draft the map

From `/mnt/project-files/foo/prep/M<n>.md`, the spec sections it cites, and the code as it is:

- **Vertical, not horizontal.** Each ticket cuts a narrow but complete path through every layer it needs (DB/migration, main/engine, IPC, renderer, copy, test ids, tests) and is **demoable alone**: it has its own foo-verify journey that shows Vikas something working.
- **Fits one fresh session.** If a ticket needs more than one context window to understand, split it.
- **Prefactor first.** "Make the change easy, then make the easy change": a prefactor or the milestone's CR (trace rows, BP ids, EARLY_STEPS) is its own ticket, early, blocking the ones that need it.
- **Blocked by** lists only tickets that truly gate it.
- **Owned files:** every ticket lists the files it may write. Tickets that can run at the same time never share a file; a shared file (`testids.ts`, `en-IN.json`, `types.ts`, `ipc.ts`, `spec/trace.csv`, `PROJECT-MAP.md`) has one owner, or the tickets touching it are chained with Blocked by. This is what lets every ready ticket run in its own thread at once.
- **4 to 8 tickets.** Fewer means tickets too big to verify; more means the milestone pack should be split.
- Words from the spec (`08-0-canonical-names.md`), acceptance from the spec's AT/ART/PERF ids and the pack's exit list. No file paths or code beyond what a decision needs.

## 2. Write it down

One shared file, `/mnt/project-files/foo/prep/M<n>-tickets.md`: a map table at the top (NN, title, blocked by, owned files, status, thread, PR), then one section per ticket, numbered in dependency order. The ticket threads read their own section from there, so the file is the one source of truth; the lead updates **Status** after each merge. Re-read the file just before changing it (other sessions write the shared folder too). Section template:

```markdown
## NN: <title>

**What to build:** the end-to-end behaviour from Vikas's side.
**Spec:** the sections and AT/ART/PERF/BP/UX ids it makes true.
**Blocked by:** NN, NN — or "None (can start now)".
**Owns:** the files it may write; files it must not touch.
**Seams to test:** one line each (agreed here, not later).
**Proof:** test/verify/<NN-slug>.journey.ts — what it drives and what it checks.
**Brief:** the ticket brief from playbooks/milestone.md, filled in.
**Status:** ready | running (thread, branch, PR) | merged (sha) | blocked (why)

- [ ] acceptance 1 (spec id), test first
- [ ] acceptance 2
- [ ] foo-verify proof PASS, block pasted in the ticket PR
```

## 3. Review instead of quizzing Vikas

Matt's skill asks the user to approve the breakdown. In foo, an **independent reviewer** (a fresh Sonnet agent with the pack, the spec sections and the map, told not to edit) checks: every pack requirement lands in some ticket; no ticket is a horizontal layer; blocking edges are real; shared-file owners are named. Act on its findings, then record `approved on Vikas's behalf` in the decision log with the reviewer's verdict (Vikas's standing rule, 2026-10-18). Vikas still sees the map in the PR.

## 4. Build

Follow the Milestone playbook. The lead sends the ready tickets to the coordinator, which starts one thread per ticket; each ticket agent builds red → green (`matt-tdd`) with its foo-verify proof and opens a draft PR into the milestone branch; the lead reviews and merges each, reports the newly unblocked tickets, and ends with the `foo-review` close-out and the one milestone PR to main. Keep each ticket's **Status** line current; it is how every thread knows where things stand.
