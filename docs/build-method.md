# How foo is built (from M4)

Chosen by Vikas on 2026-10-18: borrow the PStack ideas (option A, 14:00Z) and build in tickets from M4 (14:55Z). Sources: Lauren Tan's pstack (`github.com/cursor/plugins/tree/main/pstack`, v0.15.26) and Matt Pocock's skills (`github.com/mattpocock/skills`), both MIT, copied and trimmed into `.claude/skills/` (see its `NOTICE.md`). pstack is not installed as a plugin.

**The approved spec stays the boss.** `spec/constitution/`, DECISIONS and `11-fidelity.md` win over every rule here. Where the spec is silent, take the most conservative option and write it in `implementation-notes.md` and the decision log.

## 1. One milestone = one lead, a thread per ticket, one PR

What Vikas sees at the end is unchanged: one PR per milestone and one side-by-side compare page with an installer. The work inside is split so that tickets run in parallel, **each ticket in its own thread with its own agent** (Vikas, 2026-10-18 16:46Z):

```
milestone pack (prep/M<n>.md)
   │  milestone lead: foo-tickets
   ▼
ticket map: prep/M<n>-tickets.md  (4–8 vertical tickets: blocked by, owned files with no overlap, test-first acceptance)
   │  independent reviewer → approved on Vikas's behalf (logged)
   ▼
lead pushes milestone branch claude/foo-m<n>-…  ── draft milestone PR to main
   │  lead → coordinator: the ready tickets
   ▼
coordinator starts one thread per ready ticket (all in parallel)
   │  each ticket thread: own branch, red → green + foo-verify proof,
   │  draft PR into the milestone branch, messages the lead when green
   ▼
lead reviews (foo-review) and merges each ticket PR, reports newly unblocked tickets → more threads
   │  close-out: foo-review (Standards + Spec) + fidelity checker, TS rulebook + comment clean-up
   ▼
milestone PR ready → full CI (Windows, only here) → merge when CI + checker are green → decision log + mission board
```

Steps in detail: `.claude/skills/foo-playbooks/playbooks/milestone.md` (lead) and `playbooks/ticket.md` (ticket thread).

## 1a. Speed-ups from M5 (Vikas, 2026-10-19 04:15Z)

One milestone at a time; inside it, T1 contracts first, then up to 5 truly independent tickets in parallel threads.

- **CI per ticket.** A ticket PR into the milestone branch runs the fast Linux lane. If it changes the screen (`src/renderer/`, copy, `design/`, `golden/`, `test/fidelity/`) it also runs the golden lane (picture checks) once marked ready. The full Windows suite runs only on the milestone PR into main. Nothing reaches main without every lane green. Enforced by `.github/workflows/ci.yml` (`screen` job and the lane `if:` lines).
- **Windows in 4 shards (Vikas, option A, 2026-10-19 06:53Z).** The full Windows suite runs as 4 parallel jobs on the free runners (`vitest --shard`, `playwright --shard`), so the close-out run takes about a quarter of the wall time. Same tests, nothing skipped; shard 1 also typechecks, packages and uploads the `foo-windows-app` installer. The golden lane stays its own job beside them.
- **Review.** Fable does the main independent review of each ticket and each CR. Sonnet only re-checks the small fixes Fable asked for.
- **Coverage at close-out (FID-21, CR-0031).** Writing `docs/fidelity/<M>.audit.json` marks the milestone built: from then on every UX step, BP ref and trace row of it must be live with a test file, or listed in `docs/fidelity/coverage-gaps.json` by the close-out's CR.
- **Close-out is one command:** `pnpm closeout <M>` (`scripts/closeout.ts`) runs the recipe's mechanical steps and prints what is left to fix.

## 2. Proof

- A green build is not proof. Every ticket, fix and milestone has a **foo-verify proof block** in the PR: the real app driven through `scripts/foo-verify.ts` with a committed journey (`test/verify/*.journey.ts`), checked facts, console errors, and before/after pictures pushed to the `evidence` branch.
- foo-verify must pass its doctor before any unattended loop starts.
- Pixel fidelity stays with the golden lane on windows-latest (Tier R/B). foo-verify does not replace it.

## 3. Tickets

- **Vertical:** each cuts through every layer it needs and is demoable alone.
- **Test-first, one slice at a time** (`matt-tdd`): seams agreed in the ticket; no bulk tests first; expected values from the spec, not recomputed.
- **Parallel safely:** every ready ticket runs in its own thread on its own branch. Tickets running at the same time never own the same file; shared files (`testids.ts`, `en-IN.json`, `types.ts`, `ipc.ts`, `spec/trace.csv`, `PROJECT-MAP.md`) have one owner at a time. Only the lead merges into the milestone branch.

## 4. Review

- Per ticket: the same diff to **Opus and Sonnet**; every finding sorted **act on / consider / noted / dismissed** with a reason. Never accept every comment; never dismiss without a reason.
- Milestone close-out: **two axes** (Standards, Spec) as separate Sonnet reviewers, reported side by side, beside the unchanged fidelity checker.

## 5. Decisions on Vikas's behalf

Vikas's standing rule (2026-10-18 14:56Z and 14:59Z): he is often away and builds must not wait for his review. For build work in this repo an **independent reviewer** checks each fork or CR against the approved spec; if it passes, the builder records **"approved on Vikas's behalf"** in the decision log citing his rule, merges PRs once CI and the checker are green, and keeps going. Not covered, still his: real-world actions outside the repo (payments, messages to other people, production) and his own setup items (for example the Google OAuth client).

## 6. Decision log

`docs/decisions/<scope>.tsv`, committed, append-only (`foo-decision-log`). One row per decision: time, phase, decision, why, evidence pointer, result. Every approval on Vikas's behalf has a row.

## 7. Unattended runs (overnight contract)

Before the first change, write the contract as the log's first row: **goal**, **done means** (a check that can pass or fail), **own branch**, **may do / may not**, **escape hatch** (truly stuck: stop and write why). Then loop: smallest change the evidence justifies → verify on the real app → commit or discard → one log row. A plateau means change approach; "done" never relaxes. Details: `playbooks/overnight.md`.

## 8. Pitfalls we watch for

- Reporting success off a green build.
- Accepting every review comment, or dismissing without a reason.
- Two agents on one branch, or two running tickets owning the same file.
- An unattended loop before foo-verify works.
- A duration instead of a finish condition.
- Correcting the same mistake by hand twice (use `foo-correct`).
