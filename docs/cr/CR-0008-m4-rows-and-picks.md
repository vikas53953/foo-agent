# CR-0008: M4 trace rows, the job machine, and the picks the M4 build makes where the spec forks

- **Asked by:** the M4 integrator (ticket T1, `docs/tickets/M4.md`), 2026-10-18, while building M4 (foo-plan §5 M4).
- **Spec sections:** 07-journeys-2 §4, §7.4.3 (SM-A1…A13), 08-0 §B.2, §F, §G.2, §G.4, 08-1 §2.3, §2.4, §2.4.1, §3.2, §4.1.2,
  §4.3.4, §4.5, 08-2 §5, 08-3 §21, 08-4 §26.1, §31, 05-1 §5.2, 05-3 §5.12–§5.21, 10-acceptance-1 §B, 10-acceptance-2 §D–§E,
  11-fidelity §11.5 (FID-16/17).
- **Status:** Approved by Vikas's approve-on-my-behalf rule (his message 2026-10-18 14:56Z), after the independent review in §(e), DECISIONS X-161
- **Change:** `spec/trace.csv` (rows below), `spec/state-machines.json` (new, written by `scripts/extract-sm.ts`),
  `spec/spec-values.json` (SV-34 `pending: M6`), `spec/constitution/DECISIONS.md` (row X-161); `scripts/golden-manifest.ts`
  (`BP_M4`, `EARLY_STEPS`) and `golden/manifest.json` regenerated (`pnpm golden:manifest`). No other `spec/` or `golden/` file
  changes.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows (`spec/trace.csv`), Milestone M4

| Id                                                                                   | Test file                                          | Status  |
| ------------------------------------------------------------------------------------ | -------------------------------------------------- | ------- |
| AT-019                                                                               | `test/integration/jobs/AT-019.test.ts`             | pending |
| AT-077, AT-107                                                                       | `test/integration/jobs/stop.test.ts`               | pending |
| AT-081                                                                               | `test/e2e/m4-offline.spec.ts`                      | pending |
| AT-083                                                                               | `test/integration/jobs/cap.test.ts`                | pending |
| AT-084, AT-116                                                                       | `test/integration/jobs/stuck.test.ts`              | pending |
| AT-089                                                                               | `test/integration/jobs/quit.test.ts`               | pending |
| AT-105                                                                               | `test/unit/jobs/queue.test.ts`                     | pending |
| AT-106                                                                               | `test/integration/jobs/start.test.ts`              | pending |
| AT-108, AT-109                                                                       | `test/integration/jobs/needs-you.test.ts`          | pending |
| AT-112, AT-113                                                                       | `test/integration/jobs/waiting.test.ts`            | pending |
| AT-114, AT-115                                                                       | `test/integration/jobs/finish.test.ts`             | pending |
| AT-116a                                                                              | `test/unit/jobs/watchdog.test.ts`                  | pending |
| AT-117                                                                               | `test/integration/jobs/fail.test.ts`               | pending |
| AT-118                                                                               | `test/integration/jobs/recovery.test.ts`           | pending |
| AT-118a                                                                              | `test/integration/db/rebuild.test.ts`              | pending |
| AT-119                                                                               | `test/integration/jobs/ai-words.test.ts`           | pending |
| AT-120                                                                               | `test/integration/jobs/retry.test.ts`              | pending |
| AT-281                                                                               | `test/e2e/m4-panel.spec.ts`                        | pending |
| AT-282                                                                               | `test/e2e/m4-notices.spec.ts`                      | pending |
| AT-286, AT-287                                                                       | `test/e2e/m4-list.spec.ts`                         | pending |
| ART-11, ART-12a, ART-12b, ART-13a, ART-13c, ART-16, ART-17, ART-18a, ART-18b, ART-22 | `test/articles/ART-{11,12,13,16,17,18,22}.test.ts` | pending |
| PERF-06                                                                              | `test/perf/PERF-06.test.ts`                        | pending |
| PERF-07, PERF-08, PERF-11                                                            | `test/e2e/m4-jobs.spec.ts`                         | pending |
| UX-23-01…06, UX-23-09, UX-23-11                                                      | `test/fidelity/ux/UX-23.errors.spec.ts`            | pending |
| UX-05-02, UX-05-03, UX-05-04                                                         | `test/fidelity/ux/UX-05.first.spec.ts`             | pending |
| BP-CARD-02, -12, -15, -18, -19, -20                                                  | `test/fidelity/bp/BP-cards-m4.spec.ts`             | pending |

