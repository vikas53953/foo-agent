# CR-0013: M9 trace rows, Blueprint ids, two superseded/moved UX steps, and the picks the M9 build makes where the spec forks

- **Asked by:** the M9 lead (ticket T1, `/mnt/project-files/foo/prep/M9-tickets.md`), 2026-10-18, while building M9 (foo-plan §5 M9).
- **Spec sections:** 05-2 §5.5.2, 05-3 §5.10, §5.18, 06-3 §11.1–§11.3, §13, 07-2 §7.6, 08-0 §A, §C.3, §D, §E.8, §E.9, §G.2, §G.8,
  08-1 §1.2.1, §2.4, §3.1.1, §3.2, §3.3, §4.5, 08-2 §8, §9, §10.4, §11.4–§11.6, 08-3 §21.2, 08-4 §26.8, §26.11, §27.1–§27.6, §28.1–§28.2,
  09 §9.27, 10-acceptance-1 §B, 10-acceptance-2 §D, 11-fidelity §11.2.7, §11.12.
- **Status:** Approved by Vikas's approve-on-my-behalf rule (his message 2026-10-18 14:56Z), after the independent review in §(e), DECISIONS X-166
- **Change:** `spec/trace.csv` (rows below), `spec/constitution/DECISIONS.md` (row X-166); `scripts/golden-manifest.ts` (`BP_M9`,
  `SUPERSEDED` UX-15-02, `EARLY_STEPS` UX-15-10 → M13) and `golden/manifest.json` regenerated (`pnpm golden:manifest`). No
  other `spec/` or `golden/` file changes.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows (`spec/trace.csv`), Milestone M9, all `pending`

| Id                                     | Test file                                                         |
| -------------------------------------- | ----------------------------------------------------------------- |
| AT-036, AT-039                         | `test/e2e/m9-booking.spec.ts`                                     |
| AT-037, AT-038                         | `test/integration/browser/submit.test.ts`                         |
| AT-040, AT-207                         | `test/integration/browser/reminder.test.ts`                       |
| AT-056, AT-057, AT-211                 | `test/e2e/m9-signin.spec.ts`                                      |
| AT-058, AT-078                         | `test/e2e/m9-takeover.spec.ts`                                    |
| AT-059                                 | `test/integration/browser/login.test.ts`                          |
| AT-060                                 | `test/integration/browser/signin.test.ts`                         |
| AT-079, AT-272                         | `test/e2e/m9-live.spec.ts`                                        |
| AT-080                                 | `test/e2e/m9-stop.spec.ts`                                        |
| AT-114a                                | `test/integration/browser/proof.test.ts`                          |
| AT-137 (web part)                      | `test/articles/ART-net-web.test.ts`                               |
| AT-138, AT-139, AT-140, AT-141, AT-143 | `test/integration/web/{search,fetch,outbound,cloud,cost}.test.ts` |
| AT-142                                 | `test/e2e/m9-handback.spec.ts`                                    |
| AT-144                                 | `test/integration/browser/recipes.test.ts`                        |
| AT-157                                 | `test/e2e/m9-flights.spec.ts`                                     |
| ART-03, ART-09                         | `test/articles/ART-03.test.ts`, `test/articles/ART-09.test.ts`    |
| UX-12-01…12                            | `test/fidelity/ux/UX-12.restaurant.spec.ts`                       |
| UX-14-01, -05…10                       | `test/fidelity/ux/UX-14.signin.spec.ts`                           |
| UX-15-03…09                            | `test/fidelity/ux/UX-15.live.spec.ts`                             |
| BP-CARD-10, BP-CARD-17                 | `test/fidelity/bp/BP-cards-m9.spec.ts`                            |
| BP-SCR-13, BP-SCR-14                   | `test/fidelity/bp/BP-screens-m9.spec.ts`                          |

Each ticket flips its own rows to `live` in the commit that lands the test. The injection article has no AT/ART id, so it
has no row (it runs as `test/articles/ART-injection.test.ts`). G-M9-05: AT-039's email rung, AT-040, AT-207 and UX-12-08/10/11
need M7's once-routine and M8's `gcal.create` and drafts; their rows stay `pending` and land in a follow-up PR after M7/M8.

