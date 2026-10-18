# CR-0017: M13 trace rows, Blueprint ids, contracts and the picks the M13 build makes where the spec forks

- **Asked by:** the M13 integrator (ticket T1, `/mnt/project-files/foo/prep/M13-tickets.md`), 2026-10-18, while building M13
  (foo-plan §5 M13: Settings and the remaining screens).
- **Spec sections:** 06 §0.5, §0.9–§0.13; 06-1 §3–§5; 06-2 §6; 06-3 §9, §10, §12–§14, §19; 08-0 §A, §B.2, §C, §D, §E.3; 08-1 §3.2,
  §4.4.2, §4.6; 08-3 §17, §19.3; 08-5 §3.2–§3.7; 10-acceptance-1 §B; 10-acceptance-2 §C.5, §D, §E; 11-fidelity §11.12.
- **Status:** Pending the independent review in §(f)
- **Change:** `spec/trace.csv` (rows below), `spec/spec-values.json` (SV-36 `testid: "search-overlay"`; it stays `pending: M13`),
  `spec/constitution/DECISIONS.md` (row X-170); `scripts/golden-manifest.ts` (`BP_M13`, `EARLY_STEPS`) and `golden/manifest.json`
  regenerated (`pnpm golden:manifest`). No other `spec/` or `golden/` file changes.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows (`spec/trace.csv`), Milestone M13, all `pending`

| Id                                                                  | Test file                                                                              | Ticket                                          |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------- |
| AT-009 (Account → Replace key row half, G-M5-10), AT-147, AT-283    | `test/e2e/m13-settings-a.spec.ts`                                                      | T2                                              |
| AT-091                                                              | `test/e2e/m13-settings-b.spec.ts`                                                      | T3                                              |
| AT-156                                                              | `test/integration/settings/unprompted.test.ts`                                         | T3 (behaviour half with M7)                     |
| AT-222                                                              | `test/integration/settings/cap-below.test.ts`                                          | T3                                              |
| AT-094                                                              | `test/integration/settings/by-words.test.ts`                                           | T7                                              |
| AT-148                                                              | `test/unit/m13-cursor-scan.test.ts`                                                    | T1                                              |
| AT-149                                                              | `test/e2e/m13-drawings.spec.ts`                                                        | T4                                              |
| AT-096, AT-097                                                      | `test/e2e/m13-search.spec.ts`                                                          | T5                                              |
| AT-098, AT-099, AT-223                                              | `test/integration/search/{no-ai,ask,secret}.test.ts`                                   | T5                                              |
| PERF-05                                                             | `test/perf/PERF-05.test.ts`                                                            | T5                                              |
| AT-065                                                              | `test/e2e/m13-helpers.spec.ts`                                                         | T6                                              |
| AT-068, AT-226                                                      | `test/integration/helpers/delete.test.ts`, `test/integration/data/chat-delete.test.ts` | T6                                              |
| AT-066, AT-216, AT-217                                              | `test/integration/helpers/{routing,two-fit,pause}.test.ts`                             | T7                                              |
| AT-069, AT-071, AT-218                                              | `test/integration/helpers/{group-private,group-loop,group-owner}.test.ts`              | T7                                              |
| AT-067                                                              | `test/integration/helpers/receipts.test.ts`                                            | T7 (e2e half after M10a)                        |
| ART-01a, ART-01b, ART-14                                            | `test/articles/ART-{01a,01b,14}.test.ts`                                               | T7                                              |
| ART-13b                                                             | `test/articles/ART-13b.test.ts`                                                        | T4 (meters and Spend; purchase half after M10a) |
| UX-06-01…08 · UX-19-01…10 · UX-20-01…06 · UX-22-01…08 · UX-24-01…12 | `test/fidelity/ux/UX-{06.helpers,19.groups,20.search,22.spend,24.settings}.spec.ts`    | T8                                              |
| UX-15-10 (G-M9-03)                                                  | `test/fidelity/ux/UX-15.replay.spec.ts`                                                | T8                                              |
| UX-25-01, UX-25-02 (G-M13-08)                                       | `test/fidelity/ux/UX-25.activity.spec.ts`                                              | T8                                              |
| BP-SCR-05, -06, -07, -08, -11, -12, -15, -16, -17, -19, BP-CARD-25  | `test/fidelity/bp/BP-screens-m13.spec.ts`                                              | T8                                              |

Each row turns `live` in the commit that lands its test (FID-18 checks live rows only). The §C.5 per-surface checklist is
tracked by the e2e files above (it has no ids of its own). SV-36 needs no trace row (FID-14 reads `spec/spec-values.json`).

Blueprint ids (`BP_M13`): `#scrgal > .scr:nth-child(n) > .body` for n = 5 New helper, 6 Helper profile, 7 New group, 8 Settings,
11 Activity log, 12 Spend, 15 Search, 16 Attachment viewer, 17 Confirm dialogs, 19 Update/crash/safe mode/shortcuts (G-M13-18),
and `#cardgal > .panel:nth-child(25) > .mini` (Group, private). Drawn at 350 px, so their R2 boxes are disputed by construction
(CR-0003 §b). `EARLY_STEPS` gains UX-15-10 (chapter owner M9), UX-25-01 and UX-25-02 (chapter owner M14) as `M13`.

