# CR-0053: Lane D Group C trace witnesses

- **Asked by:** root coordinator, 2026-10-22
- **Spec sections:** 10-acceptance-1 AT-273, AT-284 and AT-285; `spec/trace.csv`; DECISIONS row X-209
- **Status:** Approved by Vikas on 2026-10-22; DECISIONS X-209 records this approval. The approved scope is limited to these three trace mappings; no direct Vikas message URL was supplied.
- **Change:** add exactly three pending `spec/trace.csv` rows: AT-273 → `test/e2e/lane-d-a11y.spec.ts`, AT-284 → `test/unit/lane-d-grouping.test.ts`, and AT-285 → `test/unit/lane-d-scroll.test.ts`. No acceptance text, test behavior, source behavior, thresholds, workflow, golden reference or other spec semantics change.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` is required in the same commit to record the approved `trace.csv` hash.

## Trace rows

The three rows are pending M9 witnesses and are the only trace entries covered by this CR:

| Acceptance | Test file                           | Spec reference                               |
| ---------- | ----------------------------------- | -------------------------------------------- |
| AT-273     | `test/e2e/lane-d-a11y.spec.ts`      | 10-acceptance-1 §J19; 04 §12.5               |
| AT-284     | `test/unit/lane-d-grouping.test.ts` | 10-acceptance-1 §X-151; 04 §1.3              |
| AT-285     | `test/unit/lane-d-scroll.test.ts`   | 10-acceptance-1 §X-152; 04 §1.6; 03-2 §3.6.6 |
