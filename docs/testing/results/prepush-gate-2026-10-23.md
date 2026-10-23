# Prepush gate: 23 October 2026

Lead source is main0d04a9f9105e42aef0b4a22238285a9007635c3e plus documentation-only changes. This is a local gate receipt, not a GitHub workflow result or feature acceptance.

All of spec:verify, check:copy, lint, final format:check, typecheck, build, trace:check and fid:guard --base origin/main exited0. Initial format failure is preserved in parent gate logs; reported files were formatted before the final passing check.

Full pnpm test first overloaded the machine and was interrupted. A fresh same-suite run with maxWorkers=2 completed exit1: 7 failed/280 passed/2 skipped files; 10 failed/6596 passed/11 skipped tests, 6617 total. Existing skipped tests were not introduced or counted as passes. No assertion, timeout, threshold or test selection was changed.

Observed failures:

- m2r-media: Windows denied creation of the required file symlink (EPERM). This is an environment prerequisite; no security setting was changed.
- m6-page-export: zipinfo executable unavailable (ENOENT), affecting two export checks.
- Browser actions/webPages: teardown hooks exceeded the existing60second limit.
- Browser submit: AT037 teardown exceeded60seconds; G-M9-07 later read a null fixture. Source/fixture diagnosis is active; no product cause is inferred merely from failure.
- Browser profile/sitenotes and action cases also failed; the raw suite log remains authoritative.

Raw receipts remain in the parent lead-amendment-gates directory: test.log (interrupted original), test-resource-bounded.log (completed failed suite), and individual gate logs. An existing Linux runtime is being assessed without installations or Windows permission changes. Focused browser diagnosis runs separately; no green retry erases these failures.

No push, ruler publication or ready-PR qualification is justified while the full test gate fails.

## First isolated Linux ruler gate

Ruler89361d0daf2746a9cca9a120d96648ea2098365f was tested in an isolated Ubuntu checkout. All non-test gates exited0. Fulltest exited1:21failed/269passed/1skipped files;99failed/6519passed/3skipped tests. Root inspected the retained test-log summary. This differs from the Windows source/test inventory and is not an acceptance comparison.

Missing prerequisites included zipinfo, usable Electron postinstall and required Chromium path. Timezone/DST and a redactor performance failure also need diagnosis. Raw logs: isolated /tmp/foo-linux-gate-ruler89361d0d-20261023/gates. Package setup is proceeding using the existing WSL root user for ordinary development dependencies; no Windows security settings, credentials or thresholds are changed. Full rerun follows corrected prerequisites and focused checks, not a blind retry.

## Corrected Linux ruler gate — 21:31 IST

Exact ruler89361d0daf2746a9cca9a120d96648ea2098365f passed all nine prepush commands: spec:verify, check:copy, lint, format:check, typecheck, test, build, trace:check and fid:guard. Full suite: 6632 passed and 3 existing skipped tests; 290 passed and 1 skipped files. No skip was added. Root verified clean checkout and gate exit codes. TZ=Asia/Kolkata matches India fixture expectations; maxWorkers=2 bounds host load without changing test selection or timeouts.

Raw local receipts: /tmp/foo-linux-gate-ruler89361d0d-20261023/full-gate-max2-TZ-IST.log and gates-max2/ in Ubuntu WSL. Prerequisite repairs installed zip/unzip, supplied Chromium at the expected path and completed Electron postinstall. Repair of pre-existing interrupted dpkg also completed pending Vim configuration/upgrades. No Windows security setting changed. Earlier failures remain above.

These local receipts authorized publication of [draft PR140](https://github.com/vikas53953/foo-agent/pull/140), not feature acceptance. The sole authorized [ruler validation39983437733](https://github.com/vikas53953/foo-agent/actions/runs/39983437733) and [CI39983410751](https://github.com/vikas53953/foo-agent/actions/runs/39983410751) remain pending. Existing draft rules skip Windows CI; those checks are not green or waived. Separate lead documentation checkout gates are underway before publishing PR138 updates.

## Lead publication gate — 23:36 IST

Full suite on28060d859f704da6bccf2ff6bb60e32df55cfdcc passed:6614 tests passed,3 existing skipped;288 files passed,1 skipped. All nine prepush commands exited0 with the same Linux timezone and worker settings as the ruler. Documentation-only77e3c0d9b then passed spec, copy, format, trace and fidelity checks. Root inspected summaries at /tmp/foo-linux-gate-lead28060d85-20261023/full-gate-max2-TZ-IST.log and docs-gates-summary.log before pushing77e3c0d9b to PR138. No app source delta was included. Prior Windows failures remain preserved; Linux success does not claim Windows CI success.
