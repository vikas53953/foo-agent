# CR-0002: M1 shell, where the Blueprint drawing and the written spec disagree

- **Asked by:** builder (M1), 2026-10-17, after the first Tier R run of the M1 Blueprint refs (golden lane, PR #3) and an
  independent checker's classification of every difference.
- **Spec sections:** 11-fidelity §11.2.4 (R1, R2), §11.2.7 (when the reference itself is wrong); 03-shell-1 §3.1, §3.4;
  03-shell-2 §3.6.2, §3.7.3; 02-foundations-2 §F13.2; DECISIONS X-128, X-138, X-148, X-153, X-154.
- **Change:** the app follows the written spec in each row below. The Blueprint v2.1 mock (`spec/refs/bp/foo-blueprint-v2.html`)
  is older than these lines. Proposal: the spec keeper redraws these parts of the mock to the written spec, re-renders the
  M1 BP refs, and Tier R re-runs. Until then each listed check is DISPUTED (CR-0002), not a Fail.

  | #   | Drawing shows                                                     | App and spec                                                            | Spec                          |
  | --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------- |
  | 1   | Window 1280 × 820 with 1px borders (shells 786 tall)              | 1280 × 800 content, 32 title bar, shells 768 tall                       | 03-shell-1 §3.1               |
  | 2   | Icons as text glyphs ⌕ ⋯ ＋ ✕ ⚙ ▣ ▯ — ☐ (R1 counts them as words) | Fluent icons with names for Narrator, no text                           | 02 §F29 icon set              |
  | 3   | No scrollbars                                                     | Native scrollbars, classic 15px on this runner, never restyled          | 02-foundations-2 §F13.2       |
  | 4   | "Needs you: …" status lines in accent blue                        | `--warn` orange                                                         | 03-shell-2 §3.6.2.1, §3.7.3.1 |
  | 5   | Doing now: no tabs, "!" disc glyph                                | In progress · Scheduled · Done tabs, Warning and CheckmarkCircle glyphs | X-148, §3.7.3.1               |
  | 6   | Chat header: no private toggle; Watch live filled dark            | EyeOff private toggle; Watch live outlined                              | §3.6.2.2, X-128               |
  | 7   | Trips row preview "typing…"                                       | "Working on Flights for 12 Dec…"                                        | §3.4.6 rule 3a, X-154         |
  | 8   | News & X as a full row                                            | Folded 44px line "· Done Mon"                                           | §3.4.7, X-153                 |
  | 9   | Money unread as a wide pill; Family group as a letter             | 20px round badge; 3-face group avatar                                   | §3.4.5                        |
  | 10  | Memory date "Sat 3 Oct"; straight apostrophes                     | "3 Oct" (`{d Mon}`); typographic ’ from copy.json                       | §3.7.3.3, 08-0 §D             |

  Not part of this CR (reported in the M1 fidelity report instead): data differences between the drawing and the `ux-world`
  seed (two WhatsApp group rows, a third memory fact, no Gmail or Calendar chips yet), the message column and composer (M2),
  and native caption buttons (drawn by Windows, masked).

- **Status:** Ready for Vikas
- **Approved by Vikas:** pending
- **Manifest:** no `spec/` change in this CR; the redraw and re-render come with the spec keeper's follow-up.
