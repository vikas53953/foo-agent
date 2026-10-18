# CR-0016: M12 trace rows, first-run contracts, and the picks the M12 build makes where the spec forks

- **Asked by:** the M12 lead (ticket T1, `/mnt/project-files/foo/prep/M12-tickets.md`), 2026-10-18, while building M12
  (foo-plan §5 M12, first run J1–J5).
- **Spec sections:** 06-1 §1, §2.0–§2.7, 06-2 §6.6 (`leaves`), 07-journeys-1 J1–J5, 08-0 §A/A.1, §C, §E.5, §E.7, §G.1–§G.2,
  08-1 §3.2, 08-2 §6.6, 08-4 §26.6, 08-5 §3, §4.1, 09 §9.4, 10-acceptance-1 §B, 10-acceptance-2 §D, 11-fidelity §11.2.7, §11.12.
- **Status:** Proposed. Independent review in §(e) before approval.
- **Change:** `spec/trace.csv` (rows below), `spec/constitution/DECISIONS.md` (row X-169); `scripts/golden-manifest.ts`
  (`BP_M12`, `EARLY_STEPS` UX-01-06/-07) and `golden/manifest.json` regenerated; `docs/fidelity/disputes.json` (§(c)).
  No other `spec/` or `golden/` file changes.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows (`spec/trace.csv`), Milestone M12

| Id                        | Test file                                        | Owner                         | Status   |
| ------------------------- | ------------------------------------------------ | ----------------------------- | -------- |
| AT-002 (folder half)      | `test/integration/setup/readiness.test.ts`       | T2                            | pending  |
| AT-003, AT-200            | `test/e2e/m12-resume.spec.ts`                    | T2 (AT-200 Card E case: T5-c) | pending  |
| AT-005                    | `test/integration/setup/ai-finder.test.ts`       | T3                            | pending  |
| AT-006, AT-009 (row half) | `test/e2e/m12-ai-finder.spec.ts`                 | T3 / T3-b                     | pending  |
| AT-155                    | `test/integration/setup/maker-helper.test.ts`    | T3                            | pending  |
| AT-155a                   | `test/unit/setup/maker-pages.test.ts`            | T1                            | **live** |
| AT-010                    | `test/integration/setup/name.test.ts`            | T4                            | pending  |
| AT-012                    | `test/integration/setup/real-task-first.test.ts` | T6                            | pending  |
| AT-013                    | `test/e2e/m12-identity.spec.ts`                  | T4                            | pending  |
| AT-201                    | `test/integration/setup/avatar.test.ts`          | T4                            | pending  |
| AT-016 (setup half)       | `test/e2e/m12-interview.spec.ts`                 | T5-b                          | pending  |
| AT-017                    | `test/integration/setup/app-peek.test.ts`        | T5                            | pending  |
| AT-202, AT-203            | `test/e2e/m12-connect.spec.ts`                   | T5-c                          | pending  |
| AT-274                    | `test/integration/setup/card-types.test.ts`      | T5                            | pending  |
| AT-019 (from the chip)    | `test/e2e/m12-first-job.spec.ts`                 | T6                            | pending  |
| AT-021                    | `test/unit/setup/firstJobChips.test.ts`          | T6                            | pending  |
| AT-022                    | `test/integration/setup/closing.test.ts`         | T6                            | pending  |
| ART-26b (automated half)  | `test/e2e/m12-keyboard.spec.ts`                  | T7                            | pending  |
| UX-01-06, UX-01-07        | `test/fidelity/ux/UX-01.install.spec.ts`         | T7                            | pending  |
| UX-02-01…09               | `test/fidelity/ux/UX-02.ai.spec.ts`              | T7                            | pending  |
| UX-03-01…10               | `test/fidelity/ux/UX-03.name.spec.ts`            | T7                            | pending  |
| UX-04-01…13               | `test/fidelity/ux/UX-04.interview.spec.ts`       | T7                            | pending  |
| UX-05-01, -05, -07        | `test/fidelity/ux/UX-05.first.spec.ts`           | T7                            | pending  |
| BP-SCR-01 … BP-SCR-04     | `test/fidelity/bp/BP-scr-m12-0{1..4}.spec.ts`    | T2, T3, T4, T6                | pending  |

