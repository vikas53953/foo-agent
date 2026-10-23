# Choice-card spec correction (diagnostic)

Date: 2026-10-23
Source base: 0d04a9f9105e42aef0b4a22238285a9007635c3e
Isolated worktree: choice-four-option-fix (restored clean)

## Evidence

- foo-testing/docs/testing/features.tsv:37 defines AT-032 as: “Given foo has 3 options, then the card shows exactly 3 options plus ‘Something else…’ and Skip…”.
- choice-four-option-fix/test/e2e/m5-choice.spec.ts:1-4,36-51 seeds a three-option fixture and verifies the three rows plus Something else/Skip.
- choice-four-option-fix/spec/constitution/05-cards-1.md:415-419 defines the general Choice-card purpose as one question with 2–4 tappable answers.
- choice-four-option-fix/spec/constitution/08-functions-and-engine-4.md:88-93 and choice-four-option-fix/resources/prompts/intake.md:4 likewise tell intake AI to ask with 2–4 options.
- choice-four-option-fix/src/shared/schemas.ts:40-50 enforces the shared 2–4 contract; :117-120 applies it to intake and :244-249 applies it to job steps.
- choice-four-option-fix/test/real-pc/journeys/B02-choice.json:4-18 maps B02 to AT-032/035/288 but does not establish the AT-032 “Given 3 options” precondition; it asks the real model for a shoes choice.

## Correction

The real-AI screenshot showing four choices is not sufficient to call a product defect for AT-032. It demonstrates a valid 2–4 Choice-card output under the current intake prompt and schema, while the AT-032 fixture contract is unproven in B02. Reclassify the prior four-option APP claim as TEST/PRECONDITION UNPROVEN, pending a journey that constrains or otherwise establishes exactly three AI options.

Do not retain the candidate intake-only .max(3) patch: it conflicts with the current 2–4 prompt and still permits two options, so it neither matches the current spec nor proves AT-032. If product intent changes, explicitly amend the intake prompt/spec and use .min(3).max(3) for intake only; preserve generic/job 2–4.

## Diagnostic red attempt

Before the candidate source patch, the added test rejected a four-option intake card but failed (1 failed, 12 passed). That test was testing an unapproved intake cardinality change, so it is diagnostic evidence of the proposed contract mismatch, not a product regression. No red commit was created.

No further tests were run. The isolated source checkout is clean after restoring only the two candidate files; no shared checkout or source/spec files were changed.
