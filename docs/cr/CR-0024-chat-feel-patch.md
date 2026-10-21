# CR-0024: C1 Chat feel fast patch: one answer once, a voice, one bubble, and the small things that made chatting feel cheap

- **Asked by:** Vikas, 2026-10-21 06:11Z (thread "Chat feels cheap"): "this is so cheap exp over all", with two screenshots
  from the P1 + R1 build on his PC. Diagnosis page: https://claude.ai/artifact/LTxRhZvvMQ7GahY4LWNGEy. He picked
  **"Fast patch: all 12 now"** on the decision card at 06:16Z.
- **Why:** two bugs (every reply posted twice when he wrote during a job; the 👎 chip covering the text) and ten feel items whose
  cause is the written spec: `rules.md` told the AI to mirror his lower-case typing, the renderer cut every answer into up to
  three bubbles each with its own time, `identity.md` held one line of personality, "what can you do" was left to the AI, and the
  dark user bubble used the loud button indigo.
- **Spec sections:** 02 F2 (`--bubble-me`, `--on-bubble-me-soft`); 04 §1.2 rhythm row, §8 anchor, §12.3, §12.4, §13.7 (new),
  §17.1; 04-2 §21.7, §26; 05 §5.2.2; 08-2 §5.5 items 3–4; 08-4 §24.2, §24.3, intake rule line, §25.2 tag note; 10-2 §C.10
  (new); `spec/spec-values.json` SV-04; DECISIONS X-182.
- **Status:** Approved by Vikas's approve-on-my-behalf rule (his messages 2026-10-18 14:56Z and 14:59Z) after the independent review in §(f); the direction is his own pick (06:16Z card). DECISIONS X-182
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows and the milestone label

AT-420…AT-433 (10-2 §C.10), AT-434…AT-439 reserved. Trace rows are labelled **M9**, the label P1 and R1 used (trace-check only
accepts `M{n}`; C1 ships on top of them). AT-420 is live in this commit (`test/unit/jobs/steer.test.ts`); the rest are pending
and owned by tickets T2–T4 (`/mnt/project-files/foo/prep/C1-tickets.md`).

## (b) The twelve items