**Disputes T8 files** with the golden run (`docs/fidelity/disputes.json`, verdict `disputed`, the app follows the written spec):
UX-06-02 "Custom" chip (G-M13-02), UX-06-05 opener (G-M13-01), UX-06-07 segmented apps (G-M13-03), UX-19-01 "Not now" (G-M13-04),
UX-22-04 chips (G-M13-05), UX-24-07 mini card (G-M13-06), UX-24-09 theme labels and 225 % (G-M13-07); BP-SCR-05 draws "Custom"
and BP-SCR-06 draws Ask/Always/Never segments (same disputes). UX-06-02, UX-06-07, UX-22-04 and UX-24-09 are already in
`SUPERSEDED` (11 §11.2.7).

## (b) Picks for the M13 gaps (pack `prep/M13.md` §8; each is the pack's "Recommended" option)

1. **G-M13-01** The helper's first message is 06-1's fixed opener (no AI turn); AT-065 passes on its "plain intro" branch; UX-06-05 disputed.
2. **G-M13-02** Template chip "Blank" (dispute UX-06-02). **G-M13-03** Helper profile apps are one Toggle each (dispute UX-06-07).
   **G-M13-04** New group buttons are [ Cancel ] [ Create group ] (dispute UX-19-01). **G-M13-05** Raising the AI cap is C-21 as M4
   built it (dispute UX-22-04). **G-M13-06** The changed-by-words line is "Changed: {row label} → {value}. [ Undo ]" (dispute
   UX-24-07). **G-M13-07** Appearance follows 06-2 §6.2 ("Same as Windows · Light · Dark", Zoom 80–200 %, Animations row; dispute UX-24-09).
3. **G-M13-08** UX-25-01 and UX-25-02 move to M13 as early steps; UX-25-03…13 stay M14.
4. **G-M13-09** M14 owns `screens/settings/privacy/{ExportRow,DeleteAllRow}.tsx`, `screens/confirms/C16DeleteEverything.tsx` and their
   states and tests; M13's PrivacyPage mounts the two rows through one slot that renders nothing until M14 merges.
5. **G-M13-10** T4 builds `src/main/data/housekeeping.ts` (08-3 §19.3 at 03:30, idempotent); earlier ad-hoc purges move into it.
6. **G-M13-11** M13's frame hosts M8's ConnectionsPage; T3 owns `screens/settings/connections/{BrowserRows,InternetRows}.tsx`.
7. **G-M13-12** T4 adds `ui/LineDrawing.tsx` with the three masters of `spec/refs/look-book/assets/`.
8. **G-M13-13** M12 T2 owns `screens/PrivacyDialog.tsx` + `src/shared/privacyLeaves.ts`; About `leaves` is disabled in FOO_TEST until then.
9. **G-M13-14** AT-283 is M13's (Appearance row); AT-271 M11; AT-277 M14.
10. **G-M13-15** M5 owns `src/main/settings/locks.ts`; T3 owns `src/main/settings/{change,undo}.ts`; AT-091's lock half waits for M5.
11. **G-M13-16** `SearchFilter` gains `'settings'`; `search:query` takes an optional `helperId` (Files group only); 08-0 §A
    `search: { recent: string[] }` (≤ 10, not on the §A.3 allow-list) is the store of recent searches.
