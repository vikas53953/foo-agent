# CR-0072: pipeline guardrails from the 12 Nov 2026 build audit

- **Asked by:** Vikas, 12 Nov 2026 17:46Z, project thread "Review how we built foo": "fix it and update it in pipeline
  or skill, put this learning and enforce it" for each audit finding; "should be working like software factory until we
  deliver"; "5. Turn batches 2 to 7 of the spec into drafts >>> yes". Audit page: https://claude.ai/artifact/2obefaMvzoaQKfvTKwRF77
- **Spec sections:** 11-fidelity §11.1.3 (FID-02, CRs), foo-plan rule 8; CLAUDE.md rules table.
- **Status:** Approved by Vikas, 12 Nov 2026 17:46Z (thread message above), DECISIONS X-228.

## (a) What was wrong (audit findings, with evidence on the page)

1. Everything was built before anyone used it: 108 of 145 merged PRs landed 17 to 20 Oct; the first real install failed on screen 1.
2. The 3.4 MB spec was treated as law before a user existed: about 70 CRs in 11 days.
3. The pipeline only grew: 12 layers in 11 days, 4 never ran, none retired; 5 of 7 standing rules were words only.
4. "Green" did not mean "works": the real-AI lane was green while 8 of 53 journeys failed; four "fixed" claims were withdrawn.
5. The project stopped for 15 days when the key secret failed and nothing alerted Vikas.
6. Too much state: 165 threads, 144 branches, an 11 GB evidence branch, 61 memory notes (the memory store does not sync deletions).
7. The reusable pipeline skills still taught week 1's approach.

## (b) Decision

| Lesson | Rule                                                                                                                                                                                                                                                                                                                                          | Enforcer (this CR unless noted)                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| L1     | One active batch (`docs/batches.tsv`). No feature on beyond it. The next batch is active only after the one before it is `done` with a `used_on` date (Vikas used the gated installer for a day).                                                                                                                                             | `pnpm pipeline:check` in the CI fast lane                                                |
| L2     | See §d.                                                                                                                                                                                                                                                                                                                                       | `docs/batches.tsv` `state` column                                                        |
| L3     | `docs/pipeline-layers.tsv` lists every layer with what it replaces, its enforcer and when it last ran. A row with no enforcer or no "replaces" fails; `--weekly` fails a running layer not run for 14 days (run it or retire it).                                                                                                             | `pnpm pipeline:check`                                                                    |
| L4     | A ready PR that changes `src/` has a Proof block (sha + step record + screenshot) or says "pre-check only". App code and QA-owned tests (`test/qa/`, `test/qa-explore/`, `test/real-pc/journeys/`, `test/real-pc/gate.txt`, `test/e2e/qa-*`) do not change in one PR without a `QA-Split:` trailer. One scoreboard: the release gate verdict. | `pnpm pipeline:check`; `.github/pull_request_template.md`                                |
| L5     | Software-factory mode until batch 1 is delivered: when CI and the release gate pass on the exact head, Claude merges and logs a decision row. Exclusions unchanged (payments, messages to others, installers to Vikas outside the gated artifact, secrets, CI trigger changes). Heartbeat: Monday gate run plus an issue to Vikas on red.     | words (CLAUDE.md) for the merge rule; the heartbeat and alert are PR #174 (audit thread) |
| L6     | At most 5 open PRs; no branch left from a merged or closed PR. Memory notes are retired by stub, never deleted.                                                                                                                                                                                                                               | `pnpm pipeline:check --weekly` (counts via GITHUB_TOKEN)                                 |
| L7     | Method lessons update the reusable skills the same day.                                                                                                                                                                                                                                                                                       | idea-to-product and fidelity-build skill cards, 12 Nov                                   |

Known limits: the fast lane does not re-run when only the PR body is edited (adding the `edited` trigger is a CI trigger
change, left out), so add the Proof block before marking ready or push once after. Thread and memory caps live outside
the repo and stay words only.

## (c) What Vikas will notice

Nothing in the app. PRs carry a Proof section; work keeps moving while he is away; batch 2 does not start until he has
used the batch-1 installer.

## (d) Spec for batches 2 to 7 is draft

The constitution stays one document, but its rules for features in a `draft` batch (B2 to B7 in `docs/batches.tsv`) are
no longer binding: a builder does not build them, and a change to them is a draft edit logged in
`docs/decisions/spec-drafts.tsv` instead of a CR needing Vikas's line. When Vikas picks a batch, Claude walks him through
that batch's sections once, the batch's row becomes `active`, and from then on the normal CR rule (FID-02) applies.
Batch 1 (`active`) is unchanged: locked. Edits to `spec/` files still need a CR id for FID-01/02, so a draft-batch edit
cites this CR (CR-0072 §d) as its standing approval.
