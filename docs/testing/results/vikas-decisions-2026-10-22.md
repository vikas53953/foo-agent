# Vikas decisions — 22 October 2026

Source: direct user instruction in this chat, after the 09:54 IST daily snapshot.

- AT-027 accepts either ❤️ or 👍. Other reaction behavior still needs verification.
- The 62 proposed non-chat features use code tests only; this does not turn missing code evidence into a pass.
- The Windows installer CI job, scoped BDD dependency install step, and AT-273/284/285 trace mappings are approved.
- Approval provenance for PR #136 is confirmed by Vikas. This is not an automated GitHub approval or a merge.
- Close PRs #83 and #62. Both were closed, without deleting branches.
- Real testing takes priority. The previous user-imposed AI spending cap is removed. Use the configured real AI secret without exposing it.
- Run all seven lanes in parallel. Cover existing journeys and executable new Group R journeys, and run every applicable category from CODEX-LANES.md.
- Use actual screens and websites when needed. Report only tests that happened, with screenshot judgments and linked logs; failures and blocked categories remain explicit.
- Keep PRs draft. No merges, keys, or personal data in the repository. PR #121 was returned to draft; manual dispatch can run Windows checks without changing draft status.

## First dispatch under the new instruction

Run: https://github.com/vikas53953/foo-agent/actions/runs/39725331473

- Workflow: existing `real-ai-e2e.yml`, unchanged.
- Workflow and application branch: `codex/real-testing-2026-10-22`.
- Application and journey-kit SHA: `0d04a9f9105e42aef0b4a22238285a9007635c3e`.
- Inputs: `journeys=all`, `max_journeys=1000`, `shards=4`, `ai=claude`, `model=claude-sonnet-5-5`.
- The 51 unique listed journeys produce 54 scheduled executions because each worker repeats first-run setup. The selection limit does not truncate this list.
- The workflow selected Claude successfully and all four Windows jobs started. This is execution status, not acceptance evidence.

The run's artifact/evidence commit, completed counts, costs when available, and screenshot judgments must be recorded after execution. Earlier run33 results remain historical observations; do not silently relabel them as this new run.

## Parallel execution continuation

- Group R run: https://github.com/vikas53953/foo-agent/actions/runs/39727432127, workflow/application SHA `9f429f8022c6c7b7ba989463ccbc2390b0fd5f6d`, all eight R IDs, four workers, Claude Sonnet 5.5. The earlier pending run `39726084968` was cancelled before execution and replaced after changing the real-AI concurrency group to per branch. Both batches can now execute independently; owner and secret guards remain.
- New owner-only manual CI categories run BDD (pretend and real), evaluation, installer/upgrade, partial one-hour job soak, available performance checks, mutation by source area, and recovery/privacy boundaries. Draft status is preserved.
- Under the latest testing-first instruction, known failed tests do not block publishing safe draft test branches. Syntax and secret/output safety are checked before dispatch; other quality checks run in parallel and failures remain disclosed.
- The first partial soak runs the actual job producer only. Its resource observer sampled another app, so memory/handles under job load are explicitly unmeasured until the provenance defect is fixed.

## Execution checkpoint, 11:13 IST

