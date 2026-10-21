# Lane A — real-AI journeys

Evidence was judged from current-main build `0665cf67d2ab6cf0515f6d3198df6dfc35357e82`, run `39663772762`, at immutable evidence commit `bb04ea9ca814ffd356dc6367b551141aefec7e91`. Shards 1–3 completed successfully; shard 0 failed, so only the three reviewed rows from successful shards are current-main promotions. The journey-level historical ledger is [lane-A-real-ai.tsv](lane-A-real-ai.tsv); the feature-level AT ledger has valid AT IDs plus separate log and screenshot links in [lane-A-feature-judgments.tsv](lane-A-feature-judgments.tsv). I directly inspected current U02, B01 and B12 summaries, logs, threads, reply text and final screenshots for AT-027, AT-030 and AT-031. The prior cc8 evidence at commit `d2280c5aaf94910edecdac6c3a332ea575af912d` and the earlier `7e1ada4a7e93d72a23bc6c4d16920b7c376d23fb` build at commit `8edc3c6dea861c8742bad4f614f6b5a349811bfa` remain preserved as audit history.

The prior cc8 audit covered all 54 finished journey folders under `s0`–`s3`; its direct checks remain recorded here, including B02's typed `2` answer, U14's Memory provenance, U23's visible water page, B08's later handback, B03's `SEARCH_BUSY`, U17's light-theme reply, U16's blank About panel, and B09's four “Couldn't show part of this” cards. Current-main B01 measures 222 words and shows its intact three-item list in one bubble; current-main U02 shows a thumbs-up on thanks with no new foo bubble; and current-main B12 has clean Hinglish, Punjabi and holiday replies. AT-027, AT-030 and AT-031 are therefore current-main passes in the feature ledger.

## Evidence rows

The journey TSV contains one row for every finished evidence journey. The separate feature TSV contains only feature-level judgments with valid AT IDs and both log and screenshot pointers. `pass` means the observed behavior met the journey expectation on that evidence build; `partial` means some of the behavior was visible but the complete journey was not proven; `wrong` means the UI or reply was observably wrong; `fail` means the required behavior was absent; `blocked` means the journey precondition was not met or the driver could not observe the required state.

## New missing-feature journeys

The seven new JSON journeys enumerate all 73 `real_ai = missing` IDs from the handoff copy. Every step includes one or more AT IDs in its `note` or `expect` text. Unsupported fault, state, protocol, persistence, timing, accessibility, and generated-control criteria are manifest-only in `blockedPrerequisites`; no natural-language prompt is presented as a test for them. The six blocked manifests retain clearly labeled messy/wrong-input, Hinglish, Hindi and Punjabi prompt variants under `blockedVariants` for a future driver with the required fixtures. The executable smoke retains only preconditioned setup and visible probes across job and Choice flows:

- `LaneA-jobs-core.json`: AT-081, AT-083, AT-084, AT-106, AT-109, AT-112, AT-113, AT-114, AT-115, AT-116, AT-117, AT-118a, AT-119, AT-120, AT-282.
- `LaneA-approvals.json`: AT-085, AT-110, AT-111, AT-121, AT-122, AT-123, AT-124, AT-126, AT-127, AT-128, AT-132, AT-133.
- `LaneA-signin-safety.json`: AT-056, AT-057, AT-059, AT-060, AT-211.
- `LaneA-motion-and-face.json`: AT-300, AT-301, AT-302, AT-303, AT-304, AT-305, AT-306, AT-309, AT-312, AT-315, AT-316, AT-317, AT-318, AT-322, AT-323, AT-324, AT-325, AT-326, AT-327.
- `LaneA-kit-components.json`: AT-342, AT-344, AT-345, AT-348, AT-349, AT-350.
- `LaneA-ai-pages.json`: AT-352, AT-353, AT-354, AT-355, AT-356, AT-357, AT-359, AT-360, AT-361, AT-362, AT-363, AT-364, AT-366, AT-367, AT-368, AT-369.
- `LaneA-smoke-5min.json`: the proposed five-minute smoke set: start, Find your AI, first chat, one harmless job and one Choice card, with AT-005, AT-006, AT-032, AT-106 and the AT-027 thanks reaction.

The seven files are runnable by explicit filename. The shared batch manifest remains outside Lane A ownership, so I did not edit it; integration can add these filenames after this lane diff is reviewed.

## Tool comparison

No new dependency or runner was selected. The existing `foo-drive.js` remains the right runner because it launches the installed Electron app, uses the isolated `FOO_DATA_DIR`/`FOO_LOCAL_DIR` profile, captures screenshots and thread dumps, and refuses unsafe actions. For traceability, the alternatives were compared before writing the journeys:

| Option                              | Evidence                                                                                                                                                                           | Decision                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Existing `foo-drive.js`             | [driver](https://github.com/vikas53953/foo-agent/blob/main/test/real-pc/foo-drive.js), [journey examples](https://github.com/vikas53953/foo-agent/tree/main/test/real-pc/journeys) | Selected; it is the established real-AI path and has safety refusals.                                     |
| Playwright `_electron` E2E launcher | [test/e2e/launch.ts](https://github.com/vikas53953/foo-agent/blob/main/test/e2e/launch.ts)                                                                                         | Useful for pretend-AI CI, but not the installed real-AI evidence workflow.                                |
| Vitest unit/integration runner      | [package scripts](https://github.com/vikas53953/foo-agent/blob/main/package.json)                                                                                                  | Useful for deterministic contracts, but cannot prove real reply text, screenshots or installed-app state. |

The bounded live smoke used the explicitly authorized private launcher; no key was provisioned in the repository and no public evidence was modified. Sanitized logs, thread dumps, summaries and selected screenshots are stored beside this report as `lane-A-targeted-*` and `lane-A-smoke-*`; they contain no private profile paths. New journeys are executable and intentionally retain explicit waits and expectations; they do not fake a pass or silently skip a missing prerequisite.

## Bounded live smoke

The default Electron launch reproduced host exception `0x80000003` before Playwright could attach. With the existing runner, `--no-sandbox`, `--disable-gpu`, and a unique private Electron `--user-data-dir`, J01/J02 completed 14 steps with `failed=0`; the sanitized targeted and smoke artifacts are [lane-A-targeted-summary.json](lane-A-targeted-summary.json) and [lane-A-smoke-summary.json](lane-A-smoke-summary.json). This launch workaround establishes a bounded driver run; it is not default visual acceptance. The historical cc8 five-minute smoke completed 13 driver steps with `failed=0`; its AT-027 hourglass/follow-up, AT-032 four-option card and AT-106 unobservable provenance remain recorded as historical observations. A fresh targeted cc8 run requested 240 words and visibly delivered a 259-word first bubble with all three list items intact in one bubble, so AT-030 was a bounded historical pass; thanks still produced a foo reply, so AT-027 failed there. A separate local run against current-main `0665cf67d2ab6cf0515f6d3198df6dfc35357e82` reached the Finder but found no usable AI, then failed six setup/send steps; its sanitized evidence is [lane-A-current-targeted-summary.json](lane-A-current-targeted-summary.json) and [lane-A-current-targeted-03-finder-tested.png](lane-A-current-targeted-03-finder-tested.png). The public current-main receipt independently supplies the eligible AT-027, AT-030 and AT-031 passes recorded above. Claude cost-state records under the private profile total `$0.3474558` across 11 sessions, including finder probes (`$0.010858` first-run, `$0.1773088` smoke, `$0.159289` targeted, and `$0` current-main attempt), within the reserved `$2` budget; no key or private profile was copied into the repository.

## Validation

- Parsed all seven new JSON files successfully with PowerShell `ConvertFrom-Json`.
- Confirmed all 73 missing IDs occur in the new journey text (`missingNotMentioned=0`).
- Confirmed every step in the new journeys contains an AT ID (`stepsWithoutAT=0`; 27 steps checked after reducing unsupported criteria to explicit blocked manifests).
- Ran Prettier on all seven new JSON files successfully.
- After fast-forwarding the lane to origin/main `0665cf67d2ab6cf0515f6d3198df6dfc35357e82`, `spec:verify`, `check:copy`, `lint` (two existing warnings, zero errors), `format:check`, `typecheck`, `trace:check`, `fid:guard --base origin/main`, `build`, and `build:renderer` passed after the manifest reduction. The required `pnpm test --maxWorkers=2` run was terminated after approximately 26 minutes when the verified lane-a runner stalled under host memory pressure; its incomplete failures and raw gate outcome are recorded in [lane-A-test-run.txt](lane-A-test-run.txt). No test or threshold changed. Current-main real-AI evidence is now available for the three judged rows; PR #110 driver fixes remain an external dependency for interpreting driver mismatches elsewhere.

## Remaining wiring for root

The seven files can be invoked directly with `foo-drive.js` by filename; no shared manifest edit is included in Lane A. The current-main run is complete; review provenance before importing [lane-A-real-ai.tsv](lane-A-real-ai.tsv) into any shared ledger, and keep the three current feature rows in [lane-A-feature-judgments.tsv](lane-A-feature-judgments.tsv) separate from the historical rows.