Every row is `pending` until its ticket (T2–T7) lands the test and flips it to `live` in the same commit (FID-18 checks
live rows only). FID-16 and FID-17 have no trace row: FID-18's id set is AT / ART / PERF / UX / BP, and the FID-nn checks are
tracked by 11-fidelity §11.13 itself (like FID-01…FID-19 today). FID-16 runs live in `test/fidelity/sm/FID-16.test.ts`;
FID-17 (fast-check random walks) is T2's `test/fidelity/sm/FID-17.test.ts`. `test/integration/**` and `test/perf/**` are not
in `vitest.config.ts` yet: the ticket that adds the first file there adds the folder to `include`.

Blueprint ids (`scripts/golden-manifest.ts` `BP_M4`): `#cardgal > .panel:nth-child(n) > .mini` for n = 2 Checklist, 12 Plan,
15 Proof, 18 Stuck, 19 Error, 20 Spend cap. They are drawn in 350px panels, so their R2 boxes are disputed by construction
(CR-0003 §b): the dispute rows go to `docs/fidelity/disputes.json` with the M4 golden run. `EARLY_STEPS` gains UX-23-01…06,
-09, -11 and UX-05-02…04 as `M4` (G-PREP-02); UX-23-07/-08 stay with M10, UX-23-10 with M11.

## (b) Picks for the M4 gaps (pack `prep/M4.md` §8; each is the pack's "Recommended" option)

1. **G-M4-01** Try again makes a new job (`origin='retry'`, `origin_ref` = old id, title "Trying again: {title}"); the old job never returns to WORKING. 08-1 §2.4's `job.retry` comment ("re-enters WORKING") is withdrawn; the message carries `{ jobId, newJobId }` (main allocates the id that `job:retry` returns).
2. **G-M4-02** Resume never posts a new message: waiting reasons app_quit / windows_shutdown / asleep → checklist edit only; other reasons → the error card is edited in place ("Back on it. Picking up from step {n}.", state `fixed`/`resumed`).
3. **G-M4-03** Forward-only migration `0002_routes.sql` widens `jobs.route` and `steps.route` to the five `Route` values (table rebuild, foreign keys off around it, `foreign_key_check` before commit).
4. **G-M4-04** New `MainToEngine` `{ kind: "jobs.pauseAll"; payload: { reason: "app_quit" | "windows_shutdown" } }`, a request acked before `app.exit(0)`; Windows shutdown still arrives as `power { event: 'shutdown' }`.
5. **G-M4-05** M4 builds `engine/tools/ToolLayer.ts`, a `GateLogic.decide` stub (read/prepare → EXECUTE, else REFUSE) and fake test tools; M5 replaces the stub.
6. **G-M4-06** Every CANCELLED job shows badge `stopped` ⛔ and checklist state `stopped`; the "Stopped by you" row is written only for user stop reasons (user_word, user_button, stop_all, stuck_stop, window_closed).
7. **G-M4-07** `slow` stays derived (no DDL column), computed from the running step's `started_at` / the last `steps.finished_at`; `rows.ts` is fixed (T6).
8. **G-M4-08** SV-34 (undo bar 48px) moves to M6 (Memory "Forget" is the first undo bar).
9. **G-M4-09** The renderer maps each `FixAction` to an existing channel; one new invoke `error:fix { cardId; nonce; action: FixAction; resolvedBy }` (main checks the action against the card's payload) covers `dismiss`, `remind_at` and `use_backup`.
10. **G-M4-10** M4 builds only the AI variant of the Spend-cap card; M10 decides the purchase-cap surface by CR.
11. **G-M4-11** Stop on a stuck card posts the `thread.stop.report.*` line built from activity rows, then the partial results as the AI's redacted result text.
12. **G-M4-12** M4 builds the whole 04-2 §23.2a stacked notice list (both sources) and registers `composer-error`, `composer-error-copy`, `composer-error-dismiss`, `composer-errors-clear`; the AT-282 row stays M4.
13. **G-M4-13** Main decides safe mode from `launches.json` and tells the engine (a `safeMode` flag on the first `settings.changed` after fork); the engine never reads the file.
14. **G-M4-14** The anchored stop regex wins only for the bare word: "cancel" stops, "cancel my booking" is the `delete` verb (both are unit cases).
15. **G-M4-15** 02 F7 and SV-31 win: card state changes animate with `--m-card` (167 ms; reduced motion a cross-fade ≤ 83 ms, no height animation).

Picks T1 made where the spec is silent (also in implementation-notes "M4"):

16. **G-M4-16** Resolves a conflict: 08-1 §2.3 step 4 and AT-089 say `jobs.pauseAll` makes every unfinished job `waiting`, but 07-2 §4 has no queued→waiting or needs_you→waiting move and 08-4 §26.10 would resume a NEEDS_YOU job past the user's answer. Pick: `jobs.pauseAll` moves WORKING jobs only to WAITING (`app_quit` / `windows_shutdown`). QUEUED jobs stay queued (nothing ran) and NEEDS_YOU jobs keep waiting on the user (their cards keep `expires_at`, 08-1 §2.3 step 4).
17. **G-M4-17** A WAITING job's bubble badge stays `working` 🛠 (04 §4.2 replaces `working` only when the job needs the user or ends; the `waiting_ai` tooltip is for a queued message). The pill says "Paused" and the error card explains.
18. **Contract shapes.** DbOp `mirror` keeps 08-1's shape `{ kind: 'job_state' | 'plan_md', id, text }`; `transition` also takes `cards` (card states are validated against 08-0 §G.2 on every write, failure `VALIDATION` per 08-1 §4.5.1); `jobs.state` changes only through `transition` (an `update` naming it is `DB_NOT_WRITABLE`); `activity` rows go only through op `activity` (camelCase `ActivityRow` without id/at). `card.answered` is `{ cardId, choice?, text?, answer?: CardAnswer, resolvedBy }` (08-1's `{ cardId, answer }` plus the named choice the M4 cards answer with). FOO_TEST adds `test.jobEvent { jobId, event }`. Named queries get the injected clock (`JobRow.slow`). 08-1 §2.4.1 says a new writable table or query is a constitution change: this CR is that change for the rows above.
19. **Copy.** Money placeholders hold `formatInr()` output, so the templates drop the "₹" the spec writes before `{x}` / `{cap}` (as `banner.ai_cap.text` did in M1); straight apostrophes are stored as ’ (as every existing key). Keys landed before the ticket that renders them are listed in `scripts/copy-pending.json` and count as used by `check:copy` until a `t()` call uses them (the list must be empty at M4 close-out); the 08-4 §26.1 phrase keys are checked against `PHRASES`.

