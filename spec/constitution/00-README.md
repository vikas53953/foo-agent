# The foo Constitution

foo is a personal agent you text, built as a WhatsApp-style Windows desktop app. It remembers you, messages you first, books and pays only with your tap, and runs on your own PC with your own AI.

This folder is the **complete build spec**. A coding agent builds foo from it with **no guessing**. If something you need is not written here, you have found a gap: stop, log it in `GAPS.md` (one line: what is missing, where you looked), take the most conservative option, and continue.

Approved by Vikas on 2026-10-16 ("Yes, this is foo… I haven't rejected anything from this Blueprint"). Visual source of truth: Blueprint v1, https://claude.ai/artifact/LaYcN1VuT1JpZX2r7mYZPs. Blueprint v2 (everything in this folder, drawn): https://claude.ai/artifact/8XnUTgLvk1wees2WqGaSa2.

## Order of authority (highest wins)

1. Vikas's own words (recorded in `../../omnibot-re/foo/PIPELINE.md`).
2. **Articles** in `01-articles.md` (the laws: safety, trust, words), then **`DECISIONS.md`** (binding cross-chapter decisions X-nn; they override any chapter text that disagrees).
3. **Foundations** in `02-foundations.md`, then `02-foundations-2.md` and `02-foundations-3.md` (F11–F31) (every token: type, colour, spacing, shape, motion, icons, accessibility).
4. Surface specs `03`–`06` (a chapter may be split into `-1`, `-2` parts) (shell, messages + composer, cards, screens).
5. Behaviour specs `07`–`09` and `12` (journeys, functions + engine, Windows integration, the R25–R31 journeys). `08-0-canonical-names.md` and `08-5-shared-types.md` rank above every chapter (after DECISIONS) for names and shared shapes.
6. `10-acceptance-1.md`, `10-acceptance-2.md` (how we prove each part is done) and `11-fidelity.md` (process only: how we prove the build matches; it changes no value).
7. Research evidence in `research/` (including `research/capabilities.md` and `research/features-catalogue.md`) and `../../personal-agent-re/` (why each value was chosen). Evidence never overrides a spec value; if they disagree, the spec wins and you log it.

## Files

