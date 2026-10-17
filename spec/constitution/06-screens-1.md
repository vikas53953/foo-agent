# 06 · Screens, part 1 of 3: splash, first run, helpers, groups

Read `06-screens.md` §0 first: surface kinds, page/dialog frames, controls (§0.4), common states (§0.5), banners, keyboard and Narrator rules apply to every screen here and are not repeated. Card internals (Choice, Connect, Secret box, Checklist, Proof, Error) are in `05-cards.md`; bubbles and composer in `04-messages-and-composer.md`; window, shells and headers in `03-shell.md`.

Evidence keys as in `02-foundations.md` (MSG, AIC, HRM, OCL, AGT, WIN, BP1) plus journey ids (J1–J23 in `research/journeys-1..4.md`) and teardown keys (INS, GRK, OCL, HRM, POK, TAB, GPT, GEM, MUS, APL, CWK, PPX, MNS as listed in `journeys-1.md` §0).

---

## §1. Splash and cold start

### 1.1 Purpose
Show something calm the instant foo's window appears, and hand over to the real chat list as fast as possible (Article 28: cold start to usable chat list < 2.0s on a mid laptop).

### 1.2 How you get there
| Launch | What MUST happen |
|---|---|
| User opens foo (Start menu, taskbar, desktop, tray "Open foo") | Main window created with `show:false` and `backgroundColor` = the current theme's `--bg-app` value; shown on `ready-to-show`. The renderer's first paint is the Splash view; it is replaced by the shell when the chat list query returns. `[WIN §1.1 "first paint"]` |
| Windows sign-in with "Start foo when I sign in to Windows" on | Launched with `--hidden`: **no window and no splash**. Tray icon only. Jobs and routines resume in the background. `[WIN §16.3]` |
| Toast click while foo is not running | Same as user open, then the shell opens the toast's chat (or card) directly; the splash never shows a chat name. |
| Second launch while foo runs | No new window, no splash. The running window restores and focuses (single instance, 09-windows). |
| Launch after an unexpected close | Splash as normal, then 09 §9.21 (recovery cards per job; 3 crashes within 10 min of launch → safe mode card). |

### 1.3 Layout (window content below the 32px title bar)

```
┌───────────────────────────── title bar 32px (03 §3.2; empty strip, caption buttons live) ─────────────────────┐
│                                                                                                                │
│                                                                                                                │
│                                              foo                                                               │  wordmark, centred, --t-display
│                                              16px                                                              │
│                                     Getting things ready…                                                       │  --t-small --fg-3 (only after 3s)
│                                              12px                                                              │
│                                     ▬▬▬▬▬▬▬▬▬▬░░░░░░░░░░                                                       │  240×4 progress (upgrade only)
│                                                                                                                │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
  bg --bg-app; block vertically centred at 45% of content height
```

| Element | Spec | Copy | Test id |
|---|---|---|---|
| Wordmark | "foo", `--font-display`, `--t-display` size/line (40/48), weight 800, letter-spacing −0.05em, lowercase, `--fg-1` (02 F0 wordmark) | "foo" | `screen-splash-wordmark` |
| Status line | `--t-small`, `--fg-3`, centred. Hidden for the first 3.0s. | see 1.4 | `screen-splash-status` |
| Progress bar | Only while upgrading data after an update. 240×4px, `--r-full`, track `--bg-sunken`, fill `--accent`, determinate. | — | `screen-splash-progress` |
| Title bar | 03 §3.2: empty 32px drag strip with live caption buttons. The window title (taskbar, Alt+Tab, Narrator) is "foo". Closing during splash quits if first run is not done; otherwise it follows the close-to-tray rule (09). | — | `titlebar` |

### 1.4 States
| State | Trigger | Shows | Copy |
|---|---|---|---|
| Normal | shell ready in < 3s | wordmark only, then cross-fade to shell (`--m-normal`; reduced motion ≤ 83ms) | — |
| Slow | not ready after 3s | status line | "Getting things ready…" |
| Upgrading | first launch after an update that changes stored chats | status line + determinate bar | "Updating your chats for the new version. This takes up to a minute. Don't turn off your PC." |
| First run | `setup.complete` is false | splash → §2 setup mode | — |
| Can't open chats | the chat store can't be opened or read | §17.2 "can't open" screen | "I can't open your chats." (§17.2) |
| Disk full | < 200 MB free and the store can't write | replaces the status line; one Primary button | "Your PC is out of space, so I can't start. Free up some space and try again." [ Open storage settings ] and Link "Try again" |
| Offline | no internet | nothing different (foo starts fully offline, Article 29) | — |

The splash never shows a spinner, a tip, a version number or a percentage outside the upgrade state.

### 1.5 Keyboard and Narrator
- Nothing is focusable in the splash except the caption buttons. Alt+F4 works.
- The status line is `role="status"`; Narrator reads "foo is starting" once when the window appears, then any status line text once.

### 1.6 Reads / writes
Reads `settings.json` (`appearance.theme`, `window.bounds`, `window.maximized`, `setup.complete`; 08-0 §A), opens `{DATA}\data\foo.db`. Writes nothing except the upgrade itself and the launch time used by §18's crash counter (08-0 §G.14).

Test ids (08-0 §C): root `screen-splash`, status line `screen-splash-status`, progress bar `screen-splash-progress`, disk-full button `screen-splash-storage`, "Try again" `screen-splash-retry`.

### 1.7 Credits
Electron no-white-flash first paint (WIN §1.1 [E3]); start hidden at login (WIN §16.3); Hermes boot copy for "chats and settings are safe" (HRM-2 §16); budget from Article 28.

---

## §2. First run

### 2.0 Setup mode (the frame for every first-run step)

**Purpose.** Get a non-technical person from install to a real result in under 5 minutes, in the same chat they will use every day. First run is **foo's chat in setup mode**, not a wizard (J1 step 6; Hermes onboarding as chat, HRM §6). The approved four steps and their titles come from BP1 "Your first five minutes with foo".

**How you get there.** First launch after install (J1); any launch while `setup.complete` is false (resumes at the last unfinished step, below); Settings → Account & your AI → "Run setup again" (§6.2; reruns steps 2–4 only, the AI stays); typing "interview me" or "set me up" (runs step 3 only, GEM §9.6).

**Layout (1100px wide window shown).**

```
┌─ title bar 32 ─────────────────────────────────────────────────────────────────────────────────────────────────┐
├──────────── left shell 340 ────────────┬──────────────────────────── main shell ───────────────────────────────────┤
│ foo                      [+ New helper]│ (f) foo          [ Step 1 of 4 · foo finds your AI ]       Skip the rest   │ 60
│                         (disabled)     │ 40px avatar      pill 28px high, 12px after the name         Link, right 16 │
├────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
│ [ Search chats            ] disabled   │                                                                             │
│                                        │            ┌──────────────── setup card (05 frame) ─────────────┐           │
│ (f) foo              now               │            │                                                     │           │
│     Setting up                         │            │                                                     │           │
│     row --fg-3, not selectable         │            └─────────────────────────────────────────────────────┘           │
│                                        │                                                                             │
│                                        │   message column max --column-max 760, centred, side pad 24             │
│                                        ├────────────────────────────────────────────────────────────────────────────┤
│ (V) Vikas · Setting up         [⚙]    │  [ Connect your AI first, then we can talk.            ] composer disabled │
└────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────┘
  right shell: hidden for the whole of setup; its header toggle is disabled with tooltip "Available after setup."
```

| Element | Spec | Copy | Test id |
|---|---|---|---|
| Step pill | height 28px, padding 0 12px, `--r-full`, bg `--accent-soft`, text `--accent`, `--t-caption-strong` (no uppercase). Sits in the chat header after the name, 12px gap. Not clickable. Shown in steps 1–3 only: the pill hides when the first job of step 4 starts (UJ-37); there is never a "Step 5". | "Step 1 of 4 · foo finds your AI" · "Step 2 of 4 · Name it and pick a face" · "Step 3 of 4 · A quick interview" · "Step 4 of 4 · A real job" (step 1 always says "foo"; steps 2–4 use `{agentName}` only where the copy names the agent) | `setup-step-pill` |
| "Skip the rest" (`setup-skip-rest`) | Link button, right side of the chat header, 16px from the edge. Hidden in step 1 (an AI is required). | "Skip the rest" → foo replies "Okay, skipping. You can change any of this in Settings." and defaults apply: name "foo", face 1, vibe "Calm, a bit funny", brief 8:00 AM, "Check with me first". Then §2.7. | `setup-skip-rest` |
| Left shell | Search disabled (placeholder `--fg-disabled`). One row "foo", text `--fg-3`, preview "Setting up", not focusable. "+ New helper" disabled with 03's tooltip "Finish setting up first"; in the ⋯ menu, New helper, New group, Routines and Activity log are disabled with the same tooltip. Footer status reads "Setting up" (03 §3.4.11); the Settings gear stays enabled. | "Setting up" | `chatlist` |
| Composer (04) | Disabled until an AI passes its test (J2). Then enabled; a typed answer answers the current setup card exactly like a tap (HRM §6 beats). | placeholder while disabled: "Connect your AI first, then we can talk." | `composer` |
| Setup cards | Use the 05 card frame (padding 14/12, `--r-lg`, 1px `--line`, `--bg-raised`). Max width 520px inside the message column, left-aligned like foo's bubbles. | per step | `card-setup` with `data-row-id` = `setupCard` (`welcome`, `ai_finder`, `name`, `face`, `apps`; card type `setup`, `SetupCardPayload` 08-5 §4.1, X-119); interview cards A–H keep their 05 type id; Card E is `card-connect` `data-row-id="E"` (X-139) |

