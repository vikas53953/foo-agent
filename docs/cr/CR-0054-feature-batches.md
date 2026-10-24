# CR-0054: feature batches (a build shows only the features switched on)

- **Asked by:** Vikas, 2026-10-24 05:17Z (project chat): keep everything built so far, put every feature on one page,
  switch them on in groups of five, give him an installer per group, test each group a day himself plus an automatic eval,
  fix, then the next five. He answered "go" at 05:45Z to the plan: switches, one feature menu, batch 1 = chat with real
  Claude plus first-run setup and settings, then an installer.
- **Why:** no person has used foo yet. 34 features are built, partly built or not built, and only 4 of 190 tracked checks pass
  with real AI. A build that shows everything at once cannot be judged by one person in a day; a build that shows five can.
- **Spec sections:** 08-4 §25.5 new item 5b; 08-5 Bootstrap `features`; DECISIONS X-211.
- **Status:** Approved by Vikas, DECISIONS X-211 (his messages 2026-10-24 05:17Z and 05:45Z).
- **Change:** the sections above.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

None. Tests are titled by CR: `test/unit/cr-0054-features.test.ts`, `test/integration/feature-switches.test.ts`,
`test/e2e/cr-0054-feature-switches.spec.ts`, and the real-AI journey `test/real-pc/journeys/B1-batch1.json`.

## (b) Spec before → after

| #   | Before                                    | After                                                                                                |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | every built feature shows in every build  | `resources/features.json` lists the features a build switches on; everything else has no entry point |
| 2   | an intake `job`, `memory`, `setting` acts | while its feature is off it posts one fixed line (`thread.feature_off.*`) and nothing else happens   |
| 3   | Bootstrap has no feature list             | Bootstrap `features?: FeatureId[]`; absent = every feature (older callers and tests are unchanged)   |

## (c) Picks where the spec is silent

1. **34 ids, 7 batches.** The ids follow the UX journeys of 11 §11.3 plus J24–J30 and three cross-cutting features (web,
   mini pages, approvals). Order: built and most useful first, not-built last. The menu page shows each one's status.
2. **Tests see everything.** A FOO_TEST run and the shared real-AI journeys switch every feature on, so no existing test
   changes; a dev run reads the file like the installer (FOO_FEATURES=all shows everything). A journey with `"features": "shipped"` tests the build's own list.
3. **A broken file switches batch 1 on**, never nothing and never everything.
4. **Choice cards stay.** foo's own clarifying question (intake `ask`) is part of chatting; the `choice` feature is the job's
   Choice steps, which need jobs.
5. **Lines name the batch, not the milestone.** Vikas reads "a later batch", the word he used.
6. **Enabling a batch** is one edit to `resources/features.json` and a new installer. When every feature is on, this CR's
   lines and gates can go.

## (d) Review

One independent review of this CR and its diff, recorded in the PR.
