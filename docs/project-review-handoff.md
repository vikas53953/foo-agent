# foo: next-session handoff (written 28 Oct 2026, 19:00Z)

Read this, then `docs/project-lessons.md` (10 short lessons), then live GitHub. Trust GitHub over
anything here.

## Purpose

foo is a WhatsApp-style personal agent for Windows for one user, Vikas. Ship it in batches of 5
features behind switches; he uses each batch for a day; his notes become tests. Batch 1 = install, ai,
name, chat, settings.

## State at handoff (verify first)

- main `4e11747` (release gate #163). Latest main gate run: FAIL, 5 of 11 journeys clean.
- Live PRs: #169 builder batch-1 fixes (CI green, real-AI red), #171 QA tests (red until CR-0070 lands
  with #169), #172 gate false positives (shard 4 node-gyp hang, re-runs when main moves).
- 18 stale PRs from 21 to 23 Oct; a decision card asks Vikas whether to close them.
- Blocker: `ANTHROPIC_API_KEY` secret refused since ~10:30Z 28 Oct. Only Vikas can fix it. Nothing has
  run since 12:13Z.

## Decisions that stand

- 24 Oct: keep all code, feature switches, batches of 5, installer per batch (Vikas "go").
- 28 Oct 03:53Z: real Claude for every app-level test; fake AI only in pure unit tests, never as proof.
- 26 Oct: builder never tests its own work; QA thread is separate; test the product, not the spec.
- Approve-on-behalf: independent review + CI green → Claude may merge; not for payments, messages,
  releases, secrets, CI trigger changes, spec clashes.
- 28 Oct 03:50Z: gate runs on every merge to main and before any app goes out.

## Human corrections to remember

17 Oct usage burn (parallel Fable helpers); 19 Oct nothing built overnight; 23 Oct "same place";
26 Oct lead mindset; 27 Oct 👀 still there (fake AI); 28 Oct "who told you to use fake AI".

## Failed approaches

22-thread parallel fan-out (18 Oct); Codex lanes (11 drafts, nothing merged); per-milestone memory
files; rules without enforcers; green lane that did not gate failures (fixed by #168, #169).

## Unresolved questions (cards pending)

1. Full reset now? (this thread, 18:40Z)  2. One definition of "proven" and rewrite rule 6.
3. Daily or weekly real-Claude sentinel (gate thread 05:31Z).  4. Close the Codex drafts?

## Next actions in order

1. Vikas fixes the key secret. 2. Reset (resolve stale threads, close stale PRs, memory to 8 files,
rules to one page). 3. One lead thread from `/mnt/project-files/handoff/foo-lead-2026-10-29.md`.
4. #169 real-Claude green → merge → #172 merge → gate on main → first gated installer.

## Evidence pointers

- Review: `docs/project-review.md`; page "foo Context Review" https://claude.ai/artifact/3Ha8q2Zd1svWC8gPGFtS7E
- Gate verdict note: `/mnt/project-files/foo/release-gate/gate-4e11747-verdict.md`
- QA evidence: `/mnt/project-files/foo/qa-explore/2026-10-28/`
- Status page 28 Oct 04:20Z: https://claude.ai/artifact/GwRdtABCzn2c16jZpJ2pSz

## Starting message for the next lead thread (ready to paste)

"Start from docs/project-review-handoff.md on main. First three calls: GitHub PR list, latest runs on
main, the key check. Report the main sha and the blocker in your first checklist line. Goal: #169
green on real Claude, merged, then the first gated installer to Vikas. One thread, no helpers, proof =
sha + record + picture."