**Global setup rules (MUST).**
1. One question per card. foo never lists a card's options in its own text (HRM §6).
2. Every card in steps 2–4 has a "Skip" Link button at its bottom-right. Skip answers with the default and collapses the card to "{question} → Skipped".
3. An off-topic question gets a one-line answer, then the same card is shown again with the lead line "Now, back to this:" (J4 branch).
4. If the user's first typed message is a real task, foo does that task first (normal job flow, 04/05) and resumes setup after the job is DONE with "Before I forget: what should I call myself?" (J3; OCL BOOTSTRAP).
5. Answered cards collapse to "{question} → {answer}" (05 Choice card answered state).
6. Closing the window mid-setup keeps foo in the tray with tooltip "foo · setting up"; the next open resumes at the unfinished card. No step is ever skipped by a restart (J1 acceptance).
7. While setup runs, no toasts are sent except "Signed in to {App}. Come back to finish setup." when the user is in the browser (J2, J4).
8. **Resume (UJ-17).** `setup.step` is 0 welcome, 1 find your AI, 2 name and face, 3 interview, 4 real job, 5 closing (06-1 numbering; 08-0 A.1). The interview is step 3: `setup.interviewCard` is set only while `setup.step = 3` and holds the letter of the card on screen ('A'…'H'; written when each card is shown; E-8, X-90). On a launch with `setup.complete = false`, foo opens its chat at the card for `setup.step` (and, in step 3, the card named by `setup.interviewCard`), posts the system line (`marker_kind = system_line`) "Picking up where we left off." (`setup.resume.line`) directly above it, and keeps every earlier answer (cards stay collapsed above; facts already written stay in memory). Nothing is asked twice. Step 1 resumes from a fresh detection.
9. **First run is complete** when the step-4 job reaches any final state (DONE, DONE_UNVERIFIED, FAILED, CANCELLED) or 10 minutes after it started, whichever is first, or at once after "Skip the rest" (UJ-37). Then §2.6 runs.

**Copy keys (08-0 §D).** Every quoted string in §2 lives under `setup.{component}.{slot}[.{state}]`: components `welcome`, `privacy`, `ai_finder`, `name`, `face`, `vibe`, `interview`, `apps`, `whatsapp_link`, `summary`, `first_job`, `closing`, `step_pill`, `resume`. Cards reuse their 05 keys (`cards.{type}.*`); only the setup-specific lines use `setup.*`.

**Test ids (08-0 §C, area `setup`).** `setup-step-pill`, `setup-skip-rest`; the first-run surfaces that are not Choice/Connect cards are card type `setup` (X-119): root `card-setup` with `data-row-id` = `setupCard` and `data-card-id` — `welcome` (§2.1), `ai_finder` (§2.2), `name` (§2.3 Card 2a), `face` (§2.3 Card 2b), `apps` (§2.4 Card C); Card E is the Connect card `variant: 'whatsapp'`, `setupCard: 'E'` (root `card-connect`, QR panel `setup-whatsapp-link`; X-127, X-139); states `shown | answered | skipped` (08-0 §G.2). Interview cards A–H keep their 05 type id (`card-choice`, `card-connect`) plus `data-card-id` and `data-row-id="{A…H}"`; ids of setup-only controls are in each step's table.

**Reads / writes.** `settings.json → setup.step` after every answered card and `setup.interviewCard` while step 3 runs; `setup.complete = true` and `setup.firstBriefAt` at the end (§2.6). Other writes per step below.

---

### 2.1 Welcome

**Purpose.** Say who foo is and start step 1. **Entry:** first window after install; any launch before "Let's go" was tapped.

```
            ┌──────────────────────────── 520 ────────────────────────────┐
            │ 24                                                           │
            │   ┌────┐                                                     │
            │   │ f  │  96px foo mark (--avatar-hero)                      │
            │   └────┘                                                     │
            │ 16                                                           │
            │   Hi, I'm foo.                         --t-title-large       │
            │ 8                                                            │
            │   I live on this PC and do things for you: bookings,         │
            │   bills, emails, reminders.                    --t-body      │
            │   First, let me find the AI you already use. This takes      │
            │   a few seconds.                         --fg-2              │
            │ 24                                                           │
            │   [ Let's go ]                    Primary 40px               │
            │ 24                                                           │
            └──────────────────────────────────────────────────────────────┘
              12
              Nothing leaves this PC unless you say so. Privacy details       --t-caption --fg-3 + Link
```
Card centred horizontally and vertically in the message area (the only setup card that is centred). Padding 24px.

| Element | Spec | Copy | Test id |
|---|---|---|---|
| foo logo → face | 96px foo logo: the two-eyes face in its still Resting pose (disc `--fg-1`, eyes `--bg-app`, 02 §F15.1, X-143); once the card is shown, the same face comes alive and plays *Waking up* once (02 §F15.9.6) [X-35]. Reduced motion: eyes shown open, no movement. `aria-hidden`. | — | `setup-welcome-face` |
| Title | `--t-title-large`, `--fg-1` | "Hi, I'm foo." | `setup-welcome-title` |
| Body | `--t-body`, `--fg-2`, two paragraphs, 8px apart | "I live on this PC and do things for you: bookings, bills, emails, reminders." / "First, let me find the AI you already use. This takes a few seconds." | `setup-welcome-body` |
| Button | Primary, 40px, default focus | "Let's go" | `setup-welcome-start` |
| Footer | `--t-caption`, `--fg-3`; "Privacy details" is a Link button | "Nothing leaves this PC unless you say so. Privacy details" | `setup-privacy-details` |

"Privacy details" opens a Dialog sm (`dialog-privacy`): title "What leaves this PC" (`setup.privacy.title`). Body: the lead line "These are the only places your information goes:" (`setup.privacy.lead`), then the **same list as 06-2 §6.6 "What leaves this PC"** (same rows, same words, rendered from the same `leaves` list in `src/shared/copy/en-IN.json`, so the two can never differ). A service that is not set up yet carries the suffix " (when you turn it on)" (`setup.privacy.not_on_suffix`); in first run that is every row except the AI. Under the list the fixed sentence "foo never uses your data to train anything, and nothing goes to us." (`setup.privacy.no_training`; R-22; UJ-15's longer wording is not used: it spoke for the user's AI maker, which R-22 forbids, and contained the banned word "server", Article 2). One Primary button "Got it" (`dialog-primary`). The same dialog opens from Settings → About (UJ-15).

States: first time only (no empty/loading). Offline: identical; the offline problem is handled in 2.2. Error: none possible.
Keyboard: focus starts on "Let's go"; Enter starts. Narrator: card is `role="group"`, name "Welcome"; reads title then body.
Test ids: card `card-setup` (`data-row-id="welcome"`, payload `setupCard: 'welcome'`, X-119), button `setup-welcome-start`, link `setup-privacy-details`.
Writes: `setup.step = 1`. Credits: J1 step 6; HRM §6 onboarding as chat; AGT A17 "Meet …" hero with one primary.

---

### 2.2 Step 1 of 4 · foo finds your AI

