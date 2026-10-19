# CR-0009: M5 trace rows, the approval machine, and the picks the M5 build makes where the spec forks

- **Asked by:** the M5 ticket T1 builder (`/mnt/project-files/foo/prep/M5-tickets.md` T1), 2026-10-18, while building M5
  (foo-plan §5 M5).
- **Spec sections:** 07-journeys-2 §5 (approval machine), §7.4.3 (SM-A4…A9), 08-0 §C, §G.2, §G.3, §G.7, 08-1 §2.4, §3.2,
  §4.5.1, 08-2 §5.7, §5.9, §9.1, §9.3, §9.4.2, §9.5, §9.6, 08-4 §25.1, §26.5, §26.7, 05-1 §0.4, §0.8, §5.3, §5.4, 05-2 §5.5, §5.7,
  §5.8, §5.9, 10-acceptance-1 §B, 10-acceptance-2 §D, 11-fidelity §11.5 (FID-16/17), X-65, X-125.
- **Status:** Approved by Vikas's approve-on-my-behalf rule (his message 2026-10-18 14:56Z), after the independent review in §(f), DECISIONS X-162
- **Change:** `spec/trace.csv` (rows below), `spec/state-machines.json` (approval machine added by `scripts/extract-sm.ts`),
  `spec/constitution/DECISIONS.md` (row X-162); `scripts/golden-manifest.ts` (`BP_M5`, `EARLY_STEPS`, new `STEP_MILESTONE`)
  and `golden/manifest.json` regenerated (`pnpm golden:manifest`). No other `spec/` or `golden/` file changes.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows (`spec/trace.csv`), Milestone M5

| Id                                                          | Test file                                        | Ticket |
| ----------------------------------------------------------- | ------------------------------------------------ | ------ |
| AT-008                                                      | `test/integration/vault/AT-008.test.ts`          | T2     |
| AT-009 (Secret box half, G-M5-10)                           | `test/e2e/m5-secret.spec.ts`                     | T2     |
| AT-016 (Choice `purpose:'setup'`, G-M5-11), AT-035, AT-035a | `test/unit/choice/typed.test.ts`                 | T5     |
| AT-032, AT-035, AT-288                                      | `test/e2e/m5-choice.spec.ts`                     | T5     |
| AT-033, AT-034                                              | `test/integration/choice/timeouts.test.ts`       | T8     |
| AT-077a                                                     | `test/integration/jobs/stop-which.test.ts`       | T8     |
| AT-077b                                                     | `test/integration/approvals/steer.test.ts`       | T8     |
| AT-085, ART-02c                                             | `test/articles/ART-02c.test.ts`                  | T9     |
| AT-110                                                      | `test/integration/approvals/decline.test.ts`     | T7     |
| AT-111 (approval part), AT-127                              | `test/integration/approvals/expiry.test.ts`      | T4     |
| AT-111 (job half), AT-128 (job half)                        | `test/integration/approvals/expiry-job.test.ts`  | T7     |
| AT-121                                                      | `test/unit/approvals/expiry.test.ts`             | T4     |
| AT-122, AT-126, AT-127, AT-280                              | `test/e2e/m5-approval.spec.ts`                   | T4     |
| AT-123                                                      | `test/integration/approvals/second-look.test.ts` | T8     |
| AT-124                                                      | `test/integration/approvals/fresh-terms.test.ts` | T8     |
| AT-128 (approval part)                                      | `test/integration/approvals/withdraw.test.ts`    | T4     |
| AT-132 (rules, main)                                        | `test/unit/approvals/rules.test.ts`              | T4     |
| AT-132 (gate, engine)                                       | `test/unit/gate/decide.test.ts`                  | T7     |
| AT-133                                                      | `test/integration/approvals/draft.test.ts`       | T6     |
| ART-03, ART-05a, ART-05b                                    | `test/articles/ART-{03,05a,05b}.test.ts`         | T7     |
| ART-06a, ART-06b                                            | `test/articles/ART-06.test.ts`                   | T5     |
| ART-08a                                                     | `test/articles/ART-08a.test.ts`                  | T9     |
| ART-08c                                                     | `test/articles/ART-08c.test.ts`                  | T3     |
| ART-10                                                      | `test/articles/ART-10.test.ts`                   | T8     |
| UX-10-01…06, UX-10-08                                       | `test/fidelity/ux/UX-10.choice.spec.ts`          | T5     |
| UX-12-05, UX-12-06 (early, owner M9)                        | `test/fidelity/ux/UX-12.booking.spec.ts`         | T4     |
| UX-16-02, UX-16-04, UX-16-06 (early, owner M8)              | `test/fidelity/ux/UX-16.drafts.spec.ts`          | T6     |
| BP-CARD-03, BP-CARD-04                                      | `test/fidelity/bp/BP-cards-m5-choice.spec.ts`    | T5     |
| BP-CARD-05                                                  | `test/fidelity/bp/BP-cards-m5-approval.spec.ts`  | T4     |
| BP-CARD-07                                                  | `test/fidelity/bp/BP-cards-m5-draft.spec.ts`     | T6     |
| BP-CARD-08, BP-CARD-09                                      | `test/fidelity/bp/BP-cards-m5-secret.spec.ts`    | T2     |

