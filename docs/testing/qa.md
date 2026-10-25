# foo batch-1 QA: one command

Vikas asked on 2026-10-25 for one repeatable testing command with real evidence, scoped to the batch-1 app and its five
features (install, ai, name, chat, settings). This page is the runbook.

## The command

```bash
pnpm qa                 # tier e2e: vitest + Playwright scenarios on the built app (xvfb on Linux)
pnpm qa --tier fast     # vitest scenarios only, seconds, no window
pnpm qa --tier full     # + real-AI B1-batch1 runs from the evidence branch + the AI-judge results
```

Output goes to `qa-report/<time>/`: `report.md`, `dashboard.html`, `results.json`, `evidence/` (one JSON per QA scenario with
the request, the AI requests, tool calls, database counts, expected and actual) and `pw/` (Playwright traces of failures).
Exit code: 0 PASS, 1 REVISE (a scenario failed), 2 BLOCKED (a scenario could not run or its test is missing).

## What decides pass or fail

- Only a test runner's own result: vitest JSON, Playwright JSON, the real-AI journey `summary.json` (`failed == 0`), or the
  deterministic checks of the AI-judge asks. Never an AI's words ("Done!", "booked"), never a log line, never an older run.
- Behaviour and permissions are checked against state: database row counts, settings read back, files scanned for the key.
- The AI judge (`llm-rubric`) scores tone, language, honesty and quality. Its scores are reported apart and never change the
  verdict.
- Nondeterministic real-AI scenarios need their last 3 runs to pass (`repeat: 3`).

## The parts

| Part                                                                          | Where                                                                           | Tool                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------- |
| Scenario list (50)                                                            | `test/qa/scenarios.ts`, guarded by `test/unit/qa-registry.test.ts`              | —                      |
| Injection and permission cases (AgentDojo-style, fake AI obeys the injection) | `test/integration/qa/b1-security.test.ts`                                       | Vitest                 |
| Batch-1 walk with key-leak scan; axe sweep light/dark                         | `test/e2e/qa-b1-journey.spec.ts`                                                | Playwright + axe       |
| Real AI, packaged app, Windows                                                | `test/real-pc/journeys/B1-batch1.json`, `real-ai-e2e.yml` (every merge to main) | Playwright `_electron` |
| Real AI asks ×3, judged                                                       | `test/judge/`, `.github/workflows/qa-ai-judge.yml`                              | promptfoo              |
| Runner, report, dashboard                                                     | `scripts/qa.ts`                                                                 | —                      |
| Read-only reviewer                                                            | `.claude/agents/foo-qa-reviewer.md`                                             | —                      |

## Tools not used, and why

- **k6:** foo is a one-user desktop app with no server, so load from many users does not apply. Speed is covered by PERF tests
  (`PERF-02` typing in a 5,000-message chat) and the real-AI reply latency in the report.
- **PyRIT / AgentDojo as packages:** both are Python and drive an HTTP model endpoint; foo's agent is an Electron app with its
  own engine. The same idea (user task + injected goal + a state check) is written in TypeScript on foo's own engine harness.
- **Phoenix / OpenTelemetry:** adding an exporter means changing the engine (`src/`), which needs a CR. Each QA scenario
  instead files its AI requests and resulting state as evidence; the real-AI runs keep `ai-turns.jsonl` with durations.

## Repairing a failure

1. Take the failure's id and repro command from `report.md`.
2. Fix the cause in the app. Never weaken a test: no `.skip`/`.only`, no looser expectation, no new exemption, no baseline
   change outside `golden-bless.ts`. `fid:guard` and the `foo-qa-reviewer` agent check this.
3. Re-run the whole affected tier (`pnpm qa`), not only the one test, and keep the new run folder as the evidence.

## Safety

Every pretend-AI test runs with `FOO_TEST=1`, temporary data folders, the in-memory vault and fake tools; no network. Real-AI
runs happen only on GitHub Actions with Vikas's key secret, owner-only, and scan their evidence for the key before pushing.
