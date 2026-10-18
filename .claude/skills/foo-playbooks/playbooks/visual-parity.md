### Visual parity

**The frozen drawing is the baseline. You do not touch it.** Source: pstack `visual-parity`, tied to `11-fidelity.md`.

1. The baseline is `spec/refs/` (Blueprint, walkthrough) through the golden lane: Tier R (words, boxes, colours) and Tier B pixels on windows-latest. Find the BP/UX ids for the surface in `golden/manifest.json` and `spec/trace.csv`.
2. Anti-shortcut rules, held: no harness changes, no blessing (`golden:bless` needs a CR or signed report, FID-06), no masks or thresholds, no restructuring a component just to make a diff pass. If the drawing looks wrong, it goes to a CR dispute (`docs/fidelity/disputes.json`), never into code.
3. One surface at a time. Shared primitives (tokens, bubble, row) first, as a blocking step.
4. Check each surface on the golden lane's evidence (`git fetch origin evidence`, `<branch>/<sha7>/fidelity.html`) and locally with foo-verify shots light and dark. Investigate every Tier R failure until it passes or is a filed dispute.
5. Proof block per surface in the PR.

**Reply:** surfaces done, Tier R result per id (pass / disputed with CR), where the evidence is, what is left.