Every row is `pending` until its ticket lands the test and flips it to `live` in the same commit (FID-18 checks live rows
only). Split ids have one row per file: their test titles carry the half (`AT-132 (rules, main)` / `AT-132 (gate, engine)`).
The M12 halves of AT-009 (the AI-finder / Settings row, G-M5-10) and AT-016 (setup cards, G-M5-11) get their rows with M12's
CR. SV-21/22/27 stay in `spec/spec-values.json` (their tickets name the test ids); FID-16/17 have no trace row (FID-18's id
set is AT / ART / PERF / UX / BP, as CR-0008 §a). FID-16 for the approval machine runs live in
`test/fidelity/sm/FID-16-approval.test.ts`; FID-17's approval random walks are T4's `test/fidelity/sm/FID-17-approval.test.ts`.

Blueprint ids (`scripts/golden-manifest.ts` `BP_M5`): `#cardgal > .panel:nth-child(n) > .mini` for n = 3 Choice, 4 Option
tiles, 5 Approval, 7 Draft, 8 Secret box, 9 Paste catcher (drawn in 350px panels; their R2 boxes are disputed by
construction, CR-0003 §b). `EARLY_STEPS` gains UX-12-05, UX-12-06, UX-16-02, UX-16-04, UX-16-06 as `M5` (frames that are
only an Approval or Draft card, reachable with fakes; M9 / M8 still bless them). New `STEP_MILESTONE` moves UX-10-07
(answer from a Windows notification) to M11 (G-M5-09); the other seven UX-10 steps stay M5.

## (b) Picks for the M5 gaps (pack `prep/M5.md` §8; each is the pack's "Recommended" option)

1. **G-M5-01** "For this chat" scope ends at whichever comes first: foo restarts or 11:59 PM local today.
2. **G-M5-02** No scope control for email moves in v1 (just once) until a CR adds a verb.
3. **G-M5-03** HELD → user picks their own value: the approval goes DECLINED (07-2 §5), then the job re-prepares a fresh
   PENDING card. 08-2 §9.6 "old card → SUPERSEDED" is withdrawn.
4. **G-M5-04** HELD → EXPIRED at its `expires_at` (nothing executes; fail closed), added to the machine.
5. **G-M5-05** Paste catcher keeps the 02-3 / M2 ids and keys (`composer-paste`, `composer-paste-send`, `composer.paste.*`);
   05-2 §5.9.4's names are withdrawn.
6. **G-M5-06** One redactor module, `src/shared/redactor.ts`; `src/engine/redact/` holds only registry-mirror glue.
7. **G-M5-07** zod on the AI's `ChoiceCardSpec` uses 08-4 §25.1 (question 1–90, label 1–40, detail ≤ 60); the renderer
   still lays out 05's maxima (engine-built questions).
8. **G-M5-08** A late answer on live prices re-checks as a checklist line, not a message (07-2 R-19, Art. 22).
9. **G-M5-09** UX-10-07 moves to M11; M5 unit-tests the toast answer path (`resolved_by='toast'`) with a fake notifier.
10. **G-M5-10** AT-009: M5 proves the Secret box half; the row half is M12.
11. **G-M5-11** AT-016: M5 proves it for Choice cards with `purpose:'setup'`; setup cards at M12.
12. **G-M5-12** A minimal `test/fakes/connectors/gmail.ts` (`drafts.create|update|send|delete`) behind the 08-3 §16.5
    interface; M8 extends it.