Blueprint ids (`BP_M9`): `#cardgal > .panel:nth-child(n) > .mini` for 10 Sign in here and 17 Handoff;
`#scrgal > .scr:nth-child(n) > .body` for 13 Watch live and 14 Sign-in window. Card minis are drawn in 350px panels, so their
R2 boxes are disputed by construction (CR-0003 §b). BP-SCR-14 is checked against X-66 (real Edge + docked banner) before it
is blessed; a drawing that shows the withdrawn "Chromium view" is a dispute row, not an app change.

UX steps: UX-15-02 is superseded by X-95 (the in-panel live picture is withdrawn; Watch live opens `live.html`; G-M9-02).
UX-15-10 (7-day replay) is 06-3 §13 Replay mode in the attachment viewer (X-128) and moves to M13 (G-M9-03). The already
superseded UX-14-02/03/04 (X-66) and UX-15-01 (06 §0.11) get no rows.

## (b) Picks for the M9 gaps (pack `prep/M9.md` §8; each is the pack's "Recommended" option, approved by Vikas in GAPS-for-review 2026-10-18 13:34Z)

1. **G-M9-01** Files follow 08-0/09: `src/main/windows/signinBanner.ts`, and the one matcher `src/shared/handback.ts`; no second matcher.
2. **G-M9-02** UX-15-02 superseded (X-95), above.
3. **G-M9-03** UX-15-10 → M13, above. M9 writes the step screenshots (08-2 §8.3.8) only.
4. **G-M9-04** M9 builds `HandoffMarker.tsx` from seeded rows; `helper.handoff` stays M13. **Deviation recorded:** the
   `job_link` card (`cards/JobLink.tsx`) is built by M4 T5 (M4 pack §3 lists it), so M9 does not build a second one; if M4
   lands without it, M9 T6 adds it.
5. **G-M9-05** Reminder, calendar and WhatsApp-draft parts build against interfaces; their tests stay `pending` (above).
6. **G-M9-06** The deadline reminder uses 05-2 §5.5.2's card words; AT-207's line is the toast body.
7. **G-M9-07** An unconfirmed booking: the site's history page every 60 s for 10 min, never Gmail, never re-submitted; then
   FAILED with the new key `cards.approval.failed.unconfirmed` "I couldn't confirm the booking. Check {site} before trying
   again." (words as the pack proposes; approved by Vikas in GAPS-for-review, 2026-10-18 13:34Z).
8. **G-M9-08** `live:state` stays as 08-1 §3.3 has it; the renderer maps running → live, paused_signin → needs_you,
   taken_over → in_control, unavailable → cant_show; starting / paused / done come from the job row.
