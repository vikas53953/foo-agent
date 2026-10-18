---
name: foo-review
description: Review a foo-agent diff with two models (Opus + Sonnet) and sort every finding act / consider / noted / dismissed; at milestone close-out also run the two-axis Standards + Spec review beside the fidelity checker. Use before marking a ticket or milestone PR ready.
---

# foo-review

Adapted for foo-agent from pstack `interrogate` (two-model adversarial review) and Matt Pocock's `code-review` (two axes). Both MIT; see `.claude/skills/NOTICE.md`. The fidelity checker (`11-fidelity.md`) is unchanged and still required; this sits beside it.

## Ticket review (two models, same diff)

1. **Scope:** `git diff <milestone-branch>...HEAD` for a ticket, or `git diff origin/main...HEAD` for a PR.
2. **Intent:** one paragraph from the ticket file and the spec sections it cites. The intent is the spec; reviewers do not question it.
3. **Spawn two reviewers in one message**, both read-only (`subagent_type: "Explore"`, brief says "do not edit files"): Reviewer A `model: "opus"`, Reviewer B `model: "sonnet"`. Fill `references/reviewer-prompt.md` with the intent, the diff, `references/rubric.md`, `references/code-quality-review.md`, and these foo lenses:
   - Does it match the spec words, ids and states exactly? New screens, words or flows the spec lacks are findings.
   - Copy via `t()`, test ids via `TID`, tokens only, spec header on each file.
   - Is there a foo-verify proof, and does its journey actually fail if the behaviour breaks?
   - Tell them not to call `mcp__hearthbot__` tools.
4. **Synthesize and judge** (`references/lead-judgment.md`): merge duplicates, note which model raised each; findings both raised are the strongest signal. Put every finding in one bucket with a one-line reason:
   - **Act on**: real correctness, security, spec or maintainability problems. Fix before ready.
   - **Consider**: real but not clearly worth it now. Log the call.
   - **Noted**: valid, not actionable now.
   - **Dismissed**: wrong, nitpicky or missing context, with the reason.
5. Fix the Act-on items, re-run the proof, and paste the bucket table into the PR under **Review**.

Cheaper path: for a small ticket (one seam, under ~150 lines) one Sonnet reviewer is enough; say so in the PR.

## Milestone close-out (two axes)

On the whole milestone branch (`git diff origin/main...HEAD`), spawn two **separate Sonnet** reviewers in one message (`matt-code-review`):

- **Standards:** `CLAUDE.md`, `docs/build-method.md`, `eslint-rules/index.js`, `implementation-notes.md`, the `typescript-best-practices` table and the smell baseline in `matt-code-review`. Report violations with the rule cited; smells are judgement calls.
- **Spec:** the milestone pack, `docs/tickets/M<n>/`, and the spec sections they cite. Report missing or partial requirements, behaviour nobody asked for, and requirements that look implemented but wrong, quoting the spec line.

Report the two axes side by side, never merged or re-ranked, then sort their findings into the four buckets as above. Then the comment and type clean-up on the diff: delete comments that only restate code or narrate history (keep the `// Spec:` headers and spec-citing notes the repo uses), and apply the TS rulebook. The fidelity checker runs as before.