13. **G-M5-13** Send-kind Approval cards come only from a hard-limit Draft's own `approvals` row (`hard_limit=1`, same row
    id); a `request_approval` with verb send gets a repair turn.
14. **G-M5-14** Approval "Change" on booking / delete / share focuses the composer ("Tell me what to change") and the typed
    text runs the 08-4 §26.5 steer path; no new channel.
15. **G-M5-15** `use_app` and `calendar_write` approvals expire after 60 min (05-2 §5.5.2); `buy` uses the pay row (10 min).
16. **G-M5-16** `secret:save` name per kind: `ai_key` ∈ ProviderId; `web_key` ∈ exa|tavily|firecrawl|browseruse;
    `conn_token` ∈ google|outlook; `hub_key` = composio; `login` = lower-case host `^[a-z0-9-]+(\.[a-z0-9-]+)+$` ≤ 253;
    `card` = `^\d{4}$`; `wa_session` = whatsapp; else `VALIDATION`.
17. **G-M5-17** Card state changes animate with `--m-card` (as G-M4-15).

Picks T1 made where the spec is silent (also in implementation-notes "M5"):

18. **G-M5-18** HELD → WITHDRAWN and APPROVED → WITHDRAWN when the job is stopped. 07-2 §5 draws WITHDRAWN only from
    PENDING ("job cancelled elsewhere"); 08-2 §5.7 step 3 says every open approval of a stopped job → WITHDRAWN. A held card
    waits on the user, and an APPROVED row can sit in the Draft undo window, the second look or the fresh-terms check, so
    both get the edge; leaving them open would leave a live card on a dead job. Fail closed: nothing is submitted. RUNNING
    keeps the 08-2 §5.7 step 2 path (it is never withdrawn).
