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
