# CR-0003: M2 trace rows, M2 Blueprint ids, and where the drawings and the M2 app disagree

- **Asked by:** builder C (M2 fidelity wiring), 2026-10-17, while wiring M2 (foo-plan §5 M2 "Fidelity exit"; 11-fidelity §11.12
  item 8 names "BP-MSG-\*, BP-COMP-\*" with no ids yet).
- **Spec sections:** 11-fidelity §11.2.3 (data rule), §11.2.4 (R1, R2), §11.2.7 (when the reference is wrong), §11.4 (FID-18);
  04 §1–§19; 04-2 §20–§23; 10-acceptance-1 §B (AT-007, AT-225); 10-acceptance-2 §D (ART-08b, ART-21a, ART-26a), §E (PERF-02,
  PERF-04).
- **Status:** Approved under overnight instruction (Vikas, 2026-10-17 18:52Z/18:59Z: continue the overnight build, don't wait
  for my approval), for morning review
- **Approved by Vikas:** pending morning review (overnight instruction above, foo project M2 build thread)

## (a) Trace rows (`spec/trace.csv`)

30 rows added for M2, each with its § citation:

| Id                                        | Test file                              | Milestone | Status  |
| ----------------------------------------- | -------------------------------------- | --------- | ------- |
| AT-007 (J2), PERF-02, ART-26a             | `test/e2e/m2-composer.spec.ts`         | M2        | pending |
| PERF-04, ART-26a, ART-21a                 | `test/e2e/m2-messages.spec.ts`         | M2        | pending |
| AT-225 (J7)                               | `test/unit/AT-225.test.ts`             | M2        | live    |
| ART-08b                                   | `test/articles/ART-08b.test.ts`        | M2        | live    |
| BP-MSG-01, 03, 04 · BP-COMP-01, 02, 04…09 | `test/fidelity/bp/BP-messages.spec.ts` | M2        | pending |
| BP-MSG-02 · BP-COMP-03                    | `test/fidelity/bp/BP-messages.spec.ts` | M3        | pending |
| UX-08-01, 03…07 (R1 · R24, J7)            | `test/fidelity/ux/UX-08.chat.spec.ts`  | M2        | pending |
| UX-08-02                                  | `test/fidelity/ux/UX-08.chat.spec.ts`  | M3        | pending |
| UX-09-01, UX-09-08 (R16, J7)              | `test/fidelity/ux/UX-09.voice.spec.ts` | M2        | pending |

"pending" rows run on the Windows lanes only (Electron E2E); "live" rows run in `pnpm test`.

**Checker change (FID-18, `scripts/trace-check.ts`).** ART-26a and ART-21a are per-milestone checks (§11.2.3 / 10-acceptance-2
§D: "every surface built so far"), so the same id is tested in more than one file (M1 shell, M2 messages, M2 composer). The
checker refused a second row for an id, which was plainly wrong. It now allows one row per (id, file) and still flags the
same id twice for the same file; an orphan message lists every named file.

## (b) The M2 Blueprint ids (`golden/manifest.json`)

Regenerated with `pnpm golden:manifest` from `scripts/golden-manifest.ts` (`BP_M2`, `EARLY_STEPS`); `counts.bp` is 33. Every id
names the `.mini` drawing inside its panel. **drawn: true** for all 13. **Size: null** for all 13: the minis are drawn in
350px Blueprint panels, not at the app's size, so R2 (boxes) cannot match by construction and is disputed below.

| Id         | Selector                                         | Drawing                                      | Spec                        | Capturable |
| ---------- | ------------------------------------------------ | -------------------------------------------- | --------------------------- | ---------- |
| BP-MSG-01  | `#messages .grid2 > .panel:nth-child(1) > .mini` | Your message: two user bubbles, ticks, badge | 04 §2–§10                   | M2         |
| BP-MSG-02  | `#messages .grid2 > .panel:nth-child(2) > .mini` | foo's message: status line, typing dots      | 04 §11–§19                  | **M3**     |
| BP-MSG-03  | `#messages .grid2 > .panel:nth-child(3) > .mini` | Rich answer: table, code, sources            | 04 §12–§13                  | M2         |
| BP-MSG-04  | `#messages .grid2 > .panel:nth-child(4) > .mini` | Date chip, handoff, unprompted bubble + why  | 04 §15–§19; 05 §5.18, §5.25 | M2         |
| BP-COMP-01 | `#compstates > .panel:nth-child(1) > .mini`      | Rest                                         | 04-2 §20.2, §20.4           | M2         |
| BP-COMP-02 | `#compstates > .panel:nth-child(2) > .mini`      | Typing                                       | 04-2 §21.2, §21.3           | M2         |
| BP-COMP-03 | `#compstates > .panel:nth-child(3) > .mini`      | foo is replying (Stop)                       | 04-2 §21.2, §23.1           | **M3**     |
| BP-COMP-04 | `#compstates > .panel:nth-child(4) > .mini`      | Recording                                    | 04-2 §22.1                  | M2         |
| BP-COMP-05 | `#compstates > .panel:nth-child(5) > .mini`      | With a photo                                 | 04-2 §21.4, §20.4           | M2         |
| BP-COMP-06 | `#compstates > .panel:nth-child(6) > .mini`      | Secret caught (paste catcher)                | 04-2 §22.4                  | M2         |
| BP-COMP-07 | `#compstates > .panel:nth-child(7) > .mini`      | Card waiting above (pending strip)           | 04-2 §23.4                  | M2         |
| BP-COMP-08 | `#compstates > .panel:nth-child(8) > .mini`      | Offline                                      | 04-2 §23.1, §20.4           | M2         |
| BP-COMP-09 | `#compstates > .panel:nth-child(9) > .mini`      | Not set up                                   | 04-2 §23.3, §20.4           | M2         |

