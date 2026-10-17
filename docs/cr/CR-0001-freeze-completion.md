# CR-0001: Complete the spec-v1.0 freeze with the reference drawings and machine tables

- **Asked by:** builder (M0b fidelity harness), 2026-10-17
- **Spec sections:** 11-fidelity §11.1.1 (what is frozen), §11.1.2 (manifest), §11.2.2 (reference paths), §11.4.4 (spec-values table), §11.5.3 (trace matrix); foo-plan §5 M0 Create
- **Change:** completes the spec-v1.0 freeze with the reference drawings and machine tables named by plan M0; no spec text changes. Added to `spec/`:
  - `refs/bp/foo-blueprint-v2.html`: the Blueprint v2.1 source, byte-for-byte (`foo-blueprint-v2.1.html` is the file published at the v2 link).
  - `refs/ux/foo-ux-walkthrough.html`: the UX walkthrough source, byte-for-byte (245 steps in 25 chapters, counted from `window.__STEPS`).
  - `spec-values.json`: SV-01…SV-38 copied from §11.4.4, each with its machine form; rows for components not built yet carry `pending: M{n}` from §11.12 item 8 (SV-16, SV-37, SV-38 live).
  - `trace.csv`: the §11.5.3 header plus a `Status` column; rows for the tests that exist today (live) and the M1 rows (pending). The full matrix is completed per milestone.
- **Status:** Approved
- **Approved by Vikas:** 2026-10-17 18:52Z, in the M1 build thread of the foo project ("CR-0001: approved")
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit
- **Still owed:** the `spec-v1.0` git tag (a tag push returned 403 from this environment; the spec keeper tags it).
