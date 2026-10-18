---
name: foo-tickets
description: Turn a foo milestone pack into a ticket map of 4 to 8 thin vertical tickets with blocking edges, then build them on one milestone branch. Use at the start of every milestone from M4 on, before any code.
---

# foo-tickets

Adapted for foo-agent from Matt Pocock's `to-tickets` and `implement-spec` (MIT; originals vendored as `matt-to-tickets`, `matt-implement-spec`; see `.claude/skills/NOTICE.md`). How the tickets are run is the Milestone playbook (`foo-playbooks`).

## 1. Draft the map

From `/mnt/project-files/foo/prep/M<n>.md`, the spec sections it cites, and the code as it is:

- **Vertical, not horizontal.** Each ticket cuts a narrow but complete path through every layer it needs (DB/migration, main/engine, IPC, renderer, copy, test ids, tests) and is **demoable alone**: it has its own foo-verify journey that shows Vikas something working.
- **Fits one fresh session.** If a ticket needs more than one context window to understand, split it.
- **Prefactor first.** "Make the change easy, then make the easy change": a prefactor or the milestone's CR (trace rows, BP ids, EARLY_STEPS) is its own ticket, early, blocking the ones that need it.
- **Blocked by** lists only tickets that truly gate it. Disjoint files where possible, so up to 3 can run at once; name the single owner of each shared file.
- **4 to 8 tickets.** Fewer means tickets too big to verify; more means the milestone pack should be split.
- Words from the spec (`08-0-canonical-names.md`), acceptance from the spec's AT/ART/PERF ids and the pack's exit list. No file paths or code beyond what a decision needs.

## 2. Write it down

One file per ticket in `docs/tickets/M<n>/NN-<slug>.md`, numbered in dependency order, plus `docs/tickets/M<n>/README.md` with the map table (NN, title, blocked by, owner of shared files, status). Ticket template:

```markdown
# NN: <title>

**What to build:** the end-to-end behaviour from Vikas's side.
**Spec:** the sections and AT/ART/PERF/BP/UX ids it makes true.
**Blocked by:** NN, NN — or "None (can start now)".
**Seams to test:** one line each (agreed here, not later).
**Proof:** test/verify/<NN-slug>.journey.ts — what it drives and what it checks.
**Status:** ready | in progress (helper, branch) | merged (sha) | blocked (why)

- [ ] acceptance 1 (spec id)
- [ ] acceptance 2
- [ ] foo-verify proof PASS, block pasted in the PR
```

## 3. Review instead of quizzing Vikas

Matt's skill asks the user to approve the breakdown. In foo, an **independent reviewer** (a fresh Sonnet agent with the pack, the spec sections and the map, told not to edit) checks: every pack requirement lands in some ticket; no ticket is a horizontal layer; blocking edges are real; shared-file owners are named. Act on its findings, then record `approved on Vikas's behalf` in the decision log with the reviewer's verdict (Vikas's standing rule, 2026-10-18). Vikas still sees the map in the PR.

## 4. Build

Follow the Milestone playbook: the frontier, at most 3 helpers, each ticket red → green (`matt-tdd`) plus its foo-verify proof, each merged into the milestone branch as it verifies, then the `foo-review` close-out on the whole branch. Keep each ticket's **Status** line current; it is how the next session knows where things stand.
