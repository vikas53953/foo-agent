# Living face — proposal for §F15.9 (research, not yet law)

**Decided 2026-10-16:** Vikas chose **A · Two eyes** (decision card, 10:23 UTC). Adopted as `02-foundations-2.md` §F15.9 [X-35…X-38]; B and C below are history only. The law is §F15.9, not this file.

Status: **proposal** for the owner (Vikas). Visual options: `scratchpad/face/foo-face.html` ("foo's Face"). Nothing in 01–10 has been edited; the amendments below are written ready to paste.

Recommendation: **Direction A · Two eyes.** Two tall, soft eyes on foo's existing disc. Chosen over B (Living orb: reads like Siri/Copilot, moods blur below 48px, leans on colour, loses the black disc) and C (Little character: warmest, but the mouth turns to mush at 26px and reads as a cartoon, against the F16 no-illustration spirit).

---

## F15.9 Living face (proposed text)

### F15.9.1 What it is

| Item | Value |
|---|---|
| Who has it | foo (default face) and every helper (default face). Not the user. |
| Form | The §F15.4 avatar disc with two vertical rounded-rectangle eyes. No mouth, no brows, no outline, no gradient, no shadow. |
| Geometry (in % of the disc diameter, origin top-left) | Eye width **12%**, eye height **24%**, corner radius = half width (fully round ends). Eye centres at **x 36% / 64%**, **y 48%**. |
| Colours | foo: disc `--fg-1`, eyes `--bg-app` (light `#0B0B10` / `#FFFFFF`; dark `#F1F1F5` / `#0D0D11`). Helper: disc its `--h-*`, eyes `--on-helper`. Lids (used to shape eyes) are drawn in the disc colour. |
| Mood ring | Outside the disc, never inside. Stroke **2px** for discs ≤ 48px, **3px** above; gap to the disc **1.5px** at 26px, **2px** otherwise. The ring may overhang the avatar box; layouts keep that space clear (rows and headers already have it). |
| Ring colours | working `--accent` (28% arc, turning); stuck `--warn` (28% arc, still); needs you `--warn` (full); waiting on you `--warn` (dashed 5/3.3 of a 100-unit path, still); happy/celebrating `--ok` (full, fades out); offline `--fg-3` (dashed, only on picture/emoji faces). No other ring colours. |
| Sizes | Uses the §F15.4 ladder only: 26, 40, 48, 72, 96. Tray uses the hand-tuned 16/20/24/32 assets in F15.9.6. |
| Brand mark | §F15.1 is unchanged: the "f" mark stays the app icon, taskbar button, installer, About, and splash, and never animates. The living face is how foo looks inside conversations, rows, toasts and the tray. Splash/first run: the mark cross-fades into the face once (`--m-face-cross` × 2), then plays *Waking up*. |
| Rename | Renaming foo ("Sunny") changes the name only. The face stays the eyes unless the user picks another face. |

### F15.9.2 Tokens (to add to F7 and the token table)

| Token | Value | Use |
|---|---|---|
| `--face-eye-w` | 12% of disc | eye width |
| `--face-eye-h` | 24% of disc | eye height (resting) |
| `--face-ring` | 2px (≤ 48), 3px (> 48) | mood ring stroke |
| `--face-ring-gap` | 1.5px (26), 2px (others) | ring gap |
| `--m-face-blink` | random **4000–7000ms** per cycle; the close-open is the last 5% of the cycle (200–350ms, scaleY 1 → 0.08 → 1) | resting blink |
| `--m-face-blink-slow` | 8400ms cycle | listening, thinking, waiting |
| `--m-face-look` | 250ms `--ease-standard` | eyes moving to a new pose |
| `--m-face-drift` | 2400ms ease-in-out, alternate, ±5% | thinking |
| `--m-face-orbit` | 1600ms linear, infinite | working ring turn |
| `--m-face-scan` | 4000ms ease-in-out | stuck (eyes look left, right, back) |
| `--m-face-once` | 400ms `--ease-standard` | noticed pop (scale 1→1.1→1), needs-you nod (−5% then back) |
| `--m-face-wake` | 600ms `--ease-standard` | eyes open from scaleY 0.08 |
| `--m-face-happy` | 2000ms (ring in 150ms, hold, fade 600ms) | happy |
| `--m-face-party` | 1600ms; 4 sparks (2 `--accent`, 2 `--ok`), 5% radius, travel 35% outward, fade by 1200ms | celebrating |
| `--m-face-react` | 900ms (badge pops 0→1.15→1 in 430ms) | 👍 / ❤️ |
| `--m-face-sorry` | 3000ms | sorry |
| `--m-face-stopped` | 1500ms | stopped |
| `--m-face-level` | follows real audio level, updated every 100ms (same as live mic level) | speaking (3 bars, 4% wide, under the eyes) |
| `--m-face-cross` | 167ms (`--m-normal`); 83ms under reduced motion | every mood change is a cross-fade |