| #   | What Vikas saw                                           | Spec before                                                                     | Spec after                                                                                                                                                                                 |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | Every reply twice when he sent two messages during a job | 08-2 §5.5 item 3 said "`answered` → the AI's `say` is posted", read per message | One step turn's `say` posts **once**; "Got it, I'll fold that in." at most once per turn. Code: `steer.ts` `settle`                                                                        |
| B2  | 👎 chip on top of "so."                                  | 04 §8 anchor `bottom: -10px` (a 24px chip covered 14px of the bubble)           | `bottom: -18px`; 24px gap below (04 §1.2 row)                                                                                                                                              |
| F1  | All lower case "i'm foo"                                 | 08-4 §24.3 "Mirror the user's casing."                                          | "Always write in normal sentence case with capital letters, even when the user types in lower case." Language mirroring (Art. 23) is unchanged                                             |
| F2  | One answer cut into 3 bubbles, 3 times, 0.8–2.5 s apart  | 04 §12.3 chat mode = 1–3 bubbles                                                | Chat mode = **one** bubble, paragraphs 8px apart inside; 04 §12.4 sender label also in foo's and helpers' own chats                                                                        |
| F3  | "what can you do" → a brochure                           | X-110: the AI writes it, the engine appends the Ideas link line                 | The AI writes one sentence; the engine posts the app-built Capabilities card (04 §13.7): ≤ 4 rows from connection state, "Try it ›" fills the field, safety line, Ideas line in its footer |
| F4  | No personality; "sorry for the wait"                     | 08-4 §24.2 one line                                                             | A "How you sound" line and one good/bad example in both identity blocks (foo's block stays one paragraph: the builder splits the file at blank lines)                                      |
| F5  | Walls of text                                            | "One idea per paragraph … a list only when comparing"                           | "Put the answer in the first sentence … a short list when you give three or more things"                                                                                                   |
| F6  | His bubble shouts                                        | 02 F2 dark `--bubble-me` `#2B3FD6` (= `--accent`)                               | `#2C359A` (white ≈ 10:1, `--on-bubble-me-2` ≈ 7:1); `--on-bubble-me-soft` `#232B7E`; buttons keep `--accent`. X-145 (indigo) stands; only the step changes                                 |
| F7  | Faint icons, only under the last answer                  | 04 §17.1 latest answer only                                                     | Also under an older answer on hover or focus, fading in over 120ms                                                                                                                         |
| F8  | Plain chips                                              | 04-2 §21.7 text only                                                            | 32px chip, 16px icon from a fixed word map, `--t-small`, `--line-strong` outline                                                                                                           |
| F9  | ⏳ on his question for minutes                           | 08-2 §5.5 item 4: badge follows the job                                         | An `answered` steer shows ✓✓ read at once; folded ones still follow the job                                                                                                                |
| F10 | Slow news search, silence until he asked                 | 05 §5.2.2 had only the 60 s "Still working" line                                | After a failed tool call the job carries on: "Slow here, trying another way" under the current step, cleared on the next good call                                                         |

## (c) Contracts T1 lands

- `steer.ts` B1 fix + AT-420 tests (red on the old code, green now).
- Copy keys `kit.capabilities.*` (18) and `cards.checklist.retry_other_way`, listed in `scripts/copy-pending.json` with their
  owning ticket. Test ids `kitCapabilities`, `kitCapabilitiesRow`, `kitCapabilitiesTry`.
- Prompt files `identity.md`, `rules.md`, `intake.md` copied byte for byte from 08-4 (F1, F4, F5 and the F3 intake line),
  `resources/prompts/MANIFEST.json` re-hashed, AT-422…AT-424 live (`test/unit/prompt/c1-voice.test.ts`); the PromptBuilder
  budget tests shortened their filler text by the ~650 characters part 1 grew.
- Tokens `--bubble-me` dark `#2C359A` and `--on-bubble-me-soft` dark `#232B7E` (`design/tokens.json`, generated CSS).
- `en-IN.json` lost two duplicate keys (`app.panel.kept.label`, `.empty` were listed twice with the same text; JSON keeps one).
- Trace rows AT-420…AT-433; spec manifest rewritten.

## (d) Not changed

- The setup header ("Step 2 of 4") and Find your AI: thread "AI setup and onboarding bugs".
- Stream mode (§12.3 second row), the typing indicator, cards.
- The light-theme user bubble (`#0B0B10`).
- The status badge geometry (04 §4.3, 24px at `bottom: -10px`): Vikas's screenshots show it clear of the text (it sits under
  the meta corner). T3's journey checks a short bubble with ⏳ and reports if it ever covers words.

## (e) Picks where the spec was silent

1. Rows of the Capabilities card: email always (hint says whether Gmail is connected), WhatsApp only when linked, then price,
   compare, remind; at most 4. Why: the first row should be the thing most people try first, and a row that cannot work yet
   still teaches what foo does.
2. "Try it" is the kit Button action `composer.fill`, handled in the renderer only, so it can never send or reach the gate.
3. The Ideas link line (X-110) stays out of the card while the Ideas page is a placeholder (`PlaceholderPage.tsx`): a link
   to an empty page is worse than none. Its copy key lands with the Ideas page's milestone.

4. Chip icon word map is fixed (no AI choice), first match wins, `Edit` otherwise (only icons already in the 02 F6 list).

## (f) Independent review

One Fable reviewer, 2026-10-21: **PASS WITH FIXES**. Acted on: old-behaviour leftovers fixed in 08-4 §25.9, 04 §2 Fill, 04
§17.1 heading, §17.3, §17.4, 04-2 diagram, 10-1 AT-278, 10-2 §C.3 row, 07 J7 diagram, 12-1 G1-4 row, 08-0 §G.17 line, DECISIONS
X-110 (placement superseded by X-182); icons limited to the 02 F6 list (`People`, `Clock`, `Edit` instead of `Chat`, `Alarm`,
`Sparkle`); T4 owns `src/shared/types.ts` and `src/main/db/rows.ts` for the retry flag; sizes 24px and `--s1` (multiples of 4,
AT-279); `composer.fill` honoured only on the engine-built card and kept out of the AI catalogue (T2 owns `catalog.ts`).
Noted: X-181 is reserved for the P2 Feel draft (CR-0023). Dismissed: "SuggestionChips.tsx does not exist" (it does:
`src/renderer/composer/SuggestionChips.tsx`). Text approved on Vikas's behalf (his rule of 2026-10-18 14:56Z / 14:59Z).

## (g) Tier R disputes

Filled by T3 if the golden lane reports the bubble colour (F6) or one-bubble (F2) differences against the drawings.
