# FIX-mode comparable baseline (2026-10-23)

This parent-side baseline records receipt metrics for the three comparable four-shard runs. It is a tracking baseline only; it makes no product, feature, acceptance, or current-main claim. The requested `at least 44` target is retained as a tracking target, not as a score.

## Provenance

| label                                    |                                                                        workflow | tested app commit                                                                                                                     | immutable evidence commit                                                                                                             | evidence root                                                                                                                          | local source shards                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `cdf39842693012` (workflow 39842693012)  | [39842693012](https://github.com/vikas53953/foo-agent/actions/runs/39842693012) | [`cdf2f6559fa57f1e8493323b2c5da1bcc2ff0851`](https://github.com/vikas53953/foo-agent/commit/cdf2f6559fa57f1e8493323b2c5da1bcc2ff0851) | [`2d83e6fa1af2d5bbf727df667d5e4ec78a3ff4f4`](https://github.com/vikas53953/foo-agent/commit/2d83e6fa1af2d5bbf727df667d5e4ec78a3ff4f4) | [real-ai/cdf2f65-claude](https://github.com/vikas53953/foo-agent/tree/2d83e6fa1af2d5bbf727df667d5e4ec78a3ff4f4/real-ai/cdf2f65-claude) | `review39842693012-evidence` (s0/s1) + `evidence-sparse-39842693012` (s2/s3) |
| `f20639828661301` (workflow 39828661301) | [39828661301](https://github.com/vikas53953/foo-agent/actions/runs/39828661301) | [`f2061bf27660f870fde3d22bddc9b436002c50bd`](https://github.com/vikas53953/foo-agent/commit/f2061bf27660f870fde3d22bddc9b436002c50bd) | [`8e36f74e2e7c2193f80429ebb4e926ae505f8092`](https://github.com/vikas53953/foo-agent/commit/8e36f74e2e7c2193f80429ebb4e926ae505f8092) | [real-ai/f2061bf-claude](https://github.com/vikas53953/foo-agent/tree/8e36f74e2e7c2193f80429ebb4e926ae505f8092/real-ai/f2061bf-claude) | `run39828661301-s01-evidence` (s0/s1) + `review39828661301-s23-work` (s2/s3) |
| `c439887449456` (workflow 39887449456)   | [39887449456](https://github.com/vikas53953/foo-agent/actions/runs/39887449456) | [`c4d41876055bf5608ee7e776ce332b95c7ce2b49`](https://github.com/vikas53953/foo-agent/commit/c4d41876055bf5608ee7e776ce332b95c7ce2b49) | [`822a7a5d452c9292de814116eb12c6c4e51aebbd`](https://github.com/vikas53953/foo-agent/commit/822a7a5d452c9292de814116eb12c6c4e51aebbd) | [real-ai/c4d4187-claude](https://github.com/vikas53953/foo-agent/tree/822a7a5d452c9292de814116eb12c6c4e51aebbd/real-ai/c4d4187-claude) | `review39887449456-evidence` (s0/s1) + `evidence-sparse-39887449456` (s2/s3) |

All three tested refs are the `codex/evidence-audit-2026-10-22` branch family and are separate from `main`; these metrics must not be promoted as current-main proof.

## Metric definitions

- **Execution row**: one journey directory containing both `summary.json` and `log.jsonl`; all four shard records are retained.
- **Actual-step strict-clean**: an execution row whose `log.jsonl` numbered records have an integer `i`, no auxiliary `step` field, and contain no `ok:false`. This excludes `launch`, `cleanup`, `appLog`, `aiTurns`, and `step:recheck` records, while retaining every initial numbered failure, including `soft:true`; later rechecks cannot erase it.
- **Summary-results clean**: an execution row whose `summary.json.results` contains no `ok:false`. This is retained for comparison only because the summary result objects can be late-mutated to `ok:true` and are not a raw failure ledger.
- **Summary-clean**: an execution row with `summary.json.failed == 0`.
- **waitReply**: count of `summary.json.results` rows whose `do` is `waitReply`; this is a result-record count, not an execution count.
- **Empty reply**: a `waitReply` result with a missing/blank `lastReply`; in these runs it equals the `firstReplyMs == null` count. `lastReply == null` is reported separately.
- **Actual-step total** and **actual-step `ok:false` total** are included as denominator checks for the corrected strict metric.

## Aggregate receipts

| run | exec rows | unique journeys | duplicate rows retained | actual-step strict-clean | summary-results clean | summary-clean | actual-step ok:false | summary-results ok:false | actual-step records | waitReply records | empty lastReply | null firstReplyMs | null lastReply |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `cdf39842693012` | 62 | 59 | `J01-J02-first-run` × 4 | 15 | 21 | 26 | 255 | 217 | 1171 | 221 | 14 | 14 | 0 |
| `f20639828661301` | 62 | 59 | `J01-J02-first-run` × 4 | 25 | 29 | 42 | 228 | 188 | 1128 | 220 | 19 | 19 | 0 |
| `c439887449456` | 62 | 59 | `J01-J02-first-run` × 4 | 15 | 20 | 24 | 262 | 223 | 1171 | 221 | 18 | 18 | 0 |

Shard shape is `s0=16`, `s1=16`, `s2=15`, `s3=15` execution rows for each run. The inventory is 59 unique journeys in every run; there are no missing or extra journey labels. `waitReply` is 221 / 220 / 221 for CDF / F206 / C439 respectively. `null lastReply` is zero in all three runs. The canonical partition intentionally ignores alternate sparse copies (including the copied `s0` under `evidence-sparse-39887449456`); including that copy would inflate C439 to 78 execution rows and double-count 16 labels.

## Per-journey comparable deltas

Tuple format is `SC/AC/SR/AF/SF/W/E`: summary-clean execution rows / actual-step strict-clean execution rows / summary-results-clean execution rows / actual numbered-step `ok:false` records / summary-result `ok:false` records / waitReply result rows / empty `lastReply` rows (and therefore null `firstReplyMs` rows). `ΔF` and `ΔC` are F206-minus-CDF and C439-minus-CDF for that tuple. A four-row tuple for `J01-J02-first-run` is intentional.

| journey                           | exec | CDF              | F206             | ΔF               | C439             | ΔC               |
| --------------------------------- | ---: | ---------------- | ---------------- | ---------------- | ---------------- | ---------------- |
| `B01-chat-rules`                  |    1 | 1/1/1/0/0/1/0    | 1/0/0/1/1/1/0    | 0/-1/-1/1/1/0/0  | 1/1/1/0/0/1/0    | 0/0/0/0/0/0/0    |
| `B02-choice`                      |    1 | 0/0/0/1/1/2/0    | 1/1/1/0/0/2/0    | 1/1/1/-1/-1/0/0  | 0/0/0/1/1/2/0    | 0/0/0/0/0/0/0    |
| `B03-web-local`                   |    1 | 0/0/0/4/4/1/0    | 0/0/0/4/4/1/0    | 0/0/0/0/0/0/0    | 0/0/0/5/5/1/0    | 0/0/0/1/1/0/0    |
| `B04-stop`                        |    1 | 0/0/0/1/1/2/0    | 0/0/0/1/1/2/0    | 0/0/0/0/0/0/0    | 0/0/0/1/1/2/0    | 0/0/0/0/0/0/0    |
| `B05-restart`                     |    1 | 0/0/0/4/4/1/0    | 0/0/0/3/3/1/0    | 0/0/0/-1/-1/0/0  | 0/0/0/4/3/1/0    | 0/0/0/0/-1/0/0   |
| `B06-booking-options`             |    1 | 0/0/0/3/3/1/0    | 0/0/0/3/3/1/0    | 0/0/0/0/0/0/0    | 0/0/0/1/1/1/0    | 0/0/0/-2/-2/0/0  |
| `B07-live`                        |    1 | 0/0/0/12/11/1/0  | 0/0/0/19/17/1/0  | 0/0/0/7/6/0/0    | 0/0/0/13/12/1/0  | 0/0/0/1/1/0/0    |
| `B08-bank`                        |    1 | 1/0/1/1/0/1/0    | 1/0/1/1/0/1/0    | 0/0/0/0/0/0/0    | 1/0/1/1/0/1/0    | 0/0/0/0/0/0/0    |
| `B09-kit`                         |    1 | 0/0/0/2/2/8/0    | 0/0/0/2/2/8/0    | 0/0/0/0/0/0/0    | 0/0/0/2/2/8/0    | 0/0/0/0/0/0/0    |
| `B10-paste-secret`                |    1 | 1/1/1/0/0/0/0    | 1/1/1/0/0/0/0    | 0/0/0/0/0/0/0    | 1/1/1/0/0/0/0    | 0/0/0/0/0/0/0    |
| `B11-zoom-appearance`             |    1 | 1/1/1/0/0/0/0    | 1/1/1/0/0/0/0    | 0/0/0/0/0/0/0    | 1/1/1/0/0/0/0    | 0/0/0/0/0/0/0    |
| `B12-languages`                   |    1 | 0/0/0/1/1/3/0    | 1/1/1/0/0/3/0    | 1/1/1/-1/-1/0/0  | 0/0/0/1/1/3/0    | 0/0/0/0/0/0/0    |
| `B13-no-apps-honesty`             |    1 | 1/0/0/2/2/2/0    | 1/0/0/2/2/2/0    | 0/0/0/0/0/0/0    | 1/0/0/2/2/2/0    | 0/0/0/0/0/0/0    |
| `B14-restart-mid-reply`           |    1 | 0/0/0/1/1/2/0    | 1/1/1/0/0/2/0    | 1/1/1/-1/-1/0/0  | 0/0/0/1/1/2/0    | 0/0/0/0/0/0/0    |
| `J01-J02-first-run`               |    4 | 4/4/4/0/0/0/0    | 4/4/4/0/0/0/0    | 0/0/0/0/0/0/0    | 4/4/4/0/0/0/0    | 0/0/0/0/0/0/0    |
| `J05-web`                         |    1 | 0/0/0/3/3/1/0    | 0/0/0/2/2/1/0    | 0/0/0/-1/-1/0/0  | 0/0/0/3/3/1/0    | 0/0/0/0/0/0/0    |
| `J07-chat`                        |    1 | 1/1/1/0/0/3/0    | 0/0/0/1/1/3/0    | -1/-1/-1/1/1/0/0 | 1/1/1/0/0/3/0    | 0/0/0/0/0/0/0    |
| `J08-choice`                      |    1 | 0/0/0/3/3/1/0    | 1/1/1/0/0/1/0    | 1/1/1/-3/-3/0/0  | 0/0/0/3/3/1/0    | 0/0/0/0/0/0/0    |
| `J09-J18-booking`                 |    1 | 0/0/0/2/2/1/0    | 0/0/0/2/2/1/0    | 0/0/0/0/0/0/0    | 0/0/0/2/2/1/0    | 0/0/0/0/0/0/0    |
| `J10-hotel`                       |    1 | 0/0/0/2/2/1/0    | 0/0/0/1/1/1/0    | 0/0/0/-1/-1/0/0  | 0/0/0/1/1/1/0    | 0/0/0/-1/-1/0/0  |
| `J12-draft`                       |    1 | 0/0/0/1/1/1/0    | 0/0/0/1/1/1/0    | 0/0/0/0/0/0/0    | 0/0/0/1/1/1/0    | 0/0/0/0/0/0/0    |
| `J15-helper`                      |    1 | 1/0/0/1/1/0/0    | 1/0/0/1/1/0/0    | 0/0/0/0/0/0/0    | 1/0/0/1/1/0/0    | 0/0/0/0/0/0/0    |
| `J17-memory`                      |    1 | 1/0/1/1/0/2/0    | 1/1/1/0/0/2/0    | 0/1/0/-1/0/0/0   | 1/0/1/1/0/2/0    | 0/0/0/0/0/0/0    |
| `J21-J22-settings-search`         |    1 | 1/1/1/0/0/0/0    | 1/1/1/0/0/0/0    | 0/0/0/0/0/0/0    | 1/1/1/0/0/0/0    | 0/0/0/0/0/0/0    |
| `R-ai-pages`                      |    1 | 0/0/0/17/10/23/0 | 0/0/0/17/10/23/0 | 0/0/0/0/0/0/0    | 0/0/0/17/10/23/0 | 0/0/0/0/0/0/0    |
| `R-approvals`                     |    1 | 0/0/0/39/37/39/0 | 0/0/0/42/37/39/5 | 0/0/0/3/0/0/5    | 0/0/0/35/34/39/1 | 0/0/0/-4/-3/0/1  |
| `R-chat-rules`                    |    1 | 1/0/1/1/0/5/0    | 1/0/1/2/0/5/0    | 0/0/0/1/0/0/0    | 1/0/1/3/0/5/0    | 0/0/0/2/0/0/0    |
| `R-dark`                          |    1 | 1/0/1/4/0/6/4    | 1/0/1/4/0/6/4    | 0/0/0/0/0/0/0    | 1/0/1/5/0/6/5    | 0/0/0/1/0/0/1    |
| `R-jobs`                          |    1 | 0/0/0/40/37/31/0 | 0/0/0/38/35/31/0 | 0/0/0/-2/-2/0/0  | 0/0/0/39/36/31/0 | 0/0/0/-1/-1/0/0  |
| `R-kit-1`                         |    1 | 1/0/1/2/0/18/0   | 0/0/0/1/1/18/0   | -1/0/-1/-1/1/0/0 | 0/0/0/9/9/18/2   | -1/0/-1/7/9/0/2  |
| `R-kit-2`                         |    1 | 0/0/0/21/16/21/4 | 0/0/0/29/20/21/4 | 0/0/0/8/4/0/0    | 0/0/0/24/20/21/4 | 0/0/0/3/4/0/0    |
| `R-reply-area`                    |    1 | 0/0/0/9/6/9/5    | 0/0/0/8/6/9/5    | 0/0/0/-1/0/0/0   | 0/0/0/9/6/9/4    | 0/0/0/0/0/0/-1   |
| `R1-rich`                         |    1 | 0/0/0/1/1/2/0    | 0/0/0/2/2/2/0    | 0/0/0/1/1/0/0    | 0/0/0/1/1/2/0    | 0/0/0/0/0/0/0    |
| `U01-bubble-menu`                 |    1 | 0/0/0/2/1/3/0    | 1/1/1/0/0/3/0    | 1/1/1/-2/-1/0/0  | 0/0/0/4/4/3/1    | 0/0/0/2/3/0/1    |
| `U02-reactions-thanks`            |    1 | 1/0/1/1/0/1/0    | 1/1/1/0/0/1/0    | 0/1/0/-1/0/0/0   | 1/0/1/1/0/1/0    | 0/0/0/0/0/0/0    |
| `U03-select-delete`               |    1 | 1/1/1/0/0/1/0    | 1/1/1/0/0/1/0    | 0/0/0/0/0/0/0    | 1/1/1/0/0/1/0    | 0/0/0/0/0/0/0    |
| `U04-find-in-chat`                |    1 | 0/0/0/1/1/1/0    | 1/1/1/0/0/1/0    | 1/1/1/-1/-1/0/0  | 0/0/0/1/1/1/0    | 0/0/0/0/0/0/0    |
| `U05-chat-list`                   |    1 | 1/0/0/7/5/0/0    | 1/0/0/7/5/0/0    | 0/0/0/0/0/0/0    | 1/0/0/7/5/0/0    | 0/0/0/0/0/0/0    |
| `U06-header-panel`                |    1 | 0/0/0/3/3/0/0    | 1/0/0/2/2/0/0    | 1/0/0/-1/-1/0/0  | 0/0/0/3/3/0/0    | 0/0/0/0/0/0/0    |
| `U07-composer`                    |    1 | 1/1/1/0/0/0/0    | 1/1/1/0/0/0/0    | 0/0/0/0/0/0/0    | 1/1/1/0/0/0/0    | 0/0/0/0/0/0/0    |
| `U08-rich-text`                   |    1 | 1/0/0/1/1/3/0    | 1/0/0/1/1/3/0    | 0/0/0/0/0/0/0    | 0/0/0/2/2/3/0    | -1/0/0/1/1/0/0   |
| `U09-plan-checklist`              |    1 | 0/0/0/4/4/1/0    | 1/0/0/2/1/1/0    | 1/0/0/-2/-3/0/0  | 0/0/0/3/2/1/0    | 0/0/0/-1/-2/0/0  |
| `U10-plan-change-stop`            |    1 | 0/0/0/2/2/2/0    | 1/1/1/0/0/2/0    | 1/1/1/-2/-2/0/0  | 0/0/0/2/2/2/0    | 0/0/0/0/0/0/0    |
| `U11-approval-states`             |    1 | 0/0/0/7/7/2/0    | 1/0/0/5/5/1/0    | 1/0/0/-2/-2/-1/0 | 0/0/0/9/8/2/0    | 0/0/0/2/1/0/0    |
| `U12-choice-variants`             |    1 | 0/0/0/3/3/4/0    | 1/1/1/0/0/4/0    | 1/1/1/-3/-3/0/0  | 0/0/0/2/2/4/1    | 0/0/0/-1/-1/0/1  |
| `U13-secret-box`                  |    1 | 0/0/0/10/9/0/0   | 1/0/0/7/6/0/0    | 1/0/0/-3/-3/0/0  | 0/0/0/10/9/0/0   | 0/0/0/0/0/0/0    |
| `U14-memory`                      |    1 | 1/1/1/0/0/2/0    | 1/1/1/0/0/2/0    | 0/0/0/0/0/0/0    | 1/1/1/0/0/2/0    | 0/0/0/0/0/0/0    |
| `U15-routines`                    |    1 | 0/0/0/2/2/1/0    | 1/0/0/1/1/1/0    | 1/0/0/-1/-1/0/0  | 0/0/0/2/2/1/0    | 0/0/0/0/0/0/0    |
| `U16-settings-all`                |    1 | 1/1/1/0/0/0/0    | 1/1/1/0/0/0/0    | 0/0/0/0/0/0/0    | 1/1/1/0/0/0/0    | 0/0/0/0/0/0/0    |
| `U17-settings-by-chat`            |    1 | 0/0/0/3/3/1/1    | 0/0/0/3/3/1/1    | 0/0/0/0/0/0/0    | 1/0/0/2/2/1/0    | 1/0/0/-1/-1/0/-1 |
| `U18-new-helper-group`            |    1 | 0/0/0/3/3/0/0    | 1/1/1/0/0/0/0    | 1/1/1/-3/-3/0/0  | 0/0/0/3/3/0/0    | 0/0/0/0/0/0/0    |
| `U19-screens`                     |    1 | 0/0/0/11/10/0/0  | 1/0/0/7/7/0/0    | 1/0/0/-4/-3/0/0  | 0/0/0/11/10/0/0  | 0/0/0/0/0/0/0    |
| `U20-errors-honesty`              |    1 | 0/0/0/5/5/3/0    | 1/0/0/1/1/3/0    | 1/0/0/-4/-4/0/0  | 0/0/0/3/3/3/0    | 0/0/0/-2/-2/0/0  |
| `U21-window-dialogs`              |    1 | 0/0/0/3/3/1/0    | 1/1/1/0/0/1/0    | 1/1/1/-3/-3/0/0  | 0/0/0/3/3/1/0    | 0/0/0/0/0/0/0    |
| `U22-face-polish`                 |    1 | 1/0/0/2/1/1/0    | 1/0/0/1/1/1/0    | 0/0/0/-1/0/0/0   | 0/0/0/3/2/1/0    | -1/0/0/1/1/0/0   |
| `U23-ai-page-chips`               |    1 | 0/0/0/4/4/1/0    | 0/0/0/3/3/1/0    | 0/0/0/-1/-1/0/0  | 0/0/0/3/3/1/0    | 0/0/0/-1/-1/0/0  |
| `U25-anatomy-composer`            |    1 | 0/0/0/2/1/1/0    | 1/0/1/1/0/1/0    | 1/0/1/-1/-1/0/0  | 0/0/0/2/1/1/0    | 0/0/0/0/0/0/0    |
| `U26-crash-reopen`                |    1 | 1/1/1/0/0/0/0    | 1/1/1/0/0/0/0    | 0/0/0/0/0/0/0    | 1/1/1/0/0/0/0    | 0/0/0/0/0/0/0    |
| `U27-composer-no-dropped-letters` |    1 | 1/1/1/0/0/3/0    | 1/1/1/0/0/3/0    | 0/0/0/0/0/0/0    | 1/1/1/0/0/3/0    | 0/0/0/0/0/0/0    |

## Interpretation limits

- These are reproducible receipt counts from immutable artifact folders, not acceptance results. A clean summary or raw step ledger does not establish that every feature predicate was visibly exercised.
- The summary-results-clean metric is deliberately shown beside the corrected actual-step strict-clean metric; they differ because late/recheck bookkeeping can mutate summary objects.
- The F206 and C439 deltas show run-to-run evidence/harness variation, including changed `waitReply`/empty-reply behavior; they do not establish a product regression or improvement.
- Keep the four J01/J02 first-run records in any FIX-mode ledger or audit trail. Use the 59-label view only to compare inventory and avoid double-counting when a separate unique-journey summary is desired.
- No credentials, reply bodies, screenshot pixels, or raw secret-like fixture values are copied here.