### F15.9.3 Moods and what triggers them (Article 12: only real state)

| # | Mood | Pose (A) | Trigger — real app state | Duration | Where |
|---|---|---|---|---|---|
| 1 | Resting | default eyes, blink | App open, nothing running, outside quiet hours | default | everywhere |
| 2 | Waking up | eyes open from a line | App start; back online; quiet hours end | 600ms once | header, row, welcome |
| 3 | Noticed | eyes 13×27%, pop | User message saved and handed to foo (same moment as 👀, Art. 16) | 400ms once | header, row |
| 4 | Listening | eyes move down 7% (toward the composer), slow blink | foo's composer has focus and a keystroke in the last 5s | while typing + 5s | header of the open chat only |
| 5 | Thinking | eyes up 8%, height 20%, drift | A reply request is really in flight and no words have streamed yet. Replaces the typing dots (F7) as a 26px face beside foo's next bubble | until first word / request ends | beside the bubble, header |
| 6 | Working | eyes height 18%, + accent ring turning | A job is WORKING (🛠) | whole job | header, row, tray, beside the checklist |
| 7 | Stuck | eyes scan left/right, still accent→warn arc | No checklist step finished for 3 minutes (stuck card, Art. 12) | until the card is answered | header, row, tray |
| 8 | Needs you | eyes 13×26%, one nod, full warn ring | A card is PENDING and not yet seen (Approval, Payment, Choice, Draft) | nod 400ms, then still | header, row, tray, toast |
| 9 | Waiting on you | eyes half-lidded, slow blink, dashed warn ring | The PENDING card has been on screen (⏳) | until answered | header, row |
| 10 | Happy | eyes become ^ ^ arcs, ok ring fades | Job DONE **with a Proof chip** (Art. 11). "⚠ Not checked live" → Resting instead | 2000ms, then Resting | header, row, toast |
| 11 | Celebrating | ^ ^ + 4 sparks | DONE with proof on a job the user approved (book, buy, pay, send) or foo's first-ever job. Max **once a day**; never in groups; never in quiet hours | 1600ms once | header, toast |
| 12 | Thumbs up | left eye winks + 👍 badge (bottom-right, 36% of disc) | foo puts 👍 on the user's bubble (F18.4) | 900ms, then the 👍 lands on the bubble | header |
| 13 | Heart | ^ ^ + ❤️ badge | foo puts ❤️ on the user's bubble | 900ms | header |
| 14 | Speaking | eyes up 5% + 3 level bars | foo's voice note is being made or played; bars follow the real level | while audio plays | header, beside the voice note |
| 15 | Sorry | eyes lower 5%, height 18%, outer top corners cut (inner corners higher) | Job FAILED (❌) or foo could not do it | 3000ms, then Resting | header, row |
| 16 | Stopped | eyes become flat lines | User pressed Stop / typed "stop" (⛔) | 1500ms, then Resting | header, row |
| 17 | Offline | disc `--bg-sunken` with dashed `--fg-3` edge, eyes outlined `--fg-3`, no motion | The Art. 29 offline line is showing | until back → Waking up | everywhere, tray |
| 18 | Asleep | eyes closed (downward arcs) + small "z" (≥ 40px only), 4000ms fade loop | Quiet hours (default 10:00 PM–7:00 AM) and nothing running | quiet hours | header, row, tray |

Priority when several are true: **Offline → Needs you → Stuck → Working → Waiting on you → Thinking → Listening → Asleep → Resting.** One-time moods (2, 3, 10–13, 15, 16) play on top and then return to whatever is true. Each chat's face (foo and each helper) shows that chat's own jobs and cards.

Rules:
- F15.9.3a The face reads only the job runner, card store, connection monitor, composer and clock. It never reads the AI's words. No *Thinking* without an in-flight request; no *Working* without a WORKING job.
- F15.9.3b Never laughs, smirks, rolls eyes, looks bored or sulks. No 😂 face. Reactions only 👍 ❤️ (F18.4).
- F15.9.3c No mood repeats its one-time animation within 10s; Celebrating at most once per day.
- F15.9.3d Groups: the face appears at 26px next to sender labels and shows only Working/Needs you rings; no one-time animations in groups.

### F15.9.4 Picture, emoji and letter faces

