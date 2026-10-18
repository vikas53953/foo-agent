# CR-0010: M6 trace rows, the memory contracts, and the picks the M6 build makes where the spec forks

- **Asked by:** the M6 lead (ticket T1, `/mnt/project-files/foo/prep/M6-tickets.md`), 2026-10-18, while building M6
  (foo-plan §5 M6), run ahead of M5 at Vikas's request (2026-10-18 18:03Z).
- **Spec sections:** 08-0 §A.1, §B.2, §C, §G.4, §G.13; 08-1 §2.4, §2.4.1, §2.5, §3.2, §3.3; 08-3 §12, §15.2, §19.4.1;
  08-4 §24.16, §25.2; 08-5 §3.6, §5; 05-3 §5.17; 06-2 §7; 06-3 §14 C-3/C-4; 10-acceptance-1 §B (AT-072…076, AT-219);
  10-acceptance-2 §D (ART-14, ART-15c).
- **Status:** Approved by Vikas's approve-on-my-behalf rule (his message 2026-10-18 14:56Z), after the independent review in §(e), DECISIONS X-163
- **Change:** `spec/trace.csv` (rows below), `spec/constitution/DECISIONS.md` (row X-163); `scripts/golden-manifest.ts`
  (`BP_M6`) and `golden/manifest.json` regenerated (`pnpm golden:manifest`). No other `spec/` or `golden/` file changes.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows (`spec/trace.csv`), Milestone M6

| Id                    | Test file                                                                                                   | Ticket        |
| --------------------- | ----------------------------------------------------------------------------------------------------------- | ------------- |
| AT-072                | `test/e2e/m6-page.spec.ts`                                                                                  | T6            |
| AT-073                | `test/integration/m6-forget.test.ts` (engine), `test/e2e/m6-page.spec.ts` (C-3)                             | T3, T6        |
| AT-074                | `test/integration/m6-tombstone.test.ts` (re-learn), `test/integration/m6-prompt-forgotten.test.ts` (prompt) | T3, T4        |
| AT-075                | `test/integration/m6-watcher.test.ts`                                                                       | T4 (after T3) |
| AT-076                | `test/unit/m6-sensitive.test.ts` (rule), `test/integration/m6-review.test.ts` (review)                      | T2, T5        |
| AT-219                | `test/integration/m6-tidy.test.ts`                                                                          | T7            |
| ART-14 (memory part)  | `test/unit/m6-retrieval.test.ts`                                                                            | T4            |
| UX-18-01…10           | `test/fidelity/ux/UX-18.spec.ts`                                                                            | T8            |
| BP-CARD-16, BP-SCR-09 | `test/fidelity/bp/BP-m6.spec.ts`                                                                            | T8            |

Every row is `pending` until its ticket lands the test and flips it to `live` in that commit. ART-15c is a manual line in
the M6 fidelity report (no trace row: FID-18 checks automated tests only). `BP-CARD-16` = `#cardgal > .panel:nth-child(16)

> .mini`(memory chip),`BP-SCR-09`=`#scrgal > .scr:nth-child(9) > .body`("What I know about you", checked against the
Blueprint's screen list); the mini is drawn in a 350px panel, so its R2 box is disputed by construction (CR-0003 §b).
UX-18's expected disputes (pack §6: UX-18-02 chip words vs X-05, UX-18-04 "People" chip, UX-18-08 C-3 buttons, UX-18-10
Notepad line format) go to`docs/fidelity/disputes.json` with the M6 golden run; the app follows the written spec.

## (b) Picks for the M6 gaps (pack `prep/M6.md` §8; each is the pack's "Recommended" option)