## (c) Job machine (`spec/state-machines.json`)

`scripts/extract-sm.ts` writes the job machine from 07-2 §4 with SM-A1…A13, X-80 and the picks above: 8 states (stored
lower_snake, SM-A13), 23 events, 32 transitions with badge / pill / checklist side effects, the forbidden (from, to) pairs and
the FID-17 invariants. It fails when the 07-2 §4 table names a From → To pair the machine lacks. `src/shared/jobMachine.ts`
is the table the runner and main's `db.tx` guard use; FID-16 checks it against the JSON cell by cell. The approval machine
(07-2 §5) is added by M5's CR.

## (d) Not changed

The renderer reducers, `shared/ipc.ts` events and the IPC handlers belong to T5/T6; `steps:upsert` (08-1 §3.3) is not wired
yet (T5 asks for it when the checklist needs it).

## (e) Independent review

Fable reviewer, 2026-10-18 ~17:20Z, read-only, against 07-2 §4 + SM-A1…A13, DECISIONS X-17/61/80/124/125/129/131, 08-4 §26.1,
08-1 §2.4/§2.4.1/§4.2/§4.3 and the pack's G-M4 list. **Verdict: PASS**, no "act" findings.

- G-M4-01…15 are the pack's recommended options and stay inside the cited spec lines; no approved screen or copy changes.
- `spec/state-machines.json` matches 07-2 §4 + SM-A + X-80 (all 14 rows; extra events each sourced; terminal states have
  no exits); `jobMachine.ts` equals the JSON; `PHRASES` matches 08-4 §26.1 word for word (36 keys, slots, "—" = null).
- Migration 0002 is forward-only, uses the §4.2 item 2 rebuild recipe, differs from 0001 only in the two route CHECKs.
- Considered and applied: §(b)16 now names the conflict it resolves. Spec-keeper list: X-161 supersedes 08-1 §4.3 lines
  690 / 717 (route CHECKs), §2.4 line 207 (`job.retry` "re-enters WORKING"), §2.4 line 188 (`card.answered` shape) and
  §2.4.1 line 240 (`transition` tables, now with `cards`).

Recorded as approved on Vikas's behalf under his standing rule (his message 2026-10-18 14:56Z: "take care of it on my
behalf and then keep on working"); listed for his later review.
