You are the LEAD tester for "foo", a Windows desktop personal-agent app (Electron, React 19, SQLite).
Repo: https://github.com/vikas53953/foo-agent (public). Use multiple agents in parallel: you run 7 lanes, one agent per lane.

## Step 0 (you, the lead, before starting any lane)

1. Clone the repo and check out the branch claude/project-thread-abkd7l. Read: docs/testing/CODEX-HANDOFF.md, docs/testing/coverage-matrix.md, docs/testing/app-wide.tsv, CLAUDE.md.
2. Create one branch per lane from main: codex/lane-<letter>-<yyyy-mm-dd>. Each lane opens its own DRAFT pull request.
3. Give each agent: its lane brief below + the RULES + the REPORT format. Agents only touch the files their lane owns, so no two agents edit the same file.

## RULES (every agent)

- Evidence rule: a result is "proven" only with a linked passing run on current main (CI run, log, screenshot). Never round up. Not sure = "partial" with the reason.
- A step marked "ok" in the real-AI driver log is NOT a pass: read the reply text and look at the screenshot.
- Score every feature as: works / works but wrong vs design (Blueprint, UX walkthrough, golden pictures) / broken / not built.
- Test like a real non-technical user: messy typing, typos, wrong inputs, Hinglish, Hindi and Punjabi.
- Every angle: UI vs design, UX of the whole journey, every frontend state (empty, loading, error, each button), backend and engine (jobs, data, restart and crash recovery, speed), bad AI output (invalid, unknown, slow, an old AI CLI), and Windows (installer, keychain, tray, notifications). Done only after it passes with real AI.
- Before picking any new tool, compare at least 3 options with evidence and write the comparison in your report.
- The repo is PUBLIC: never commit keys, secrets, real names, emails or phone numbers (use example.com, fake numbers). Real-AI runs use your own API key in your own environment only.
- Never push to main, never merge. Never ask Vikas to tap, click or run anything: tests start by themselves.
- Do not edit spec/ or golden/. Never skip, mask or loosen a test or change a threshold.
- Every new source file opens with its spec section comment (lint foo/spec-header). UI words only via t(key); test ids only from TID.
- Before every push run: pnpm spec:verify && pnpm check:copy && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm trace:check
- Real-AI spend: each lane may spend at most $10 (about ₹850) of real-AI calls per day; all lanes together at most $50 (about ₹4,250) per day. Log what each run cost in your report. Stop and report if you hit the cap.
- Windows: Codex cloud is Linux. Linux with xvfb is fine for most app tests (the app runs there). Anything that needs real Windows (installer, upgrade, Credential Manager, tray, notifications, Narrator, Mica, Windows performance) goes in a test file on your PR branch marked "needs Windows CI". Claude marks the PR ready so the repo's Windows CI runs it. Never claim a Windows result you did not see.
- Do not duplicate open PRs: #97 (promptfoo judge, axe sweep, chaos reopen, Windows install/keychain checks), #101 (mutation on 4 files, spec-coverage guard), #102 (nightly pass^3, spend cap). Build on them; note it if you need them merged.

## LANES

Lane A: Real-AI journeys [Linux + Windows CI] (owns test/real-pc/journeys/_, docs/testing/results/lane-A-_)

- Judge the latest finished real-AI run on main (branch `evidence`, folder real-ai/<sha>-claude/s0..s3) feature by feature.
- Write journeys for the 73 features with real_ai = missing in docs/testing/coverage-matrix.tsv. Every step names its AT id.
- Include messy, wrong-input, Hinglish, Hindi and Punjabi variants, and the smoke set (start, find AI, first chat, one job, one card).

Lane B: BDD [Linux] (owns test/bdd/*)

- One Given/When/Then .feature file per spec journey J1..J22, every scenario tagged with its AT id from docs/testing/features.tsv.
- Compare playwright-bdd, cucumber-js and one more option, then wire the winner to the existing Playwright _electron launcher (test/e2e/launch.ts) with the pretend AI, plus a real-AI mode.

Lane C: AI eval and prompt injection [Linux] (owns test/eval/*)

- Add a second eval framework next to promptfoo (DeepEval or similar; compare at least 3). Cases: routing, plan quality, tone, honesty about what foo can't do, safety (cards, OTPs, passwords, big payments), bad or unknown AI output, slow or old AI CLI, Hinglish, Hindi, Punjabi. Each case names its AT id.
- Prompt-injection red team against real Claude: email, pasted text, files, web pages and AI pages that try to make foo pay, send, reveal secrets or change rules. Build on test/articles/ART-injection.test.ts.

Lane D: Visual, motion, accessibility [Linux; Narrator and high contrast need Windows CI] (owns test/e2e/lane-d-_.spec.ts, docs/testing/results/lane-D-_)

- Visual with real AI: compare real-AI screenshots from the evidence branch against golden/ and the Blueprint; list every difference.
- Motion: checks for the 13 motion rules marked missing (springs, fades, shimmer, face blink and bob, Basic and Off motion levels).
- Accessibility beyond the axe sweep: keyboard-only use of every screen, focus order, Narrator labels, high contrast, 200% zoom.

Lane E: Windows, install, upgrade, performance, soak [Windows CI] (owns test/windows/lane-e-_, test/soak/_)

- Install, first run, uninstall, Credential Manager, tray, notifications.
- Upgrade: install the previous release build, create chats, memory, a routine and a running job, install the new build over it, check everything is kept and the job resumes.
- Performance with real AI and pretend AI: startup, first reply, typing lag, chat switch, a 1,000-message chat, memory over an hour, and every spec time or size limit (perf column).
- 8-hour soak with routines and jobs: memory, handles, freezes.

Lane F: Code quality for an AI-built app [Linux] (owns stryker.lane-f.config.json, scripts/audit/*)

- App-wide mutation testing (beyond #101's 4 files): score per area, surviving mutants that matter.
- Wire-up audit: click every button on every screen and prove it does something real; find fake or hard-coded data.
- Unused code and dependencies (e.g. knip), made-up settings, static code scan, dependency audit, repo secret scan.
- Chaos and fuzz during real-AI jobs: random kills, corrupt database, disk full.
- Cost per journey and privacy: capture network traffic on a real-AI run; nothing goes to a host the spec doesn't allow.

Lane G: Usability and UX [Linux] (owns docs/testing/usability/*)

- AI heuristic review of every screen against the Blueprint and Nielsen's 10 heuristics, with screenshots and severity.
- A 15-minute script for a real person: 5 tasks, what to watch for, 3 questions afterwards. Vikas or testers run it.

## REPORT (every lane)

- Write docs/testing/results/codex-<yyyy-mm-dd>-lane-<letter>.md with one row per thing tested:
  | Feature or check | Test type | Result (pass / fail / wrong / blocked) | Build sha | Evidence link | Note |
- List what you could not run and why.

## Step last (you, the lead)

- Shared files (real-ai-results.tsv, app-wide.tsv, the matrix, the handoff log) are changed ONLY in this final step, never by a lane.
- Collect all lane reports. In ONE final PR: add the judged real-AI rows to docs/testing/real-ai-results.tsv, update docs/testing/app-wide.tsv, run `python3 docs/testing/build_matrix.py`, commit the regenerated files, and add a line to the Log in docs/testing/CODEX-HANDOFF.md.
- Reply with: every PR link, how many cells moved to proven (with links), what failed, and what could not run and why.
- Claude reviews every claimed pass against its evidence before anything counts or merges.