1. **G-M6-01** New `MainToEngine` `{ kind: "memory.cmd"; payload: { cmd: 'add' | 'edit' | 'setPrivate' | 'setKind' | 'forget' | 'undo' | 'forgetBySource' | 'forgetAll'; …the invoke's request } }`, a request: main validates the invoke, forwards one message, returns the engine's `Result`. `memory:openFolder` stays in main.
2. **G-M6-02** The AT-219 conflict card is a Choice card with `purpose='conflict'` (08-0 §B.2 enum, 08-3 §12.7), asked when the tidy AI returns `ask` (the fake AI does so in AT-219). AT-219's "memory_confirm" wording is read as `conflict`.
3. **G-M6-03** Chat "remember …" (intake `kind:'memory'`, `op:'remember'`) reuses the manual-add path: one `classify` turn, provenance `said`, origin `chat:{chatId}/{messageId}` (the evidence is that message), the sensitive rule, 👍 + chip.
4. **G-M6-04** Chat "forget …" picks by FTS match with token overlap ≥ 0.6: exactly one → forget + chip "Forgot it. I won't use that again." with Undo 5 s; two or more → a Choice card listing up to 3 facts (`purpose: memory_confirm`, the nearest existing `ChoicePurpose`; the spec names it for "Remember that…?" only); none → a reply that nothing matched (words added by T5 under `thread.memory.*`, from J17).
5. **G-M6-05** The memory chip carries `data-state="memory"` (05-3 §5.17.1); M2's other markers keep `data-state = marker_kind`.
6. **G-M6-06** `privacy.rememberOn=false` blocks post-turn review, intake remember, `memory.propose`, style stats and tidy's merges; the Memory page's "+ Add something" (the user's own typed act, Art. 15) still saves; reads and forgets keep working.
7. **G-M6-07** C-3 and C-4 are built in M6 inside `src/renderer/screens/confirms/`; M13 reuses them.
8. **G-M6-08** Follow 08-0 §E.3 / 08-5 §5 over the plan: `messages/MemoryChip.tsx`, no `store/memory.ts` slice (page state local; the Memory page and right shell subscribe to `memory:changed`).
9. **G-M6-09** M6 ships `memory.tidy()` and the idle catch-up rule as functions tested with the fake clock (FOO_TEST `test.memoryTidy` runs it now); M7 registers the `memory_tidy` builtin and schedules it at 03:00.
10. **G-M6-10** Both activity rules stand: a single Forget on the Memory page writes no activity row; a forget from the chip writes `forgot_facts` with count 1; bulk forgets write `forgot_facts` with the count.

Picks T1 made where the spec is silent (also in implementation-notes "M6"):

11. **G-M6-11** The memory-only export (06-2 §7.4, 08-3 §19.4.1 `foo-memory-{d-Mon-yyyy}.zip`) has no channel: `data:export { folder; scope?: 'all' | 'memory' }` takes `scope: 'memory'`, returns `{ exportId }` at once and reports on `data:exportProgress` like the full export. M6 answers `scope: 'all'` with `VALIDATION` until J21's milestone. `files:pickFolder` (08-1 §3.2) lands with it.
12. **G-M6-12** The budget helpers the conflict card needs (`countToday`, `hold`, quiet check, pack §4.6) live in a new small `src/main/notify/budget.ts` that M7 extends; the pack's `NotificationService.ts` is M11's file and does not exist yet.
    13a. **G-M6-13** A fact line whose brace has no origin label reads as origin `manual` (the same as a brace-less line), and the writer always writes the label. `memory_index.origin` / `origin_kind` are NOT NULL (0001 l.356–357), so the parsed fact's origin is never null.
    13b. **G-M6-14** Slug (08-3 §12.3): after NFKC, keep `\p{L}\p{N}\p{M}-`. The spec's class `\p{L}\p{N}-` would strip the combining marks of its own example `माँ` (the candrabindu is `\p{M}`); keeping marks is what makes that example legal.
    13c. **G-M6-15** "Normalised text" for the fact hash (08-3 §12.2; tombstones and dedupe depend on it) is fixed as: NFKC, every run of white space → one space, trimmed, lower-cased; hash = lower-case hex sha256 of that, UTF-8.
    13d. **`file.write` scope.** M6 allows only memory files and helper notes; 08-1 §2.4 also names `sites\`, which the milestone that writes site notes (M9) adds to `isWritableDataFile`. Write failures other than a refused path are `DISK_FULL` (ENOSPC) or `UNKNOWN` with the OS message (for example a file Notepad holds open during a rename), never `PATH_NOT_ALLOWED`.
13. **Contract shapes.** `file.write { relPath, text, atomic: true }` is an EngineToMain request (08-1 §2.4 lists it); main writes temp + rename under `{DATA}` and accepts only `memory/*.md`, `memory/people/*.md`, `memory/preferences/*.md`, `memory/.tombstones`, `memory/.tidy-log.md` and `helpers/h_*/notes.md` (else `PATH_NOT_ALLOWED`; a full disk is `DISK_FULL`). The code catches up to 08-1 §2.4.1, which already lists the four memory tables as `WritableTable` / `HardDeletable`: `memory_index` (insert, update, delete), `memory_tombstones` and `memory_group_grants` (insert-or-replace, delete by `{hash}|{originKind}` / `{factId}|{chatId}`) and `memory_uses` (insert; the nightly purge that deletes it is M7's); a tx that moved `memory_index` runs `INSERT INTO memory_fts(memory_fts) VALUES ('rebuild')` before commit (08-1 §2.5); deleting a fact deletes its grants. Named queries: the four 08-1 §2.4.1 already names (`memoryByScope` = part 5 candidates, `memorySearch` = part 5b FTS, `memoryTombstoned`, `memoryUsedInChat`) plus five additions this CR makes, `memory.byId`, `memory.byFile`, `memory.all`, `memory.tombstones`, `memory.weekCount` (the engine gets facts with their hash). The engine sends `memory:changed` itself as a `ui.patch`. Settings gain `privacy.{rememberOn,learnFromChats,askBeforeRemembering}` (true/true/false) and `notifications.unpromptedPerDay` (3); `privacy.rememberOn` is writable through `settings:set` (the Memory page's "Turn back on"). FOO_TEST adds `test.memoryTidy`. New ErrorKinds `MEMORY_PARSE`, `TOO_LATE`, `CONFIRM_MISMATCH`, `PRIVATE_BLOCKED`, `EXPORT_SECRET_FOUND`, `DISK_FULL` (08-3 §21). 08-1 §2.4.1 says a new query is a constitution change: this CR is that change for the five added names, the `memory.cmd` and `test.memoryTidy` messages (`memory.cmd` is the one engine message per invoke of 08-1 §3.1.7; X-111 withdrew `MemoryCmd` as a page API, and the Memory page still calls only the `memory:*` invokes) and `data:export.scope`.
14. **Copy.** The M6 keys land in `en-IN.json` with T1 and are listed in `scripts/copy-pending.json` (key → ticket) until a `t()` uses them. Counts use ICU plurals (`{count, plural, one {# thing} other {# things}}`) where the spec writes `{23}`; the memory chip's keys are `memory_chip.line.*`, `memory_chip.button.*`, `memory_chip.accessible.saved` (08-0 §D's three-segment shape). Quotes are “ ” and apostrophes ’, as every existing key.

## (c) What is not changed

No migration: 0001 already has every memory table and the FTS triggers. No screen, word or flow the spec does not have.

## (d) Running ahead of M5

The ask-before-remembering Choice card (`memory_confirm`), the two-match forget Choice (G-M6-04) and the conflict card
(`conflict`) render with M5's Choice card. M6 writes their card rows now (unit- and integration-tested); their render and
e2e land in T8 after M5 is on main. The M6 PR to main opens only then.

## (e) Independent review

Ticket map reviewed by an independent Sonnet reviewer (2026-10-18 18:12Z): PASS-WITH-FIXES, 4 act and 3 consider findings,
all applied to the map (memory step tools in T5, the export contract in T1, the right-shell refresh in T6, `Engine.ts`
slots in T1; budget file noted as G-M6-12, `intakeMemory.ts` = the memory half of intake, prompt-file owners, week count,
ART-15c, chip-forget activity). This CR, by an independent Fable reviewer (2026-10-18 18:24Z): PASS-WITH-FIXES; act 1 (X-163 + manifest in the same commit) and act 2 (the tables were already writable in 08-1 §2.4.1) applied; consider 3 (reuse the four 08-1 query names) and 4 (record the `memory_confirm` reuse) applied. Approved on Vikas's behalf. G-M6-13…15 and 13d were added after the M6 monitor's pass 2 (2026-10-18 18:32Z) on T2's PR #12; they pick the spec's own example or the most conservative reading.