**Purpose.** Find an AI the user already has, prove it works with a real request, and pick one. Chat stays locked until one passes (OCL §6.1, §9.1; J2). **Entry:** "Let's go"; Settings → Account & your AI → "Change" (same card, posted in foo's chat, without the step pill); J19 when the AI stops working.

```
┌──────────────────────────────── 520 ─────────────────────────────────┐
│ I'm looking for the AI you already use…        --t-body-strong        │
│ 8                                                                     │
│ ┌ row 56 ─────────────────────────────────────────────────────────┐  │
│ │ (C) Claude             signed in                 ✓ works         │  │ 26px letter disc, name --t-body-strong,
│ ├─────────────────────────────────────────────────────────────────┤  │ detail --t-small --fg-2, status right
│ │ (C) ChatGPT            signed in                 Testing…        │  │
│ ├─────────────────────────────────────────────────────────────────┤  │
│ │ (G) Gemini                                       not found       │  │
│ ├─────────────────────────────────────────────────────────────────┤  │
│ │ (K) Your own key                     [ Add in secret box ]       │  │ Secondary 32px
│ ├─────────────────────────────────────────────────────────────────┤  │
│ │ (P) AI on this PC                                not found       │  │
│ └─────────────────────────────────────────────────────────────────┘  │
│ 12                                                                    │
│ I'll use Claude. It works and it's the best fit for jobs like         │
│ bookings. You can change this any time in Settings.     --t-body      │
│ 8                                                                     │
│ [ Use Claude ]  [ Pick another ]                                      │
│ 8                                                                     │
│ This uses your Claude plan. If you hit its limit, I'll tell you      │
│ and wait.                                        --t-caption --fg-3   │
└───────────────────────────────────────────────────────────────────────┘
```

**Rows, in this fixed order** (J2 detection ladder; all checks run in parallel, rows render in this order):

| # | Row name | Shown when | Detail line | Test id |
|---|---|---|---|---|
| 1 | "Claude" | always | "signed in" / "installed, not signed in" / empty | `setup-ai-row` `data-row-id="claude-cli"` |
| 2 | "ChatGPT" | always | same | `setup-ai-row` `data-row-id="codex-cli"` |
| 3 | "Gemini" | always | same | `setup-ai-row` `data-row-id="gemini-cli"` |
| 4 | "OpenAI key" / "Anthropic key" / "Google key" | one row per key found already saved for this Windows user | "found on this PC" | `setup-ai-row` `data-row-id="openai-key, anthropic-key or google-key"` |
| 5 | "Your own key" | always | — | `setup-ai-row` `data-row-id="own-key"` |
| 6 | "AI on this PC" | always | "free, runs on this PC" when found | `setup-ai-row` `data-row-id="ollama"` |

Row anatomy: 56px, padding 0 12px; 26px disc (`--avatar-inline`, bg `--bg-sunken`, first letter `--t-caption-strong` `--fg-1`; no brand logos); name `--t-body-strong`; detail `--t-small` `--fg-2`; status/control right-aligned. Rows sit in a Row group (§0.4).

**Per-row states (status column):**

| State | Status shows | Tone | Control |
|---|---|---|---|
| Looking | spinner ring 16px + "Looking…" | `--fg-3` | — |
| Testing | spinner ring 16px + "Testing…" | `--fg-3` | — |
| Works | `CheckmarkCircle` 16px + "works" | `--ok` | — |
| Not found | "not found" | `--fg-3` | — |
| Installed, not signed in | — | — | Secondary 32px "Sign in" |
| Sign-in didn't finish | "Sign-in didn't finish." `--t-small` | `--warn` | Link "Reopen" · Secondary "Try again" |
| Key didn't work | "didn't work. It may be old or typed wrong." | `--bad` | Secondary "Replace key" |
| Plan limit used | "signed in, but your plan's limit is used up until {3:00 PM}." | `--warn` | — |
| Slow (> 20s) | "slow to answer." | `--warn` | Secondary "Test again" |
| Waiting for internet | "Waiting for internet" | `--fg-3` | — |
| Your own key (row 5) | — | — | Secondary "Add in secret box" |

**Card-level flow and copy (final):**
1. Lead line: "I'm looking for the AI you already use…" Rows appear at once in Looking state.
2. Each found item is tested with one tiny real request ("Reply with the word ready"), 20s limit. The test cost is never shown.
3. When every row has settled, or after 25s, the choice block appears under the rows:
   - 2+ work: "I'll use {Claude}. It works and it's the best fit for jobs like bookings. You can change this any time in Settings." [ Use {Claude} ] (Primary, default focus) [ Pick another ] (Secondary). "Pick another" turns the block into a 05 Choice card "Which one should I use?" listing working AIs only.
   - 1 works: "I'll use {ChatGPT}. It works. You can change this any time in Settings." [ Use {ChatGPT} ] only.
4. Note line under the buttons (`--t-caption` `--fg-3`):
   - plan: "This uses your {Claude} plan. If you hit its limit, I'll tell you and wait."
   - key: "This uses your {OpenAI} key, so each job costs a little. I'll show the cost and stop at your monthly cap (₹1,000 to start)." + Link "Change cap" → Dialog sm "Monthly AI cap" (the confirm `dialog-c-21`, X-118): ₹ field (default 1,000, minimum 100), [ Cancel ] [ Save cap ]; under 100: field error "The lowest cap is ₹100."
5. After "Use …" the card collapses to "✓ Using {Claude} (your AI)", the composer unlocks, `setup.step = 2`, and §2.3 starts.

**Branches (final copy):**

| Case | What the card does | Copy |
|---|---|---|
| Nothing found or nothing works | Rows stay; block becomes a 05 Choice card | "I couldn't find an AI on this PC yet. Which one do you use?" options "ChatGPT · sign in with your account" (Best fit), "Claude · sign in with your account", "Gemini · sign in", "I have a key" |
| A sign-in option is picked and its maker's helper is already on this PC | Sign-in line | "Opening {ChatGPT} sign-in in your browser…" (`setup.ai_finder.opening_signin`) → "✓ Signed in as {v***@gmail.com}" (`setup.ai_finder.signed_in`) → test |
| A sign-in option is picked and its maker's helper is not on this PC (X-42) | Consent block | "To use your {ChatGPT} plan, {OpenAI} needs its small free helper on this PC. I'll open their page; install it, then come back here." (`setup.ai_finder.maker_consent`) [ Open {OpenAI}'s page ] (Primary, `setup-ai-open-page`; `app:openExternal` target `maker_page` with the `providerId`, URL from `resources/maker-pages.json`, 08-0 §E.5) [ Not now ] (Secondary, `setup-ai-not-now`) |
| After "Open {OpenAI}'s page" | Waiting line with the F7 spinner ring 16px | "Waiting for the {ChatGPT} helper… I'll notice when it's installed." (`setup.ai_finder.waiting_helper`). foo waits for the maker's helper and re-runs `providers.detect` for that provider every 5 s and when the window regains focus (no install path: foo installs nothing, X-42). Found → the sign-in line above. |
| Not found after 10 minutes | Line + two buttons; no timer after this | "Not installed yet." (`setup.ai_finder.not_installed`) [ Open the page again ] (Secondary, `setup-ai-open-page`) [ Pick another AI ] (Secondary, `setup-ai-pick-another`) |
| "Not now" on the consent block | Back to the AI finder list; that row's detail line | "Needs its helper" (`setup.ai_finder.needs_helper`) and a Link "Open page" (`setup-ai-row-open-page`) |
| Rule | foo never downloads, runs or installs anything for an AI (X-42; `ai:install` removed, 08-0 §B.3). There is no progress percentage and no download error in this step. | — |
| "I have a key" / "Add in secret box" | 05 Choice card, then 05 Secret box | "Which key is it?" [ OpenAI ] [ Anthropic (Claude) ] [ Google (Gemini) ] → Secret box lead: "To use your own AI I need your {OpenAI} key. Paste it in the box below, not in the chat." Saved key is tested; row 5 becomes "{OpenAI} key" with its state |
| Key pasted into the composer | 05 Paste catcher | (05) |
| Offline when testing | Card header strip (Warn banner style inside the card, 40px) | "You're offline. I need the internet to test your AI." [ Try again ]; rows show "Waiting for internet"; auto-retry every 30s |
| Only "AI on this PC" works | The local model is offered as a 05 Choice card (`purpose: setup`), never a toggle; it replaces the choice block | question "This AI runs on your PC. It's free but slower and can't do bookings well. Fine for chatting and reminders. Use it?" options "Use it anyway" · "Add another AI" |
| Only plan-limited AI | Block | "You can still set me up. I'll start working at {3:00 PM}." [ Continue anyway ] |

**Test ids.** Card `card-setup` (`data-row-id="ai_finder"`, payload `setupCard: 'ai_finder'`, X-119); each row `setup-ai-row` with `data-row-id="{providerId}"` (08-0 §B.4) and `data-state` = the row state in lower_snake (`looking`, `testing`, `works`, `not_found`, `not_signed_in`, `signin_unfinished`, `key_failed`, `plan_limit`, `slow`, `offline`, `needs_helper`, `waiting_helper`); row button `setup-ai-row-action`; [ Use {AI} ] `setup-ai-use`; [ Pick another ] `setup-ai-pick-another`; "Change cap" `setup-ai-change-cap` (opens C-21's field rules in a Dialog sm `dialog-c-21`).

**Keyboard.** Rows are one Tab stop (↑/↓); → moves into a row's button. Narrator name per row: "{Claude}, {signed in}, {works}". Each row's state change is announced through the card's polite status region at most once per 2s ("ChatGPT works").
**Writes.** `ai.primary`, `ai.backup` (the next working AI, else null) and `ai.providers.{providerId}` (`kind`, `lastVerifiedAt`, `lastVerifyOk`) (08-0 §A); a pasted key goes to the Windows vault as `foo/ai_key/{providerId}` (08-0 §E.8); "Change cap" writes `money.aiCapPaise` (≥ 10000 paise, 08-0 §A.2); tech log line "AI test passed: {providerId}" (no keys). Provider names shown are 08-0 §B.4 (X-78). No memory, no activity row (X-71).
**Credits.** OpenClaw detect + verify ladder and locked continue (OCL §6.1, §9.1); Grok secret card (GRK §1.2); Hermes masked key dialog (HRM §4); Perplexity jargon wall lesson (PPX §6, §9.13); BP1 Step 1 of 4.

---

### 2.3 Step 2 of 4 · Name it and pick a face

Three cards in sequence: name → face → vibe. foo never suggests a name in its own text; the dice is the only source (OCL §6.2; MNS §6, §9.7).

**Card 2a · Name** (asks foo's name; the user's own name is Card A of §2.4). Card `card-setup` (`data-row-id="name"`, payload `setupCard: 'name'`, X-119).
```
┌──────────────────────────── 520 ─────────────────────────────┐
│ What should I call myself?                 --t-body-strong     │
│ 8                                                              │
│ [ Type a name                                    ]  16/20     │ field 40px, full width; counter --t-caption --fg-3
│ 8                                                              │
│ [ That's it ]  [ Keep "foo" ]  [ 🎲 Surprise me ]              │ Primary · Secondary · Secondary
└────────────────────────────────────────────────────────────────┘
```
| Element | Rule | Copy | Test id |
|---|---|---|---|
| Field | Text field §0.4, max 20 characters, trimmed. Counter appears from 16 characters: "{n}/20". Any script allowed (Hindi, Punjabi). | placeholder "Type a name" | `setup-name-field` |
| That's it | Primary (`setup-name-done`), default action on Enter. Blank field = Keep "foo". | "That's it" | `setup-name-done` |
| Keep "foo" | Secondary (`setup-name-keep`). | "Keep "foo"" | `setup-name-keep` |
| Surprise me | Secondary with 🎲 (`setup-name-surprise`). Fills the field (`setup-name-field`) from the built-in list of 200 short friendly names; no repeat within the session (J3 acceptance). | "🎲 Surprise me" (Narrator: "Surprise me with a name") | `setup-name-surprise` |
| Errors | Pasting more than 20 characters keeps the first 20 and shows the field error. A name with no letter or digit shows the second error. | "Keep it under 20 letters so it fits in the chat list." · "Use at least one letter." | `setup-name-error` |
After: foo replies in a bubble (04), 3 words or fewer: "{Name} it is." (HRM §6). The header name, left-shell row and tray tooltip update within 1s.

**Card 2b · Face (2×2 picker)** — card `card-setup` (`data-row-id="face"`, payload `setupCard: 'face'`, X-119).
```
┌──────────────────────────── 520 ─────────────────────────────┐
│ Pick a face.                                --t-body-strong    │
│ 8                                                              │
│ ┌─104──┐ 12 ┌─104──┐                                           │
│ │ (f)  │    │ (✿)  │   tile: --r-md, 1px --line, 72px face    │
│ │1     │    │2   ✓ │   (--avatar-pick) centred; number          │
│ └──────┘    └──────┘   --t-caption --fg-3 at bottom-left 8px    │
│ 12                                                             │
│ ┌──────┐    ┌──────┐   selected: 2px --accent border (inset)   │
│ │ (◐)  │    │ (★)  │   + 20px --accent disc with Checkmark 16  │
│ │3     │    │4     │   --on-accent, top-right 6px              │
│ └──────┘    └──────┘                                           │
│ 12                                                             │
│ [ Use this face ]  [ 🎲 Surprise me ]  [ Use my own picture ]  │
└────────────────────────────────────────────────────────────────┘
```
| Element | Rule | Copy | Test id |
|---|---|---|---|
| Grid | 2 columns × 104px tiles, 12px gap (220×220 total), left-aligned. `role="radiogroup"` name "Faces"; arrow keys move, Space/Enter selects. Selecting a face updates header, chat row, tray and toasts within 1s (J3 acceptance). Each tile `setup-face-tile` with `data-index` 1–4 and `data-state` `selected`/`idle`. | — | `setup-face-grid` |
| Tile 1 | foo's living face (02 §F15.9) in Resting with blink [X-38], on `--fg-1` with `--bg-app` eyes; preselected. Under the tile, label "Living face" (`setup.face.living_label`, `--t-caption` `--fg-1`) and second line "Default" (`setup.face.living_default`, `--t-caption` `--fg-2`). Never replaced by "Surprise me". | "Living face" · "Default" | `setup-face-tile` |
| Tiles 2–4 (first showing) | Glyph faces (02 §F15.5 pool), glyph in `--on-helper`, `--font-display` 32px: tile 2 ✿ on `--h-terracotta` (#B54A2F), tile 3 ◐ on `--h-green` (#17804D), tile 4 ★ on `--h-violet` (#6B5BD6), so the first screen matches the walkthrough. No label under tiles 2–4. | — | `setup-face-tile` |
| No made-up pictures (AI-36) | v1 never asks an AI to draw a face; there is no "making faces" state, skeleton or wait in this card. | — | — |
| Use this face | Primary (`setup-face-use`); commits and moves on, then §2.3.4. | "Use this face" | `setup-face-use` |
| Surprise me | Secondary with 🎲 (`setup-face-surprise`): redraws tiles 2–4 at random from the §F15.5 glyph pool and the 02 helper palette, never repeating any of the three glyph/colour pairs currently shown; tile 1 (living face) stays. | "🎲 Surprise me" (Narrator: "Surprise me with new faces") | `setup-face-surprise` |
| Use my own picture | Secondary (`setup-face-own-picture`). Windows file picker filtered to PNG and JPG. Picture is centre-cropped to a square and shown in a circle; it replaces tile 4 and is selected. Over 5 MB: field-style error under the grid. | "Use my own picture" · "That picture is too big. Pick one under 5 MB." | `setup-face-own-picture` |
Narrator name per tile: "Face 1 of 4, living face, default" / "Face 2 of 4, flower on terracotta" / "Face 3 of 4, half moon on green" / "Face 4 of 4, star on violet" (after "Surprise me": "Face {n} of 4, {glyph name} on {colour name}") / "Your picture".

**Card 2c · Vibe** — a 05 Choice card: "How should I talk to you?" options "Calm, a bit funny" (Best fit), "Straight to the point", "Warm and chatty", "Something else…" (APL §9.13 tone picker). foo answers in the chosen vibe with one line plus its emoji, which becomes the identity emoji:

| Choice | foo's line |
|---|---|
| Calm, a bit funny | "Calm, a bit funny. Got it. 🌿" |
| Straight to the point | "Straight to the point. Got it. 🎯" |
| Warm and chatty | "Warm and chatty. Got it. ☀️" |
| Something else… (typed) | "{their words}. Got it. ✨" |

Then `setup.step = 3`. **Writes.** `identity.agentName`, `identity.avatarRef` (FaceRef, 08-0 §E.7: `living:{style}` for tile 1, `glyph:{emoji}` for tiles 2–4, `file:{chatId}` for an own picture), `identity.vibe` (`calm_funny` / `direct` / `warm` / `custom`), `identity.vibeLine`, `identity.emoji` (08-0 §A); `{DATA}\memory\identity.md` (name, vibe line, emoji, date; provenance `said`, origin `setup`); an own picture is saved as `{DATA}\avatars\{chatId}.png` (≤ 2 MB, 08-0 §E). Test ids: vibe card is `card-choice` with `data-row-id="vibe"`. **Credits.** OpenClaw birth sequence (OCL §6.2, §9.6); Manus/Cue dice (MNS §6, §9.7); Grok "Surprise me" identity editor (AGT A2, A17); Muse name-first (MUS §9.6); BP1 Step 2 of 4.

#### 2.3.4 Face explainer card (UX-07)

**When.** Once, right after "Use this face" commits the **living face** (tile 1 or a later living style), before Card 2c. Never shown again (the `cards` row stays in the thread). Not shown for glyph, letter or picture faces (they show news only as a ring, 02 §F15.9.3), never in a group or helper chat, and not on "Run setup again" if a `face_explainer` card already exists. Type `face_explainer` (08-0 §G.1); it posts no job and writes nothing else.

**Sequence.** foo bubble "My face shows what I'm really doing. Nothing more." (`cards.face_explainer.lead`), then the card.

```
┌──────────────────────── 440 ────────────────────────┐
│  ┌─ 192 ─┐ 16 ┌─ 192 ─┐                              │
│  │ (••)◌ │    │ (••)○ │   40px living face, centred  │
│  │Working│    │Needs  │   label --t-small --fg-1     │
│  │on some│    │you    │   8px under the face         │
│  └───────┘    └───────┘                              │
│  12                                                  │
│  ┌───────┐    ┌───────┐                              │
│  │ (^^)  │    │ (‿‿)z │                              │
│  │Done,  │    │Quiet  │                              │
│  │w/proof│    │hours  │                              │
│  └───────┘    └───────┘                              │
└──────────────────────────────────────────────────────┘
```

| Element | Spec | Copy (key) | Test id |
|---|---|---|---|
| Card | 05 frame, width 440, padding 14/12; no header, no buttons, no footer; `role="group"`, Narrator name "About my face" | — | `card-face-explainer` |
| Cell 1 | 40px living face in mood 6 *Working* (02 §F15.9.3: `--accent` ring turning); reduced motion: still 28% `--accent` arc | "Working on something" (`cards.face_explainer.working`) | `card-face-explainer-cell` `data-index="1"` |
| Cell 2 | mood 8 *Needs you* (full `--warn` ring), pose held, no nod loop | "Needs you" (`cards.face_explainer.needs_you`) | `data-index="2"` |
| Cell 3 | mood 10 *Happy* (^ ^ eyes, `--ok` ring), held | "Done, with proof" (`cards.face_explainer.done`) | `data-index="3"` |
| Cell 4 | mood 18 *Asleep* (closed eyes + "z") | "Quiet hours" (`cards.face_explainer.quiet`) | `data-index="4"` |

Grid 2 × 2, cells 192 wide, 16px column gap, 12px row gap; face centred, label centred 8px below (`--t-small`, `--fg-1`). The four faces are illustrations: `aria-hidden`, they never react to real state. Narrator reads "About my face. Working on something. Needs you. Done, with proof. Quiet hours." Card type `face_explainer` with an **empty payload** (`{}`; the cells are fixed copy, 08-0 §G.1); `cards.state` is only `shown` (08-0 §G.2). Not logged (X-71).

---

### 2.4 Step 3 of 4 · A quick interview (with app chips and connections)

Eight cards (A–H) then a summary. Every card has "Skip". Typing instead of tapping answers it ("8 is fine" → "8:00 AM").

| Card | Component | Question (final copy) | Answers (final copy) | Writes |
|---|---|---|---|---|
| A | 05 Choice card, first option prefilled from the Windows display name only when that name contains a space or is letters only in title case (e.g. "Vikas Sharma" → "Vikas", "Vikas" → "Vikas"; "vikas53953" or "User" → no chip, UJ-38). With no chip the card shows the text field and [ Something else… ] is not drawn. The name is shown as a chip only; the AI does not see it unless picked (HRM §4) | "What should I call you?" | [ {Vikas} ] [ Something else… ] → foo: "Hi {Vikas}." | `user.firstName`; `{DATA}\memory\about-you.md` name line (provenance `said`, origin `setup`) |
| B | 05 Choice card | "Can I peek at which apps you have installed? Not your files." | [ Yes, have a look ] [ No thanks ] | nothing saved; the installed-apps list lives in RAM for this session only |
| C | **App chips** (below) | "Which apps do you use most?" | multi-select | `{DATA}\memory\about-you.md` apps line (`said`, origin `setup`) |
| D | 05 Connect card, Google (only if "Gmail + Calendar" ticked) | lead bubble (UJ-16): "Want me to read your Gmail and see your contacts, so I know your bills, trips and people?" (`setup.interview.d_lead`) | Connect card copy below | `connections` rows gmail/gcal/contacts (08-1), `connections.google.calendarOn`, `connections.google.contactsOn`, `permissions.apps.{gmail, calendar, contacts}`; token in the vault as `foo/conn_token/google` (08-0 §E.8) |
| E | **WhatsApp link card** (below; only if WhatsApp ticked) | — | — | `connections.whatsapp.read`, `connections.whatsapp.draft`, `permissions.apps.whatsapp`; session file `{DATA}\vault\wa-session.bin` (08-0 §E.8) |
| F | 05 Choice card with free text | "Who matters most to you?" | [ Family ] [ Partner ] [ Friends ] [ Skip ]; one follow-up at most: "Any birthdays I should know?" (`setup.interview.f_birthdays`). Birthday rule (UJ-29) below | `{DATA}\memory\people\{slug}.md` (`said`, origin `setup`) |
| G | 05 Choice card | "When should I send your morning brief?" | [ 8:00 AM ] (Best fit) [ 7:00 AM ] [ 9:00 AM ] [ Don't send one ] | `brief.at` ("08:00" / "07:00" / "09:00") and `brief.enabled` (false for "Don't send one") |
| H | 05 Choice card | "How much should I do on my own?" | [ Check with me first ] (Best fit) [ Go ahead with small things ] with detail line "Reading, drafting, adding to your calendar, reminders. Never sends, buys, books, posts or deletes without asking." | "Check with me first" leaves the 08-0 §A.1 defaults; "Go ahead with small things" sets `permissions.actions.read`, `.drafts`, `.calendar` = `always` (send, book, pay, post, delete, share are locked and never change here, 08-0 §A.2) |

Each interview card is the 05 type shown with `payload.setupCard` = its letter (08-0 §G.1) and a top-right label "{k} of 8" (`setup.interview.counter`, `--t-caption` `--fg-3`); `setup.interviewCard` is written when the card is shown (§2.0 rule 8). Card C (app chips) is card type `setup` with `setupCard: 'apps'` (`card-setup`, `data-row-id="apps"`, X-119); Cards D and E are Connect cards (payloads below).

**The user's own face.** Default = `letter:` + the first grapheme of `user.firstName` (`Intl.Segmenter`; upper-cased where the script has case, 08-0 §E.7), so "विकास" gets "वि"; set when Card A is answered.

**Card F birthday rule (UJ-29).** A birthday is read as a day + month in any common form ("12 Dec", "12 December", "12/12" read day-first, "१२ दिसंबर"); the year is optional and, when absent, never shown or guessed. Every saved birthday shows the memory chip (04, X-05) "I'll remember: {Mom}'s birthday is {12 Dec}" (`memory_chip.saved`) with [ Undo ] — the date in the R-09 short form, weekday added only when the next occurrence is within 7 days. If no day + month can be read: "I didn't catch the date. Which day and month?" (`setup.interview.f_date_retry`), asked once; a second miss saves the person without a birthday.

**App chips (Card C).**
```
┌──────────────────────────── 520 ─────────────────────────────┐
│ Which apps do you use most?                 --t-body-strong    │
│ 8                                                              │
│ ( WhatsApp ) ( Gmail + Calendar ) ( X )                        │ 40px chips, wrap, 8px gaps
│ ( Instagram ) ( None of these )                                │
│ 12                                                             │
│ [ Done ]                                             Skip      │ Primary · Link
└────────────────────────────────────────────────────────────────┘
```
- Chips: §0.4 Chip, 40px size (touch-friendly), `role="checkbox"` each, group name "Apps you use". Selected shows leading ✓ and `--accent-soft`.
- Chips in this order: "WhatsApp", "Gmail + Calendar", "X", "Instagram", "None of these". Outlook is omitted, not disabled, while `flags.outlook` is false (X-41; 06 §0 "Outlook in v1"); there is no "coming soon" copy. X is a note only (X has no connection; foo can open an X draft for you to post, X-34): the X chip carries the note "Drafts only" (`setup.apps.x_drafts_only`, `--t-caption` `--fg-3` inside the chip after the name; X-34, X-95).
- If Card B was "Yes", installed apps are pre-selected (WhatsApp desktop only). "None of these" clears the others and is exclusive.
- Under the chips, when X or Instagram is selected, one `--t-caption` `--fg-3` line: "I'll read X and Instagram later. Posting isn't in this version." (`setup.apps.x_instagram_note`).
- Test ids: each chip `setup-app-chip` with `data-row-id` `whatsapp` / `google` / `x` / `instagram` / `none`; [ Done ] `setup-apps-done`.
- "Done" is disabled until one chip is selected; tooltip "Pick at least one, or tap Skip."

**Connect card copy (Card D, rendered by the 05 Connect card; payload `ConnectPayload` with `variant: 'google'`, `setupCard: 'D'`, 08-5 §4.1, X-127).** Title "✉ Connect Gmail and Calendar"; lines "I'll read emails and your calendar to spot bills, trips and plans." / "I'll write drafts, but I never send without your tap."; plus the 05 §5.11 contacts line "See your contacts, so I message the right person (I never change them)."; buttons [ Connect ] [ Not now ]. There is no Outlook variant in v1 (X-41). States and branch copy are 05's (opening, connected as, denied "Gmail isn't connected. That's fine, I'll work without it.", link expired, wrong account, partial permissions "Connected. I can read and draft, but not send. I'll ask you to send from Gmail yourself.", offline "You're offline. I'll connect this when you're back." [ Remind me ]).

**WhatsApp link card (Card E).** Owned here because of the QR panel. Payload: `ConnectPayload` with `variant: 'whatsapp'`, `setupCard: 'E'` (08-5 §4.1, X-127); [ Show QR code ] → `whatsapp:linkStart`.
```
┌──────────────────────────── 520 ─────────────────────────────┐
│ 💬 Link WhatsApp                             --t-body-strong   │
│ I can read your chats to remind you of things, and draft       │
│ messages for you to send.                                      │
│ I never send a WhatsApp message without your tap.   --t-body   │
│ 12                                                             │
│ ┌──── 232 ────┐  1  Open WhatsApp on your phone                │ steps --t-small --fg-1,
│ │  ▓▓ ▓ ▓▓▓   │  2  Tap ⋮ or Settings → Linked devices         │ number --t-body-strong
│ │  ▓ QR ▓▓    │     → Link a device                            │ 24px column, 8px row gap
│ │  ▓▓▓ ▓ ▓    │  3  Point your phone at this code              │
│ └─────────────┘                                                │
│ 12                                                             │
│ [ Show QR code ]  [ Not now ]                                  │
│ WhatsApp may unlink foo now and then. If that happens I'll     │
│ ask you to scan again.                     --t-caption --fg-3  │
└────────────────────────────────────────────────────────────────┘
```
| State | Panel shows | Copy | `data-state` |
|---|---|---|---|
| Before | No QR; buttons [ Show QR code ] [ Not now ] | as above | `before` |
| Getting code | 232×232 box, `--bg-sunken`, `--r-md`, spinner ring 20 centred | "Getting a code…" | `getting_code` |
| Ready | QR 200×200 on `--qr-bg`, `--qr-fg` modules, 16px quiet zone, `--r-md`; a new code about every 20 s; the panel expires 60 s after Show QR code (08-3 §16.4.4, X-127) | steps 1–3 visible | `ready` |
| Expired | QR blurred 8px (no blur under reduced transparency: replaced by `--bg-sunken`), centred Primary button | "This code expired." [ New code ] | `expired` |
| Scanned | QR replaced by spinner + line | "Linking… keep WhatsApp open on your phone." | `scanned` |
| Linked | card collapses | "✓ WhatsApp linked ({+91 98••• ••210})" | `linked` |
| Failed 3 times | — | "WhatsApp didn't link. You can try later in Settings → Connections." [ Skip for now ] | `failed` |
| Offline | Show QR disabled | "You're offline. I'll connect this when you're back." [ Remind me ] | `offline` |
Narrator: the QR image is named "WhatsApp link code. Scan it with your phone." The steps list is an ordered list.
Test ids: card root `card-connect` (`data-row-id="E"`); QR panel `setup-whatsapp-link` (`data-state` = state above in lower_snake: `before`, `getting_code`, `ready`, `expired`, `scanned`, `linked`, `failed`, `offline`), QR `setup-whatsapp-qr`, [ Show QR code ] `setup-whatsapp-show`, [ New code ] `setup-whatsapp-new-code`, [ Not now ] `setup-whatsapp-not-now`.

**Summary bubble (after H).** foo bubble (04) then a 05 Choice card:
"Here's what I've got, {Vikas}:" / "• You use {Gmail, Calendar and WhatsApp}" / "• {Mom's birthday is 18 Oct}" / "• Morning brief at {8:00 AM}" / "Fix anything?" [ Looks right ] [ Fix something ]. Lines appear only for facts actually given. "Fix something" → "What should I change?" and the relevant card is re-shown (MUS §9.5). Dates in the summary use the same form as the memory chip (year only if given).
Then `setup.step = 4`. **Credits.** Gemini "interview me" (GEM §9.6); Hermes beats and look-around (HRM §4, §6, §9.7); Grok "Which tools do you use?" chips and Connect states (GRK2, GRK §1.4); Muse "Fix anything?" (MUS §9.5); Cowork ask-vs-go (CWK §9.9); OpenClaw WhatsApp QR and its fragility (OCL §4, §8.4); BP1 Step 3 of 4.

---

### 2.5 Step 4 of 4 · A real job

**Purpose.** Something visible within a minute, finished within five, on real data only (HRM §4, §6; J5).

```
┌──────────────────────────── 520 ─────────────────────────────┐
│ Let's do something real. Pick one, or ask me anything.        │ --t-body-strong
│ 8                                                              │
│ ( Find bills due this week ) ( Spot my upcoming trips )        │ 40px chips, single-select,
│ ( What's on this week? ) ( Something else… )                   │ each label ≤ 32 characters
└────────────────────────────────────────────────────────────────┘
```
| Connected | Chips offered, in this order (max 4 + "Something else…") |
|---|---|
| Gmail | "Find bills due this week" · "Spot my upcoming trips" |
| Calendar | "What's on this week?" |
| WhatsApp | "Anything I missed in chats?" |
| Nothing | "Plan dinner for Saturday" · "Remind me of Mom's birthday" |
Tapping a chip sends its text as the user's message (04 bubble with status badge) and the normal job flow runs (05 checklist, result, proof chip, receipt footer). "Something else…" focuses the composer with hint "Tell me what you want instead". Branch copy (nothing found, slow, failed, limit) is J5's and renders through 05 cards. The step pill hides when this job starts; first run completes per §2.0 rule 9 (UJ-37). Test ids: chip `setup-first-job-chip` with `data-index` 1–5.

**"Remind me of Mom's birthday" when no birthday is in memory (UJ-18).** foo asks with a 05 Choice card (typed answer) "When is your Mom's birthday?" (`setup.first_job.birthday_ask`), read by the §2.4 Card F birthday rule; then the memory chip "I'll remember: Mom's birthday is {12 Dec}" [ Undo ] (`memory_chip.saved`, X-05); then foo's line "I'll remind you on {Fri 11 Dec, 9:00 AM}, the day before." (`setup.first_job.birthday_reminder`) and a once routine at 9:00 AM the day before (05 Routine card). If the birthday is known, the routine is made straight away with the same line.

**"Plan dinner for Saturday" (UJ-18).** Offline: "I need to be online to find places. Try me again when you're connected." (`setup.first_job.dinner_offline`); the job ends FAILED with no retry timer. Online without web-tool keys: foo uses its own Edge window (X-46 fallback, 08-0 §G.8) and the checklist status line reads "Looking on the web…" (`setup.first_job.dinner_web`). With keys: the normal web tools.

After the result, a 05 Choice card: "How does this look?" [ Looks right ] [ Fix something ] [ Take it further ]. "Take it further" → "Want me to remind you a day before each bill?" [ Yes ] [ No thanks ] (Yes creates a routine via 05 Routine card).

**"Fix something" (UJ-28).** foo posts "Tell me what's wrong, in your words." (`setup.first_job.fix_prompt`). Whatever the user types next becomes an ordinary job through 08-2 intake; like any job it shows the Plan card (05-3 §5.12) when its plan has 2 or more steps, otherwise a plain reply. No special card and no special class.

**Credits.** Hermes first task inside a minute and feedback chips (HRM §4, §9.6); Poke texts first with one useful thing (POK §9.6); BP1 Step 4 of 4.

---

### 2.6 "See you tomorrow at 8"

**Purpose.** Close setup with one clear promise and hand over the full app.

| Brief setting | foo's closing bubble (final) |
|---|---|
| A time was chosen | "I'll send your first morning brief tomorrow, {Sat 17 Oct}, at {8:00 AM}." |
| "Don't send one" | "Setup's done. Message me any time." |
The first brief is always the next day (`[foo decision: the first brief needs a night of reading]`). "tomorrow" never appears without the absolute day (Article 21).

What changes on screen, in this order, within 1s:
1. Step pill fades out (`--m-normal`) and "Skip the rest" disappears.
2. Left shell: search, "+ New helper" and the ⋯ menu items enable; the foo row becomes a normal row with the closing line as its preview.
3. Right shell opens if the window is wide enough (03 rule) and shows Using, What I know, Spent this month.
4. `settings.json → setup.complete = true`, `setup.step = 5`, `setup.firstBriefAt` (epoch ms of the first brief, or absent for "Don't send one"); `setup.interviewCard` is removed.

Copy keys: `setup.closing.brief_time`, `setup.closing.no_brief`.

---

### 2.7 First run: states summary

| State | Behaviour |
|---|---|
| First time | §2.1 onward |
| Resume | Launch with `setup.complete` false: §2.0 rule 8 ("Picking up where we left off.", card for `setup.step` / `setup.interviewCard`; earlier answered cards stay collapsed above) |
| Loading | Each card's own loading (detection "Looking…", helper "Waiting for the {ChatGPT} helper…", QR "Getting a code…"); the face card has no loading state |
| Error | Per card, through 05 Error card; never blocks the rest of setup except step 1 |
| Offline | Welcome works; step 1 waits for internet (auto-retry 30s); steps 2–3 work offline except Connect/QR (disabled with "Remind me"); step 4 offers only "Remind me of Mom's birthday" and "Plan dinner for Saturday" |
| Skip the rest | defaults as §2.0 |
| Re-run from Settings | steps 2–4 posted in foo's chat with the pill; existing answers shown as each card's preselected option |

Narrator for setup mode: the step pill is part of the chat header's accessible name: "foo, setup step 1 of 4, foo finds your AI". When a step changes, the polite status region says "Step {2} of 4, {Name it and pick a face}".

---

## §3. New helper dialog

**Purpose.** Make a helper: a contact with one job, a face, a colour and the apps it may use (GRK2 bots with jobs; APL §9.5 name + role + goal; MNS §9.9 agents by life area).

**How you get there.** Left shell header "+ New helper" or ⋯ menu → "New helper" (03 §3.4.2); Ctrl+N; foo's one-time offer card "Want a Trips helper to look after travel? It keeps your trips in one chat." [ Yes, make Trips ] (opens this dialog prefilled with the Trips template); the user typing "make me a helper for money stuff" (foo replies "Let's set it up." and opens the dialog with the Money template).

**Layout.** Dialog lg (720px).
```
┌──────────────────────────────────────── 720 ─────────────────────────────────────────┐
│ New helper                                                                       [✕] │ title --t-subtitle
│ 16                                                                                   │
│ Start from:  ( Trips ) ( Money ) ( Home ) ( Family ) ( Blank )                       │ 32px chips
│ 20                                                                                   │
│ ┌── preview 200 ──┐ 24 ┌──────────────── form 448 ──────────────────────────────┐  │
│ │                 │    │ Name                                                    │  │ labels --t-body-strong
│ │      (✈)        │    │ [ Trips                                    ] [🎲]       │  │ field 40 + icon btn 36
│ │   96px avatar   │    │ 16                                                      │  │
│ │                 │    │ Its job                                                 │  │
│ │     Trips       │    │ [ Plan and book my travel                          ]    │  │ 2-line field (72px)
│ │ --t-subtitle    │    │ 16                                                      │  │
│ │ Plan and book   │    │ What a good job looks like (optional)                   │  │
│ │ my travel       │    │ [ Trips booked on budget, no surprises             ]    │  │
│ │ --t-small --fg-2│    │ 16                                                      │  │
│ │                 │    │ Face   (✈) (🧳) (🌴) (T)  [🎲]                          │  │ 48px face buttons, 8 gap
│ │ ┌ chat row ──┐  │    │ 16                                                      │  │
│ │ │(✈) Trips   │  │    │ Colour ● ● ● ● ● ● ● ● ● ●                              │  │ 28px swatches, 8 gap
│ │ │ Hi, I'm…   │  │    │ 16                                                      │  │
│ │ └────────────┘  │    │ What it can use                                         │  │
│ └─────────────────┘    │ [✓] Gmail  [✓] Calendar  [ ] WhatsApp  [✓] Browser       │  │ 40px checkbox rows, 2 cols
│                        │ [ ] Payments                                            │  │
│                        │     Trips can ask you to approve payments. It can never │  │ --t-small --fg-2, only when ticked
│                        │     pay without your tap.                               │  │
│                        └─────────────────────────────────────────────────────────┘  │
│ 24                                                                                   │
│                                                      [ Cancel ]  [ Create Trips ]   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```
Below `--dialog-lg` + 32px window width, the preview column is hidden and the form takes the full width.

**Elements.**

| Element | Spec | Copy | Test id |
|---|---|---|---|
| Template chips (`dialog-new-helper-template`, `data-row-id` = template) | 32px Chips, single-select; picking one fills every field (and overwrites unsaved edits after a confirm only if the user typed something: "Replace what you typed with the {Money} template?" [ Replace ] [ Keep mine ]; Dialog sm `dialog-template-replace`, X-118) | "Trips" "Money" "Home" "Family" "Blank" | `dialog-new-helper-template` |
| Name (`dialog-new-helper-name`, 🎲 `dialog-new-helper-name-surprise`) | Text field, max 20, required. 🎲 icon button (36px) fills a random short name from the same 200-name list as §2.3 (no repeats in the session). | label "Name" · placeholder "Like Trips or Money" · 🎲 Narrator "Surprise me with a name" | `dialog-new-helper-name` |
| Its job (`dialog-new-helper-job`) | Multi-line field, 2 visible lines (72px), max 120 characters, required. This text is also what foo uses to route work (GRK §4.3). | label "Its job" · placeholder "What should it look after? Like "Plan and book my travel"" | `dialog-new-helper-job` |
| Good result (`dialog-new-helper-good`) | Multi-line field, 2 lines, max 120, optional. | label "What a good job looks like (optional)" · placeholder "Like "Bills paid on time, nothing missed"" | `dialog-new-helper-good` |
| Face (`dialog-new-helper-face`, `data-index` 0–4) | The living face button first and pre-selected (02 §F15.9, eyes in `--on-helper` on the chosen colour) [X-38], then 4 face buttons 48px (`--r-full`, on the chosen colour; symbol faces such as ✈ stored with U+FE0E, `--font-display` 24px in `--on-helper`; emoji faces such as 🧳 🌴 stored with U+FE0F, full colour, `--font-emoji` 24px; 02 §F15.5 types 2–3) [X-30] + 🎲 icon button + Link "Use my own picture" (same rules as §2.3). `role="radiogroup"`. | Narrator per face: "{Plane} face" | `dialog-new-helper-face` |
| Colour (`dialog-new-helper-colour`, `data-row-id` = token) | 10 swatches, 28px circles, the 10 `--h-*` tokens in 02 order. Selected: 2px `--fg-1` ring 2px outside + `Checkmark` 16px `--on-helper` inside. Default: the first colour no other helper uses (02 F2). Used colours are still selectable (a small `--t-caption` hint under the row: "Money uses this colour too."). | Narrator per swatch: "{Terracotta}", "{Terracotta}, used by Money" | `dialog-new-helper-colour` |
| What it can use (`dialog-new-helper-app`, `data-row-id` = `HelperForm.allowedApps` key) | Checkbox rows 40px, two columns: Gmail, Calendar, Contacts, WhatsApp, X, Browser, Payments (Outlook omitted while `flags.outlook` is false, X-41). Only apps connected in Settings → Connections are enabled (X is always enabled: it only opens drafts); others are disabled with second line "Not connected yet". Browser is always available. Payments off by default; when ticked, the explainer line appears. | "{Trips} can ask you to approve payments. It can never pay without your tap." | `dialog-new-helper-app` |
| Preview | 200px column, `--bg-sunken`, `--r-lg`, padding 16: 96px avatar, name `--t-subtitle`, job `--t-small` `--fg-2` (2-line clamp), and a 64px mini chat row (avatar 40, name, preview "Hi, I'm {Trips}…"). Updates live as fields change. | — | `dialog-new-helper-preview` |
| Create (`dialog-primary`) | Primary. Label follows the name: "Create {Trips}"; empty name: "Create helper", disabled with tooltip "Give it a name first." | "Create {Name}" | `dialog-primary` |
| Cancel (`dialog-secondary`) | Secondary | "Cancel" | `dialog-secondary` |

Copy keys: `dialog.new_helper.{slot}`; template content `dialog.new_helper.template.{trips|money|home|family}.{name|job|good|topics}`.

**Templates (fixed content).**

| Template | Name | Its job | Good result | Face options (after the living face, which is the default) | Colour (if unused, else next unused) | Can use (ticked) | Opener topics |
|---|---|---|---|---|---|---|---|
| Trips | "Trips" | "Plan and book my travel" | "Trips booked on budget, no surprises" | ✈ 🧳 🌴 T | `--h-steel` | Gmail, Calendar, Browser | "flights, hotels, trains" |
| Money | "Money" | "Track bills and spending, and get payments ready" | "Bills paid on time, nothing missed" | ₹ 💳 📈 M | `--h-green` | Gmail, Browser | "bills, payments, spending" |
| Home | "Home" | "Look after the house: gas, repairs, deliveries" | "Things at home sorted before they run out" | 🏠 🔧 📦 H | `--h-brown` | Gmail, WhatsApp, Browser | "gas, repairs, deliveries" |
| Family | "Family" | "Birthdays, plans and gifts for the family" | "Nobody's special day forgotten" | 🎂 🎁 👪 F | `--h-raspberry` | Gmail, Calendar, WhatsApp | "birthdays, plans, gifts" |
| Blank | empty | empty | empty | the living face, then the first letter of the name on the colour | next unused | Browser | — (Blank opener below) |

Every template's default face is the living face (02 §F15.9) [X-38]; the faces listed above are the other 4 options, in that order.

**Validation (inline field errors, final copy).**
| Case | Copy |
|---|---|
| Name already used by a helper | "You already have a helper called {Trips}." |
| Name equals foo's name | "That's my name. Pick another one." |
| Name over 20 | "Keep it under 20 letters so it fits in the chat list." |
| Job empty on Create | "Tell me its job in a few words." |
| Already 8 helpers (checked before opening) | Dialog does not open; Dialog sm (`dialog-helper-limit`, X-118) instead: title "8 helpers is the most for now", body "Delete one to make another.", button "Got it" |

**After Create.** Dialog closes; the helper appears in the left shell with its face and colour and its chat opens. Its first bubble is fixed text, posted at once with no AI turn (UJ-22):
- Template helper: "Hi, I'm {Trips}. Send me anything about {flights, hotels, trains} and I'll take it from here. Right now I can see: {Calendar, Browser}." (`thread.helper_opener.template`)
- Blank helper: "Hi, I'm {Name}. My job: {its job}. Send me anything for it and I'll take it from here. Right now I can see: {Browser}." (`thread.helper_opener.blank`)
- "Right now I can see:" lists the ticked apps except Payments, in the checkbox order, joined with ", ". If Payments is ticked, a second line in the same bubble: "I can ask you to approve payments, never pay without your tap." (`thread.helper_opener.payments`)

foo's chat gets the handoff marker (05) "You made a new helper: {Trips}". In a group the helper's face shows rings only (02 §F15.9.3d, owner Q6).

**States.** First time: as drawn, Blank template selected unless opened from an offer. Loading: none (local). Error on save: dialog stays, Bad banner inside the dialog under the title: "That didn't save. Try again." [ Try again ]. Offline: works (helper creation is local); the first message waits for the AI and shows the 04 typing state. Esc or Cancel with unsaved typing → confirm (§14 C-15).

**Keyboard.** Ctrl+N opens with focus in Name. Enter in Name/Job/Good result moves to the next field; Ctrl+Enter creates. Tab order: chips → Name → 🎲 → Job → Good result → faces → colours → checkboxes → Cancel → Create.
**Narrator.** `role="dialog"`, name "New helper". The preview column is `aria-hidden="true"` (it repeats the form).
**Writes.** `helpers` row (08-1: `name`, `job_text`, `good_result`, `face_ref` FaceRef, `color_token`, `allowed_apps` = `HelperForm.allowedApps`, `paused = 0`, `template`) and its chat, mirrored to `{DATA}\helpers\{helperId}\profile.json`; empty `{DATA}\helpers\{helperId}\notes.md`; an own picture to `{DATA}\avatars\{chatId}.png`. No Activity row (helper creation is not an 08-0 §G.4 event). **Credits.** Grok bots, Chief of Staff routing by job text (GRK §4.3, GRK2); Autopilot name + role + goal (APL §9.5); Manus/Cue templates by life area and dice (MNS §9.7, §9.9); Grok character colour picker (AGT A2).

---

## §4. Profile pages

### 4.1 Helper profile

**Purpose.** See and change everything about one helper: its job, look, what it can use, what it knows, its routines and files; pause or delete it (J15; MNS §9.8; GRK §5.11; AGT A16).

**How you get there.** Click the helper's name or avatar in its chat header; chat options ⋯ → "Open profile" (03 §3.6.2.2); Ctrl+I in its chat; left shell row context menu → "Open {name}'s profile" (03 §3.4.9); Search result (Chats & helpers) → "Profile" action. **Leaves to:** back arrow / Esc → that helper's chat.

**Layout (Page).**
```
┌─ page header 60 ────────────────────────────────────────────────────────────────┐
│ [←]  Trips                                                    [ Message Trips ] │ Secondary 32
├─────────────────────────────────────────────────────────────────────────────────┤
│                         ┌──────┐                                                 │ 32 top
│                         │  ✈   │ 96px                                            │
│                         └──────┘                                                 │
│                          Trips                --t-title                          │
│                  Plan and book my travel      --t-body --fg-2                    │
│                    [ Paused ] pill (only when paused)                            │
│ 24                                                                               │
│ ITS JOB                                                       section label      │
│ ┌──────────────────────────────────────────────────────────────────────────┐   │
│ │ Name                                              Trips              ›   │   │ rows 56
│ │ Its job                                Plan and book my travel       ›   │   │
│ │ What a good job looks like       Trips booked on budget, no surpri…  ›   │   │
│ └──────────────────────────────────────────────────────────────────────────┘   │
│ LOOK                                                                             │
│ │ Face                                    (✈) (🧳) (🌴) (T) [🎲]             │   │
│ │ Colour                                  ● ● ● ● ● ● ● ● ● ●                 │   │
│ WHAT TRIPS CAN USE                                                               │
│ │ Gmail                                                         [● on]     │   │ toggles
│ │ Calendar                                                      [● on]     │   │
│ │ WhatsApp                                                      [○ off]    │   │
│ │ Browser                                                       [● on]     │   │
│ │ Payments  Can ask you to approve payments. Never pays without your tap.  │   │
│ WHAT TRIPS KNOWS                                                   See all 6    │
│ │ Prefers aisle seats on short flights   I guessed · from 3 bookings  ⋯   │   │ memory rows (§7)
│ │ Goa trip 12–14 Dec                      From Gmail · 9 Oct           ⋯   │   │
│ │ Trips also uses what I know about you. See it                           │   │
│ TRIPS'S ROUTINES                                                                 │
│ │ Goa hotel prices        Every day, 9:00 AM · Next: Sat 17 Oct, 9:00 AM ›│   │
│ FILES TRIPS MADE                                                    See all     │
│ │ [PDF] goa-plan.pdf      16 Oct · 240 KB           [ Open ] [ Show ]      │   │
│ ACTIVITY                                                                         │
│ │ See what Trips did                                                   ›   │   │
│ 32                                                                               │
│ [ Pause Trips ]   [ Delete Trips ]                       Secondary · Destructive │
│ 48 bottom                                                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Elements and behaviour.**

| Element | Behaviour | Copy | Test id |
|---|---|---|---|
| Message {Helper} (`profile-message`) | Opens the helper's chat with the composer focused. | "Message {Trips}" | `profile-message` |
| Hero | 96px avatar (`--avatar-hero`), name `--t-title`, job `--t-body` `--fg-2` (2-line clamp), "Paused" pill (`--warn-soft` bg, `--warn` text, 24px, `--t-caption-strong`) when paused. | "Paused" | `profile-hero` |
| Name / Its job / Good result rows | Click → the row turns into the field (same limits as §3) + [ Save ] [ Cancel ] (32px). Enter saves; Esc cancels. Validation copy as §3. | — | `profile-row-name, -job, -good` |
| Face / Colour rows | Inline pickers as §3; change applies at once (no Save), header and chat row update within 1s. | — | `profile-row-face, -colour` |
| What {Helper} can use (`profile-app`, `data-row-id` = `HelperForm.allowedApps` key) | One Toggle per app (Gmail, Calendar, Contacts, WhatsApp, X, Browser, Payments; Outlook omitted while `flags.outlook` is false, X-41); writes `helpers.allowed_apps`. Unconnected apps: toggle disabled, second line "Not connected. Connect it in Settings → Connections." with Link "Connections". Turning an app off while a job of this helper uses it: the job's next step that needs it asks in the helper's chat ("I need your Calendar to add this trip. Let {Trips} use Calendar?" [ Allow ] [ Not now ], J15). | Payments second line: "Can ask you to approve payments. Never pays without your tap." | `profile-app` |
| What {Helper} knows | Up to 5 most-used notes from `helpers\{id}\notes.md`, each a Memory row (§7.3) with ⋯ menu (Edit, Forget). Header link "See all {n}" opens the Memory page filtered to this helper. Footer row: "{Trips} also uses what I know about you." + Link "See it" (Memory page, All). | Empty: "{Trips} hasn't learned anything yet." | `memory-row` |
| {Helper}'s routines | Routine rows (§8.3 row) → open the Routines page with that routine selected. | Empty: "No routines yet. Ask {Trips} in its chat, like "every Friday tell me hotel prices for Goa"." | `profile-routine` |
| Files {Helper} made | Up to 5 file rows: 32px type icon (`Document`/`Image`), name `--t-body` (middle ellipsis), "{date} · {size}" `--t-small` `--fg-2`, [ Open ] (default Windows app) [ Show ] (Explorer, file selected). Reads `files:list { helperId, limit: 5 } → FileRow[]` (X-124). "See all" opens Search (§12) with Files filter and this helper. | Empty: "Files {Trips} makes will show up here." | `profile-file` |
| Activity | Row → Activity log (§9) filtered to this helper. | "See what {Trips} did" | `profile-activity` |
| Pause {Helper} (`profile-pause`) | Secondary. Pausing: routines pause; messages to the helper get the line "{Trips} is paused. [ Turn on ] or ask foo instead." (J15). Running jobs of this helper keep running to the end. Button becomes "Turn {Trips} back on". Page shows Warn banner at top: "{Trips} is paused. Its routines are paused too." [ Turn on ]. | "Pause {Trips}" / "Turn {Trips} back on" | `profile-pause` |
| Delete {Helper} (`profile-delete`) | Destructive → §14 C-5 (or C-6 when it has running jobs). Delete is a soft delete (`helpers.deleted_at`, its chat `deleted_at`; purge per 08-0 §G.5, X-63); Activity rows stay. After delete: back to foo's chat; foo posts the marker "You deleted {Trips}. Bookings it made stay booked." | "Delete {Trips}" | `profile-delete` |

**States.** First time (new helper): knows/routines/files show their empty lines. Loading: skeleton rows per section. Error reading notes: section shows "I couldn't read {Trips}'s notes." + Link "Try again". Offline: everything works; "Message" works (message waits for the AI).
**Keyboard.** Ctrl+I opens; F6 cycles left shell → page. Esc → back to chat. **Narrator.** Page name "{Trips} profile"; hero is a heading level 1 "{Trips}"; each section is a heading level 2 + list.
**Reads/writes.** `helpers` row (mirror `{DATA}\helpers\{helperId}\profile.json`), `{DATA}\helpers\{helperId}\notes.md`, `routines` rows owned by the helper, files in `{OUT}` made by the helper (from the `foo.db` file index), `activity` rows for this helper (read only). Test ids: root `screen-helper-profile`; hero `profile-hero`; section rows `profile-row-{rowId}` (`name`, `job`, `good`, `face`, `colour`); memory rows use §7's `memory-row`; files `profile-file` with `data-row-id`. **Credits.** Manus agent profile (MNS §9.8); Grok Library and character (GRK §5.11, AGT A2); Muse profile tabs (AGT A16); WhatsApp "Contact info" sections (MSG §9).

### 4.2 foo profile ("{agentName}" page)

Same frame as 4.1 with these differences (J3 "Change name, face or vibe"):

| Section | Rows |
|---|---|
| Hero | `--avatar-hero` (96px) foo's face (the living face by default, 02 §F15.9, the logo is the same face held still, X-143), `{agentName}`, line "Your main helper" |
| Name and look | Name (field max 20, 🎲), Face (4 options + 🎲 Surprise me + Use my own picture), "How I talk" (radio rows: "Calm, a bit funny" / "Straight to the point" / "Warm and chatty" / "Something else…" with a text field) |
| What I know about you | top 5 facts (Memory rows) + "See everything" → §7 |
| My routines | routines owned by foo |
| Files I made | as 4.1 |
| Setup | Row "Run setup again" (`profile-run-setup`) → posts setup steps 2–4 in foo's chat (§2.0) |

Writes: name, face and "How I talk" write `identity.agentName`, `identity.avatarRef`, `identity.vibe`/`vibeLine`/`emoji` (08-0 §A) and `{DATA}\memory\identity.md`. Test id root `screen-foo-profile`.
There is no Pause, no Delete and no "What it can use" (foo's reach is set in Settings → Permissions). Header button: "Message {foo}".

### 4.3 Group profile

**Entry.** Group chat header name; chat options ⋯ → "Group info"; Ctrl+I in a group. Page title = group name.

| Section | Rows and behaviour | Copy |
|---|---|---|
| Hero | Stacked faces of up to 3 members (40px, overlapping 12px), name `--t-title`, "{3} helpers" `--t-body` `--fg-2` | — |
| Name | Editable row, max 30 | — |
| Members | One row per member (avatar 26, name, job `--t-small` `--fg-2`, ⋯ → "Remove from group"); row "Add a helper" opens a menu of helpers not in the group | Removing below 2: blocked with tooltip "A group needs at least 2 helpers." Adding above 6: menu item disabled, tooltip "6 is the most for a group." |
| Files | as 4.1 "Files {Helper} made", for files made in this group | Empty: "Files this group makes will show here." (02 §F16.3 E-27) [X-33] |
| Privacy note | Static row, `--t-small` `--fg-2` | "Payments, passwords, addresses and private things never show here. Helpers ask you in their own chats." |
| Danger | [ Delete group ] (`profile-delete`) Destructive → §14 C-7 (soft delete, 08-0 §G.5) | "Delete group" |
| Faces | Every member face in a group shows rings only, never eye moods (02 §F15.9.3d; owner Q6) | — |

**WhatsApp group mirror variant** (a linked WhatsApp group shown read-only, J16): hero line "From WhatsApp · {8} people · read-only"; no Members editing; one row "Messages from this group are read live from your phone and kept for 7 days." ; danger button is "Hide from foo" (Secondary) → confirm §14 C-8. If WhatsApp is unlinked: Warn banner "WhatsApp is unlinked." [ Link again ].

Credits: Grok groups (GRK §4.2); Tab private things in DM (TAB §9.9); WhatsApp group info (MSG §9).

---

## §5. New group dialog

**Purpose.** Make a group chat of the user plus 2–6 helpers (J16; GRK §4.2).

**How you get there.** Left shell ⋯ menu → "New group" (03 §3.4.2); Ctrl+Shift+N; the user typing "start a group with Trips and Money to plan Goa" (dialog opens prefilled: name "Goa", Trips and Money ticked).

**Layout.** Dialog md (520px).
```
┌──────────────────────────── 520 ─────────────────────────────┐
│ New group                                                [✕] │
│ 16                                                            │
│ Group name                                                    │ --t-body-strong
│ [ Like "Goa trip"                                   ]         │ field 40, max 30
│ 16                                                            │
│ Who's in it                               2 of 6 picked       │ caption --fg-3, right
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [✓] (✈) Trips     Plan and book my travel                │ │ rows 56, checkbox 20
│ │ [✓] (₹) Money     Track bills and spending               │ │
│ │ [ ] (🏠) Home     Look after the house                    │ │
│ │ [ ] (f) foo       Your main helper                       │ │
│ └──────────────────────────────────────────────────────────┘ │ list max-height 280, scrolls
│ 8                                                             │
│ Payments and private things never show in groups. Helpers     │ --t-small --fg-2
│ ask you in their own chats.                                   │
│ 24                                                            │
│                                   [ Cancel ]  [ Create group ]│
└───────────────────────────────────────────────────────────────┘
```

| Element | Rule | Copy | Test id |
|---|---|---|---|
| Group name (`dialog-new-group-name`) | Text field, max 30, required | label "Group name" · placeholder "Like "Goa trip"" | `dialog-new-group-name` |
| Members list (`dialog-new-group-member`, `data-row-id` = helper id or `foo`) | Checkbox rows (avatar 26px, name `--t-body-strong`, job `--t-small` `--fg-2` 1-line). All helpers plus foo. The first ticked helper is the group owner and posts the first line. | counter "{n} of 6 picked" | `dialog-new-group-member` |
| Limits | Create disabled below 2 ticked (hint under the list `--t-small` `--fg-3`: "Pick at least 2."). At 6 ticked, unticked rows are disabled with tooltip "6 is the most for a group." | — | `dialog-new-group-hint` |
| Privacy line | static | "Payments and private things never show in groups. Helpers ask you in their own chats." | `dialog-new-group-privacy` |
| Create (`dialog-primary`) | Primary | "Create group" | `dialog-primary` |

**States.** First time with fewer than 2 helpers: the list is replaced by the empty block "You need at least 2 helpers for a group." + Primary "Make a helper" (closes this dialog, opens §3). Name missing on Create: field error "Give the group a name." Save error: in-dialog Bad banner "That didn't save. Try again." [ Try again ]. Offline: works; the owner's first line waits for the AI.
**After Create.** Group appears in the left shell with stacked faces; its chat opens; owner's first line: "{Trips} here with {Money}. Tell us what you need for {Goa trip}." (J16).
**Keyboard.** Ctrl+Shift+N opens with focus in the name; Space toggles a member; Enter in the name moves to the list; Ctrl+Enter creates. **Narrator.** List is `role="group"` "Who's in it, {2} of 6 picked"; each checkbox name "{Trips}, {Plan and book my travel}".
**Writes.** `chats` row `kind='group'` with members and owner in `foo.db` (08-1). No Activity row (not an 08-0 §G.4 event). Copy keys `dialog.new_group.{slot}`. **Credits.** Grok New Group Chat, 2–6 bots (GRK §4.2, AGT A14); Tab group with private things in DM (TAB §9.9); Cue groups of agents (MNS §9.9).