BP-MSG-02 and BP-COMP-03 (and walkthrough step UX-08-02) need the engine's reply stream (status line, typing dots, Stop),
which M3 builds; they are scheduled M3, not dropped. `EARLY_STEPS` marks UX-09-01 and UX-09-08 as first tested in M2 (the
UX-09 steps that need no transcription; transcription is M11).

## Drawing vs app and spec

The app follows the written spec and the `ux-world` seed (§11.2.3: state comes from the seed, never bent to match a picture).

| #   | Ref(s)          | Drawing shows                                                       | App and spec                                                                                     | Spec                |
| --- | --------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------- |
| 1   | all BP-MSG/COMP | 350px mini panels                                                   | Real column (≤ 600px) and full composer width                                                    | 04 §1.3; 04-2 §20.2 |
| 2   | all             | Icons and ticks as text glyphs (✓✓ ＋ 🎤 ➤), counted as words by R1 | Fluent icons with accessible names, no text                                                      | 02 §F29             |
| 3   | BP-MSG-01       | Dentist texts                                                       | Seeded user reply “can it say "Happy birthday Mummy"?” quoting the cake line, working badge      | §11.2.3             |
| 4   | BP-COMP-04      | Recording bar with no hint text                                     | Timer plus the spec hint ("Release to send · Esc to cancel", `composer.recording.hint_keyboard`) | 04-2 §22.1          |
| 5   | BP-COMP-06      | "That looks like a key / Remove it"                                 | "That looks like a password or key" / Send anyway (spec copy)                                    | 04-2 §22.4          |
| 6   | BP-COMP-07      | "Needs your OK: Pay Taj… Show ↑"                                    | "Waiting for your OK: {amount} to {payee}"                                                       | 04-2 §23.4          |
| 7   | UX-08-01, 03…06 | Chat list previews and right shell as a static picture              | The `ux-world` list and right shell (Goa job, its Doing-now rows)                                | §11.2.3             |
| 8   | UX-08-\*        | Brief card, status line, jump button, newer rows                    | Seed's chapter 8 scene; status line only while a reply streams (M3)                              | 04 §8, §14          |
| 9   | UX-08-\*        | Sticky date text                                                    | Sticky date shows only after user input                                                          | 04 §1               |
| 10  | UX-08-07        | Rich bubble 680px wide in a 600px column (overflows)                | Bubble capped by the column                                                                      | 04 §1.3, §12.1      |
| 11  | UX-08-\*        | ✓✓ read ticks on user bubbles without a badge                       | Read is derived from a badge (`seen`); the seed sets badges where the steps need them            | 04 §5               |
| 12  | UX-09-\*        | Chapter 9 shows only the cake line at 8:30                          | Same seeded world as chapter 8; clock kept at 9:41                                               | §11.2.3             |
| 13  | UX-09-08        | A card in the thread about the blocked microphone                   | The composer banner `mic_blocked` with spec copy                                                 | 04-2 §23.2          |

## Disputed checks (`docs/fidelity/disputes.json`)

Under this CR, only these checks are "expected fail"; every other check still counts (§11.2.7 step 3):

- BP-MSG-01…04 and BP-COMP-01…09: **R1, R2** (rows 1–6).
- UX-08-07 and UX-09-08: **R1, R2** (rows 10, 13).
- UX-08-01…06 and UX-09-01: **R1** (rows 2, 7–9, 11, 12).

R3 (colour) and R4 (highlight crop) still count everywhere. A dispute is removed when the spec keeper redraws the reference
(or the spec changes) and Tier R re-runs.

## (c) Proposals for the spec keeper (no `spec/` text changed here)

- **P1 · P14 and postal codes.** The paste catcher's P14 (`\bpin\b` + 6 digits) catches "pin code 560038". ART-08b allows it
  as the one false positive in 200. Proposal: exclude "pin code" / "pincode" before 6 digits in P14 (05-2 §5.9 / 04-2 §22.4).
- **P2 · Voice format.** 04-2 §22.1 says Ogg Opus; Chromium's MediaRecorder records WebM Opus only, and the plan says
  `data/voice/*.webm`. The app stores WebM Opus. Proposal: §22.1 says "Opus (WebM container)".
- **P3 · composer-field testid.** The testid sits on the inner contenteditable, so FID-14 SV-10/SV-11 measure the pill wrapper
  through a `:has()` selector. Proposal: the spec's testid list names the pill box.
- **P4 · per-chapter start states.** The walkthrough's chapter 8 and 9 pictures assume a world without the Goa job; the
  `ux-world` seed has one world. Proposal: either per-chapter seed states in 08-3 §22.9 or redraw the walkthrough from the
  one world.
- **P5 · read tick without a badge.** 04 §5 derives "read" from the badge; the walkthrough draws ✓✓ on bubbles that have no
  badge. Proposal: state whether a plain user bubble can show read.

- **Manifest:** `spec/trace.csv` changed; `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.
  `golden/manifest.json` regenerated only, with `pnpm golden:manifest`.