19. **G-M5-19** Draft Undo inside the 5 s window moves the same `approvals` row APPROVED → PENDING. 05-2 §5.7 says Undo
    returns the draft "with a fresh PENDING approval", and `approvals.card_id` is UNIQUE (08-1 §4.3), so the card keeps one
    row; `approved_at` / `approved_via` are cleared and `expires_at` is reset to the undo time + 60 min (05-2 §5.7 "expiry
    reset to 60 min"; 08-0 §G.7 is silent on undo).
    Allowed only while the row is APPROVED and `undo_until > now`; RUNNING never goes back.
20. **G-M5-20** (the M5 lead's review fix 10; numbered 20 because 18 and 19 were already taken) Paste catcher "Send
    anyway": 08-2 §11.5 says the value is registered, but 04-2 §22.4 (wins) says "The real value is not kept anywhere": the
    renderer swaps in "•••• (hidden)" before `message:send`, so main registers a value (`registerSecretValue`, T3's
    `src/main/secrets/registerValue.ts`) only when its R1 re-check catches something the renderer missed. 08-2 §11.5 is
    aligned to 04-2 by this CR.
21. **Contract shapes.** 08-1 §2.4.1 says a new message kind or channel is a constitution change: this CR is that change for:
    - invoke channels `card:answer|approve|decline|askAgain|heldPick`, `draft:update|send|undo|discard|openInApp`,
      `secret:save|list|delete`, `code:submit` (08-1 §3.2 shapes; `by: 'tap' | 'keyboard'` named `CardTapBy`). T1 registers
      every one in `IpcRouter.ts` with a stub that answers `VALIDATION` `not_implemented`; each owning ticket fills only its
      own handler file (`src/main/{cards/answerIpc,approvals/approvalIpc,drafts/draftIpc,vault/secretIpc}.ts`).
    - main → engine `approval.changed { approvalId, state }`, `registry:add`, `registry:remove`, `code.submit { requestId,
codeRef }` (a handle, never the code); engine → main `approval.open` (an `ApprovalDraft`, verbs book|buy|pay|delete),
      `approval.transition { approvalId, to, data? }`, `vault.use { purpose, name, jobId?, approvalId? }`.
    - `fields_hash` = sha256 hex of the RFC 8785 canonical JSON of `ApprovalFields` (08-2 §9.3), in
      `src/engine/gate/fieldsHash.ts` (node:crypto; the renderer never hashes); `newNonce()` in `src/shared/canon.ts`.
    - FOO_TEST adds `test:card.seed { chatId?, type, state, payload, jobId?, expiresAt?, approval? }`: one card of any type, with an
      `approvals` row for approval / draft / payment cards (PENDING by default, expiry per verb, the card state mirrored
      for approval cards), written through `applyDbOps` so card states are checked against 08-0 §G.2.
22. **Approval machine** (`src/shared/approvalMachine.ts`): 11 states, 17 events, 21 transitions; the six final states
    (COMPLETED, DECLINED, EXPIRED, SUPERSEDED, WITHDRAWN, FAILED) have no exits; expiry minutes per verb (pay / buy 10,
    book 15, every other verb 60). Main's `ApprovalGate` and the engine gate both use this table.
23. **Copy.** 287 `cards.choice|tiles|approval|draft|secret|common.*` keys from 05-1 / 05-2 copy tables (mechanical names
    `cards.{type}.{slot}[.{state}]`, 05-1 §0.4; spec-fixed names as written in the pack). Keys landed before the ticket that
    renders them are in `scripts/copy-pending.json` with the owning ticket (must be empty at M5 close-out). Notes for the
    lead: `cards.common.gated_typed_yes` repeats `thread.approval_typed.approve` (both kept, both spec-named);
    "Nothing needs you here." (05-1 §0.6) has no key yet (the ticket that renders it adds it).

## (c) Approval machine (`spec/state-machines.json`)

`scripts/extract-sm.ts` now writes the approval machine next to the job machine: 07-2 §5 diagram and state table, SM-A4…A9,
08-2 §5.9 step 2 and §9.4.2, 08-4 §26.5, and the picks G-M5-03, -04, -18, -19 above. Each transition names its card copy
key, its job effect and its source. It fails when the 07-2 §5 state table names a state the machine lacks or the diagram
draws an edge it lacks. `test/fidelity/sm/FID-16-approval.test.ts` checks the app table against the JSON cell by cell and
against the 07-2 §5 edges written out by hand.

## (d) Not changed

No migration: the M0 DDL already has the `approvals` scope CHECK, `fields_hash`, `second_look`, `undo_until` and
`submitted_at`. `settings.json` has no `permissions` / `rules` section yet: T4 (rules) and T7 (permission chips) add it under
their own owns. `src/preload/*` and `EngineBridge.ts` got additive lines only (the channel lists and `not_implemented`
cases for the three new engine kinds); the lead owns them after T1.

## (e) Open items for the spec-keeper

X-162 supersedes: 08-2 §11.5 "Send anyway registers the value" (G-M5-20); 08-2 §9.6 "old card → SUPERSEDED" (G-M5-03); 05-2 §5.9.4 paste catcher ids / keys (G-M5-05); the plan's
`engine/redact/Redactor.ts` (G-M5-06); 05-1 §5.3.2 limits for the AI's spec (G-M5-07); 05-1 §5.3.2 "posts Checking those
prices…" (G-M5-08); 08-2 §9.5 "until app restart" (G-M5-01); 08-2 §9.1 expiry list (adds use_app, calendar_write, buy,
G-M5-15); 07-2 §5 diagram (adds HELD → EXPIRED, HELD → WITHDRAWN, APPROVED → WITHDRAWN, APPROVED → PENDING for
Draft undo).

## (f) Independent review

Sonnet reviewer, 2026-10-18 ~18:40Z, read-only, against prep/M5.md §8, 07-2 §5 + SM-A4…A9, 05-2 §5.7, 08-0 §G.7, 08-1 §2.4 /
§3.2, 08-2 §5.7 / §5.9 / §9.1 / §9.4.2, 08-4 §26.5 and the M5 ticket map; ran FID-16 (approval) and `trace:check`.
**Verdict: PASS WITH FIXES**; both "act" findings applied before merge:

- Act 1 applied: G-M5-19 now resets `expires_at` to undo time + 60 min, as 05-2 §5.7 says (it first kept the creation time).
- Act 2 applied: APPROVED → WITHDRAWN added (08-2 §5.7 step 3: a stop during the undo window, second look or fresh-terms
  check left the APPROVED row with no exit); machine now 21 transitions, FID-16 updated.
- Considered and applied: G-M5-18 cites 08-2 §5.7 step 3. Noted: the ticket map names no file for the early UX-12 / UX-16
  steps; this CR assigns `UX-12.booking.spec.ts` (T4) and `UX-16.drafts.spec.ts` (T6).
- Checked, no issue: G-M5-01…17 equal the pack's recommended options with no screen or copy change; the machine matches
  07-2 §5 plus the cited extras with no exit from a final state; expiry minutes match 08-2 §9.1 + G-M5-15; the 56 M5 trace
  rows cover the pack list with the owning tickets' files; the item 21 shapes match 08-1 §2.4 / §3.2 and the code.

G-M5-20 was added after this review at the M5 lead's request (map review fix 10, from the cross-milestone monitor). It takes
the spec's own precedence (04-2 §22.4 wins over 08-2 §11.5) and changes no screen or copy.

Recorded as approved on Vikas's behalf under his standing rule (his message 2026-10-18 14:56Z: "take care of it on my
behalf and then keep on working"); listed for his later review.

## (g) Addenda during the build (G-M5-21 onwards; ids handed out by the M5 lead)

Each addendum is a pick where the spec is silent or forks, taken by the ticket that met it, landed here by the lead. A
batch independent review (Fable) checks them before the milestone PR; until then each is "pending review".

- **G-M5-21** (T2) Move to secret box posts the card (04-2 §22.4, 05-2 §5.8, 08-1 §3.2). 08-1 has no channel that
  posts the Secret box that 04-2 §22.4 "Move to secret box" needs, and the renderer never writes cards (08-1 §4.6).
  Added invoke `secret:offer { chatId, slot } → CardRow`, `slot` ∈ `openai | google | card | otp | password | key`
  (the 04-2 §22.4 suggested names). Main writes a foo message and an `asking` Secret box titled from the slot; an
  `otp` slot reuses the chat's open code box. The value never crosses this channel: the renderer hands it to the
  card's field in memory, drops it after 60 s if no card takes it or when the chat changes, and forgets every caught
  value once its mask leaves the composer, on Send and on a chat switch. A `password` or `key` box has no vault name
  yet (08-0 §E.8), so its Save refuses with "I don’t have a safe place for this one yet, so I didn’t save it."
  (new key `cards.secret.line.no_kind`) and nothing is stored. Groups: never (05-2 §5.8.6): no Move in a group, and
  main refuses `secret:offer` for a group chat. When the vault can't save, the card shows the §5.8.3 Disabled state
  up front. Pending review.
- **G-M5-22** (T10) Safe mode and interrupted jobs (08-4 §26.7, 03 safe mode). In safe mode, recovery still marks
  unknown tool calls and posts the crash-recovery card for each WORKING or QUEUED job, but starts nothing (no
  startNext, no resume runs, no `opens_at` wake) until the user taps Start normally. The job keeps its recovered state
  with a needs_you badge. Rejected: keep the job `working` (it reads as running when it is not); a new
  `waiting_reason 'safe_mode'` (needs DDL). Pending review.
- **G-M5-23** (T10) Plan limit with no reset time (03 §3.3, 04 header status). With no `resetAt`, the sidebar footer
  reads "{AI} limit reached" and the chat header "Paused · {ai} limit reached" (new `*.no_time` keys), the wording the
  banner and composer already use. Rejected: "until it resets". Pending review.
- **G-M5-23b** (T10, deferral) 08-4 §26.8 item 6, quit past `wake_at` → job FAILED + `thread.trains.tatkal_missed`,
  moves to M9 with the trains journey, its copy and the only producer of `opens_at` jobs. Until then a job that slept
  past its time wakes on the first tick. Pending review.
- **G-M5-24** (T4) `ApprovalFields` gains optional `app: PermissionApp`. 08-5 §3.3 says a `use_app` approvals row
  carries `fields.app`; 08-2 §9.3 leaves it out. A `use_app` approval sets it, and its "For this chat" / "Always"
  rule matches `{ app }`. A `use_app` approval without `app` cannot make a rule (`RULE_NOT_ALLOWED`). Pending review.
- **G-M5-26** (T5) UX-10-02 moves to M6 (`STEP_MILESTONE`, trace row): it highlights the "Used: hates early flights ✕"
  memory chip (memory in replies, M6), which M5 does not build. Same rule as G-M5-09. Pending review.
- **G-M5-25** (lead, found by T4) The R2 store scrub does not apply P17 (04-2 key-like 32+ characters, entropy ≥ 4)
  to a JSON leaf that is exactly a foo id (08-0 §E.7 `{prefix}_{UUIDv7}`, prefixes of 08-1 §0.6). Every id is 39+
  hex characters and passed P17, so stored card payloads, activity fields and tool calls held `[hidden]` in place of
  their ids. An id inside a longer string gets no exemption. `src/main/store/writeRedacted.ts`. Pending review.
- **G-M5-29** (T7) Engine `approval.open` carries `{ jobId, draft, title, impact }` (strict), not the bare draft. 08-1
  §2.4 (the line to amend) gives `payload: ApprovalDraft`, and 08-2 §9.4 `createApproval(draft, hard)` / §9.7
  `ApprovalGate.create (main): ApprovalDraft`, but an ApprovalDraft has no job id; main's card needs the job and the text,
  and 05-2 §5.5.2 says the text is built only from the verified fields. The engine builds `title` / `impact` from the
  verified draft (`src/engine/gate/approvalText.ts`); main's `openFromEngine` stores them. Rejected: main builds the
  text (two copies of the card-kind rules, and main would need the job's time zone logic). Pending review.
- **G-M5-30** (T7) Decline line keys: `thread.approval.declined` "Okay, I won't. {next}" and
  `thread.approval.declined.nothing_else` "Nothing else to do here." The words are AT-110's and 07-2 §4's verbatim;
  the fork is only the key names. Pending review.
- **G-M5-31** (T7) `cards.approval.book.party` "{count} people" (05-2 §5.5.2 booking line "… · 4 people", 08-4 §28.4
  "people '4 people'"); no key existed. Pending review.
- **G-M5-32** (T7, deferral and spec-keeper items) (a) The deadline-reminder buttons stay disabled: Keep it needs a
  PENDING → COMPLETED approval edge the machine does not have (07-2 §5), and neither Keep it nor Cancel booking has an
  IPC channel (08-1 §3.2). Both move to the first milestone that creates `deadline_reminder` cards; M5 makes none.
  (b) Spec gap: the booking impact line has an {area} slot (05-2 §5.5.2 "{Place}, {area} · …") but ApprovalFields has
  no `area` (08-2 §9.3). Until the spec settles it, a slot nothing verified fills (area; `when` with no quote) is left
  out with its separator, never guessed or shown empty. Open for the spec-keeper.

### Drawing vs app (Tier R disputes, `docs/fidelity/disputes.json`)

| Ids                                        | Checks | Drawing                                                                               | Spec (wins)                                                                                                                                               |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BP-CARD-08                                 | r1, r2 | 351 px sketch, emoji, a "Show" text eye, value half shown                             | 05-2 §5.8.1 / §5.8.5: 440 px card, icon eye, field fully masked                                                                                           |
| BP-CARD-03, BP-CARD-04, UX-10-01, -04, -05 | r1, r2 | minis with badges, Skip and time; sample checklist phrases; highlight at another y    | 05-1 §5.3: no badges/Skip/time on the minis; checklist rows are catalogue phrases; the live log places the card                                           |
| UX-10-03                                   | r3, r4 | highlight on a ➤ glyph                                                                | the M2 Send button draws the Fluent send icon (03 / 04 composer)                                                                                          |
| UX-10-06                                   | r2, r4 | Done drawn 28 px                                                                      | 05-1 §5.3: `--btn-h` 40 px (SV-22 passes)                                                                                                                 |
| BP-CARD-05                                 | r1, r2 | a personal email address, a short impact line, an [ Edit ] button; 351×156 mini panel | example.com fixture (public repo), spec impact line, "I'll always ask for this one.", expiry footer, [ Change ] (05-2 §5.5 ASCII); 440 px wide (238 tall) |
| BP-CARD-09                                 | r1, r2 | "Remove it" with no body                                                              | 04-2 §22.4: "Move to secret box" / "Send anyway" plus the body line                                                                                       |

The app follows the spec; the Blueprint sketches predate those sections. Expected to fail until the spec-keeper redraws
them. Pending the batch review.