- Baseline run `39725331473` completed successfully. Its screenshots and logs are being judged; this is not yet a new feature-pass count.
- Category run: https://github.com/vikas53953/foo-agent/actions/runs/39728230100. Workflow `ee65f116a96b0ee92066b3aa84c9a5c42f89ec0f`; tested B `45ddf2ccc0849dc545833dc89964a8c7a4193188`, C `da4b243b186ebd23057328a86cc3380c34a80a86`, E `236b9bfc8e45f0d2911967c1c76e0a78e841aed0`, F `0e37145d7e82ecde551ce601f11183ba72fc8318`.
- BDD pretend: 14 passed, 8 failed; all 22 screenshots inspected. Real: 22 launch failures, zero scenario behavior exercised and zero screenshots. The isolated Windows profile could not supply Electron's `userData` path. These are distinct outcomes, not 22 product assertion failures.
- Lane C: 28/28 boundary tests passed. DeepEval had 20 positive cases and one intentional negative case; all 21 expectations were satisfied, with zero provider calls in this CI job. Separate five real-Claude injection probes cost $0.0669714; their local receipt evaluator retained one capitalization mismatch.
- Installer builds succeeded, but source fetching failed because the PR97 full SHA was incorrect. Verified PR97 head is `9e599e343eb9559ab3af45b8e92b1f04a7d804bf`. Original failed run is retained. Installer-only rerun: https://github.com/vikas53953/foo-agent/actions/runs/39729442831, workflow `9c41b620d0e6cfbb6e479d97a72c817eff1eb918`, tested E `1320f3bc47a2f2c84d96d19c4d835e00e269d5a3`.
- Visual/motion/accessibility Windows run: https://github.com/vikas53953/foo-agent/actions/runs/39727818674 at `17e4fd6badf543ff1a98316b447e880aea6a4f27`; one Windows shard has failed and others remain active. Detailed judgments are pending.
- Performance job success only means its available check and blocked-evidence report completed. It does not prove the missing live performance measurements. One-hour soak and four mutation areas remain active.
- Root `ee65f116` passed spec verification, copy, lint, formatting, typecheck, build, trace and fidelity guard checks. Workflow-only repair `9c41b620` passed YAML parsing, all 53 PowerShell block parses, targeted formatting and diff checks.
- Next real-AI slices add explicit assertions to existing paste, stop/recovery, browser, booking-boundary and widget journeys. The audit distinguishes 35 gap rows awaiting current judgments, 36 needing feature-specific assertions and 15 with no matching current route. Authored checks do not count as results.

## Execution checkpoint, 11:50 IST

- Current main remains `0d04a9f9105e42aef0b4a22238285a9007635c3e`. Baseline evidence is pinned at `b292335721066ef5edd65ce11a7c993f812b9d01`; all 291 PNGs from 54 executions were reviewed. Full feature judgments remain separate from workflow success. AT-027 has conflicting contexts: an idle thanks produced a heart, but U02 produced eyes and an assistant message, so the aggregate result remains failed.
- Group R run `39727432127` completed on all four workers. Immutable evidence: `f1f1e8ab207c567290bcc903b115d771c25ae0ce`. Its 420 steps include 119 failed steps; these are not feature counts. Independent screenshot judgments are complete and their inventories are being reconciled before publishing totals. AT-427 replies stayed in one bubble, but exceeded the test's 600-character input condition. This leaves the exact rendering predicate unproven; it is not a universal reply-length failure.
- Expanded real-AI run: https://github.com/vikas53953/foo-agent/actions/runs/39733030713. All four Windows workers are running. Application and journey kit: `948fe18ccc02caf874c8bf913c27fe15cecee983`. Selected B03, B04, B05, B06, B08, B09, B10, B14 and U27. B07 needs the driver to target the separate live window; that repair proceeds independently.
- Installer run `39729442831` produced 19 passing PR97 checks, one WinRT runtime failure and two gaps. Upgrade/first-run fixtures did not execute because PowerShell bound the argument array positionally. The packaged screenshot proves a visible shell only.
- Installer rerun https://github.com/vikas53953/foo-agent/actions/runs/39731650055 completed with a failed final gate. Workflow `7b43d6cc212e541ecb688fa38f85435508c58ead` fixes named parameter splatting and uses the original PR97 Windows PowerShell runtime. Raw fixture outcomes and screenshots are under review; continued step success is not acceptance.
- BDD fixture repairs and a separate production-mode real-AI BDD path are being implemented. Pretend-only hooks cannot substantiate a real-AI result. Visual/motion fixture repairs also proceed independently, preserving the original assertions.
- Four mutation areas and the original one-hour producer diagnostic remain running. The local eight-hour soak has not started: review found that the observer sampled the `cmd.exe` launcher. It must verify Electron's own runtime PID and executable before resource measurements count.
- These are ongoing execution facts, not completion of all 190 features. PRs remain drafts and no merge occurred.
