# CR-0052: Add an AI-eval pass threshold for `test/eval`

- **Status:** PROPOSED — pending Vikas approval; this document is not an approval and does not authorize a code or spec change.
- **Asked by:** Codex Lane C, 2026-10-22 (IST)
- **Base checked:** lane-C merge `ffe5fbc810280a74e2d2a52d6b2d0d3b31e80cd3`, including main `0d04a9f9105e42aef0b4a22238285a9007635c3e`.
- **Spec section:** `spec/constitution/11-fidelity.md` §11.7.6, FID-06.
- **Reservation check:** No `CR-0052` file exists in `docs/cr/`, no `CR-0052` row exists in `spec/constitution/DECISIONS.md`, and the open GitHub PR list has no CR-0052 claim. Lane C reserves this number with this proposal.

## Why this proposal exists

FID-06 says: “Also not allowed: `test.skip`, `test.fixme`, `.only`, lowering a threshold, adding a mask, or widening a tolerance without a CR id in the same line (**FID-06** checks).” The current guard evidence reports the exact unapproved additions:

```text
FID-06: added without a CR:
  test/eval/deepeval_adapter.py: threshold: self.threshold = 1.0
  test/eval/deepeval_adapter.py: threshold: self.success = self.score >= self.threshold
  test/eval/deepeval_adapter.py: threshold: self.success = self.score >= self.threshold
```

The current file intentionally keeps the metric threshold explicit at `1.0` ([`test/eval/deepeval_adapter.py`](../../test/eval/deepeval_adapter.py#L35-L61), `FooBoundaryMetric.__init__`) and compares both envelope and ordinary cases with `self.score >= self.threshold`. No threshold is hidden, renamed, lowered, widened, or edited by this proposal.

## Proposed decision, pending approval

Approve the existing deterministic DeepEval metric's explicit pass threshold of `1.0` for `test/eval`. The threshold remains visible in the adapter and means a case passes only when its deterministic score is exactly `1.0`; the CR does not change the metric, fixtures, test expectations, or FID-06 guard. Any later threshold change requires another CR.

Until this CR is approved and recorded in `DECISIONS.md`, Lane C parks the DeepEval metric result and does not claim the FID-06 gate is clear. The focused Vitest evaluation and injection cases continue independently.

## Current evidence

- The existing deterministic DeepEval result is recorded at [`test/eval/results/deepeval-2026-10-22.log`](../../test/eval/results/deepeval-2026-10-22.log); it reports 21 cases, 21 expected outcomes, zero provider calls, and evaluator cost `$0`.
- The current one-worker focused Vitest run is recorded in the Lane C report. It ran the existing `foo-eval` and `injection-red-team` files without a provider call or paid AI request: 2 files, 28 tests, 27 passed, 1 failed. The failure is the existing hostile fake-AI case's `afterEach` hook timing out at 60 seconds.
- No manifest regeneration or `Approved by Vikas` line is included because this proposal is not approved.