9. **G-M9-09** Live window Narrator name per 06-3 §11.2: "{job}, picture of foo's browser" (X-121: the words are 06-3's).
10. **G-M9-10** The `signin` payload's `reason` is a closed enum `sign_in | captcha | passkey | bank_3ds | known_puzzle |
saved_login_failed` (`SignInReasonSchema`); `mode` is `take_over` for captcha / passkey / bank_3ds / known_puzzle; buttons
    exactly per the 05-3 §5.10.2 lane row (passkey: I'm done + Skip).
11. **G-M9-11** No Watch button on the Sign-in card (05-3 §5.10.4's id list is the owner).
12. **G-M9-12** `resources/handback-sites.json` and `resources/no-capture-hosts.json` ship the 08-4 §27.4/§27.5 seeds verbatim; the
    review is a Vikas item in the M9 report.
13. **G-M9-13** Vault names `foo/web_key/{exa|tavily|firecrawl|browseruse}` (08-0 §E.8 wins over X-46's spelling).
14. **G-M9-14** Copy slots named per 08-0 §D (`live.window.pill.{…}`, `live.window.{now,starting,cant_show,picture_tooltip,
take_over,control_bar,hand_back,stop,title}`, `signin_banner.{waiting,success,in_control,done,hand_back,not_secure}`,
    `cards.signin.{title.<lane>,state.*,button.*}`) and listed in implementation-notes, as M1 did.

Contract shapes T1 lands (08-1 is followed as written; no shape changes): MainToEngine `job.watch`, `job.takeOver`,
`job.handBack` (no `mode`), `signin.done`, `signin.skip`, `webkey.check { provider }`;
invokes `job:openWindow`, `job:takeOver`, `job:handBack`, `signin:done`, `signin:skip`, `app:openExternal`
(handlers stubbed until their ticket); events `live:frame`, `live:state`; settings `privacy.screenshotDays`,
`privacy.readCodesFromGmail`, `connections.web` (08-0 §A defaults); the M9 error kinds of 08-3 §21.2 / 08-2 §8 / 08-4 §27.3;
the vite inputs `windows/live.html` and `windows/signin-banner.html` (08-1 §1.2.1); `resources/web-tools.json` (08-4 §27.3);
the runtime dependency `playwright-core` 1.64.1 (08-0 §G.8: Edge driven by playwright-core over CDP; same version as
`@playwright/test`).

## (c) Not changed

No approved screen, word or flow changes. The approval machine and Approval card kinds stay M5's. `permissions.apps.browser`
(08-0 §A) arrives with M5's gate settings.

## (d) Ahead of plan order

The plan runs M9 after M5. Vikas (2026-10-18 18:03Z) asked for independent work to run in parallel now, so the M9 branch is
based on the M4 branch and merges M4, then M5, then main; tickets that need M5 code to interfaces and are wired when M5 lands.
The M9 PR to main opens only after M5 is on main.

## (e) Independent review

Sonnet reviewer, 2026-10-18 ~18:25Z, read-only, against the pack, 08-1 §2.4/§3.2/§3.3, 08-0 §A, 08-4 §27.3–§27.5 and the
DECISIONS above. **Verdict: PASS WITH FIXES**; the one act finding (this section still read "pending" while the Status line
said approved) is fixed by this text.

- G-M9-01…14 are the pack's recommended options and stay inside the cited lines; MainToEngine kinds, the M9 invokes and events,
  the resource seeds, the `handback.check` rule, the settings defaults, the trace rows and the manifest changes match.
- Considered and applied: `code:submit` / `code.submit` are left to M5 (M5 T1/T2 own the secret channels; the Sign-in card's
  use-code box invokes it once M5 lands); the `playwright-core` 1.64.1
  runtime dependency (`package.json`, lock file) is named under (b). Noted: `privacy` / `connections` hold only the M9 keys;
  M6/M8 extend those objects (merge check at each milestone merge).

Recorded as approved on Vikas's behalf under his standing rule (his message 2026-10-18 14:56Z); listed for his later review.

## Addendum (2026-10-20, M9 lead, T3 merge)

- **Page snapshot source.** The masked snapshot (08-2 §8.3) is built by foo's own DOM walker (`src/engine/tools/browser/walker.ts`),
  never by Playwright's AI snapshot, which prints field values before masking. Masking happens at source, so no value reaches a
  turn. Logged in `docs/decisions/M9.tsv`.
- **Open seams carried to T7, T8 and T9:** `screen.open` is built but not registered until main has an opener and a protocol
  kind; the runner should put a tool's `errorKind` in the step observation, call `runtime.stepStarted` per step and
  `shots.capture` after each step (PR #59 "Seams").
- **Merge on main:** `settings.privacy` and `settings.connections` now hold M6's, M8's and M9's keys in one object each;
  `app:openExternal` keeps main's single handler (`src/main/setup/aiFinderIpc.ts`), and T8 adds `handback_site` there.

## Addendum (2026-10-20, M9 close-out lead, T9)

**Rows flipped to live** (each by the test whose title names the id): ART-03 browser rung (`test/articles/ART-03.browser.test.ts`),
ART-09 new site (`test/articles/ART-09.site.test.ts`), UX-12-01…07, -09, -12 (`UX-12.restaurant.spec.ts`), UX-15-03, -04, -06,
-07 (`UX-15.live.spec.ts`), BP-SCR-13, BP-SCR-14 (`BP-screens-m9.spec.ts`). **One row added:** ART-08a, the browser part
(`test/articles/ART-08a.browser.test.ts`: a site password and a card number typed by the person on pages in foo's browser are in
no snapshot, step picture, stored tool call, AI request or file; OCR of pictures is listed as not covered, the masker test checks
the pixels). The injection article runs as `test/articles/ART-injection.test.ts` with no row, as (a) says.

**Stay pending, honestly:** UX-15-05 (no "You took over" / "Carrying on from here." checklist rows: no step state maps to
`took_over`), UX-15-08 (dialogs C-13 / C-13b are not built; the step uses the typed "Stop everything" of 08-4 §26.9), UX-15-09
(no combined stop report or "Pause all routines" link), plus the G-M9-05 rows and AT-079 named in the handoff. They are carry
items for the follow-up after M7, in `docs/decisions/M9.tsv`.

**Code fix (ART-09, no spec change).** 08-2 §8.1 says acting with `book`/`buy`/`pay` on a domain other than
`approval.fields.siteDomain` needs a new Approval card, and §9.6 A checks "siteDomain of the page == fields.siteDomain → else
HELD(mismatch)". The runner never passed the page's domain to the second look, so an approved booking would have run on whatever
site the job's page was on. `runnerGate.runApproved` now passes it for those verbs; the HELD card asks "you asked for {card's
site}, this is {page's site}. Which one?" before anything is pressed. The test fails on the old code (seen) and passes now.

**Drawing vs app (Tier R disputes, `docs/fidelity/disputes.json`, CR-0013).** The app follows the cited spec line each time:

| Ids                        | Checks                                | Why the app is right                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-12-01…04, -07, -09, -12 | r1, r2, r4 (r3 on -01 dark, -03, -09) | fixtures are the sandbox TableJoy / Coastline Kitchen / Sun 18 Oct / ₹1,000 / TJ8821 (08-3 §22.5, public repo), not the drawn Pizza by the Bay / ₹500 / #PB-4471                                                           |
| UX-12-02, -04              | r1, r4                                | checklist rows are 08-4 §26.1 phrase words; "Checking the 8:00 PM table…" is the Tiles card's `cards.tiles.checking`, not a row                                                                                            |
| UX-12-03                   | r1, r3, r4                            | an AI ask is a ChoiceCardSpec (08-4 §25: label + detail, no photo), so a Choice card, best fit on the accent-soft fill (05-2 §5.4)                                                                                         |
| UX-12-07                   | r1, r4                                | after the tap: 05-2 §5.5.4's "Approved by you at {time}. Doing it now…"; the drawn "checked again" strip is not in 05-2                                                                                                    |
| UX-12-09                   | r1, r3, r4                            | a confirmation number opens 05-3 §5.15.2's popover; the full-window viewer is 06-3 §13 (M13)                                                                                                                               |
| UX-12-12                   | r1, r4                                | the done answer carries the Proof chip (05-3 §5.15)                                                                                                                                                                        |
| UX-12-01 dark              | r3                                    | the dark "me" bubble uses the dark-theme accent token, the drawing a light fill                                                                                                                                            |
| UX-15-03, -04              | r1…r4                                 | the drawing is a Windows desktop with foo behind; the capture is the live window alone (09 §9.27.1); the control bar copy is X-121's                                                                                       |
| UX-15-06                   | r1, r2, r4                            | the stop report is 08-2 §5.7's "Stopped. Nothing was booked, paid or sent."                                                                                                                                                |
| UX-15-07                   | r1, r2, r4                            | 08-2 §5.7 puts `activity.summary` in as written (06-3 §9.4 "Sent an email to {name}"), so the report reads "I'd already Sent an email…"; **spec gap** for the spec keeper (casing when the summary is quoted mid-sentence) |
| BP-SCR-13                  | r1, r2, r3                            | the drawing is a gallery mini; the app is the full live window with 06-3 §11.2's "{job} · step n of m" bar                                                                                                                 |
| BP-SCR-14                  | r1, r2, r3                            | the drawing is the withdrawn 720×640 "Chromium view" (X-66); the app is 05-3 §5.10.3's docked banner                                                                                                                       |

UX-12-05 stays under CR-0009's dispute and UX-12-06 under its review row.

**App gaps found by the golden specs (not disputes; carry list, `docs/decisions/M9.tsv`):** the Approval impact line has no date
(`requestApproval`'s `parseWhen` port is not wired, G-M5-32); the proof popover lacks the screenshot (05-3 §5.15.2); after a stop,
steps that never ran show as done (`jobCards.ts` maps `skipped` → done, an M4 mapping); after a stop the ask bubble keeps 🛠 and the
"stop" bubble gets no ⛔; a typed "yes" / "Stop everything" bubble keeps 👀 after foo answers; no `stopped_all` activity row seen
within 5 s of "Stop everything".