When the user picks a picture or emoji (F15.5 types 1–3) for foo or a helper, the picture is never altered. Mood shows only as: the ring (above), plus `--accent` ring for Listening (55% opacity, still) and Thinking (dotted, 3200ms turn), a `--bad` ring flash for Sorry, a dashed `--fg-3` ring and 60% greyscale for Offline, 55% opacity + "z" for Asleep, and the 👍/❤️ badge. Stopped shows nothing.

### F15.9.5 Reduced motion (add to F25.4)

| Animation | Normal | Reduced |
|---|---|---|
| Blink, drift, scan, nod, pop, wake | as tokens | none — static pose |
| Working ring | turning | still quarter-arc |
| Happy / Celebrating | ring fade, sparks fly | ring shown, sparks shown in final place, no movement |
| Mood change | cross-fade 167ms | cross-fade 83ms |
| Speaking level | follows audio | **still follows audio** (it is information, like the live mic level) |
| Asleep "z" | fades in and out | static |

### F15.9.6 Windows assets (09 owners to adopt)

| Asset | Sizes | Content |
|---|---|---|
| Tray icon (09 §9.8.1) | 16, 20, 24, 32 px × light-taskbar and dark-taskbar | 6 states: Resting (eyes), Working (+ `--accent` dot), Needs you (+ `--warn` dot), Done (+ `--ok` dot, 10s), Offline (dashed outline, grey eyes), Quiet hours (closed eyes, flat 1px lines at 16). Dot: radius 2.6px at (13,13) on the 16 grid, 0.8px knock-out ring in the taskbar colour. At 16: eyes 2×5px at x 5 and 9, y 4, whole pixels. Light taskbar: disc `#0B0B10`, eyes `#FFFFFF`; dark: disc `#F1F1F5`, eyes `#0D0D11`. Static PNG/ICO frames only; no tray animation. |
| App icon `.ico`, taskbar button | unchanged | the "f" mark (§F15.1). |
| Taskbar overlay (09 §9.10.1) | unchanged | amber count / green check. The face is not used on the taskbar. |
| Toast logo (09 §9.9.2) | 48×48 PNG, circle crop | the chat's face rendered at 48 in the mood that caused the toast (Happy for Done, Needs you for a card, Sorry for a failure), with its ring. Re-rendered per toast. |
| Welcome / first run (06-1) | 96 | "f" mark cross-fades to the face, then Waking up. |

### F15.9.7 Accessibility and contrast themes

- Narrator: the face is `aria-hidden` wherever the name is beside it (F15.5.3). Every mood already has a spoken counterpart (bubble badge, row pill, card, checklist, offline line), so the face adds nothing to hear. Where the face stands alone it is named "{name}" (no mood words).
- Colour is never alone: each ring also differs in shape (turning arc / still arc / full / dashed), and rows keep their word pills.
- Forced colours (F25.5): disc `Canvas` with 1px `CanvasText` edge (scaled 4% of the disc), eyes `CanvasText`, all rings `Highlight`, emoji badge `Canvas`/`CanvasText`. `forced-color-adjust: none` on the face, colours set explicitly.

### F15.9.8 Performance

- Pure inline SVG + CSS keyframes on `transform`/`opacity` only; no canvas, video, Lottie or images.
- Idle CPU < 1% with every visible face resting (only blinks run).
- All face animations pause (`animation-play-state: paused`) when the window is minimised, hidden, occluded or the session is locked, and for faces scrolled out of view (IntersectionObserver). Rows in the virtualised list render the static pose until visible.
- Blink timing is randomised per face so a list of faces never blinks in sync.

---

## Amendments to existing sections (ready to paste)

1. **§F15.1 Never** — append: "The living face (§F15.9) is not the mark; the mark itself still never animates."
2. **§F15.5** — insert before type 4: "**Living face** (default for foo and every helper; §F15.9)". Letter faces remain for the user and for fallback.
3. **§F15.5.2** — replace with: "Faces carry no online/offline presence dots. A mood ring (§F15.9.1) is allowed, only for real job, card and connection state."
4. **§F7 What animates** — add: "Living face moods (§F15.9.2 tokens). Typing dots next to foo's bubble are replaced by the 26px Thinking face."
5. **§F25.4** — add the rows in §F15.9.5.
6. **Article 12** — append one sentence: "The face too: foo's face shows only what is really running; it never shows a feeling the app's state doesn't back."

## Open questions for the owner

- A, B or C (recommend A).
- Should helpers in a group chat animate at all (proposal: rings only)?
- Celebrating: keep the once-a-day cap, or allow on every approved booking/payment?