12. **G-M13-17** The cap-below pause line names the weekday ("…until Sun 1 Nov…", AT-222's form; Art. 21); 06-2 §6.5 l.204 aligned.
13. **G-M13-18** M13 owns BP-SCR-19; M11 proves the update strip by Tier R on UX-24-12.
14. **G-M13-19** The 🎲 name list is M12 T1's `resources/names.json`; T6's 🎲 is disabled in FOO_TEST until it merges.
15. **G-M13-20** A helper change emits `chat:upsert` for its chat and the renderer refetches `helper:list`; no new channel.
16. **G-M13-21** foo's one-time helper offer is a Choice card with suggestion key `helper_offer:{template}`, counted as unprompted (T7).
17. **G-M13-22** "Paid this month" and Spend purchases read the `monthPurchases` query (X-71); before M10a a local copy in
    `src/main/screens/spend.ts`, deleted when M10a merges.

Picks T1 made where the spec is silent or two places differ (also in `docs/decisions/M13.tsv`):

18. **G-M13-23** Shortcut groups. 06-2 §6.10 names the page's groups "Getting around", "Chats", "Pages", "Jobs and cards", while
    06-3 §19 (the list §6.10 says it shows, "order final") groups them "Getting around", "Chats", "Make and open", "Talking and jobs"
    plus the Cards line. Pick: one table (`screens/shortcutsTable.ts`, T2) with §19's groups, rows and order on both surfaces.
    The action ids §6.10 and §19 name but never list are kebab-case of the §19 action words: `search-everything, search-chats,
find, next-area, details, jump-needs-you, close-back, zoom, close-window, next-chat, next-needs-you, open-chat-n, pin, mute,
mark-unread, profile, new-helper, new-group, settings, memory, routines, activity, this-list, hold-to-talk, voice-typing,
send, new-line, watch-live` (test ids `settings-row-shortcuts-{id}`, `dialog-shortcuts-row` `data-row-id`).
19. **Settings index location.** 06-2 §6.0's search index and 06-3 §12's Settings group read one list, so it lives in
    `src/shared/settingsIndex.ts` (main's `search:query` and the renderer both import it; 08-0 §E.3 lists no file for it).
    Rows without a label (the two meters, the theme preview, per-folder rows `f-{n}`, the v1-hidden `a-outlook`) are not searchable.
    Synonyms are 06-2 §6.0's: "Gmail/WhatsApp/X" find the Connections page, "delete/export" the Privacy rows `old-chats`,
    `delete-all`, `export` (06-2 has no "Your data" row).
20. **Copy keys.** Settings rows: `settings.{page}.row.{row}.label` / `.second` (page and row ids with `-` → `_`, 08-0 §D);
    nav `settings.nav.{page}`; the frame `settings.frame.*`, `settings.search.*`. T1 lands the frame keys and every row label (and
    the second lines that are one fixed sentence); each wave-2 ticket adds the keys of the screens it renders (additive edits to
    `en-IN.json`, never a reorder). Test ids: T1 lands every pack §4 id, except the Connections rows M8 owns (`gmail`, `calendar`,
    `contacts`, `outlook`, `whatsapp`, `w-hidden`, `x`, `hub`) and `dialog-c-16` (M14).
21. **Settings keys.** T1 adds the 08-0 §A keys no other lane adds: `notifications.kinds`, `notifications.sound`,
    `notifications.unpromptedPerDay` (M6 adds the same key with the same shape), `brief`, `chat`, `search`. `permissions` and
    `rules` (M5), `privacy` (M6, M9), `routines` (M7), `connections` (M8, M9) and `files` (T3 through the integrator) arrive
    with their owners. `WRITABLE_PATHS` gains the rows of the M13 pages whose keys exist; M5's `locks.ts` still decides locks.
22. **Contracts.** `src/shared/ipc.ts` gains the 08-1 §3.2 rows `helper:create|update|delete`, `group:create|update|delete`,
    `chat:delete`, `files:list`, `files:pickFolder` (the same shape as M6's row; one handler is kept when M6 merges),
    `activity:list|saveCsv`, `spend:month`, `search:query|recent|clearRecent|ask`, `settings:undo`, `data:deleteOlderThan`, and
    M7's `suggestions:listDismissed|restoreDismissed`, `routine:pauseAll|resumeAll` (typed here because M7 has not merged; T3's
    `src/main/settings/m7Stubs.ts` answers until it does). Zod rows live in `src/main/screens/schemas.ts`; handlers register in
    `src/main/screens/{settings,activity,spend,search,helpers,data}.ts` through `registerScreens()`, one file per ticket, so no
    wave-2 ticket edits `IpcRouter.ts`. `src/shared/types.ts` gains `HelperForm`, `HelperApp`, `HelperTemplate`, `FileRow`,
    `SuggestionRow`, `SuggestionKind`, `SearchFilter`, `SearchHit`, `SearchResults`, `ActivityQuery` (08-5 shapes; the two row
    types are their tables' columns camelCased, 08-0 §0).
23. **Windows accent and animation effects.** `PlatformInfo` gains `accent` ('#rrggbb' | null, `systemPreferences.getAccentColor`)
    and `osAnimations` (`getAnimationSettings().shouldRenderRichAnimation`), read when the window loads; FOO_TEST adds
    `test:accent { accent }` and `test:osAnimations { on }` (null = the OS value; the next window load reads them). AT-147's
    "switches live" is the Settings toggle, which needs no new event.

## (c) Not changed

Page bodies, dialogs, main handlers and engine code belong to T2–T7. `chat:removed` and `chat:upsert` already exist (G-M13-20 needs
no new event). `setPath` in `IpcRouter.ts` stays two-level until T3's `change.ts` replaces it for three-level paths (`notifications.quiet.from`).

## (d) Ticket ownership after T1

Integrator-owned (T1, then the M13 lead): `src/shared/{ipc,types,testids,settings,settingsDefaults,settingsIndex}.ts`,
`src/shared/copy/en-IN.json`, `scripts/copy-pending.json`, `src/renderer/screens/{registry,dialogs}.ts`,
`src/renderer/screens/settings/SettingsScreen.tsx`, `src/main/screens/{index,schemas}.ts`. Wave-2 tickets may append to
`en-IN.json`, `copy-pending.json` and `testids.ts`.

## (e) Spec-keeper list

X-170 supersedes, for the spec copy: 08-0 §B.2 `SearchFilter` (adds `'settings'`), 08-1 §3.2 `search:query` In (adds `helperId?`),
06-2 §6.5 l.204 (the pause line's date names the weekday), 06-2 §6.10 group names (§19's groups), and 08-0 §E.3 (adds
`src/shared/settingsIndex.ts`).

## (f) Independent review

Pending.