UX-05-02…04 keep their M4 rows in `UX-05.first.spec.ts` (one row per id per file); M12 re-runs and blesses them as the
chapter owner. UX-05-06 is superseded (X-103) and has no row. UX-04-04…09 are M8 early steps (G-PREP-03): M8 adds them to
`EARLY_STEPS`, M12 blesses. AT-277 and AT-102 have no M12 row: their trace rows are M14's (merge decision B); M12 proves its
halves as notes (splash lockup and welcome face through LF's `FooMark.tsx`; a finished data dir skips setup) in T4's
`test/unit/setup/foomarkPlacement.test.tsx` and T2's `test/integration/setup/resume.test.ts`. The R column is left empty on
the new rows (the R mapping of J1–J5 is not restated in the pack).

Blueprint ids (`BP_M12`): `#scrgal > .scr:nth-child(n) > .body` for n = 1 Splash, 2 First run · find your AI, 3 First run ·
name and face, 4 First run · first real job (the selector pattern M6 and M9 use for BP-SCR-09/13/14). `EARLY_STEPS` gains
UX-01-06 and UX-01-07 as `M12` (G-M12-04); UX-01-08 (tray tooltip) joins after M11; M14 blesses UX-01 on the installed build.

## (b) Picks (pack `prep/M12.md` §8; each is the pack's "Recommended" option unless marked)

1. **G-M12-01** (merge decision A) The living face is built once by the standalone LF ticket; M12 only renders `<Face>` /
   `<FooMark>` and is blocked by LF for those parts.
2. **G-M12-02** In setup mode (no verified AI, `setup.complete = false`) the composer placeholder is 06-1's long line
   `setup.composer.locked` "Connect your AI first, then we can talk."; 04-2's short line stays for the send tooltip and the
   drop overlay. 04-2 line 374 reads "first run: 06-1 §2.0's line". Closes CR-0007 §(e) pick 14.
3. **G-M12-03** The step pill shows in steps 1–4 (06-1 line 104 "steps 1–3" reads "1–4"); hidden at step 0 and from the
   moment the step-4 job starts.
4. **G-M12-04** EARLY_STEPS UX-01-06/-07 now, UX-01-08 after M11 (above).
5. **G-M12-05** M4 owns AT-019 from a typed request; M12's AT-019 row is "from the setup chip"; both stay green.
6. **G-M12-06** M12 blesses UX-04-04…09 as owner; no re-tag.
7. **G-M12-07** The written spec wins over the drawings listed in §(c); each is a `disputed` row.
8. **G-M12-08** 06-1 line 313 (AI-36, presets only) wins over the J3 summary's "generated if the AI can make images";
   07-journeys-1 line 153 reads "four preset faces".
9. **G-M12-09** AT-022 asserts the visible text contains "tomorrow, Sat 17 Oct" and "8:00 AM"; the copy is 06-1 line 481
   (`setup.closing.brief_time`).
10. **G-M12-10** AT-203's line reads "Settings → Connections." (06-1 line 432; the page is `connections`).
11. **G-M12-11** X-115's "(first run Card B …)" reads "Card D" (Google connect); `bill_watch` creation stays with M8/M10.
12. **G-M12-12** Main's `src/main/setup/SetupFlow.ts` owns the first-run flow (card posting, typed-answer routing, rules 3, 4,
    8, 9); the engine stays setup-unaware except `origin = 'setup'` on the step-4 job; Choice/Connect answers carrying
    `payload.setupCard` are routed by main to SetupFlow.
13. **G-M12-13** Typed answers: shared pure `src/shared/setupAnswers/` (`index.ts` signatures by T1; `name.ts` T4; `choice.ts`,
    `apps.ts` T5). Choice cards use 08-4 §26.6 exactly; Card G also accepts a clock time whose hour equals exactly one
    option's hour ("8 is fine" → 8:00 AM); the name card takes text of ≤ 20 graphemes with a letter and no 08-2 §5.3.1
    do-verb as the name, anything else is a message (rule 4); the apps card uses §26.6 rule 6 against the chip labels.
14. **G-M12-14** `^(interview me|set me up)[.!]*$` (case-insensitive), checked by main before intake; runs step 3 only; no AI
    call (`INTERVIEW_ME`).
