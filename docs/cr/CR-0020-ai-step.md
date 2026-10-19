# CR-0020: the AI step: "Find your AI" and Settings → Your AI before M12, its trace rows and picks

- **Asked by:** Vikas, 2026-10-19: "Pull it forward" on the testing thread's card (~18:09Z), then "so build now in parallel of
  M6" and "wat ever we planned in AI step do build all that now .. in alongside M6". The coordinator scoped it: the J2 card
  (06-1 §2.2) and the Settings "Your AI" rows (06-2 §6.1), plus the key entry, detect and test states they need. Welcome,
  name and face, interview, first job and the other Settings pages stay with M12 / M13.
- **Why:** a fresh install never chooses an AI today (`ai.primary` defaults to null, settingsDefaults.ts), so a tester cannot
  get a reply. With this step a first run finds the Claude Code or Codex CLI already signed in on the PC, or takes an API
  key in the Secret box, tests it and starts chatting.
- **Spec sections:** 06-1 §2.0, §2.2; 06-2 §6.0, §6.1; 08-0 §A (`ai.*`, `setup.*`), §E.5 (`maker-pages.json`), §E.8; 08-1
  §3.2 (`ai:detect`, `ai:verify`, `ai:choose`, `app:openExternal`, `secret:save`, `secret:list`); 08-2 §6.3.1, §6.6, §6.7;
  05-2 §5.8; 10-acceptance-1 AT-005, AT-006, AT-009, AT-155, AT-155a; 11-fidelity §11.12 item 8.
- **Status:** pending independent review (§(f)); then approved on Vikas's behalf under his standing rule, DECISIONS X-178.
- **Change:** `spec/trace.csv` (rows below), `spec/constitution/DECISIONS.md` (row X-178); `scripts/golden-manifest.ts`
  (`EARLY_STEPS`) and `golden/manifest.json` regenerated (`xvfb-run pnpm golden:manifest`). No other `spec/` or `golden/`
  file changes.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows (`spec/trace.csv`) and the milestone label

The step is not a plan milestone, and trace / fidelity ids take `M<n>` only. It ships alongside M6 and before M8 (Vikas's
order), so its rows and early steps are labelled **M6**. The owners do not change: UX-02 stays with M12 and UX-24-02 with
M13, which still bless their pictures (`EARLY_STEPS`, CR-0003 pattern).

| Id                                                      | Test file                                 |
| ------------------------------------------------------- | ----------------------------------------- |
| AT-005, AT-006, AT-009 (Settings half), AT-155, AT-155a | `test/e2e/ai-step.spec.ts`                |
| AT-155a                                                 | `test/unit/ai-step.test.ts`               |
| UX-02-01…07, UX-02-09 (early, owner M12)                | `test/fidelity/ux/UX-02.ai.spec.ts`       |
| UX-24-02 (early, owner M13)                             | `test/fidelity/ux/UX-24.settings.spec.ts` |

AT-005 and AT-006 keep their M3 engine rows (`test/unit/m3-engine.test.ts`); these rows add the screen half. AT-009's
Secret box half stays M5's (`m5-secret.spec.ts`); this is the Settings half G-M5-10 left for later. UX-02-08 (the paste
catcher) is the M2 composer's and is not run again. UX-02-01's five Looking rows last about a second on a first start,
so the step checks its words but takes no picture (a timed picture would be flaky). BP-SCR-02 (the J2 Blueprint panel)
stays with M12.

## (b) Picks where the spec is silent or forks

1. **First run opens on the finder.** Until M12 builds the welcome card, a first run with no AI (`setup.complete` false,
   `setup.step` ≤ 1, `ai.primary` null) opens foo's chat on the J2 card and `setup.step` moves 0 → 1. A FOO_TEST run posts it
   only when it asks for a first run (`FOO_TEST_FIRST_RUN=1`), so every older test world is unchanged.
2. **The finder is a real `setup` card row.** Main writes it (05 card frame, payload `setupCard: 'ai_finder'`) through the
   card store, so it survives a restart and the renderer never writes cards (08-1 §4.6). A successful `ai:choose` moves
   open finder cards shown → answered and a first run to `setup.step` 2.
3. **`SetupCardPayload.using`** records the chosen AI on the answered card, so the collapsed card reads "✓ Using {AI} (your
   AI)" after a restart.
