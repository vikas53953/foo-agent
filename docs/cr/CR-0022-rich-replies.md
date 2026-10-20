# CR-0022: Rich Replies: a kit of 13 pieces in A2UI, AI-made pages in a sealed box, and 6 input/output extras

- **Asked by:** Vikas, 2026-10-20. At 07:42Z he asked for a better input and output experience ("how we give the input from
  the composer, what the input will look like on the shell, and then how the output is coming", naming ChatGPT's
  Intelligent UI and Claude's artifacts, HTML, graphs, motion, tables, charts). He then picked on four decision cards
  in the thread "Rich input and replies":
  Q1 **C · Both now** (07:50Z), Q2 **B · All 13** (08:03Z), Q3 **A · A2UI** (08:07Z), Q4 **A · All 6** (08:08Z).
- **Why:** foo's replies today are text, a markdown subset, tables and 25 card types. Charts are bars only
  (02-2 §F19.9 "Not in v1: line charts…"), there are no maps, no controls inside a reply, and any HTML the AI writes is
  shown as text (04 §13). ChatGPT (Intelligent UI, 2026-10-07), Claude (inline visuals, 2026-03-12) and Gemini (dynamic
  view, Nov 2025) now answer with interactive pieces. On the input side, foo does not show what it understood and cannot
  take a question about one line of a reply.
- **Evidence:** teardown of 11 apps plus WhatsApp Business, Telegram, RCS, Apple Messages and Slack, every claim labelled:
  `/mnt/project-files/foo/rich-io/re/` (`patterns.md` is the harvest), library shelf `/mnt/project-files/foo/rich-io/libraries.md`,
  decision page https://claude.ai/artifact/8ezkZVsdsJsoLE18VcUfPM.
- **Status:** Direction approved by Vikas himself (four cards above). The CR text is checked by an independent reviewer
  (§(f)) under his approve-on-my-behalf rule (2026-10-18 14:56Z). DECISIONS **X-180**.
- **Order:** builds **after P1 Polish (CR-0021) is on main**. P1 owns `composer/**`, `messages/**`, `cards/**` and the
  Appearance page while it runs (§(e)). Vikas places the milestone in the build order.
- **Milestone label:** trace and fidelity ids take `M<n>` only (CR-0020 §(a)). The milestone is called **R1 Rich Replies**
  in prose. Its trace rows use the label of the plan milestone it ships alongside, which T1 fixes once Vikas sets the
  order (pick 1).

## (a) What changes for the user

1. **Kit pieces in replies.** When a picture helps, foo's reply holds one or more live pieces drawn by foo in foo's look
   (light, dark, high contrast, Animations Off/Basic). The 13 pieces are: line chart (also area and bar), map with stops, + / − and
   sliders, compare side by side, timeline, week calendar, tabs, timed checklist, quick calculator, goal ring,
   pick from a list, pick a time, short form. Pieces appear while the reply streams.
2. **AI-made pages in a sealed box.** When no piece fits, or the user asks ("make me a tool"), the AI writes a small page.
   It runs in a sandboxed frame with no network, no files and no access to accounts, keys or money. Any action it asks for
   goes through foo's normal gates. A kit piece or a one-line status shows first while the page is built.
3. **"foo read:" line** under the user's message: the people, places, dates, times and amounts foo understood.
4. **Ask about this:** select words in a foo reply, then ask a side question about them without stopping the job running.
5. **Big paste becomes a file:** a paste over 10,000 characters becomes a text file chip in the composer.
6. **Visuals setting:** Mostly words / Balanced (default) / Show me visuals. Mostly words means no kit pieces and no AI pages
   unless the user asks for one.
7. **Say-this vs do-this chips** after a reply: reply chips (grey, ↩, fill the composer, never send, as P1's follow-ups)
   and action chips (accent, icon: call, open map, add to calendar, open link). Action chips that act for the user go
   through the normal gates.
8. **Live stamp + Keep:** a piece built from live data shows "Data as of {time}" with Refresh. "Keep" saves a piece or AI page
   so it can be found again (pick 9).

## (b) Spec edits (T1 makes them, in this order)

| Where                                                                                           | Edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 02-2 §F19.9                                                                                     | Rename "Meters and bars (the only charts in v1)" to "Charts". Add line, area and bar charts with axes and one-line labels, plus the goal ring. One hue per chart stays the rule (`--accent`; status colours only for thresholds; never helper colours). Legends only when there are 2+ series. Pie and donut charts stay out. Forced colours as today.                                                                                                                                                                                                                                                 |
| 04 §12.1                                                                                        | A message holding a kit surface or AI page is a rich bubble.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 04 §13                                                                                          | New rows: "Kit surface" (fenced block `a2ui, §13.5 new) and "AI page" (fenced block `page, §13.6 new). Raw HTML outside a `page` block is still shown as plain text.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 04 §13.5 new                                                                                    | Kit surface: A2UI v0.9.1 messages (`createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`) restricted to foo's catalog (§(c)). Streaming: each complete message renders at once; an incomplete one is held back (same rule as 04 §14 markdown). Invalid or unknown component → that component is dropped, a quiet "Couldn't show part of this" caption is shown, and the reply text still shows. User actions in a surface are sent to the engine as an A2UI user action.                                                                                                             |
| 04 §13.6 new                                                                                    | AI page: HTML only, ≤ 512 KB, rendered in an `iframe sandbox="allow-scripts"` with `srcdoc` and CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:`, no `allow-same-origin`, no network. Host↔page traffic is MCP Apps (SEP-1865) style JSON-RPC over `postMessage`, logged. The page may only: report its size, send a chat message _draft_ (fills the composer), ask to open a link (the 04 §13 other-domain dialog rules), and ask for a foo action (always goes through the gate as if the user typed it). Frame states: building, ready, failed, kept. |
| 04 §10 / 04-2 §20–§23                                                                           | "foo read:" line (§(a)3) under the last user bubble: `--t-caption`, `--fg-3`, one line, ellipsis; tooltip with the full list; hidden when nothing was found; never for secrets (redaction rules apply). Big paste (§(a)5) joins 04-2 §22.5 paste rules, after the paste catcher (secrets are checked first).                                                                                                                                                                                                                                                                                           |
| 04 §1.9                                                                                         | Selecting text in a foo bubble shows an "Ask about this" pill (also in the message menu). It opens a reply strip quoting the words, marked "Side question". A side question is answered in the same chat without stopping a running job (pick 6).                                                                                                                                                                                                                                                                                                                                                      |
| Follow-up chips (the section CR-0021 adds; P1 branch not pushed yet, T1 cites its final number) | Adds action chips next to P1's reply chips: at most 3 action chips, each with a Fluent icon and the accent colour. They are never shown after an approval or payment card.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 05 §0.1                                                                                         | Two new card types: `kit` (a kit surface the engine posts as its own card, e.g. from a job) and `page` (an AI page). Inline surfaces inside a reply stay part of the message.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 06-2 §6.2 Appearance                                                                            | New row "Visuals": segmented control with Mostly words / Balanced / Show me visuals.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 08-0 §A                                                                                         | `appearance.visuals` ∈ `words` \| `balanced` \| `visuals`, default `balanced`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 08-0 §G.1                                                                                       | 25 → 27 card types (`kit`, `page`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 08-1 §3                                                                                         | New channels: `kit:action` (renderer → main), `page:rpc` (renderer → main, logged), `kit:refresh`, `keep:save`, `keep:list`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 08 engine                                                                                       | The system prompt carries the catalog (generated from the zod schemas, pick 2) and the visuals level. The reply parser gains `a2ui` and `page` blocks. The understood-entities extraction feeds "foo read:".                                                                                                                                                                                                                                                                                                                                                                                           |
| 10-acceptance                                                                                   | AT-340 to AT-379 (§(d)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| DECISIONS                                                                                       | X-180 (this CR).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## (c) The catalog (foo's A2UI catalog `foo.kit.v1`)

Standard A2UI parts used as-is: Row, Column, List, Text, Image, Icon, Divider, Button, TextField, CheckBox, Slider,
DateTimeInput, ChoicePicker, Card, Tabs. Modal is not used: foo dialogs stay foo's. foo's own components:

| Component                           | Data                                      | Notes                                                                                                               |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `LineChart` (variant line/area/bar) | series[] of {label, points[]}             | one hue; ≤ 3 series; numbers formatted by 02 money/number rules                                                     |
| `MapStops`                          | stops[] {name, lat, lng, note}            | MapLibre with a no-key basemap (pick 4); numbered pins, dashed route; "Open in Maps" action chip                    |
| `Stepper`                           | value, min, max, step, label              | + / − with keyboard; recomputes bound values                                                                        |
| `Compare`                           | 2–3 columns {title, rows[]} , highlight   | best column outlined, one line saying why                                                                           |
| `Timeline`                          | items[] {date, title, amount?}            |                                                                                                                     |
| `WeekCalendar`                      | days[], slots[] busy/free                 | uses the user's calendar only through M8 connectors                                                                 |
| `TimedChecklist`                    | steps[] {title, seconds?}                 | timers run in the renderer; done ticks saved in the surface's data model                                            |
| `Calculator`                        | inputs[], outputs[] {label, formula}      | formulas use a safe evaluator (+ − × ÷, ^, min, max, round, pmt); no code runs (pick 5)                             |
| `GoalRing`                          | value, target, label                      |                                                                                                                     |
| `ListPick`                          | rows[] ≤ 10 {title, sub}                  | answer counts like a Choice card answer (05 §5.3.4, reactions too)                                                  |
| `TimePick`                          | date, slots[]                             |                                                                                                                     |
| `ShortForm`                         | fields[] ≤ 6 (text, number, date, choice) | a field that looks like a password, card, OTP, CVV or key is refused and the Secret box is used instead (Article 8) |
| `LiveStamp`                         | asOf, refreshable                         | "Data as of {time}" + Refresh                                                                                       |

Any Button whose action would send, book, pay, delete or share is an approval request (Article 6), never a direct action.

## (d) Acceptance ids (new, 10-acceptance)

AT-340 to AT-352: one per kit piece (draws from a sample surface; keyboard and Narrator; light, dark and high contrast).
AT-353 streaming draws complete messages early and holds incomplete ones. AT-354 invalid component dropped with
caption, text kept. AT-355 user action round trip. AT-356 a gated button opens an approval. AT-357 to AT-362 AI page:
sandbox has no network (a fetch fails), no same-origin, size cap, RPC log, action goes through the gate, kit/status
shown first. AT-363 "foo read:" shows and never shows a secret. AT-364 Ask about this keeps a running job running.
AT-365 big paste → file chip, after the paste catcher. AT-366 Visuals = Mostly words → no pieces unless asked.
AT-367 reply vs action chips, none after approval/payment. AT-368 live stamp + Refresh. AT-369 Keep saves and lists.
AT-370 ShortForm refuses secret-like fields. AT-371 Calculator never runs code. AT-372 to AT-379 reserved.

## (e) Overlaps with CR-0021 (P1 Polish)

| Area                         | P1 owns                            | R1 adds                                                    |
| ---------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| 04-2 composer, `composer/**` | suggestion chips, send/stop states | big paste → file, side-question strip                      |
| 04 messages, `messages/**`   | message details, motion            | "foo read:" line, Ask about this pill, kit and page blocks |
| follow-up chips (CR-0021)    | reply chips                        | action chips beside them                                   |
| `cards/**`                   | card motion, job-done peak         | `kit` and `page` card types                                |
| 06-2 §6.2 Appearance         | zoom, Mica, Sounds                 | Visuals row                                                |
| 02 §F7 motion                | the 104-detail list                | pieces use P1's tokens and Presence; no new motion rules   |

R1 starts after P1 is on main. T1 re-reads CR-0021's merged text before editing the same sections.

## (f) Picks where the ask forks (each logged in docs/decisions/R1.tsv)

1. **Trace label** follows the plan milestone R1 ships alongside, fixed by T1 once Vikas sets the order.
2. **Catalog source of truth** is zod schemas in `src/shared/kit/`, which generate the AI prompt section and validate every
   message (json-render and OpenUI follow the same idea; no library needed for it).
3. **Renderer:** foo's own React components on top of the A2UI message model. Google's `@a2ui/react` is not used (its
   styling bug and foo's tokens; libraries.md).
4. **Map:** MapLibre GL (BSD-3) with a free basemap that needs no key (OpenFreeMap or Protomaps); offline → the stops list
   without the map. The library is added by T3 with a licence line in NOTICE.
5. **Calculator** uses a small hand-written expression evaluator, no `eval`, no `Function`.
6. **Side question** is a normal message with `reply_to` and a `side: true` flag. The engine answers it from context and
   does not cancel or re-plan the running job.
7. **Big paste** threshold is 10,000 characters (ChatGPT's, docs) and the file is `pasted-{time}.txt` in the chat's files.
8. **Visuals default** is Balanced. Mostly words still renders tables (04 §13.2) because they are text.
9. **Keep** saves into the chat's Files (right shell Media and files tab): kit surfaces as JSON plus a PNG snapshot, and
   AI pages as `.html` plus a PNG. A kept AI page reopens in the same sealed box.
10. **Charts library:** none. The 13 pieces are SVG drawn by foo (02 §F19 rules), so no chart dependency is added.

## (g) Review

Independent reviewer verdict: (filled in by the review step before the PR is marked ready).