| File | What it decides |
|---|---|
| `00-README.md` | This page: how to use the constitution |
| `01-articles.md` | The 31 laws foo must never break |
| `02-foundations.md` | Design tokens: every colour, size, font, radius, shadow, timing, icon |
| `02-foundations-2.md`, `02-foundations-3.md` | Foundations F11–F31: layout grid, layers, scrolling, icons in depth, brand and faces (including foo's living face, §F15.9), empty states, pictures, emoji, numbers and dates, loading, feedback, sound, voice and tone, languages, accessibility depth, component state matrix, pointer and tooltips, theming, token files, polish bar |
| `DECISIONS.md` | Binding cross-chapter decisions X-01… (they override any chapter text that disagrees) |
| `03-shell-1.md`, `03-shell-2.md` | Window, title bar, banner strip, left shell (chat list), headers, main shell, right shell, footers, resizing |
| `04-messages-and-composer.md`, `04-messages-and-composer-2.md` | Input text (your bubble), output text (foo's bubble), markdown, streaming, reactions, status badges, the composer |
| `05-cards.md` (index), `05-cards-1.md`, `05-cards-2.md`, `05-cards-3.md` | Every card inside a chat: shared card rules, brief, checklist, choice, approval, payment, draft, secret box, paste catcher, sign-in, connect, plan, routine, proof, memory chip, stuck, error, spend cap, table, file, place, voice note |
| `06-screens.md` (index + shared rules), `06-screens-1.md`, `06-screens-2.md`, `06-screens-3.md` | Every page and window: first run, helpers, profiles, groups, settings, memory, routines, activity, spend, watch live, search, viewer, confirms, Windows Hello, updates, crash, safe mode, shortcuts sheet |
| `07-journeys-1.md`, `07-journeys-2.md` | Index of the end-to-end journeys J1–J23 (full text in `research/journeys-1..4.md`; J24–J30 in `12-features-*`), the two state machines, journey conflicts resolved |
| `08-0-canonical-names.md` | Canonical names and shared models (settings.json schema, shared TS types and casing, data-testid scheme, copy keys, paths, badge, card types and states, permissions, activity, deletion, windows, deep links, schema additions, photo check, railway rules, round-2 rulings §H.2); binding after DECISIONS, before every chapter [X-53…X-80, X-90…X-141] |
| `08-5-shared-types.md` | Every shared TypeScript shape that no chapter holds in full (view types, card payload members, built-in routine tasks, Zustand data slices, the `foo-native` export list, canonical JSON and ids); same rank as 08-0; nothing in the constitution cites `review/*.md` [X-111] |
| `08-functions-and-engine-1.md`, `-2.md`, `-3.md`, `-4.md` | Every function, data model, storage, IPC, your-AI engine, connectors, browser, approvals and payments, memory, routines runner, privacy, errors, tests; `-4` holds the verbatim AI prompt texts, `<act>` schemas, job-runner limits, tool detail, gate and payment detail, adapter detail and engine copy keys (§24–§31) |
| `09-windows.md` | Windows integration rules (identity, installer, title bar, toasts, taskbar, tray, startup, scaling, keyboard shortcuts, Hello, updates, crash, uninstall) |
| `10-acceptance-1.md`, `10-acceptance-2.md` | Acceptance tests (per journey and per article) and the QA checklist per surface |
| `11-fidelity.md` | How we prove the build matches the spec: frozen spec `spec-v1.0`, golden pictures, exact copy, spec values, Change Requests, milestone fidelity reports (approved, X-99; Article 31) |
| `12-features-r25-r31-1.md`, `12-features-r25-r31-2.md` | The seven v1 additions R25–R31 as journeys J24–J30 with cards, copy keys, settings, test ids and tests: part 1 J24 Ideas, J25 Trains, J26 Recharges and billers (AT-158…AT-199); part 2 J27 Catch me up, J28 Photos and papers in, J29 Send to foo, J30 Private chat (AT-230…AT-266). Approved together as one set (X-89, X-100) |
| `research/capabilities.md`, `research/features-catalogue.md`, `research/living-face.md`, `research/web-tools.md` | Research evidence (`living-face.md`: the three face directions; A adopted as 02 §F15.9, X-35; `web-tools.md`: search, read and browse tools; Vikas chose cloud tools with his own keys, X-46, not its all-local recommendation): computer use, browser use, connections and other capabilities (with proposed spec deltas); the features catalogue. Evidence only, never overrides a spec value |
| `GAPS.md` | Gaps found while writing or building (append only) |
| `CHANGELOG.md` | Every editorial change made to align the chapters (file, section, before → after, reason) |

## Read in this order (build agent)

1. `00-README.md` (this page).
2. `01-articles.md`: the laws. Keep them open while building.
3. `DECISIONS.md`: binding cross-chapter decisions; where a chapter disagrees, DECISIONS wins.
4. `02-foundations.md` → `02-foundations-2.md` → `02-foundations-3.md`: build the token file first (CSS custom properties, light and dark), then the F11–F31 rules (state matrix, empty states, icons, feedback, accessibility).
5. `09-windows.md`: app identity, installer, single instance, window, tray, shortcuts (the frame everything runs in).
6. `08-0-canonical-names.md` (the names every chapter must use) → `08-5-shared-types.md` (the shared shapes) → `08-functions-and-engine-1.md` → `-2.md` → `-3.md` → `-4.md`: processes, storage, IPC, engine, approvals, memory, routines, then prompts, act schemas and engine limits.
7. `03-shell-1.md` → `03-shell-2.md`: the three-column shell and banner strip.
8. `04-messages-and-composer.md` → `04-messages-and-composer-2.md`: bubbles, badges, composer.
9. `05-cards.md` → `05-cards-1.md` → `-2.md` → `-3.md`: every card.
10. `06-screens.md` → `06-screens-1.md` → `-2.md` → `-3.md`: every page, dialog and window.
11. `07-journeys-1.md` → `07-journeys-2.md`: check each journey end to end against what you built.
12. `12-features-r25-r31-1.md` → `12-features-r25-r31-2.md`: the R25–R31 journeys (built in M15).
13. `10-acceptance-1.md` → `10-acceptance-2.md`: run the tests; a part is done only when its tests pass.
14. `11-fidelity.md`: the fidelity gates every milestone must pass.
15. `GAPS.md` and `CHANGELOG.md`: known gaps and what the editor changed.
16. When you need the why behind a value: `research/capabilities.md` and `research/features-catalogue.md` (evidence only).

## How values are written

- Sizes are CSS px at 100% Windows scaling (1 px = 1 DIP). Use `rem` in code with `1rem = 16px` so Windows text scaling (100–225%) works.
- Colours are hex. Every colour token has a **light** and a **dark** value.
- Every spec value carries its evidence in brackets: `[exact: file:line]`, `[measured: ±4px]`, `[reported]`, `[foo decision]`. A `[foo decision]` is a choice we made on purpose; build it as written.
- Copy (words on screen) in "double quotes" is final. Do not reword it. `{name}` marks a variable.

## Words used in this folder

| Word | Meaning |
|---|---|
| foo | The app, and also the main agent's default name (the user can rename it; code uses `{agentName}`) |
| Helper | A second agent with one job (Trips, Money, Home…). Each helper is its own chat |
| Job | One piece of work foo is doing (book a hotel). Has a checklist and a state |
| Card | A rich message inside a chat that you can tap (choice, approval, payment…) |
| Your AI | The AI service the user already has (Claude, ChatGPT, Gemini, a local model) that foo drives |
| Left shell | The chat list column |
| Main shell | The open conversation |
| Right shell | The side panel (Doing now, Using, What I know, Spent) |
