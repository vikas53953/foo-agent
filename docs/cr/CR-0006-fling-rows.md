# CR-0006: Light message rows while the user flings the list (PERF-04)

- **Asked by:** M2 CI fixer, 2026-10-18, from the Full suite on 1434188 (job 117547851225, PERF-04) and the independent review
  of e5e5866.
- **Spec sections:** 10-acceptance-2 §E (PERF-04: fling scroll through the 5,000-message chat at 60 fps, ≤ 1 % of frames over
  16.7 ms); 03-shell-2 §3.6.4 (virtualised list, measureElement on every row); 02-2 §F13.3 (row estimates); 04 §1.4 (tail
  corners), §1.8 (row name and keys), §3 (meta), §4 (badges), §8 (reaction chips), §10.1 (images), §10.8 (file chips),
  §12–§13 (answers, markdown).
- **Status:** Approved under overnight instruction (Vikas, 2026-10-17 18:52Z/18:59Z: continue the overnight build, don't wait
  for my approval), for morning review
- **Approved by Vikas:** pending morning review (overnight instruction above, foo project M2 build thread)

## (a) Why

On the hosted runner PERF-04 measured 9.5 % of frames over 16.7 ms (job 117547851225) against 0.6 % with no input and 0.0 %
for 200 wheel events on the chat header in the same run. Each 1200 px wheel brings a new screen of rows, and mounting a
screen of full bubbles (React components, markdown, tooltips, meta, badges, measurement) is the long frame. Rendering every
row as an empty box removed it entirely (local harness, CPU ×2: 0 of 422 frames over 20 ms), so the virtualiser and the
history pages are not the cause; the full bubbles are.

## (b) The change

While the **user's own** scrolling (a wheel, touch move or key on the list, the scroll event within 250 ms of it) moves faster
than **4 px/ms** (`FLING_PX_PER_MS`, about four 900px screens a second; a whole wheel arriving as one scroll event is timed as
one frame), message rows render as `FlingRow` (`src/renderer/messages/FlingRow.tsx`). When the virtualiser's isScrolling ends
(150 ms after the last scroll event) every row is the full row again and is measured; the above-the-fold corrections keep the
view in place. A slow wheel, a click, a programmatic scroll (tests placing a row, jumps, find) and the at-rest state never
show light rows. The row that holds focus stays full. Date separators and other non-message rows stay full.

| Part of the row                                                                                                                                                | Full row                                | Light row (fling only)                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| Row box, position                                                                                                                                              | measured, positioned by the virtualiser | the row's known height (measured before, else the §F13.3 estimate), clipped; not measured |
| `role="listitem"`, accessible name (§1.8), `data-message-id`, `tabIndex`                                                                                       | yes                                     | yes (same name)                                                                           |
| Row gap (§1.2), side, group indent, hold width (72 % / `--bubble-max`, rich `--bubble-max-rich`)                                                               | yes                                     | yes (same classes)                                                                        |
| Bubble fill, shadow, radius, tail corners (§1.4), padding, `lang` (§2, §13)                                                                                    | yes                                     | yes (same classes and attributes)                                                         |
| Text                                                                                                                                                           | markdown, WhatsApp styling, links       | plain runs of the same text (first 600 characters), the §3.1 trailing spacer              |
| Meta: time, tick (§3)                                                                                                                                          | yes, with tooltips                      | time and tick glyph, no tooltips, no "Edited", no 👍/👎 mark, no backup mark              |
| Images (§10.1)                                                                                                                                                 | tiles with the picture                  | the same tiles empty, in their placeholder fill (`--bg-sunken`)                           |
| Badge (§4), reaction chips (§8), quote (§6.4), file chips (§10.8), link preview, sources, worked line, voice player, Read more, emoji-only sizes, sender label | yes                                     | not drawn                                                                                 |
| Cards                                                                                                                                                          | the card                                | the card box (`--card-w`, `--r-lg`, `--bg-raised`, 1px `--line`) with its title           |
| Markers                                                                                                                                                        | the marker                              | its text, centred, `--t-caption` `--fg-3`                                                 |
| Toolbar, menus, hover, test ids                                                                                                                                | yes                                     | none (nothing on a light row can be clicked)                                              |

At rest, nothing differs from the spec: Tier R, FID-14, axe (ART-26a) and ART-21a run at rest, and their scrolling is
programmatic.

## (c) Measurements

Local Chromium harness serving the real renderer and IPC with the perf seed, the test's fling (1200 px wheels with the same
round trips), frames over 20 ms (headless frames jitter around 16.7 ms: the no-input control shows 30–50 % "over 16.7").

| Build                                                    | CPU ×2                                                              | CPU ×4               |
| -------------------------------------------------------- | ------------------------------------------------------------------- | -------------------- |
| No light rows (1434188), 150 wheels each way             | 13.0 % (120 of 920)                                                 | 22.8 % (361 of 1586) |
| Empty boxes for every row (floor experiment)             | 0 of 422                                                            | 2.2 % (15 of 693)    |
| Light rows, first version (box, colours, text only)      | 0.6 % (3 of 496)                                                    | 1.8 % (15 of 826)    |
| Light rows as in (b), 150 wheels each way                | 0.2 % (1 of 627)                                                    | 5.2 % (51 of 983)    |
| Light rows as in (b), the test's full fling to both ends | 0.6 % (10 of 1609); controls 1 of 298 (no input), 1 of 206 (header) | 5.2 % (133 of 2548)  |

Cost of each addition on ×2 (150 wheels each way; frames over 20 ms / frames for the fling, fewer frames meaning shorter
wheels): all of (b) 1 / 627; without the name 0 / 582; without the meta 3 / 558; without the image boxes 5 / 619; without
`lang` 1 / 593; without the tail corners 1 / 618; without all five 1 / 549. At ×2 every variant sits at the no-input floor;
at ×4 the fuller row costs about 3 points over the first version.

**Alternative: no light rows.** PERF-04 stays at about 9 % on the hosted runner (9.5 % in job 117547851225; 13 % at ×2 and
23 % at ×4 locally) and fails its 1 % budget; it would then need a CR on the budget or the runner instead.

## (d) Proposals for the spec keeper

- **P1.** Add to 03-shell-2 §3.6.4: "During a fast fling by the user (faster than four screens a second), message rows may
  render a light version (same box, fill, corners, side, plain text, time and tick, image placeholders, name) and are measured
  when the scroll settles (150 ms after the last scroll event)." and to 02-2 §F13.3 that light rows are not measured.
- **P2.** Or keep the full rows and change PERF-04's budget or runner (see the alternative above).