4. **Inline questions.** "Pick another", "nothing found", "Which key is it?" and the local-AI question are drawn inside the
   finder card with the 05 Choice look (`purpose: setup`). Their answers have no engine meaning, so no Choice row is written.
5. **Sign-in happens in the maker's own app.** 08-1 has no channel that starts a CLI's own login, and foo never touches
   login tokens. "Sign in" shows "Sign in in the {Claude} app, then come back." and the row is looked at again every 5 s and
   when the window regains focus; a helper that appears is tested at once (AT-155: within 5 s).
6. **`choose` accepts a plan-limited AI** ("Continue anyway", 06-1 §2.2 only-plan-limited block). Its test answered (it is
   signed in); it rests until its reset time like any limited primary (08-2 §6.7). `VerifyResult` failures carry `resetAt`.
7. **Other test failures read as slow** with [ Test again ] (06-1 §2.2 has no row state for AI_TIMEOUT, AI_SERVICE_DOWN or
   UNKNOWN). While the engine is still starting, detection is asked again every second, so rows stay Looking instead of
   reading "not found".
8. **`FOO_TEST_AI_HOME`.** A FOO_TEST run may name a folder that stands in for the user's home: the ladder then finds helpers
   only in `{home}/bin` and sees no real `*_API_KEY`. Tests never look at the machine they run on (08-3 §22.3).
9. **A key found only in the environment** shows its row with [ Add in secret box ] and is not tested until it is in the
   vault (08-2 §6.6 copies it only after the user saves it).
10. **Keys are read from the vault.** The engine's `getKey` asks main with `vault.use({ purpose: 'ai_call', name })`
    (08-2 §6.3.1); before this step it always returned null.
11. **Settings, what this step builds.** The 06-2 §6.0 frame (header, the 11-item nav, content column) and the YOUR AI rows of
    §6.1 (Using with its status line, Test now, Change; Backup AI; How it's paid with Replace key; Add another AI). Deferred
    to M13: Search settings, the narrow (< 720px) drill-in layout, the YOU rows, "Run setup again", foo's profile row, deep-
    link flash, and every other page's rows (those pages show their title). Gap copy: "Not set up yet" (Using with no AI),
    "Free, runs on this PC" (How it's paid for AI on this PC, from 06-1 §2.2 row 6), "checked just now / {n} min / {n} h /
    {n} days ago".
12. **Replace key replaces at save.** The dialog saves the new key over the old one, then tests it; a failed test keeps the
    dialog open with "That key didn't work…". Keeping the old key until the new one passes needs a vault slot for a
    candidate key; that waits for M12's key work.
13. **The step pill stays at "Step 2 of 4"** after an AI is chosen, because steps 2 to 4 are M12's; chat works meanwhile.
14. **Locked composer line.** In setup mode the not-set-up composer reads "Connect your AI first, then we can talk."
    (`setup.composer.locked`, 06-1 §2.0); outside setup it keeps "Connect your AI first".

## (c) Channels (08-1 §3.2 is a closed list)

- `ai:openFinder {} → { chatId, cardId }` (new). Settings "Change" and "Add another AI" must "switch to foo's chat and post the
  §2.2 card" (06-2 §6.1); the renderer cannot write cards, so main posts it. Older open finder cards are marked skipped.
- `ai:askKey { providerId: openai-key | anthropic-key | google-key } → CardRow` (new). "Add in secret box" and "Which key is
  it?" post the 05-2 Secret box (`ai_key`, vault name = provider id, why line `setup.ai_finder.key.lead`) under the finder.
  It carries no value; the key goes through `secret:save` only.
- `app:openExternal` (spec'd) is built for `target: 'maker_page'` only; the URL comes from `resources/maker-pages.json`, never
  from the renderer, and any other provider or target is `URL_NOT_ALLOWED` (AT-155a). FOO_TEST runs record the URL instead
  of opening a browser.

## (d) Not changed

No migration and no new settings key. The M6 files (renderer store, memory) are untouched. `src/preload/*` gained the three
channel names only.

## (e) Open items for the spec-keeper

08-1 §3.2 gains `ai:openFinder` and `ai:askKey`. 06-1 §2.2's sign-in line ("Opening {ChatGPT} sign-in in your browser…")
waits for a CLI login channel (pick 5). 06-2 §6.1 "the old key is kept until the new one passes" waits for pick 12.

## (f) Independent review

Pending.
