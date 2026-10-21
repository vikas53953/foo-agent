# 11 · Fidelity: build what is written

This chapter answers one question from Vikas: **"Will the agents deliver exactly what we designed, or will it change over time?"** It turns "build what is written" from a hope into checks a machine runs on every change, plus a short list of checks a person runs where a machine cannot.

Rank: this chapter is a **process** chapter. It changes no value, word or behaviour in 01–10. It decides how we prove the build matches them and what happens when it does not. Where it names a test, the test checks the spec; it never changes it (same rule as 10-acceptance-1 preamble).

Written 2026-10-16. Status: **approved** (Vikas, "GO, start building", 2026-10-16 12:13 UTC, on a page stating that Go also approves these fidelity rules; X-99). Article 31 (§11.11) is now law in `01-articles.md`; the §11.12 plan edits are applied to `foo-plan.md`.

**Contents**

- §11.0 The promise in plain words
- §11.1 Frozen spec (versions, hashes, Change Requests)
- §11.2 Golden references (the 245 walkthrough steps and the Blueprint mocks)
- §11.3 Exact copy (copy keys per 08-0 §D, `en-IN.json`, string tests, banned words)
- §11.4 Tokens and spec values (lint, one source, computed-style table)
- §11.5 Behaviour fidelity (journeys, state machines, traceability)
- §11.6 Milestone gates and the fidelity report
- §11.7 Rules for many agents
- §11.8 Drift over time (after v1)
- §11.9 Honest limits
- §11.10 Test IDs (FID-01…FID-20)
- §11.11 Article 31 proposal
- §11.12 Plan changes (exact edits to `foo-plan.md`)
- §11.13 Open points for Vikas

---

## §11.0 The promise in plain words

1. The design is **locked** with a fingerprint. Nobody building foo can change it. Only Vikas can, by saying yes to a written Change Request.
2. Every one of the **245 walkthrough steps** (25 chapters, source `foo-ux-walkthrough.html`) becomes a picture test: the real app is driven into the same moment and photographed, and the photo is compared with the approved drawing.
3. Every **word** on screen comes from one list copied out of the spec. A word that is not on the list fails the build.
4. Every **colour, size and timing** comes from one token file that is itself checked against the spec, and the key sizes (bubble corner 18px, composer 46px, chat row 72px…) are measured in the running app.
5. Every **journey** (J1–J23, and J24–J30 once Vikas approves that set, X-100) and every state-machine move is an automated test, and every requirement R1–R31 is traced to the tests and steps that prove it.
6. At the end of every milestone a **different agent** (one that wrote none of the code) audits plan vs built, and Vikas sees a side-by-side page **before** the next milestone starts.
7. After v1 the same checks run on **every change, forever**. Something that used to pass and now fails is a blocker, not a footnote.

"Different from the spec" has only two legal outcomes: **fix the build**, or **Vikas approves a Change Request**. A silent deviation is a defect, even when it looks better.

---

## §11.1 Frozen spec

### 11.1.1 What is frozen

The **spec set** is everything below, frozen together as one version:

| Part | Files |
|---|---|
| Constitution | every `*.md` in `foo/constitution/` (00–12, including `08-0-canonical-names.md`, `08-5-shared-types.md` (X-111), `08-functions-and-engine-4.md`, `12-features-r25-r31-1.md` and `12-features-r25-r31-2.md`; DECISIONS, GAPS, CHANGELOG) and `research/`; `08-functions-and-engine-4.md` §24 is also the source of the `resources/prompts/*.md` hashes |
| Requirements and plan | `omnibot-re/foo/foo-prd.md`, `omnibot-re/foo/foo-plan.md`, `omnibot-re/foo/PIPELINE.md` (Vikas's words) |
| Visual references | UX walkthrough source (`foo-ux-walkthrough.html`: 245 steps in 25 chapters, self-contained), https://claude.ai/artifact/JLd5Men2GBvJZXzRidnUMQ; Blueprint v2.1 source (`foo-blueprint-v2.html`), https://claude.ai/artifact/8XnUTgLvk1wees2WqGaSa2 |
| Derived files (generated from the above by §11.3–§11.5 scripts, then frozen with them) | `copy.json` (keyed by 08-0 §D copy keys), `spec-tokens.json`, `spec-values.json`, `state-machines.json`, `trace.csv`, `golden/manifest.json` and the reference PNGs |

GAPS.md is append-only and is the one file that may grow inside a version (§11.1.4).

### 11.1.2 Version tag and manifest

- The first frozen version is **`spec-v1.0`**. It is created once Vikas approves this chapter and before M0 starts.
- The spec set is copied (vendored) into the build repo at `foo-agent/spec/` with the same relative paths, and the repo is tagged `spec-v1.0`.
- Prompt files are part of the frozen set: round 2 changed `rules.md`, `step.md`, `intake.md` and added `group_intake.md`, `group_member.md` (08-4 §24.19–§24.20), so their hashes are taken fresh at `spec-v1.0` (X-141).
- `spec/SPEC-MANIFEST.json` lists every file with its **SHA-256**, byte size and path, plus the version, the date, the DECISIONS row that approved it and the SHA-256 of the manifest's own file list:

```json
{
  "version": "spec-v1.0",
  "approved": { "by": "Vikas", "date": "2026-10-16", "decision": "X-nn" },
  "files": [
    { "path": "constitution/01-articles.md", "sha256": "…64 hex…", "bytes": 6813 },
    { "path": "refs/ux/foo-ux-walkthrough.html", "sha256": "…", "bytes": 257321 }
  ],
  "set_sha256": "…hash of the sorted path:sha256 lines…"
}
```

- **FID-01 (CI, every push):** `scripts/spec-verify.ts` recomputes every hash. Any difference, any extra file, any missing file → build fails with the file name. The app's About page (test builds) and every fidelity report print the `set_sha256` so anyone can see which spec a build was checked against.
- Version numbers: **minor** (`v1.1`) for copy, value or drawing changes; **major** (`v2.0`) for an Article change, a new journey or removing a feature. Every version lists its Change Requests in `spec/VERSIONS.md`.

### 11.1.3 Who may write the spec

| Who | May |
|---|---|
| Builder agents | **Read** `spec/` only. They never edit any file under `spec/`, `golden/ref/` or `foo/constitution/`. |
| Reviewer agent (§11.7) | Read only. Writes only fidelity reports. |
| Spec keeper (one named agent or person, the coordinator by default) | Applies an **approved** Change Request to the constitution, regenerates derived files, bumps the version, writes the DECISIONS row and the CHANGELOG lines. |
| Vikas | Approves or rejects Change Requests. His words in `PIPELINE.md` stay the highest authority. |

Enforcement, not trust:
- `spec/**`, `golden/ref/**`, `golden/app/**` and `.github/CODEOWNERS` are owned by the spec keeper in CODEOWNERS; branch protection requires that review.
- **FID-02 (CI):** a pull request that touches `spec/**` or `golden/**` fails unless its description carries `Fidelity-CR: CR-nnnn` and that CR file says `Status: Approved by Vikas` with a DECISIONS row id that exists in the new `spec/constitution/DECISIONS.md`.
- In builder sessions the `foo/constitution/` folder is opened read-only where the host allows it; where it does not (the shared network folder), FID-01 still catches any change because the build reads only the vendored, hashed copy.

### 11.1.4 Change Request (CR)

Anything that would make the build differ from the frozen spec goes through a CR. That includes "the drawing is wrong", "this word is awkward", "this size doesn't fit", "the library can't do that", and "I have a better idea".

Flow: **CR written → reviewer checks it is complete → shown to Vikas in plain words with a before/after picture → Vikas says yes or no → (yes) DECISIONS row X-nn → spec keeper edits the chapters, regenerates derived files, bumps the version (`spec-v1.1`), re-blesses only the affected goldens → CI green → builders continue.** Until the new version is tagged, the builder builds the **old** spec. A rejected CR is closed and the spec stands.

CR file: `foo-agent/docs/cr/CR-nnnn.md`, numbered from CR-0001.

```markdown
# CR-0007 · {one-line title in plain words}

Status: Draft | Ready for Vikas | Approved by Vikas (date, his words quoted) | Rejected (date)
Raised by: {agent or person} · Date: {YYYY-MM-DD} · Spec version: spec-v1.0
Milestone affected: M{n} · Blocks the build: yes / no (if no, the build keeps the current spec meanwhile)

## What the spec says now
{file §section, exact quote}  ·  Golden refs affected: UX-13-07, BP-CARD-05  ·  Tests affected: AT-122, FID-08 row SV-07

## What we want instead
{exact new text / value / drawing}

## Why
{the problem, with evidence: screenshot, measurement, library limit, user feedback}

## What Vikas will notice
{one or two plain sentences; before/after images attached}

## Options
1. Keep the spec as is (default if no answer) — consequence: …
2. The change — consequence: …

## If approved, the spec keeper will change
- {file} §{n}: "{before}" → "{after}"
- copy.json / spec-tokens.json / golden refs to re-render: …
- DECISIONS row: X-nn
```

GAPS vs CR: a **gap** is the spec being silent (Art. 30): log it in GAPS.md, take the most conservative option, keep building. A **CR** is wanting something different from what the spec says. A gap that needs a real answer becomes a CR when it is raised to Vikas.

### 11.1.5 Silent deviation = defect

Any difference between the build and the frozen spec that has no approved CR is a **defect** with priority equal to the highest priority test or surface it touches (P0 if it touches money, approvals, secrets, data or an Article). This holds even when:
- the difference looks better ("improvements" are deviations, §11.7.6);
- the test was not written yet (the reviewer finds it by reading, §11.6);
- the builder logged it only in `implementation-notes.md` (notes explain; they do not approve).

---

## §11.2 Golden references

### 11.2.1 What a golden reference is

A **golden reference** is one approved picture of one exact moment in foo, with an ID, the data and clock that produce it, and the test that drives the real app into the same moment.

Two families:

| Family | ID | Source | Count |
|---|---|---|---|
| UX walkthrough steps | `UX-cc-ss` (chapter 01–25, step 01–16), e.g. **UX-13-07** = chapter 13 "Hotel with payment and Windows Hello", step 7 | https://claude.ai/artifact/JLd5Men2GBvJZXzRidnUMQ (`#hotel-7`) | **245** steps × light + dark = 490 reference frames |
| Blueprint mini mocks | `BP-APP-L/M/R` (shells), `BP-ANAT-*` (widths L/M/S/XS), `BP-MSG-*`, `BP-COMP-*` (composer states), `BP-CARD-01…25` (25 cards in the order the Blueprint shows them), `BP-SCR-01…19` (19 screens), `BP-WIN-*` (native Windows surfaces: toasts, taskbar, tray, Hello, uninstall) | https://claude.ai/artifact/8XnUTgLvk1wees2WqGaSa2 | fixed by `golden/manifest.json` at freeze |

The 25 UX chapters (ID prefix · walkthrough anchor · journey · requirements · steps):

| UX | Anchor | Title | J | R | Steps |
|---|---|---|---|---|---|
| UX-01 | `install` | Install foo | J1 | R17 · R23 | 8 |
| UX-02 | `ai` | Find your AI | J2 | R3 · R4 | 9 |
| UX-03 | `name` | Name and face | J3 | R17 | 10 |
| UX-04 | `interview` | Quick interview and connections | J4 | R18 · R9 | 13 |
| UX-05 | `first` | First real job, inside a minute | J5 | R17 · R8 · R14 | 7 |
| UX-06 | `helpers` | Meet your helpers: Trips, Money, Home | J15 | R2 | 8 |
| UX-07 | `brief` | Morning brief | J6 | R7 · R15 | 8 |
| UX-08 | `chat` | Just chatting, in your language | J7 | R1 · R24 | 7 |
| UX-09 | `voice` | Voice notes, in and out | J7 | R16 | 8 |
| UX-10 | `choice` | Choices: tap the best fit | J8 | R9 · R10 | 8 |
| UX-11 | `bills` | Bills with Money | J11 | R6 · R12 · R14 | 10 |
| UX-12 | `restaurant` | Booking a restaurant | J9 | R5 · R10 · R14 | 12 |
| UX-13 | `hotel` | Hotel with payment and Windows Hello | J10 · J15 | R6 · R2 · R8 · R14 | 16 |
| UX-14 | `signin` | Sign in here: trains on IRCTC | J13 | R11 · R4 · R10 | 10 |
| UX-15 | `live` | Watch live, take over, stop | J18 | R11 · R8 | 10 |
| UX-16 | `drafts` | Drafts and sends: Gmail, WhatsApp, X | J12 | R18 · R5 | 10 |
| UX-17 | `routines` | Routines: "tell me only if…" | J14 | R12 | 10 |
| UX-18 | `memory` | Memory you can see and forget | J17 | R13 | 10 |
| UX-19 | `groups` | Groups, and what stays private | J16 | R2 · R18 | 10 |
| UX-20 | `search` | Search everything (Ctrl+K) | J22 | R22 | 6 |
| UX-21 | `notify` | Notifications, taskbar and tray | J20 | R15 · R23 | 11 |
| UX-22 | `spend` | Spend caps you can always see | J19 | R19 | 8 |
| UX-23 | `errors` | When things go wrong | J19 | R20 | 11 |
| UX-24 | `settings` | Settings, by page or by asking | J21 | R21 · R23 · R5 | 12 |
| UX-25 | `data` | Activity log, export, delete, uninstall | J23 · J21 | R21 · R14 | 13 |
| | | | | **Total** | **245** |

Counts are taken from `window.__CH` / `window.__STEPS` in the frozen `foo-ux-walkthrough.html` (UX-30); if a CR changes the walkthrough, this table and the manifest are regenerated from it, never typed by hand.

Each walkthrough step carries three texts: **c** (what you do), **s** (what you see), **f** (what foo does), and one highlighted element (`data-hl`). The golden test uses all four: c = the action the test performs, s and f = the assertions, hl = the region that is compared most strictly (§11.2.4).

### 11.2.2 How the reference images are produced

`scripts/golden-render.ts` (runs only on the **golden runner**, §11.2.6; output is frozen into `golden/ref/` and hashed in the manifest):

1. Open the frozen walkthrough file `spec/refs/ux/foo-ux-walkthrough.html` in the same Chromium that Electron ships (via `_electron` or Playwright with the Electron Chromium version), viewport 1440×900, `deviceScaleFactor: 1`.
2. For each step `i` of `window.__STEPS` (245): call `window.__go(i)`; force the stage to scale 1 (frame `transform: none`, stage 1280×800), so `#frame` is exactly **1280×800 CSS px at 100 %**; wait for fonts (`document.fonts.ready`) and two animation frames.
3. Screenshot `#frame` with `animations: "disabled"`, `caret: "hide"`, light theme (`<html data-theme="light">`), then dark (`data-theme="dark"`). Files: `golden/ref/ux/UX-13-07.light.png`, `UX-13-07.dark.png`.
4. Write `golden/ref/ux/UX-13-07.json`: chapter, step, anchor (`hotel-7`), J, R, the texts c/s/f, the `data-hl` id and its bounding box in frame pixels, the walkthrough state object for that step (`__STEPS[i].state`), the clock shown in the frame (§11.2.3), the app route, and `capture` (§11.2.5).
5. Blueprint: open `spec/refs/bp/foo-blueprint-v2.html` at the same settings; for each mock listed in the manifest (CSS selector → BP id, fixed at freeze), screenshot the element at its drawn size (the Blueprint draws at real size), light and dark → `golden/ref/bp/BP-CARD-05.light.png` etc. + JSON with the selector, size and the spec § it draws.
6. Every PNG's SHA-256 goes into `SPEC-MANIFEST.json`. Re-rendering the same spec version must produce byte-identical PNGs (**FID-03**); if not, the runner changed and §11.8.3 applies.

### 11.2.3 How the app is driven into the same state

One Playwright-for-Electron spec file per chapter: `test/fidelity/ux/UX-13.hotel.spec.ts`. One `test.step` per walkthrough step, named with the ID (`UX-13-07 · Payment card with Hello prompt`).

- **Launch:** `_electron.launch` on the `FOO_TEST=1` build with `--force-device-scale-factor=1`, a fresh temp `FOO_DATA_DIR`, Windows text size 100 %, window content size **1280×800** (`setContentSize`), not maximised, theme forced through the test channel (light run, then dark run).
- **Clock:** the injected fake `Clock` (08-3 §22.2). Default **Fri 16 Oct 2026, 9:00 AM IST** (X-10). Steps whose frame shows another time (chapters 01–06 are "Day 0 · Thu 15 Oct, evening"; brief and routine steps show later times) set the clock to the time recorded in that step's JSON, via `test:clock`. The clock never reads the real time in a golden test.
- **Data:** the chapter's start state is seeded through `test:seed` from `test/seed/ux-world.ts` (built to `test/seed/ux-world.sql.gz`, X-129), which is generated from the walkthrough's own state objects (same chats, names, helpers, amounts, memory facts, avatars). Hand-typing seed data is not allowed; it must come from the frozen reference.
- **Actions:** each step performs its **c** text through the real UI (click, type, key) using `data-testid`s from `src/shared/testids.ts` (`TID`, 08-0 §C, X-58; never class names or text). The fake AI (`FOO_FAKE_AI`) replays a script generated from the walkthrough's foo messages for that chapter; fake connectors and sandbox sites (08-3 §22.4–22.5) stand in for Gmail, WhatsApp, booking and checkout. Jumping straight to a state with `test:seed` is allowed **only** for the first step of a chapter; every later step must be reached by doing the previous step's action (so the path, not just the picture, is tested).
- **Assertions per step, in this order:** (1) the **s** and **f** facts as DOM/store assertions written by hand from the texts (e.g. "badge is ⏳", "card state PENDING", "nothing charged" via the sandbox ledger); (2) copy check on the frame (§11.3); (3) spec-value checks for components on screen (§11.4.4); (4) screenshot compare (§11.2.4); (5) axe-core on the frame (ART-26a).

### 11.2.4 Two tiers of picture comparison

The walkthrough and Blueprint are **HTML drawings**, not the app. Their pixels will never match the real components exactly (different DOM, simplified icons, mock photos). So comparison runs in two tiers.

**Tier R · Reference conformance (app vs drawing).** Run when a step is first built, and again whenever the reference changes by CR.

| Check | Method | Pass | Review | Fail |
|---|---|---|---|---|
| R1 Copy | every text node in the hl region and the whole frame, normalised whitespace, compared with the reference frame's text nodes | identical | — | any word different, missing or extra |
| R2 Anchors | bounding boxes of named anchors (hl element, title bar, left/main/right shells, header, composer, every card on screen), mapped reference selector → app `data-testid` (a `TID` value, 08-0 §C) in the step JSON | position within ±4 px, size within ±2 px | ±5–8 px | > 8 px or element missing |
| R3 Colour | sample fill and text colour at the centre of each anchor; CIEDE2000 | ΔE ≤ 2 | 2–5 | > 5 |
| R4 hl crop pixels | pixelmatch on the hl crop, per-pixel `threshold: 0.1` (YIQ), anti-aliasing detection on, masks applied | ≤ 3 % pixels differ | 3–10 % | > 10 % |
| R5 Whole frame | pixelmatch, same settings | reported only (diff heat-map in the fidelity report) | — | — |

A **Review** result is not a pass: it goes to the reviewer and then to Vikas in the fidelity report side by side (reference | app | diff). He either accepts the app picture (it becomes the Tier B baseline) or it is fixed. A **Fail** blocks the milestone.

**Tier B · Baseline lock (app vs approved app).** Once a step passes Tier R and is accepted in a fidelity report, the app's own screenshot is **blessed** as `golden/app/UX-13-07.light.png` (and dark), with the commit, spec version and report id in `golden/app/UX-13-07.json`. From then on, on every push:

| Setting | Value |
|---|---|
| Tool | Playwright `expect(page).toHaveScreenshot()` (pixelmatch inside) |
| Per-pixel threshold | `0.1` |
| Max differing pixels | `maxDiffPixelRatio: 0.001` (0.1 % of 1,024,000 = 1,024 px) |
| Cluster rule (**FID-05**) | fail also if any 16×16 px block has > 25 % pixels changed, even under the ratio (catches an icon swap or a changed word) |
| Options | `animations: "disabled"`, `caret: "hide"`, `scale: "css"`, fonts ready |
| Retries | none for pictures; a flaky picture is a defect, not a retry |

Tier B is what stops slow drift: any pixel change beyond noise fails, whether or not anyone meant it.

### 11.2.5 Masks and capture kinds

**Masks** (filled with a solid colour before comparing, listed per step in the step JSON, never added by a builder alone):

| Region | Why | Mask |
|---|---|---|
| Native caption buttons (top-right of the title bar, Windows draws them via `titleBarOverlay`) | not our pixels; differ between Windows 10 and 11 | fixed rect from 09 §9.1 sizes |
| Text caret, spinners, shimmer, typing dots, recording waveform | animated | element masks; the static state is tested separately with reduced motion |
| Live-view screencast and any real website pixels | outside content | element mask; the sandbox site is checked by DOM, not pixels |
| Voice-note waveform drawn from audio | depends on the audio file | element mask (seeded audio keeps it stable; mask stays as a guard) |
| Emoji glyphs (Tier R only) | the walkthrough was drawn with another emoji font | element mask in Tier R; **not** masked in Tier B |

No mask may cover copy, a card, a button, a badge, an amount or a time. Clock-driven text is not masked: the clock is pinned, so times must match.

**Capture kinds** (field `capture` in each step JSON):
- `window`: inside foo's own window; full pipeline above.
- `native`: drawn by Windows (installer pages, toasts, Action Center, taskbar badge, tray menu, jump list, Windows Hello, File Explorer, SmartScreen). Automated part: the **payload** is compared exactly (toast XML from the `Notifier` fake, tray/jump-list menu templates, Hello prompt text "Approve paying {amount} to {payee}" [X-08], NSIS string table). Picture part: manual on the reference laptop, filed per §11.9.3.
- `mixed`: both (e.g. a toast and the window behind it).

### 11.2.6 The golden runner

- Pictures are only comparable on one fixed machine image. The **golden runner** is a pinned Windows 11 23H2 image (exact build number recorded), 1280×800 content at 100 % scale, ClearType default, Segoe UI Variable, Segoe UI Emoji and Nirmala UI at the versions in that image, GPU acceleration off (`--disable-gpu`) for stable rasterisation.
- At M0 the builder checks whether GitHub's `windows-latest` has Segoe UI Variable and stable rendering. If it does not, the golden lane runs on a self-hosted runner from that pinned image; the other lanes stay on `windows-latest`. This choice is logged in GAPS.md (FID-04 records the image id in every report).
- A Windows 10 22H2 golden image exists for the surfaces where 09 says Windows 10 differs (window corners, title bar, Hello, toasts); only those steps have Win10 baselines.

### 11.2.7 When the reference itself is wrong

If a walkthrough frame or Blueprint mock disagrees with the written spec, or is simply wrong:

1. **Never** "update the snapshot". `--update-snapshots` is blocked in CI (**FID-06**: the golden directories are read-only to every job except `golden:bless`, which needs a CR id or a signed fidelity report id).
2. Build what the **written spec** says (values and copy in 01–10 and DECISIONS outrank a drawing), log one GAPS.md line, and raise a CR to fix the drawing (or, if the drawing is what Vikas wants, to change the text).
3. The step is reported as **DISPUTED (CR-nnnn)**: its other checks still run; only the conflicting check is set to "expected fail" with the CR id, and only until the CR is decided.
4. After the CR: the spec keeper fixes the walkthrough or Blueprint source, re-renders only the affected references, bumps the spec version, and the step is re-checked in Tier R.

Known cases before freeze (decisions already taken; re-render, no CR; X-128): UX-24-10 Outlook chip (X-41); UX-05-06 reminder time 9:00 AM (X-103); UX-06-02 chip "Blank" (06-1 §3); UX-06-07 app toggles (06-1 §4.1); UX-10-05 no Next button (05 §5.3.1); UX-13-03, UX-22-07 "Go" (X-04); UX-13-16 "The price changed from ₹{old} to ₹{new} at checkout, so I stopped. Nothing was paid." + right label "Replaced" (05 §5.6.3); UX-14-02…04 real Edge window + `signin-banner.html` (X-66); UX-15-01 `ArrowMaximize` button (06 §0.11); UX-16-06 "Change" (X-79); UX-18-04 ⋯ menu (06-2 §7.3); UX-21-05 toast without reply box (05 §0.10); UX-22-04 C-21 typed field (X-15); UX-24-09 "Same as Windows · Light · Dark" (06-2 §6.2). The spec keeper re-renders these before `spec-v1.0`; until then Tier R treats them as `superseded` in `golden/manifest.json` and skips the pixel compare for the highlighted element only.

---

## §11.3 Exact copy

### 11.3.1 copy.json and copy keys (X-59, 08-0 §D)

The copy scheme is 08-0 §D; this section only says how fidelity checks it. `scripts/extract-copy.ts` reads every chapter 01–09 and 12, DECISIONS and the walkthrough/Blueprint text, and extracts every string in "double quotes" (straight or curly) into `spec/copy.json`, keyed by its **08-0 §D copy key** `{area}.{component}.{slot}[.{state}]` (each segment `lower_snake`; areas as 08-0 §C plus `errors`, `notifications`, `memory_chip`, `tray`, `jumplist`):

```json
{
  "cards.approval.status.approved": {
    "text": "Approved by you at {time}. Doing it now…",
    "vars": { "time": "time.absolute" },
    "source": "05-cards-2.md:412 §5.5.4",
    "class": "ui",
    "surfaces": ["Approval card · APPROVED"],
    "lang": "en-IN"
  }
}
```

(The key above illustrates the pattern; the real key is the one the owning chapter names.)

- **Key.** The key is the 08-0 §D key named in the owning chapter next to the quoted string. Where a chapter quotes a string without naming its key, the spec keeper assigns one at freeze under the §D pattern (area from the surface, component from the 08-0 §C/§E name, slot from the element: `title`, `body`, `button.{action}`, `link`, `tooltip`, `aria`, `status.{state}`), and records it in `spec/copy-keys.map` (source file:line → key). The superseded `COPY-{chapter}-{line}` ids are not used anywhere; the file:line lives only in `source`.
- `{name}` placeholders become ICU MessageFormat variables (`intl-messageformat` 10.x, version pinned at M0). Each variable has one formatter applied **before** `t()` is called (`time.absolute`, `money.inr` via `formatInr()`, `count`, `name`, `text`) from `src/shared/format.ts` (`formatTime`, `formatDate`, `formatInr`; F10; the `src/shared/` file set is 08-0 §E.9, X-111); ICU number/currency skeletons are not used (08-0 §D).
- **Classes.** Not every quoted string is UI text. Each one gets a class: `ui` (shown by foo), `user-says` (example of what the user types or says), `ai-sample` (example of a free AI reply), `term` (a word being discussed, e.g. "check"), `external` (Windows or a website's text). The extraction proposes a class; the spec keeper confirms it once per version; **anything unclear is `ui`** (the conservative choice: it must then be rendered exactly). The classification file is part of the frozen spec. Only `ui` entries get a key.
- When two chapters quote different text for the same key or surface, extraction fails and lists both; DECISIONS or a CR settles it before freeze (no builder picks).

### 11.3.2 The UI renders copy only through `t(key, vars)`

- `src/shared/copy/en-IN.json` (one flat JSON object, key → ICU message) is **generated** from the `ui` entries of `spec/copy.json`. Nobody edits it by hand (same rule as tokens, F29.2). **FID-07:** CI regenerates it and fails on any difference; `scripts/check-copy.ts` (08-0 §D) also fails on a missing key, an unsupplied or unused `{var}`, an unused key, or a banned word (Article 2).
- Components, main and engine show words only through `t(key, vars)` from `src/shared/copy/t.ts` (one function in all three processes), e.g. `t('cards.approval.status.approved', { time })`. Variables are typed: passing a raw number where a pre-formatted `money.inr` string is expected is a type error.
- **FID-08 (ESLint rule `foo/no-literal-copy`):** no JSX text, and no string literal in `aria-label`, `title`, `placeholder`, `alt`, notification, tray, jump-list, dialog or menu fields. Allowed literals: punctuation-only strings, `TID.*` references (never a literal `data-testid`, lint `foo/testid-from-registry`), CSS module class names.
- Text that foo does not author (the AI's reply text, the user's messages, website titles, file names, memory facts, contact names) is rendered inside an element marked `data-copy="ai|user|external|data"`. These are not in `en-IN.json`; they are covered by ART-02b (banned words in AI replies), ART-21a (times) and ART-21c (money). AI prompts live in `resources/prompts/*.md` and are not copy (08-0 §D).

### 11.3.3 Runtime copy test (FID-09)

In every golden step, every journey test and every component-state harness frame:
1. Walk the DOM: visible text nodes, plus `aria-label`, `aria-description`, `title`, `placeholder`, `alt`, and the window title.
2. Drop subtrees marked `data-copy="ai|user|external|data"` (they are checked by the scans instead).
3. Each remaining string must match a `ui` template in `en-IN.json` (by key) (placeholders as typed patterns: `{time}` must match the F10 absolute format, `{amount}` the Indian ₹ format).
4. Fail on any string with no match, listing the text, the `data-testid` path (`TID` names) and the screenshot.
Native payloads (toast XML, tray menu, jump list, Hello text, installer strings) run the same check through the test fakes.

Coverage the other way (**FID-10**): after the full suite, every `ui` copy entry must have been rendered at least once, or be listed in `copy-unreached.md` with the milestone that will reach it. At M14 that list is empty, or each line has an AT that is UNVERIFIABLE with a manual check.

### 11.3.4 Banned words

- **ART-02a** runs over `copy.json` itself (so a banned word cannot even enter the source) and over every rendered string from FID-09, with Article 2's regex (10-acceptance-2 §D). The only exemption stays X-20 (crash-report preview body).
- **§F23.8 banned phrasing** ("ok, on it", narration, apologies over one line…) is a second list in `spec/banned-phrasing.json`, scanned the same way.
- ART-02b covers AI replies (they are not in copy.json).

---

## §11.4 Tokens and spec values

### 11.4.1 One source

`design/tokens.json` is the only hand-edited style source (F29.2). It is generated **once** from the spec and then checked against it forever:
- `scripts/extract-tokens.ts` parses the token tables in 02-foundations F0–F10 and F29.6 and DECISIONS (X-24, X-25, X-26…) into `spec/spec-tokens.json` (name → light, dark, unit, source §).
- **FID-11:** `tokens.json` must equal `spec-tokens.json` for every name and value (light and dark). A token in code that is not in the spec, or a spec token missing from code, fails.
- **FID-12:** `src/renderer/styles/tokens.css`, `src/shared/tokens.ts` and `design/tokens.paper.json` are rebuilt in CI from `design/tokens.json`; any difference fails (F29.2 rule, made a test). These are the only token files (08-0 §E.1, X-60): there is no `motion.ts` and no `renderer/tokens/` folder; motion tokens are in the same files. A token file at any other path fails FID-12.

### 11.4.2 Lint (FID-13)

- **Stylelint** (F29.5): no raw hex/rgb/hsl/named colours, no `ms`/`s` values, no `z-index` numbers, no `font-family`, no `px` except `0`, `1px`, `1.5px`, `2px` borders and X-23 component-local sizes; each local size carries `/* local: {chapter} §{n} */` and the rule checks the § exists in the frozen spec heading index and that the value equals the value in that section's table.
- **ESLint rule `foo/no-raw-design-values`** for TS/TSX: flags hex/rgb strings, numbers passed to `style` for colour/size/spacing/radius/duration/delay/z-index, `setTimeout`/animation durations that are not a `tokens.ts` constant, and inline `style={{ … }}` with design values. Icons only from `@fluentui/react-icons` or `src/renderer/icons/custom/` (F29.5).
- ART-24a (static scan) and ART-24b (runtime: every computed colour, font size, radius and transition is in the token set) stay as written in 10-acceptance-2 §D.

### 11.4.3 What the lint cannot see

Lint proves "a token was used", not "the **right** token was used" (a card using `--r-md` instead of `--r-lg` passes lint). The spec-values test closes that hole.

### 11.4.4 Spec-values test (FID-14)

`spec/spec-values.json` is a table: component, `data-testid` (`TID` value, 08-0 §C), CSS property, expected value at 100 % scale (light and dark where colour), source. The test renders each component in the component harness (and again inside golden steps where it appears) and compares `getComputedStyle` and `getBoundingClientRect`. Tolerance: **exact** for computed CSS values; **±0.5 px** for measured boxes (sub-pixel layout). The starting table (the spec keeper completes it at freeze, one row per value in 03–06 component tables that a test can measure):

| ID | Component (`data-testid`) | Property | Expected | Source |
|---|---|---|---|---|
| SV-01 | user bubble (`bubble-me`) | border-radius, non-tail corners | 18px | 02 F4 `--r-bubble`; 04 §1.4 |
| SV-02 | user bubble, last of a run | border-bottom-right-radius (tail) | 6px | 04 §1.4 |
| SV-03 | foo bubble, last of a run | border-bottom-left-radius (tail) | 6px | 04 §1.4 |
| SV-04 | user bubble | background (light / dark) | `#0B0B10` / `#F1F1F5` | 02 F2 `--bubble-me` |
| SV-05 | foo bubble | background (light / dark) | `#F0F0F4` / `#202028` | 02 F2 `--bubble-foo` |
| SV-06 | message text | font-size / line-height / weight | 15px / 22px / 400 | 02 F1 `--t-body` |
| SV-07 | message text tagged `lang="hi"` or `"pa"` | line-height | 24px | 02 F1 `--t-body-indic`; 04-2 §26 |
| SV-08 | bubble | max-width | 72 % of column, ≤ 620px (rich ≤ 680px) | 02 F5 `--bubble-max` |
| SV-09 | message column | max-width | 760px | 02 F5 `--column-max` |
| SV-10 | composer pill (`composer-field`) | min-height (one line) | 46px | 04-2 §20 (12 + 22 + 12) |
| SV-11 | composer pill | border-radius | 24px | 02 F4 `--r-composer` |
| SV-12 | composer round buttons | width × height | 36 × 36px | 02 F5 `--btn-h` |
| SV-13 | chat row (`chatlist-row`) | height | 72px | 02 F5 `--row-chat` |
| SV-14 | chat row avatar | width × height | 48 × 48px | 02 F5 `--avatar-list` |
| SV-15 | left header and chat header | height; top and bottom y equal | 60px; aligned | 02 F5 `--header-h` |
| SV-16 | title bar | height | 32px | 02 F5 `--titlebar-h` |
| SV-17 | left shell | default width | 340px (resizable 300–460) | 02 F5 `--sidebar-w`; 08-0 §A.1 `window.sidebarWidth` default 340 (300–460), resolved by X-91 |
| SV-18 | right shell | width | 340px | 02 F5 `--panel-w` |
| SV-19 | card (standard / wide) | width | 440px / 600px | 02 F5 `--card-w`, `--card-w-wide` |
| SV-20 | card | border-radius | 16px | 02 F4 `--r-lg` |
| SV-21 | every text button | border-radius | 999px | X-01 `--r-full` |
| SV-22 | primary button in cards and dialogs | height | 40px | 02 F5 `--btn-h` |
| SV-23 | menu item | min-height | 40px | X-26 |
| SV-24 | search / find field | height | 36px | 02 F5 `--field-h` |
| SV-25 | every clickable thing | hit area | ≥ 40 × 40px | 02 F5; U-5 |
| SV-26 | timestamp, placeholder | colour (light / dark) | `#696975` / `#8E8E9A` | X-24 `--fg-3` |
| SV-27 | text field, checkbox, toggle-off edge | border colour (light / dark) | `#85858F` / `#70707C` | X-25 `--line-input` |
| SV-28 | primary button | background (light / dark) | `#2B3FD6` / `#8C9BFF` | 02 F2 `--accent` |
| SV-29 | main shell | background (light / dark) | `#FFFFFF` / `#0D0D11` | 02 F2 `--bg-app` |
| SV-30 | hover colour change | transition-duration | 83ms | 02 F7 `--m-fast` |
| SV-31 | card state change | transition-duration | 167ms | 02 F7 `--m-card` |
| SV-32 | focus ring | outline | 2px `--focus-outer` + 1px `--focus-inner` | 02 F8; U-2 |
| SV-33 | toggle track | width × height | 40 × 20px | 02 F5 `--toggle-w/-h` |
| SV-34 | undo bar | height | 48px | §F21.3 `--undo-h`; X-32 |
| SV-35 | dialog small / medium / large | width | 400 / 520 / 720px | 02 F5 `--dialog-*` |
| SV-36 | Search overlay (Ctrl+K) | width | 640px | 02 F5 `--palette-w` |
| SV-37 | window first open | content size | 1280 × 800 (clamped to 90 % of work area) | X-14; AT-001 |
| SV-38 | base styles | `font-synthesis` | `none` | X-31 |

Rules: a row's expected value is copied from the frozen spec by `scripts/extract-values.ts` where the table is machine-readable, and by hand (reviewed) where it is prose. Changing a row needs a CR. Adding rows (to cover more of 03–06) is encouraged and needs only reviewer approval, because it adds a check without changing the spec.

---

## §11.5 Behaviour fidelity

### 11.5.1 Every Given/When/Then is a test

- **FID-15:** each of AT-001…AT-133 (10-acceptance-1 §B) is one automated test whose title starts with its ID (`test("AT-122 · …")`), in `test/e2e/J{nn}.spec.ts` or `test/e2e/sm-*.spec.ts`. The test's Given/When/Then text is copied verbatim into the test's annotation from the frozen spec, and FID-15 checks it still equals the spec text (so a test cannot quietly weaken its own goal).
- Tests that cannot be fully automated (real Windows Hello, real toasts in Action Center, SmartScreen, Narrator) are split: the automated part with fakes, and a manual part listed in §11.9.3, both under the same AT id. Status UNVERIFIABLE is allowed only for the manual part and only with a filed manual record.
- Every branch row in each journey's research table (10-acceptance-1 §A.3) has an automated or manual check listed in `trace.csv`.

### 11.5.2 State machines, exhaustively

- `scripts/extract-sm.ts` turns the two machines in 07-journeys-2 §7.4 (with SM-A1…A13) into `spec/state-machines.json`: states, events, allowed transitions, side effects (badge, card text, pill), and **forbidden** transitions.
- **FID-16 (table test):** for the job machine and the approval machine, every (state × event) pair is tested at the engine level: allowed → expected next state and side effects; not allowed → state unchanged, `APPROVAL_BAD_TRANSITION` (or job equivalent) logged, nothing visible changes. This is the full cross product, not a sample.
- **FID-17 (random walks):** property-based tests (fast-check) run 10,000 random event sequences per machine with the fake clock and the sandbox ledger, checking invariants after every step: at most one charge per approval id; never WORKING after CANCELLED/FAILED/DONE; DONE only with proof or "⚠ Not checked live"; badge always equals the runner's state; no approval leaves PENDING without a tap event (typed "yes" and reactions never count, Art. 6).
- The UI side of each transition is covered by AT-105…AT-133 (stuck Stop per SM-A11 / X-80) and the golden steps that show those states.

### 11.5.3 Traceability matrix (FID-18)

`spec/trace.csv`, generated at freeze and completed by the spec keeper, one row per link:

| R | J | AT / ART / PERF | UX step | BP ref | Spec § | Test file | Milestone |
|---|---|---|---|---|---|---|---|
| R6 | J10 | AT-122 | UX-13-09 | BP-CARD-06 | 05-cards-2 §5.6; 07-2 §7.4 | test/e2e/sm-approval.spec.ts | M10 |

CI checks, every push:
- every R1–R31 has ≥ 1 AT and ≥ 1 UX step (R25–R31: their AT-158…AT-199 tests; UX steps only once the walkthrough has those chapters, until then the row names the 12-* journey step);
- every AT, ART, PERF, UX and BP id appears in exactly the test file the matrix names, and that file contains a test with that id;
- no test id exists that the matrix does not know (no orphan tests, no invented ids);
- every UX step names ≥ 1 spec § that exists in the frozen heading index.
The fidelity report prints coverage per R: tests passing / total, UX steps passing / total.

**FID-21 [X-189, CR-0031]: built milestones are covered.** A milestone is built once its close-out wrote `docs/fidelity/<M>.audit.json`. Every UX step and BP ref of `golden/manifest.json` in a built milestone, and every matrix row of one, needs a `live` row whose test file exists; superseded steps are exempt. Known gaps are listed with their reason in `docs/fidelity/coverage-gaps.json` (62 on 2026-10-21). A new gap fails; a listed id that is covered now fails until it is removed, so the list only shrinks; adding an id needs a CR (FID-06). `scripts/coverage-check.ts`, every push.

---

## §11.6 Milestone gates and the fidelity report

### 11.6.1 The gate

A milestone (M0–M14, `foo-plan.md` §5) is **done** only when all of these hold, in this order:
1. Its "Must pass" list (plan) and its **fidelity exit** list (§11.12, Plan changes item 6) are green on CI at one commit.
2. A **fidelity report** for that commit exists (§11.6.2).
3. An independent **reviewer agent** has signed it (§11.7.3).
4. The report has been **shown to Vikas as an HTML page** (a private Artifact link) and he has said continue, or listed what to fix. His answer is quoted in the report and in `PIPELINE.md`.
5. Only then does the next milestone start.

**Fresh evidence only.** Every screenshot, test result, lint output and video in the report is produced from the commit the report names, in the same CI run (run id printed). Anything older, from another branch, or "it passed yesterday" is not evidence. A claim with no evidence is reported as **UNVERIFIABLE**, never as DONE.

### 11.6.2 Fidelity report template

File: `qa-evidence/M{n}/fidelity.html` (generated by `scripts/fidelity-report.ts`, self-contained, light and dark), plus `fidelity.json` with the same data. Sections:

1. **Header:** milestone, commit, CI run id, spec version + `set_sha256`, golden runner image id, date, builder agent(s), reviewer agent, overall verdict (PASS / PASS WITH CR / FAIL).
2. **Plan vs built audit:** one row per item in the milestone's Goal, Create and Must pass lists in `foo-plan.md`, and per spec § named in its "Constitution" line:

| Status | Meaning |
|---|---|
| **DONE** | built as written; evidence linked (test ids, screenshots) |
| **PARTIAL** | some of it built; the missing part named exactly (state, step id, branch) |
| **NOT DONE** | not built; says whether it is scheduled later (milestone) or missed |
| **CHANGED** | built differently from the spec; must name an approved CR, otherwise it is a defect and the verdict is FAIL |
| **UNVERIFIABLE** | cannot be proved by machine here; names the manual check and who will run it, when |

3. **Golden summary:** counts per tier (pass / review / fail / disputed / not yet built); then for every step not passing, and for a sample of 10 passing steps chosen by the reviewer, a **side-by-side row: reference | app | diff heat-map**, light and dark, with the R1–R5 numbers.
4. **Copy:** FID-09 failures (string, place, screenshot), FID-10 coverage %, ART-02a/§F23.8 hits.
5. **Tokens and values:** stylelint + ESLint counts (must be 0), FID-11/12 result, FID-14 table with any row that failed (expected vs measured).
6. **Behaviour:** AT/ART/PERF results for the milestone and the full regression list; state-machine table coverage; traceability coverage per R.
7. **Gaps and CRs:** GAPS lines added in this milestone, CRs raised / approved / rejected, and every "conservative option" taken.
8. **Deviations found by reading:** what the reviewer found that no test caught, each turned into a new test or a CR.
9. **For Vikas (top of the page, plain words):** what you can try now, what changed from the drawings (if anything) and why, what needs your yes.

---

## §11.7 Rules for many agents

### 11.7.1 One owner per area

`foo-agent/OWNERS.yml` maps every folder (and shared files) to exactly one builder agent per milestone, e.g. `src/renderer/cards/**: builder-cards`, `src/engine/payments/**: builder-money`. **FID-19:** CI rejects a commit by an agent that touches a path it does not own. Shared files (`src/shared/ipc.ts` and the rest of the `src/shared/` file set of 08-0 §E.9, `tokens.json`, `OWNERS.yml`) are owned by the coordinator; others ask for a change. Two agents never edit the same file in parallel.

**FID-22 [X-189, CR-0031]: the checks are locked.** A PR that changes a check file (`LOCKED` in `scripts/fid-guard.ts`: the guards, the test configs, `OWNERS.yml`, `ci.yml`, the Claude Code hook) or removes more test cases than it adds needs a CR, like FID-02. A Claude Code `PreToolUse` hook (`.claude/hooks/locked-checks.mjs`) stops an agent before it edits a locked file or deletes or moves a test file, unless a CR on its branch names the path.

### 11.7.2 What a builder is given

Each builder task brief contains **only**: `00-README.md`, `01-articles.md`, `DECISIONS.md`, `GAPS.md`, this chapter, the chapters and § named in the milestone's "Constitution" line, the golden refs (UX/BP ids) for its surfaces, and the `copy.json`/`spec-values.json` slices for them. No old plans, no earlier drafts, no other agent's chat. A builder brief never contains or cites a `review/` file; shapes come from 08-0 §B and 08-5 (X-111). Less to read means less to mix up; the frozen spec is the only memory.

### 11.7.3 The reviewer is independent

- The reviewer agent did not write, plan or advise on any code in the milestone, and does not see the builders' conversations, only the spec, the code, the running app and the CI artefacts.
- It runs the suites itself on the golden runner (it does not trust the builder's run), reads every surface the milestone touched against its spec §, writes the fidelity report, and may not edit code. Its job is to find differences, not to approve.
- If the reviewer and the builder disagree on what the spec says, neither decides: it becomes a GAPS line and, if needed, a CR.

### 11.7.4 Cite the spec in every component

Every source file in `src/renderer/**`, `src/main/**` and `src/engine/**` starts with a header; **FID-20** (ESLint `foo/spec-header`) checks it exists and that every § resolves in the frozen spec heading index:

```ts
/**
 * @spec 05-cards-2 §5.5 Approval card; 07-journeys-2 §7.4 (approval machine, SM-A6)
 * @decisions X-01 X-04 X-17
 * @golden UX-12-08 UX-13-09 BP-CARD-05
 * @states rest hover pressed focus disabled loading empty error offline · PENDING APPROVED HELD RUNNING CHECKING COMPLETED DECLINED EXPIRED SUPERSEDED WITHDRAWN FAILED
 * @owner builder-cards
 */
```

The `@states` list must equal the states the cited § names (checked against the component-state harness, ART-25).

### 11.7.5 Gaps: stop, log, be conservative

When the spec is silent: one GAPS.md line (date · what is missing · where you looked · what you did), take the most conservative option (Art. 30: ask the user, do less, show more), mark the code `// GAP: GAPS.md 2026-10-20 "…"` and continue. ART-30 fails on any `TODO`, `FIXME`, `assume` or `GAP:` marker without a matching GAPS line.

### 11.7.6 No improvements beyond the spec

Not allowed without an approved CR, even when "obviously better": extra or reworded text; an extra button, link, tooltip, shortcut, menu item, setting, confirmation, animation, sound, toast or empty-state illustration; reordering; changing a size, colour or timing; adding a dependency the plan does not list; removing a state because "it never happens". Ideas go in `docs/cr/ideas.md` and the builder keeps building the spec. A reviewer finding one reports it as CHANGED without CR (defect).

Also not allowed: `test.skip`, `test.fixme`, `.only`, lowering a threshold, adding a mask, or widening a tolerance without a CR id in the same line (**FID-06** checks).

---

## §11.8 Drift over time (after v1)

### 11.8.1 Same suites, every change

All FID tests, all AT/ART tests, Tier B goldens (245 UX × 2 themes + BP refs) and the spec-values table run on every pull request and on `main` after every merge, on the golden runner. PERF smoke runs on every PR; full PERF weekly on the reference laptop.

### 11.8.2 Weekly drift report

Every Monday 9:00 AM IST a scheduled job writes `qa-evidence/weekly/{date}/drift.html` and sends Vikas the link: Tier B pass rate and any blessed baseline changed (with CR id), largest under-threshold diffs (trend, so creeping changes show before they fail), copy coverage, lint counts, new GAPS lines and open CRs, flaky tests, dependency and image changes, PERF p95 trend (E.2: > 10 % slower = P1).

### 11.8.3 Dependency and OS updates

- Electron, Chromium, React and every direct dependency are **pinned exact** (plan §2); lockfile committed.
- Updates come in **one batch PR per month** (security fixes may come any day as their own PR). The PR must pass every suite with **zero** Tier B changes. If pictures change (a Chromium text-rendering change, for example), the PR includes a "rebaseline" CR with side-by-side images; Vikas approves before merge.
- The golden runner image (Windows build, fonts, emoji) is pinned by id. Moving to a new Windows build is the same process: one PR, all suites, rebaseline CR if pictures change. The weekly report prints the image id.
- Windows feature updates on real users' PCs cannot be pinned; the reference laptop takes them first and runs the manual list (§11.9.3) within a week of release.

### 11.8.4 Regression = blocker

A test that passed at any earlier commit and fails now blocks merge and release, whatever its priority (P1 included). Quarantining a flaky test is allowed for at most 48 hours, with an owner and a GAPS line; while quarantined it counts as NOT DONE in every report. Reverting is always allowed; turning a check off is not.

---

## §11.9 Honest limits

### 11.9.1 What cannot be pixel-identical, and what we do

| Limit | Why | How it is handled |
|---|---|---|
| Drawings ≠ app | the walkthrough and Blueprint are hand-made HTML: simplified DOM, placeholder photos, mock icons | Tier R compares copy, positions, sizes and colours strictly and pixels loosely; Vikas approves the first app picture; Tier B locks it |
| Fonts in the reference frames | the reference HTML was first drawn on a machine without Segoe UI Variable; text rendered in a fallback font | references are re-rendered on the golden runner (Windows fonts) before freeze; if a frame still differs it is fixed by CR, not by tolerance |
| Font rasterisation at other scales | ClearType, hinting and sub-pixel positions change at 125/150/225/300 % | Tier B baselines only at 100 %; other scales checked by layout rules (no clip, no overlap, no horizontal scroll, hit areas ≥ 40px) and G.2 screenshots reviewed by a person |
| GPU and machine differences | anti-aliasing differs between machines | pictures compared only on the golden runner; developer machines run everything except Tier B |
| Windows 10 vs 11 | square vs round window corners, title-bar caption buttons, scrollbar style, Hello and toast look | caption area masked; Win10 baselines only for frame-level surfaces; scrollbars checked by behaviour (overlay, auto-hide) not pixels |
| Native Windows surfaces | toasts, Action Center, tray menu, jump list, Hello, installer, SmartScreen, File Explorer are drawn by Windows | payload equality (toast XML, menu templates, texts) automated; look checked manually from the list below |
| Real websites and live view | real booking sites change daily | sandbox sites in all automated tests; real sites only in manual checks; live-view pixels masked |
| AI replies | wording differs every time | goldens use the fake AI; real replies checked only by banned-word, time, money and language scans (ART-02b, ART-21a/c, ART-23b) |
| Emoji | Segoe UI Emoji changes with Windows updates | pinned runner image; Tier R masks emoji; Tier B does not |
| Motion | a still picture cannot prove timing and curves | computed transition values (SV-30/31), reduced-motion behaviour, and recordings reviewed by a person (G.4) |
| Taste | "optically centred", "feels calm", F31 polish bar items | reviewer reads F31 per screen; Vikas sees side-by-side pictures every milestone |
| The reference can be wrong | a golden test proves "same as the drawing", not "the drawing is right" | §11.2.7: CR, never a silent snapshot update |

### 11.9.2 What these checks do not promise

They prove the build matches **what was written and drawn**. They cannot prove the spec is complete (gaps are found by building and logged), that real websites will behave, or that a user will like it (the stranger test, 10-acceptance-2 §F, covers that).

### 11.9.3 Manual check list (per milestone that touches them, and every release)

Run on the reference laptop (10-acceptance-1 §A.6), Windows 10 22H2 and Windows 11, filed with screenshots/recordings under `qa-evidence/M{n}/manual/` and named by the step or test id:

1. Installer pages, SmartScreen, Start menu entry (UX-01, AT-001).
2. Toasts in the corner and in Action Center, Review / Not now (UX-21, X-02).
3. Taskbar badge, overlay and progress; tray menu and "Quiet until…" times (UX-21, X-11).
4. Jump list with the chosen face (AT-011).
5. Windows Hello prompt text and the typed-amount fallback (UX-13, X-08).
6. Snap Layouts on the maximise button; Windows 10 square corners.
7. Display scale 125 %, 150 %, 300 % and text size 225 % on window, chat list, chat, Approval, Payment, Settings (G.2).
8. All four contrast themes on the same six surfaces (U-6).
9. Narrator script (ART-26c) and keyboard-only journeys (ART-26b).
10. Uninstall with "Keep my data" and "Delete everything" (UX-25).

---

## §11.10 Test IDs added by this chapter

| ID | What it checks | Runs | Fails the build when |
|---|---|---|---|
| FID-01 | spec manifest hashes | every push | any spec file changed, added or missing |
| FID-02 | spec/golden change guard | every PR | `spec/**` or `golden/**` changed without an approved CR |
| FID-03 | reference re-render is byte-identical | golden runner, weekly + on image change | a reference PNG differs from its hash |
| FID-04 | golden runner identity | every golden run | image id differs from the pinned one |
| FID-05 | Tier B goldens (ratio + cluster rule) | every push | any step/theme over threshold |
| FID-06 | no snapshot update, skip, mask or threshold change without CR | every PR | found |
| FID-07 | generated `src/shared/copy/en-IN.json` is fresh; `scripts/check-copy.ts` passes | every push | differs from `spec/copy.json`, or any missing/unused key or `{var}` |
| FID-08 | `foo/no-literal-copy` lint | every push | any literal UI string |
| FID-09 | runtime copy match | every UI test | any visible string not matching an `en-IN.json` key |
| FID-10 | copy coverage | full suite | a `ui` entry never rendered and not listed as later/manual |
| FID-11 | `tokens.json` = spec tokens | every push | any name or value differs |
| FID-12 | generated token files fresh | every push | differ |
| FID-13 | stylelint + `foo/no-raw-design-values` | every push | any hit |
| FID-14 | spec-values table | every push | any row differs |
| FID-15 | each AT is a test with the spec's own Given/When/Then text | every push | missing test or changed text |
| FID-16 | state machines, full state × event table | every push | any pair wrong |
| FID-17 | state-machine random walks (invariants) | every push (1,000), nightly (10,000) | any invariant broken |
| FID-18 | traceability matrix complete | every push | any R, AT, UX or BP unmapped; any orphan test |
| FID-19 | file ownership | every PR | an agent edits a path it does not own |
| FID-20 | spec header on every source file | every push | missing header or unknown § |
| FID-21 | built milestones covered (X-189) | every push | a UX step, BP ref or matrix row of a built milestone has no live row with a test file and is not a listed gap, or a listed gap is covered |
| FID-22 | locked checks (X-189) | every PR | a locked check file changed, or test cases removed, without a CR |
| (Tier R) | reference conformance R1–R5 | when a step is first built, and on reference change | R1–R4 Fail; Review goes to the report |

---

## §11.11 Article 31 (adopted 2026-10-16, X-99)

Added to `01-articles.md`, Part III · Craft, as Article 31 (X-99), before the `spec-v1.0` freeze:

> **31. Build what is written.** foo is built exactly as this constitution and its approved drawings say: every word from the copy list, every value from the token file, every step of the walkthrough checked against its golden picture. The spec is frozen and fingerprinted; builders read it and never edit it. Anything different (even something better) needs a Change Request that Vikas approves, which becomes a DECISIONS row and a new spec version. A difference without one is a defect. A milestone is done only with fresh evidence, checked by a reviewer who did not build it, and seen by Vikas. After release, the same checks run on every change; a regression blocks. [11-fidelity]

---

## §11.12 Plan changes (exact edits to `omnibot-re/foo/foo-plan.md`; applied 2026-10-16, X-99)

These edits are applied to the plan (Phase 3a). Item 1's X-range is written as the current DECISIONS range.

1. **Header, authority line.** "`DECISIONS.md` (X-01…X-20)" → "`DECISIONS.md` (X-01…X-34)"; add "· `11-fidelity.md` (how fidelity is proved; process only)" after "→ 10". (The plan's range is stale: DECISIONS now ends at X-34.)

2. **§1 Rules, new rule 8.** Add: "8. **Build what is written (11-fidelity).** Read `spec/` only, never edit it. Every UI string through `t(key, vars)` from `src/shared/copy/en-IN.json` (08-0 §D); every style value from tokens; every source file starts with an `@spec` header. Anything different needs an approved Change Request (`docs/cr/`); ideas go in `docs/cr/ideas.md`. Never update a golden picture, skip a test, add a mask or widen a threshold without a CR id."

3. **§1 Rule 6** ("Each milestone ends with…"). Replace "a demo build for Vikas" with "a fidelity report (11 §11.6.2) for that commit, signed by an independent reviewer agent, shown to Vikas as an HTML page; the next milestone starts only after Vikas says continue".

4. **§2 Tech stack, Tests row.** Append: "· golden pictures with Playwright `toHaveScreenshot` (pixelmatch) on a pinned Windows 11 golden runner · `pixelmatch` (report heat-maps) · `fast-check` (state-machine random walks) · Stylelint + custom ESLint rules `foo/no-literal-copy`, `foo/no-raw-design-values`, `foo/spec-header`". **CI row:** append "· golden lane on the pinned golden runner image (self-hosted if `windows-latest` lacks Segoe UI Variable, 11 §11.2.6)". (New dependencies `pixelmatch` and `fast-check` need Vikas's yes as part of approving this chapter.)

5. **§3 Repo layout.** Add at the top level:
   ```
   ├─ spec/                    frozen spec set (read-only): constitution/, refs/ux/, refs/bp/, SPEC-MANIFEST.json,
   │                           VERSIONS.md, copy.json, spec-tokens.json, spec-values.json, state-machines.json,
   │                           trace.csv, banned-phrasing.json, headings.json (heading index)
   ├─ golden/                  manifest.json · ref/ux/UX-cc-ss.{light,dark}.png+json · ref/bp/BP-*.png+json
   │                           · app/ (blessed app baselines)
   ├─ docs/cr/                 CR-nnnn.md · ideas.md
   ├─ OWNERS.yml               one owner per path (FID-19)
   ├─ eslint-rules/            no-literal-copy · no-raw-design-values · spec-header
   ├─ scripts/                 spec-verify · extract-copy · extract-tokens · extract-values · extract-sm
   │                           · golden-render · golden-bless · fidelity-report · build-tokens
   ```
   In `src/shared/`: "copy/ (`en-IN.json` generated from `spec/copy.json`, keys per 08-0 §D, `t.ts`; never hand-edited, FID-07)" and "testids.ts (`TID`, 08-0 §C)". In `test/`, add "`fidelity/` ux/UX-01…UX-25 specs · bp/ · copy · spec-values · trace · sm-table · sm-walks" and "`seed/` ux-world.ts · perf.ts → `{set}.sql.gz`" (X-129; never `test/fidelity/seed/` or `test/perf/seed.ts`). In `src/shared/`, the file set is exactly 08-0 §E.9 (X-111).

6. **§4 Test strategy table.** Add four rows:
   - "Golden (Tier R / Tier B) | Playwright `_electron` + pixelmatch on the golden runner | the app matches the 245 walkthrough steps and the Blueprint mocks; then never drifts | Tier B every push; Tier R per step when built"
   - "Copy fidelity | `foo/no-literal-copy`, FID-09/10, ART-02a | every word is the spec's word | every push"
   - "Spec values | FID-11, FID-14 (computed styles) | the right token in the right place | every push"
   - "Traceability | FID-15, FID-18 | every R → AT → UX step is tested | every push"

7. **§5 M0, Create.** Append: "`spec/` vendored and tagged `spec-v1.0` with `SPEC-MANIFEST.json` + `scripts/spec-verify.ts` (FID-01) and the CODEOWNERS/CR guard (FID-02); golden pipeline: `scripts/golden-render.ts` producing all 490 UX and the BP reference PNGs on the golden runner, `golden/manifest.json`, the `golden-bless` script, and one sample UX test (UX-08-01) wired end to end; `copy.json` extraction (08-0 §D keys) + class file + `copy-keys.map` + generated `src/shared/copy/en-IN.json` + `t.ts` + `scripts/check-copy.ts` + `foo/no-literal-copy` + FID-09 harness; `src/shared/testids.ts` + `foo/testid-from-registry`; token lint: `extract-tokens.ts`, `tokens.json` = spec (FID-11), generator + freshness (FID-12), Stylelint + `foo/no-raw-design-values` (FID-13); `spec-values.json` with SV-01…SV-38 and the FID-14 runner (rows for components not built yet are marked `pending: M{n}`); `state-machines.json` + FID-16 table test skeleton; `trace.csv` + FID-18; `OWNERS.yml` (FID-19), `foo/spec-header` (FID-20); fidelity report template `scripts/fidelity-report.ts` → `qa-evidence/M0/fidelity.html`; CR template `docs/cr/CR-0000-template.md`."
   **M0, Must pass.** Append: "· FID-01, 02, 03, 04, 06, 07, 08, 11, 12, 13, 18, 19, 20 · FID-14 rows SV-16, SV-37, SV-38 · golden runner identified and pinned (GAPS line if self-hosted) · M0 fidelity report reviewed and shown to Vikas."

8. **§5 every milestone M1–M14: add a "Fidelity exit" line** after "Must pass". Common to all: "FID-01…FID-20 green on the whole app so far; Tier B green for every step blessed in earlier milestones; Tier R run for the steps below with no Fail; fidelity report signed by the reviewer and seen by Vikas." Plus the golden refs each milestone brings to Tier R (a chapter is fully owned by the milestone that completes it; earlier milestones test the steps they can, the rest show NOT DONE (scheduled M#)):

   | Milestone | Golden refs to pass Tier R (and bless) | Spec-values rows |
   |---|---|---|
   | M0 | — (UX-08-01 wiring sample only) | SV-16, 37, 38 |
   | M1 | BP-APP-L/M/R, BP-ANAT-* (shell frame, chat list, headers, right shell, widths L/M/S/XS) | SV-13–18, 23–25, 29, 32 |
   | M2 | UX-08 (all 7), UX-09 steps not needing transcription; BP-MSG-*, BP-COMP-* | SV-01–12, 26, 30 |
   | M3 | UX-08 re-run with adapter replies through the fake AI; UX-02 engine assertions (UI frames in M12) | — |
   | M4 | UX-05 job parts; UX-23 stuck, loop, AI-offline, recovery steps; BP-CARD checklist, plan, proof, stuck, error, spend cap | SV-19, 20, 31, 34 |
   | M5 | UX-10 (all 8); approval/draft/secret-box steps reachable with fakes; BP-CARD choice, option tiles, approval, draft, secret box, paste catcher | SV-21, 22, 27 |
   | M6 | UX-18 (all 10); BP-CARD memory chip; BP-SCR memory page | — |
   | M7 | UX-07 (all 8), UX-17 (all 10); BP-CARD brief, routine created, suggestion; BP-SCR routines | SV-33 |
   | M8 | UX-16 (all 10); UX-04 connection steps; UX-11 reading steps; BP-CARD connect, draft variants | — |
   | M9 | UX-12 (all 12), UX-14 (all 10), UX-15 (all 10); BP-CARD sign-in, handoff; BP-SCR live view, sign-in window | — |
   | M10 | UX-13 (all 16), UX-11 (all 10); BP-CARD payment, CVV variant; BP-SCR typed amount | SV-35 |
   | M11 | UX-21 (all 11), UX-09 (all 8), UX-23 crash/safe-mode steps; BP-WIN-* payloads + manual list items 2–6 | — |
   | M12 | UX-01 in-window steps, UX-02, UX-03, UX-04, UX-05 (all) | — |
   | M13 | UX-06 (all 8), UX-19 (all 10), UX-20 (all 6), UX-22 (all 8), UX-24 (all 12), UX-25 activity-log steps; remaining BP-SCR | SV-36 |
   | M14 | UX-01 installer steps on the installed build, UX-25 (all 13); **all 245 UX steps × light + dark in Tier B**, all BP refs; manual list 1–10 on Windows 10 and 11; FID-10 copy coverage 100 % (or manual) | all rows |

9. **§7 Definition of done.** Add items: "7. The milestone's fidelity report (11 §11.6.2) for this commit has no FAIL, no CHANGED without an approved CR, and every UNVERIFIABLE item has a named manual check. 8. An independent reviewer agent signed it. 9. Vikas has seen the HTML report and said continue." In "The build is releasable", add: "all 245 golden steps pass Tier B in light and dark; FID-01…FID-20 green; manual list (11 §11.9.3) filed for Windows 10 and 11."

10. **§8 Risks.** Add a row: "Drift between spec and build (agents 'improving', snapshots updated, values swapped for near tokens) | frozen spec with hashes, CR-only changes, golden Tier R/B, copy and spec-values tests, independent reviewer, Vikas sees each milestone (11-fidelity)".

11. **§9 Counts.** Append: "245 UX golden steps (490 frames light + dark) and the Blueprint mocks (25 cards, 19 screens, shells, composer, messages, Windows surfaces); 38+ spec-value rows; 20 FID tests."

---

## §11.13 Open points for Vikas (answered 2026-10-16, X-99: 1 approved; 2 Article 31 adopted as written; 3 spec keeper = the coordinator agent; 4 golden runner decided at M0 with a GAPS line if self-hosted)

1. Approve this chapter (and with it the freeze `spec-v1.0`, the CR process, and the two new test libraries `pixelmatch` and `fast-check`)? Until he does, it is a proposal and the plan is unchanged.
2. Approve Article 31 as written, or keep it as a rule of this chapter only?
3. Who is the spec keeper (default: the coordinator agent)?
4. A self-hosted Windows 11 golden runner may be needed (§11.2.6); it costs a small always-on VM or Vikas's spare PC. Default if no answer: decided at M0 after checking `windows-latest`, log