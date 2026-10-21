---
name: foo-review
description: Review a foo-agent diff at the depth its risk tier asks for, verify every act-on finding before it blocks, cap review at 3 rounds, and log each finding's outcome; at milestone close-out also run the two-axis Standards + Spec review beside the fidelity checker. Use before marking a ticket or milestone PR ready.
---

# foo-review

Adapted for foo-agent from pstack `interrogate` (two-model adversarial review) and Matt Pocock's `code-review` (two axes), both MIT (see `.claude/skills/NOTICE.md`). The tier, verify, round-cap, outcome and commit-pin rules (2026-10-21) follow Anthropic's "How the Claude Code team does code review" (claude.dev, 15 Oct 2026). The fidelity checker (`11-fidelity.md`) is unchanged and still required; this sits beside it.

## 0. Fresh-eyes self-check (builder, before the PR opens)

The agent that wrote the code is the worst judge of it. Before opening the ticket PR, the builder spawns one read-only Sonnet subagent (`subagent_type: "Explore"`, "do not edit files, do not call `mcp__hearthbot__` tools") with only the ticket section, the cited spec lines and `git diff <base>...HEAD`. It reports anything that does not match the ticket or looks broken. Fix or answer each point, then open the PR. This is a quick pass, not the review.

## 1. Pick the depth: risk tier

Run `pnpm review:tier --base <milestone-branch or origin/main>`. The tier comes from the changed paths, never from who wrote the change.

| Tier   | When (see `scripts/review-tier.ts`)                                                                                              | Reviewers                              | Verify step |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------- |
| low    | only `docs/`, `.claude/skills/`, root `*.md`, under 400 changed lines                                                             | one Sonnet                             | no          |
| normal | app or test code                                                                                                                  | one Fable                              | yes         |
| high   | CI workflows, `spec/`, `golden/`, fidelity gates, installer, dependencies, vault/secrets, spend approvals, AI engine and AI finder | Fable + Opus, same diff, one message   | yes         |

High tier never widens what approve-on-behalf covers: the items `docs/build-method.md` §5 keeps for Vikas (and CI trigger changes) stay his. Paste the tier line into the PR.

## 2. Hunt (round 1)

1. **Scope:** `git diff <milestone-branch>...HEAD` for a ticket, or `git diff origin/main...HEAD` for a PR into main.
2. **Intent:** one paragraph from the ticket file and the spec sections it cites. The intent is the spec; reviewers do not question it.
3. **Spawn the tier's reviewers in one message**, all read-only (`subagent_type: "Explore"`, brief says "do not edit files"; tell them not to call `mcp__hearthbot__` tools). Fill `references/reviewer-prompt.md` with the intent, the diff, `references/rubric.md`, `references/code-quality-review.md`, and these foo lenses:
   - Does it match the spec words, ids and states exactly? New screens, words or flows the spec lacks are findings.
   - Copy via `t()`, test ids via `TID`, tokens only, spec header on each file.
   - Is there a foo-verify proof, and does its journey actually fail if the behaviour breaks?
   - Name the **bug class**, not one line: "every IPC handler in this diff skips input validation", with each place listed.

## 3. Verify (normal and high tier)

A finding blocks only if a second agent agrees it is real. For each finding the lead would put in **Act on**, spawn one read-only Sonnet verifier per finding (all in one message) with `references/verifier-prompt.md`. The verifier tries to refute it by tracing the real call path and spec line. Verdicts:

- **confirmed**: stays in Act on.
- **refuted**: goes to Dismissed with the verifier's reason.
- **unsure**: Consider, with what would settle it.

Findings both hunters raised independently skip the verifier: two agreeing sources are already the correlation.

## 4. Judge and log

Sort every finding into one bucket with a one-line reason (`references/lead-judgment.md`), noting which model raised it:

- **Act on**: real correctness, security, spec or maintainability problems (verified). Fix before ready.
- **Consider**: real but not clearly worth it now. Log the call.
- **Noted**: valid, not actionable now.
- **Dismissed**: wrong, nitpicky or missing context, with the reason.

Paste the table into the PR under **Review** with an **Outcome** column filled once the round closes: `fixed`, `wrong` (the reviewer was mistaken), `intentional` (the code is right on purpose) or `no-matter` (true but not worth a change). The lead adds one row per review to the milestone decision log: `review	<PR>@<sha>	tier, rounds, act-on n, fixed n, wrong n`. The share of `wrong` is the reviewer's false-alarm rate; when it passes about a third over a milestone, tighten the reviewer prompt (through `foo-correct`).

## 5. Later rounds: stop the loop

- **Round 2 and 3 review only the new diff** (`git diff <reviewed-sha>..HEAD`) plus the open Act-on items. Do not re-review settled code.
- **Never repeat a finding** already bucketed in an earlier round, unless the new diff changed that code.
- **Cap: 3 rounds.** If round 3 still has confirmed Act-on items, stop reviewing. The builder writes in the PR why the approach keeps failing and proposes a different one; the lead decides (re-ticket, split, or a CR). No round 4 on the same approach.

## 6. Approval binds to a commit

"Approved on Vikas's behalf" names the exact head SHA reviewed: `approved on Vikas's behalf @<sha>` in the PR and the decision log. Any push after it needs a re-review of just `git diff <sha>..HEAD` before merge (round rules above apply). An agent's approval is recorded as on Vikas's behalf, never as his own.

Cheaper path still holds: a ticket under ~150 lines that the tier script calls low or normal may use one Sonnet hunter; say so in the PR.

## Milestone close-out (two axes)

On the whole milestone branch (`git diff origin/main...HEAD`), spawn two **separate Sonnet** reviewers in one message (`matt-code-review`):

- **Standards:** `CLAUDE.md`, `docs/build-method.md`, `eslint-rules/index.js`, `implementation-notes.md`, the `typescript-best-practices` table and the smell baseline in `matt-code-review`. Report violations with the rule cited; smells are judgement calls.
- **Spec:** the milestone pack, the ticket map (`/mnt/project-files/foo/prep/M<n>-tickets.md`), and the spec sections they cite. Report missing or partial requirements, behaviour nobody asked for, and requirements that look implemented but wrong, quoting the spec line.

Report the two axes side by side, never merged or re-ranked. Verify their Act-on findings as in §3, then sort into the four buckets with outcomes. Then the comment and type clean-up on the diff: delete comments that only restate code or narrate history (keep the `// Spec:` headers and spec-citing notes the repo uses), and apply the TS rulebook. The fidelity checker runs as before.