15. **G-M12-15 (Vikas)** `resources/names.json`: 200 names, 3–8 letters, easy to say in English and Hindi, no brand,
    public-figure or AI-product names, drafted by the builder; listed for Vikas to skim in the M12 report; not blocking.
    M13's New helper dialog reuses this file.
16. **G-M12-16** Glyph pool (`src/shared/face.ts`): ✿ flower, ◐ half moon, ★ star, ✈ plane, ☀ sun, ☂ umbrella, ♪ note,
    ✦ spark, ☘ clover, ⚑ flag, ✎ pencil, ♥ heart; colour names = the F2 helper token names. FaceRef `glyph:{glyph}` is
    stored with U+FE0E (02-2 §F15.5 type 2).
17. **G-M12-17** `appPeek.ts` (main only, on "Yes" only) checks just WhatsApp Desktop; the result lives in RAM
    (`SetupState.answers[3]`), is never logged with names and never sent to the AI.
18. **G-M12-18** Card A's display name: main reads the account's full name once (PowerShell `Win32_UserAccount.FullName`,
    fallback `os.userInfo().username`), applies UJ-38, never logs it, never sends it to the AI unless picked.
19. **G-M12-19** (merge decision C) M14 owns `src/main/install/readiness.ts` and the `ReadinessResult` extension (CR-0018);
    M12 calls it when `install.readiness` is absent (a port stubbed until M14 T1 merges); CR-0016 adds no readiness field.
20. **G-M12-20** `resources/maker-pages.json`: Claude/Anthropic `https://code.claude.com/docs/en/setup`, ChatGPT/OpenAI
    `https://developers.openai.com/codex/cli`, Gemini/Google `https://github.com/google-gemini/gemini-cli`, Ollama/Ollama
    `https://ollama.com/download` (as written). zod-validated at load (`MakerPagesSchema`, https only). The cloud container
    reached only the first URL (the proxy blocks the others); the real-PC session (T7) opens all four once and the decision
    log records it.
21. **G-M12-21** M12 builds `ai:signIn` per 08-2 §6.6 with the 10 min limit (`SIGNIN_TIMEOUT`, added to `ErrorKind`);
    fallback line `setup.ai_finder.signin_in_app` "Sign in in the {AI} app, then come back."; the real-PC session verifies
    each CLI's command. T1 registers the channel with a stub answering `AI_CLI_INCOMPATIBLE` (as `cliCommon.signIn` does).
22. **G-M12-22** Closing the window before the shell replaces the splash quits; from the welcome card on it hides to the tray
    (M11; until then hide + single-instance restore).
23. **G-M12-23** Rule 7's toast is `setup.signin.toast` "Signed in to {app}. Come back to finish setup.", sent through an
    injected notifier that logs until M11.
24. **G-M12-24** The interview counter "{k} of 8" and the bottom-right "Skip" are one `setupChrome` slot in the card frame,
    landed by the M12 lead in M5's / M8's card files after they merge.
25. **G-M12-25** (merge decision B) AT-271 → M11, AT-277 → M14, AT-283 → M13; M12 writes the first-run Animations default
    (≤ 4 logical CPUs or < 8 GB RAM → 'basic', X-150; `firstRunDefaults()` already does this since M1).
26. **G-M12-26** Card F free text is split on `,` / `and` / `aur` / `और`; each part goes through M6's manual-add
    classify with origin `setup`, provenance `said`; one people file per named person.
27. **G-M12-27** The choice block's [ Use {OpenAI key} ] is the "Use this key" tap of 08-2 line 275; nothing is copied into
    the vault before it.
28. **G-M12-28** The M1 status line stays "Setting up" (03 §3.4.11); the pill alone follows pick 3; unit cases for steps 0
    and 5.

Picks T1 made where the spec is silent:

29. **Settings additions** (08-0 §A.1 keys the M12 cards write, all with their §A.1 defaults, no migration: a missing key
    repairs to the default): `setup.interviewCard?` ('A'…'H'), `setup.firstBriefAt?` (epoch ms), `identity.avatarRef`
    (FaceRef, default `living:default`, the style the shell already draws), `identity.vibe` (default `calm_funny`),
    `identity.vibeLine` / `identity.emoji` (default empty until step 2 or Skip the rest writes them), `brief.enabled` /
    `brief.at` (true / '08:00'; M7's brief routine reads the same keys). Permissions stay with M5's gate milestone; the
    Card H writes land through the lead after it.
30. **Copy keys.** 255 keys for every quoted string of 06-1 §1–§2, landed in `scripts/copy-pending.json` (labelled by the
    ticket that renders each) until a `t()` call uses them; empty at M12 close-out (T7). Key shape needs three segments, so
    the pack's `setup.off_topic_lead` / `setup.real_task_resume` / `setup.signin_toast` are `setup.off_topic.lead`,
    `setup.real_task.resume`, `setup.signin.toast`. The 06-2 §6.6 `leaves` sentences are `settings.privacy.leaves.*` (one
    source for the first-run dialog and Settings → Privacy; merge decision E, M13 reuses them). Placeholders use the
    existing `{AI}` for an AI's name and `{maker}` for its maker. `memory_chip.saved` is M6's key.
31. **`app:openExternal`** is M9's channel (CR-0013 registers it with all five targets). M12 does not register it: T1 ships
    `resources/maker-pages.json` and `src/main/setup/resources.ts` (`makerPageUrl`), and the lead lands the `maker_page`
    branch in M9's handler once M9 merges into the M12 branch (pack §3 "if their milestone already registered the channel,
    M12 adds the `maker_page` branch through the lead").
32. **Contract shapes.** `SetupState.answers` is RAM only (never written to `settings.json`). `setup:answer` is refused with
    `VALIDATION` when setup is complete, when `step` is not the current `setup.step` (no later step is reachable, AT-006),
    when a step ≥ 2 is answered with no verified AI (`ai.providers[primary].lastVerifyOk`), and when the answer's shape is
    wrong (`SETUP_ANSWER_SCHEMAS`); step 5 takes no answer. `setup:skip` is refused in steps 0–1 and after completion.
    `SetupFlow.setStep` writes `setup.step` and drops `interviewCard` when leaving step 3. Interview Choice cards add
    `{ purpose: 'setup', setupCard: 'A'|'B'|'F'|'G'|'H' }` to M5's `ChoicePayload` (`SetupChoiceMark`); the vibe, summary and
    first-job feedback Choice cards carry `purpose: 'setup'` with no `setupCard` and are recognised by the card id SetupFlow
    posted. `ConnectPayload.setupCard` is M8's (already on its branch). FOO_TEST adds `test:setup { op: 'displayName' |
'apps' | 'pickImage' | 'reset' }` (`__fooTest.setup.*`).
33. **Open for T4 (not decided here):** 08-0 §E.7's `glyph:{emoji}` has no colour, but a glyph tile draws the glyph on a
    helper colour. T4 raises the storage of foo's glyph-face colour as an addendum to this CR before building the tiles.

## (c) Disputes (`docs/fidelity/disputes.json`, verdict `disputed`, CR-0002 route)

- R1 (words): UX-03-04 ("fresh pictures if your AI can make pictures"; 06-1 line 313), UX-03-05 ("app icon keeps the f";
  X-143), UX-03-10 ("Now, back to my name…"; 06-1 line 114), UX-04-03 (Outlook chip; X-41), UX-05-05 ("Change something";
  06-1 line 467), UX-05-07 ("tomorrow, Fri 16 Oct, 8:00 AM"; 06-1 line 481).
- R4 (face): UX-03-05 and BP-SCR-03 draw an "f" tile (X-143: the two-eyes living face).
- UX-04-05 is Google's own consent page: unverifiable in the app (r1–r4).
- BP-SCR-01…04, R1 and R2: BP-SCR-01 draws "Starting…" (06-1 §1.4: nothing for 3 s, then "Getting things ready…"), BP-SCR-02
  leads "Let's find your AI" (06-1 line 232), BP-SCR-04 closes without "tomorrow," (R-07, line 481); the R2 boxes of gallery
  thumbnails are disputed by construction (CR-0003 §b).

## (d) Not changed

The step handlers (`src/main/setup/steps/*`), the renderer cards and every test body beyond T1's contracts belong to
T2–T7. `ai:detect` keeps its M3 shape; the per-provider re-detect (`ai.cmd { cmd: 'detect', providerId }`) is T3's addendum
if `ai.cmd` lacks the field.

## (e) Independent review

Pending.
