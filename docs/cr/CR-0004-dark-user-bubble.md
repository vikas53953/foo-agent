# CR-0004: The dark user bubble is indigo (X-145) everywhere, and the M2 golden-lane differences that follow from the spec

- **Asked by:** M2 CI fixer, 2026-10-17, from the Full suite and golden lane on ba071fe and 651799f (FID-14 SV-04 dark; Tier R
  UX-08, UX-09, BP-MSG-01).
- **Spec sections:** 02 F2 (`--bubble-me` and the `--on-bubble-me*` family), DECISIONS X-145; 04 §2 (user bubble fill),
  04 §1.1 (column side padding), 04 §3.1 (meta), 04 §6.4 (reply-quote); 04-2 §25 #4, §26; 11-fidelity §11.2.4 (R2, R3, R4),
  §11.2.7 (when the reference is wrong); `spec/spec-values.json` SV-04.
- **Status:** Approved by Vikas, DECISIONS X-157 (built first under the overnight instruction of 2026-10-17 18:52Z/18:59Z)
- **Approved by Vikas:** 2026-10-18 13:00Z, in the M2 build thread of the foo project ("CR-0004 approved")

## (a) The contradiction

X-145 (Vikas's approved Look Book decision, option B) makes the user's own bubble indigo in dark mode: `--bubble-me`
`#2B3FD6`, `--on-bubble-me` `#FFFFFF`, `--on-bubble-me-2` `#C9D0FF`, `--tick-read-on-me` `#FFFFFF`, `--on-bubble-me-soft`
`#2334B8`. 02 F2 carries those values and the app paints them. Three places still had the pre-X-145 near-white bubble:

| Place                         | Said                                                                     | Now                                          |
| ----------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| `spec/spec-values.json` SV-04 | `#0B0B10 / #F1F1F5`, dark `rgb(241, 241, 245)`                           | `#0B0B10 / #2B3FD6`, dark `rgb(43, 63, 214)` |
| 04 §2 table, Fill             | dark `#F1F1F5`                                                           | dark `#2B3FD6` indigo, X-145                 |
| 04-2 §26 token table          | `--tick-read-on-me` dark `#2B3FD6`; `--on-bubble-me-soft` dark `#DCDCE3` | `#FFFFFF`; `#2334B8` (as 02 F2)              |
| 04-2 §25 #4                   | the contrast note on `#F1F1F5`                                           | marked as the pre-X-145 bubble               |

**Decision:** X-145 wins. The walkthrough and Blueprint drawings still draw the near-white dark bubble; they are disputed below
until redrawn.

## (b) Golden-lane differences that follow from the spec (`docs/fidelity/disputes.json`)

Numbers from the golden lane on 651799f (evidence branch `claude/foo-m2-messages-composer-ch8wrz/651799f/`). The app follows the
written spec and the `ux-world` seed (§11.2.3). CR-0003's entries stay; this CR adds checks for the same refs.

| #   | Ref(s)                        | Check(s)       | Measured                                                                                                                                                | Cause (spec)                                                                                                                                                                 |
| --- | ----------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | UX-08-01, 03, 04, 05, 06      | R2             | highlight 69 / 69 / 69 / 75 / 95 px higher; UX-08-05 also 6 px taller (two Gurmukhi lines at `--t-body-indic` 24px, SV-07; the drawing uses 22px lines) | The ux-world pending approval (₹14,600 to Taj Holiday Village) shows the pending strip above the composer (04-2 §23.4); chapter 8 is drawn without it (CR-0003 P4)           |
| 2   | UX-08-01, UX-08-06            | R4             | 15.7 % / 30.7 % light, 87.5 % dark                                                                                                                      | The R4 crop at the drawn box holds other rows once row 1 moves them; dark adds row 3                                                                                         |
| 3   | UX-08-01, UX-08-06, BP-MSG-01 | R3 (dark)      | ΔE 56.0 / 61.4 / 61.4 (`#F1F1F5` drawn, `#2B3FD6` app)                                                                                                  | X-145, (a) above                                                                                                                                                             |
| 4   | UX-08-06, BP-MSG-01           | R2, R3 (light) | bubble 26 px taller; ΔE 7.8 (`#0B0B10` drawn, `#26262C` quote fill dominant)                                                                            | 04 §6.4: the quote shows the sender name and up to 2 lines; the drawing shows one line with no name                                                                          |
| 5   | UX-09-01                      | R2, R3, R4     | round button 8 px right; ΔE 35.2 light / 20.6 dark; R4 21.7 %                                                                                           | 04 §1.1: side padding 16px when the main shell is below 900px (600px here); the drawing uses 24px. R3/R4 sample the drawn box, 8px off the button                            |
| 6   | UX-09-08                      | R3, R4         | ΔE 29.3 light / 51.2 dark; R4 23.9 % / 23.4 %                                                                                                           | The drawing's highlight is a button on a card in the thread; the app's is the `mic_blocked` banner action (04-2 §23.2), CR-0003 row 13, whose R1/R2 CR-0003 already disputes |

Disputed under this CR (only these; R checks not listed still count):

- UX-08-01, UX-08-06, UX-09-01: **R2, R3, R4** (rows 1–5).
- UX-08-03, UX-08-04, UX-08-05: **R2** (row 1).
- BP-MSG-01: **R3** (rows 3, 4).
- UX-09-08: **R3, R4** (row 6).

`scripts/tier-r.ts` `disputedChecks` now joins every entry that names a ref (a ref in CR-0003 and CR-0004 reports
"CR-0003 + CR-0004" and the union of their checks); before, only the first entry counted.

Not disputed, fixed in code instead: foo's bubbles put the time on its own line (ba071fe: UX-08-03/04 highlight 54 / 22 px
taller), because the 04 §3.1 spacer sat after the last paragraph (implementation-notes, M2 CI fixes 18); on 651799f the gaps
are 2.0 / 0.7 px. BP-COMP-01/02/04 dark R3 (ΔE 5.2–5.5 on ba071fe) pass on 651799f (ΔE 0) and are not disputed.

## (c) Proposals for the spec keeper

- **P1 · redraw.** Redraw the chapter 8/9 frames and BP-MSG-01 with the indigo dark bubble, the §6.4 quote and the 16px
  padding below 900px, or give chapter 8 a start state without the pending approval (CR-0003 P4).

- **Manifest:** `spec/spec-values.json` and two 04 chapters changed; `pnpm tsx scripts/spec-verify.ts --write` run in the same
  commit.
