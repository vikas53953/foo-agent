# 05 · Cards, part 3 of 3 (§5.10–§5.29)

Shared rules (§0) are in `05-cards-1.md` and apply to every card here. Evidence keys as in `05-cards-1.md`.

---

## §5.10 Sign-in-here card + the sign-in window

**Purpose.** When a site needs a person (sign-in, CAPTCHA, passkey, bank check), the user does that one bit on the real page in the job's own Edge window (brought to the front with foo's docked banner, §5.10.3, X-66) while foo waits and sees nothing `[Article 8; JRN C9, J13; BP1 "Sign in here, I'll continue"]`.

**Trigger.** The job's browser lands on a sign-in form, a one-time-code page, a CAPTCHA / "press and hold", a passkey/phone approval, or a bank 3-D Secure page, and no saved login fits (JRN J13 lane chooser). The job goes NEEDS YOU.

### 5.10.1 Card anatomy (`--card-w` 440px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Globe 20] IRCTC wants you to sign in. Do it here and I'll carry on.         │ 22 (wraps)
│ [favicon 16] irctc.co.in                                           ● LIVE    │ --t-small --fg-2 · LIVE --t-caption-strong --live
│ [ I'm done ]  [ Take over ]  Skip                                            │ 40
│                                                                     9:30 AM │
└──────────────────────────────────────────────────────────────────────────────┘
```
- Favicon 16px, read from the site during the job and cached in `jobs\{id}\media\`; missing → `Globe` 16 `--fg-3`.
- "● LIVE": 8px dot + word, both `--live` (06 §0.11 alias of `--bad`), shown only while Edge is in front with the sign-in banner (§5.10.3). No pulsing (0.8).
- Buttons: "I'm done" Primary, "Take over" Secondary, "Skip" Link button.

### 5.10.2 Card copy (final)

| Lane | Title | Buttons |
|---|---|---|
| Sign-in | "{Site} wants you to sign in. Do it here and I'll carry on." | [ I'm done ] [ Take over ] Skip |
| CAPTCHA / press-and-hold | "This page wants to check you're a person. You do this bit, then hand it back." | [ Take over ] Skip |
| Passkey / phone approval | "{Site} sent an approval to your phone. Approve it there, then tap I'm done." | [ I'm done ] Skip |
| Bank check (3-D Secure) | "Your bank sent a code to {+91 98••• ••210}. Type it on the bank's page." | [ I'm done ] Link "Use the code box" (opens §5.8 Code box) |
| Known puzzle site (site note) | foo line before the card: "{IRCTC} always asks for a puzzle, so I'll need you for a few seconds."; on the card the line `known_puzzle_site` (`cards.signin.known_puzzle_site`): "This site asks a picture puzzle. I'll show it to you; you solve it." Puzzles are never solved by foo (Art. 8): no AI turn, tool or service ever reads or answers one | [ Take over ] Skip |
| Saved login failed | "Your saved {IRCTC} login didn't work. Sign in here and I'll update it." | as Sign-in |

| State | Copy |
|---|---|
| Done (page left the sign-in form, or I'm done confirmed) | summary `--ok`: "✓ Signed in to {irctc.co.in} · {9:32 AM}"; checklist row "Signed in to {IRCTC}" |
| I'm done tapped, page still shows the form | line `--t-small` `--warn`: "It still looks like the sign-in page. Finish there, or tap Skip." |
| Skip, another route exists | summary grey "Skipped. I'll try another way." |
| Skip, no other route | foo posts: "{IRCTC} is the only place to book this {train}. Want to sign in later?" [ Remind me in 1 hour ] [ Stop ] |
| Remind me in 1 hour (UJ-40) | creates a `once` routine owned by this chat (08-3 §13.2); at fire time it posts the message "You wanted to sign in to {irctc.co.in}. Ready when you are." with Primary [ Sign in ] (re-opens Edge at the sign-in page with the banner, §5.10.3); the job stays NEEDS YOU until then |
| No answer 10 min | toast reminder only (see toast) |
| No answer 2 h | summary grey; job CANCELLED; foo: "I stopped the {train booking} because the sign-in wasn't done. Ask me again any time." [ Start again ] |
| Edge or the banner closed by the user | treated as Skip |
| Offline | job WAITING; card buttons disabled with the offline line |
| Read-only in history | summary only |
| States (`cards.state`, 08-0 §G.2) | `waiting` (posted, Edge not in front), `live` (Edge in front with the banner), `signed_in`, `skipped`, `timed_out` (2 h), `handed_back` (take-over ended with Hand back), `withdrawn` (job stopped) |
| After first success on a site | foo asks once per site (§5.8.4 Login variant): "Save your {IRCTC} login so I can sign in myself next time? It stays on this PC and I fill it in without seeing it." [ Save ] [ Don't save ] |
| Code arrived by email, Gmail connected | asked once: "The code went to your Gmail. Want me to read codes from your email for {IRCTC} from now on?" [ Yes, for {IRCTC} only ] [ No, I'll type them ] |

### 5.10.3 The sign-in banner (content contract; X-66, 08-0 §G.8; window behaviour, position and frame are 09 §9.27)

foo never draws the site. For a sign-in (`signin.mode = 'sign_in_here'`) or a take-over (`'take_over'`), foo brings the **real Edge window** of the job to the front (Edge is always external, driven over CDP) and docks one small foo-owned window, `signin-banner.html` (frameless, always on top, positioned against Edge by `foo-native` wintrack, 09 §9.27), along Edge's top edge. The 06-3 "Chromium view" window is withdrawn.

```
┌─ signin-banner.html, docked to the top of the real Edge window, width = Edge's width ───────────────┐
│ [Lock 16] irctc.co.in/nget/signin                      (address row 32, read-only, --t-small)     │
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [Warning 16] foo is waiting. It can't see what you type here.                      [ I'm done ]    │ banner 40 (--banner-h), Warn tone
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
┌─ the real Edge window (the site; Edge's own frame and controls) ───────────────────────────────────┐
│                                                                                                    │
```

| Part | Value | Test id |
|---|---|---|
| Window | `signin-banner.html`, height 72px (address row 32 + banner 40), width = the Edge window's width; follows Edge when it moves or resizes; hidden when Edge is minimised; never covers other apps' windows (09 §9.27) | `signin-banner` (root) |
| Address row | height 32px, bg `--bg-sidebar`, `LockClosed` 16 `--fg-2` for https (no lock for http, plus the word "Not secure" in `--bad`), domain in `--t-small` `--fg-1` bold (600), path `--fg-3`; read-only, read from the CDP target URL so the user can always see which site they are typing into `[foo decision: anti-spoofing]` | `signin-banner-address` |
| Banner | 06 §0.6 Warn tone: "{agentName} is waiting. It can't see what you type here." + Secondary `--btn-h-sm` 32px "I'm done" (access key Alt+D) | `signin-banner-done` |
| Success banner | bg `--ok-soft`, `CheckmarkCircle` 16 `--ok`, text `--fg-1`: "Looks like you're in. Carrying on…"; after 2 s the banner window closes, Edge goes back to the background and the job carries on (Watch live, 06-3 §11.1, shows it) | `signin-banner-success` |
| Take-over bar (`mode = 'take_over'`) | replaces the Warn banner; 06 §0.6 **Control** tone (bg `--warn`, text `--on-warn`): "You're in control. {agentName} is paused." + button "Hand back to {agentName}" (Alt+D) | `signin-banner-hand-back` |
| Privacy | while Edge is in front for a sign-in: no screenshots, no page text read, no AI calls about the page; password, card and OTP fields are blanked in any later frame `[GRK §1.5 snapshot leak; JRN J13]` | — |
| Detection | foo watches only the page URL and whether a password/one-time-code field is still present; when both change, it continues without a tap `[JRN J13 step 4]` | — |
| Keyboard | Edge owns every key on the page; Alt+D anywhere (global while the banner is shown) = "I'm done" / "Hand back"; Tab inside the banner window moves address row → button `[foo decision; 09 §9.17.1 lists Alt+D, X-09]` | — |
| Narrator | banner window name "{domain}, sign in, {agentName}"; banner `role="status"` read on open; success announced "Signed in. Carrying on." | — |

The `--signin-w` / `--signin-h` sizes of §5.26 no longer size any window (Edge keeps its own size); see §5.27 #19.

### 5.10.4 Keyboard, Narrator, motion, groups, toast, logged, sources

- Card Tab order: I'm done → Take over → Skip. Ctrl+Enter = I'm done (or Take over on the CAPTCHA lane). Bringing Edge and the banner to the front: Enter on the card summary when NEEDS YOU, or the notification's [ Open ].
- Card label: "Sign-in needed: {site} wants you to sign in." LIVE reads "live window open".
- Motion: arrival; LIVE dot static; window open/close per 06.
- Groups: never ("The sign-in stays private. I've asked {userName} in their own chat.").
- Toast: "{agentName} · {IRCTC} needs you to sign in." [ Open ] (brings Edge and the banner to the front directly); one reminder at 10 min: "{agentName} · {IRCTC} is still waiting for you to sign in."
- Logged: activity (08-0 §G.4, kind `connected`) `signed_in_site` (domain, no values) on success, and `saved_login` when the Login variant saves; requested, took over, handed back, skipped and timed out are card events and tech-log lines. No screenshot is saved while Edge is in front for a sign-in. Site note `sites\{domain}.md` ("needs sign-in", "always CAPTCHA").
- Test ids: root `card-signin`; `card-signin-done`, `card-signin-take-over`, `card-signin-skip`, `card-signin-use-code-box`, `card-signin-remind`, `card-signin-stop`, `card-signin-start-again`, `card-signin-save-login`, `card-signin-dont-save`; LIVE pill `card-signin-live`; banner window ids in the §5.10.3 table.
- Sources: JRN C9, J13, J18; Grok Take over / I'm done / Skip and four lanes (GRK §1.1, §1.4); Manus take over for 2FA (MNS §9.1); Tab private live browser (TAB §9.4); ChatGPT take over / return control (GPT §5); AGT A8; BP1.

---

## §5.11 Connect card (Gmail + Calendar + Contacts, WhatsApp; Outlook only from v1.1)

**Purpose.** Ask once, in plain words, to connect an app, saying what foo will and won't do with it `[JRN C10, J4]`.

**Trigger.** Interview step (J4 Cards D, E), a job that needs an app that isn't connected ("Connect Gmail and I can tell you the amount too"), an expired connection, or a new permission (send).

### 5.11.1 Anatomy (`--card-w` 440px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Gmail logo 32] Connect Gmail and Calendar                                   │ 32 row; title --t-body-strong
│ I'll read emails and your calendar to spot bills, trips and plans.           │ --t-body
│ I'll write drafts, but I never send without your tap.                        │ --t-body
│ [ Connect ]  [ Not now ]                                                     │ 40
│                                                                     9:05 AM │
└──────────────────────────────────────────────────────────────────────────────┘
```
WhatsApp, after "Show QR code":
```
│ ┌───────────────┐  1  Open WhatsApp on your phone                            │
│ │  QR 200×200   │  2  Tap ⋮ or Settings → Linked devices → Link a device     │ --t-body, number --t-body-strong
│ │ --qr-bg/fg    │  3  Point your phone at this code                          │
│ └───────────────┘                                                            │
│ WhatsApp may unlink foo now and then. If that happens I'll ask you to scan  │ --t-caption --fg-3, always visible
│ again.                                                                       │
```
- App logo: `--logo` 32px, the app's official mark bundled as a local SVG (never fetched); header row height 32px. Narrow card (< 400px inner): steps go under the QR.
- QR: `--qr-size` 200px, 8px quiet zone, colours `--qr-bg` / `--qr-fg` (06 §0.11) in both themes, `--r-sm`.

### 5.11.2 Copy (final)

`ConnectPayload` (08-5 §4.1, X-127) carries `variant` (column below) and `scopes`. "Connect" (and "Allow sending") tapped → `connection:connect { app: 'google', scopes: payload.scopes }`; "Show QR code" (`whatsapp`) → `whatsapp:linkStart`.

| Card | `variant` | Title | Lines | Buttons |
|---|---|---|---|---|
| Google | `google` | "Connect Gmail and Calendar" | "I'll read emails and your calendar to spot bills, trips and plans." / "I'll write drafts, but I never send without your tap." / "See your contacts, so I message the right person (I never change them)." (X-48, UJ-16; the same Google sign-in asks for Gmail, Calendar and Contacts) | [ Connect ] [ Not now ] |
| Microsoft (**not rendered in v1**: omitted, not disabled, while `flags.outlook` is false, X-41; no "coming soon" copy) | `outlook` | "Connect Outlook and Calendar" | same lines with "Outlook" | [ Connect ] [ Not now ] |
| WhatsApp | `whatsapp` | "Link WhatsApp" | "I can read your chats to remind you of things, and draft messages for you to send." / "I never send a WhatsApp message without your tap." | [ Show QR code ] [ Not now ] |
| One app for a job | `one_app` (`why` = the line) | "Connect {Gmail}" | "{So I can see your bills and trips.}" | [ Connect ] [ Not now ] |
| New permission | `allow_send` (`scopes: ['gmail']`) | "Allow sending from {Gmail}" | "To send emails I need one more permission from Google." | [ Allow sending ] [ Not now ] |
| Contacts alone (only when Gmail is already connected without Contacts; asked together, it is the third line of the Google card) [X-48] | `contacts_only` (`scopes: ['contacts']`) | "Connect your contacts" | "See your contacts so I message the right person." / "I only read them. I never change or share them." | [ Connect ] [ Not now ] |

| State | Copy |
|---|---|
| Opening | spinner row: "Opening {Gmail} sign-in in your browser…" (`connection:connect { app: 'google', scopes: payload.scopes }` returns `{ connectionId, status: 'connecting' }` at once; the card follows `connection:upsert` events, 08-0 §G.12, X-74) |
| Waiting (browser open) | "Waiting for you to finish in your browser…" + Link "Reopen" |
| Connected | summary `--ok`: "✓ Connected as {v•••@gmail.com}" + Link "Use a different one" (label for Narrator: "Wrong account? Use a different one") |
| Partly granted | summary `--ok`: "Connected. I can read and draft, but not send. I'll ask you to send from Gmail yourself."; second line form when Calendar or Contacts was not granted (X-127): "Connected. Google didn't let me see your {calendar}; you can allow it later in Settings → Connections." (`cards.connect.line.partial_scope`) |
| Denied / cancelled | "Gmail isn't connected. That's fine, I'll work without it." [ Try again ] Link "Skip" |
| Link expired (10 min) | "That sign-in link expired." [ Reopen ] |
| Offline | "You're offline. I'll connect this when you're back." [ Remind me ] |
| QR shown | steps + footer; a new code arrives about every 20 seconds (08-3 §16.4.4); 60 seconds after Show QR code the panel expires (X-127) |
| QR expired (60 s) | QR blurred (CSS `filter: blur(6px)`, `--fg-3` overlay text) "This code expired." [ New code ] |
| WhatsApp linked | summary `--ok`: "✓ WhatsApp linked ({+91 98••• ••210})" |
| WhatsApp failed 3× | "WhatsApp didn't link. You can try later in Settings → Connections." [X-07] [ Skip for now ] |
| Not now | summary grey "Not connected. You can do this later in Settings → Connections." [X-07] |
| Read-only in history | summary only |
| States (`cards.state`, 08-0 §G.2) | `offered` (as drawn; Offline is a look of it), `opening`, `waiting`, `connected` (incl. WhatsApp linked), `partial` (Partly granted), `denied`, `expired` (link expired), `failed` (WhatsApp failed 3×), `skipped` (Not now) |

### 5.11.3 Keyboard, Narrator, motion, groups, toast, logged, sources

- Tab: Connect/Show QR code → Not now → Reopen/Use a different one. Ctrl+Enter = Primary.
- Card label: "Connect an app: {title}". QR image `alt`: "QR code to link WhatsApp. Scan it with the WhatsApp app on your phone." Connected state announced politely.
- Motion: arrival; M-1. Groups: never. Toast: only when the user finished in the browser while foo is not focused: "{agentName} · {Gmail} connected. Come back to finish setup." [ Open ].
- Logged: activity (08-0 §G.4, kind `connected`) `connected` (app, masked account, granted permissions; WhatsApp linked is `connected` with app `whatsapp`) and `disconnected`; offered, denied and expired are card events and tech-log lines. The Google token is one vault entry `foo/conn_token/google` shared by Gmail, Calendar and Contacts; the WhatsApp session is `{DATA}\vault\wa-session.bin` (08-0 §E.8, X-73).
- Test ids: root `card-connect`; `card-connect-connect` (Connect), `card-connect-allow-send` (Allow sending), `card-connect-not-now`, `card-connect-show-qr`, `card-connect-new-code`, `card-connect-reopen`, `card-connect-try-again`, `card-connect-skip`, `card-connect-remind`, `card-connect-different-account`; QR `card-connect-qr`.
- Sources: JRN C10, J4, J13; Grok Connect/Authorize/Reopen/Retry, 10-minute link, incremental consent (GRK §1.4; AGT A9); OpenClaw WhatsApp QR and fragility (OCL §4, §8.4); Tab real logos (AGT A9).

---

## §5.12 Plan card (steps + time + AI cost)

**Purpose.** Before a long or costly job, show the steps and a rough time and AI cost, and wait for "Go" `[JRN C11; PPX quote-before-work]`.

**Trigger.** The job is estimated at > 2 minutes or > ₹5 of AI, or > 20% of the remaining monthly AI cap (adds "This is a big one."). Never auto-starts `[AGT A3: no countdown auto-start]`.

### 5.12.1 Anatomy (`--card-w` 440px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [TaskListLtr 20] My plan · Goa stay, 12–14 Dec                               │ 22
│ 1  Check Booking.com, MakeMyTrip and hotel sites                             │ number --t-body-strong --fg-2 (20px col)
│ 2  Keep 3 under ₹8,000 a night, under 5 min walk to the beach                │ step --t-body
│ 3  Show you before booking anything                                          │
│ About 6 minutes · uses about ₹4 of your AI                                   │ --t-small --fg-2
│ [ Go ]  [ Change plan ]                                                      │ 40
│                                                                     9:18 AM │
└──────────────────────────────────────────────────────────────────────────────┘
```
Steps: all plan steps (1–12, 08-4 §25.2), gap 4px; beyond 6 the card shows the first 5 and a row "…and {n} more · Show" (Link button, `card-plan-show-all`, key `cards.plan.show_all`) that expands in place (X-131). The engine inserts a "Show you before {acting}" step before the first step that books, pays, sends, posts or buys (08-4 §26.2 step 0; X-131); the plan never promises to act without a card.

### 5.12.2 Copy (final)

| Slot | Copy |
|---|---|
| Title | "My plan · {title}" |
| Estimate | "About {n} minutes · uses about ₹{x} of your AI" / plan-based AI: "About {n} minutes · about {p}% of your {Claude} plan" |
| Big job (> 20% of cap) | appended in `--warn`: " · This is a big one." |
| Buttons | "Go", "Change plan" |
| Change plan | composer focused with placeholder "Tell me what to change"; the old card becomes Superseded "Plan changed. See the new one below." |
| Started | summary `--ok`: "Started · {9:19 AM}"; the checklist (§5.2) follows with these steps |
| No answer 24 h | summary grey "I didn't start {Goa stay} because I didn't hear back." + Link "Start again" `[foo decision, mirrors J8 24 h]` |
| Stopped elsewhere | WITHDRAWN copy (0.5) |
| Offline | Go disabled + offline line |
| Cap reached | Go disabled; line "You've reached this month's AI cap." + Link "Raise cap" (§5.21) |
| States (`cards.state`, 08-0 §G.2) | `pending`, `go` (Started), `changed` (Change plan; the old card shows the Superseded look), `withdrawn` (stopped elsewhere, or no answer in 24 h with the copy above) |

### 5.12.3 Keyboard, Narrator, motion, groups, toast, logged, sources

- Tab: Go → Change plan. Ctrl+Enter = Go. Card label: "Plan: {title}, {n} steps, about {n} minutes, about ₹{x}". Steps are an ordered list.
- Motion: arrival; M-1. Groups: never. Toast: "{chat} · Plan ready for {Goa stay}." [ Open ].
- Logged: card row (steps, estimate); activity: none (shown, go and changed are card events). Estimate vs actual stored in `jobs\{id}\state.json` for the 2× loop rule (Article 13).
- Test ids: root `card-plan`; `card-plan-go`, `card-plan-change`, `card-plan-start-again`, `card-plan-raise-cap`; steps `card-plan-step` (`data-index`); estimate `card-plan-estimate`.
- Sources: JRN C11, J10, J19.3; Perplexity plan + cost (PPX §9.1); Gemini plan preview (GEM §9.3); ChatGPT plan card, no auto-start (AGT A3); BP1 "Plan and cost before big jobs".

---

## §5.13 Routine created card

**Purpose.** Confirm in plain words what a routine checks, how often, when it will tell the user, where, and when it next runs `[JRN C13, J14; GRK §2 row 21]`.

**Trigger.** A routine is created by asking, by accepting §5.14, or edited in chat. foo first runs it once and posts the result line ("Right now BTC is ₹57,20,000 (57.2 lakh), above your line. Here's what the routine will do:") `[MNS run once first]`. Amounts follow 07-2 R-09: full grouped figures, lakh only in brackets (UJ-41).

### 5.13.1 Anatomy (`--card-w` 440px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Clock 20] Routine created                                                   │ 22
│ Checks       Bitcoin price in rupees (CoinDCX)                               │ label/value grid (0.2)
│ How often    Every 30 min, 7:00 AM to 10:00 PM (your time, IST)              │
│ Tells you    only if it's below ₹55,00,000 (55 lakh)                         │
│ Where        Money chat + notification                                       │
│ Next run     Fri 16 Oct, 10:15 AM                                            │
│ Uses about   ₹30 of your AI a month                                          │
│ I never send, buy, book, post or delete on my own. It ends in a card for you.│ --t-small --fg-2 (only when the routine prepares an action)
│ [ Run once now ]  [ Edit ]  [ Pause ]                                        │ 40
│ Runs when your PC is awake. If it's asleep, I check as soon as it wakes.     │ --t-caption --fg-3
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.13.2 Copy (final)

| Slot | Copy |
|---|---|
| Title | "Routine created" / after an edit "Routine updated" / paused "Routine paused" |
| Row labels | "Checks", "How often", "Tells you", "Where", "Next run", "Uses about" |
| Tells you | "only if {condition}" or "every time, with {what}" |
| Where | "{chat name} + notification" or "{chat name} · no notification" (the word "toast" never appears on screen, X-79) |
| Uses about | "₹{x} of your AI a month" / plan-based "about {p}% of your {Claude} plan a month" |
| Action routines | "I'll get it ready each {month} and ask you before paying. I never pay on my own." |
| Footer | "Runs when your PC is awake. If it's asleep, I check as soon as it wakes." `[AGT A12]` |
| Buttons | "Run once now", "Edit", "Pause" (paused: "Resume") |
| Edited line | the changed row gets bg `--accent-soft` and "(was {every 30 min})" `--fg-2`; foo line "Updated. Next run {Fri 16 Oct, 11:00 AM}." |
| Running now | spinner row "Checking now…" |
| Paused | foo line "Paused. I won't check {BTC} until you turn it back on."; Resume → "On again. Next run {time}." |
| Last run failed | row `--bad`: "Didn't finish at {8:45 AM} · See why" (Link to Routines page, 06 §8) |
| Deleted | summary grey "Routine deleted" (delete confirm lives in 06 §14: "Delete the {BTC} routine? Its history goes too. This can't be undone.") |
| Duplicate | instead of a new card: "You already have this: '{BTC below ₹55,00,000}'. Change it instead?" [ Change it ] [ Make another anyway ] |
| Limits | "That's 25 routines, the most I can look after. Delete one to add this." / "The fastest I check is every 15 minutes." |

**Routine result message** (when a run fires; a normal foo bubble, not a card): result text + footer `--t-caption` `--fg-3`: "Why am I getting this? Your {BTC} routine." where "Your {BTC} routine" is a Link to the routine `[Article 19]`.

### 5.13.3 Keyboard, Narrator, motion, groups, toast, logged, sources

- Tab: Run once now → Edit → Pause. Ctrl+Enter = Run once now. Edit opens the Routines page detail (06 §8) focused on the routine.
- Card label: "Routine: {name}. {How often}. Tells you {condition}. Next run {absolute time}."
- Motion: arrival; changed-row highlight is a chip-style colour change `--m-normal`. Groups: never (routine lives in its owner 1:1). Toast: none for the card; fired runs toast per J14.
- Logged: `routines\{id}.json` (08). Activity: none for one routine (created, edited, paused, resumed, run now and deleted are tech-log lines); "Pause all" / "Resume all" are `paused_routines` / `resumed_routines` (06-2 §6.7, 08-0 §G.4). `cards.state` is always `shown` (08-0 §G.2); "updated" and "paused" are new versions of the card's text.
- Test ids: root `card-routine`; `card-routine-run-now`, `card-routine-edit`, `card-routine-pause` (also Resume), `card-routine-change-it`, `card-routine-make-another`, `card-routine-see-why`; rows `card-routine-row` (`data-index`).
- Sources: JRN C13, J14; Grok routine created, Next run / Once (GRK §2 row 21, §4.5); ChatGPT "tell me only if" (GPT §9.7); Manus run once first (MNS §9.15); AGT A12; BP1 "Routines made by asking".

---

## §5.14 Routine suggestion ("Want me to do this every month?")

**Purpose.** Offer once to turn a repeated ask into a routine; never offer twice `[Article 20; JRN J11 step 7]`.

**Trigger.** The user asked for the same task with the same object 3 times in 3 consecutive periods (3 months for bills, 3 weeks for weekly tasks), or a helper's pattern rule fires (J15). Counts toward the 3-a-day interruption budget and obeys quiet hours (Article 19). Never shown if dismissed before for that task.

### 5.14.1 Anatomy and copy (`--card-w` 440px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ You've asked me to pay the Airtel bill three months in a row. Want me to     │ --t-body
│ just remind you and get it ready each month?                                 │
│ [ Yes, every month ]  [ No thanks ]                                          │ 40
│ Why am I getting this?                                              9:00 AM │ Link button --t-small
└──────────────────────────────────────────────────────────────────────────────┘
```

| Slot | Copy |
|---|---|
| Body template | "You've asked me to {task} {three} {months} in a row. Want me to just remind you and get it ready each {month}?" (non-money tasks: "Want me to do this every {month}?") |
| Buttons | "Yes, every {month}", "No thanks" |
| Why link | "Why am I getting this?" → popover: "You've done this {3} times. I offer once. If you say no, I won't ask again." |
| Yes | summary `--ok` "Yes, every {month}"; the Routine created card (§5.13) follows |
| No thanks | summary grey "Okay, I won't ask again." (restorable only via Settings → Privacy → "Show dismissed suggestions") |
| No answer 7 days | summary grey, counted as dismissed `[foo decision: conservative, Article 20]` |

- No header icon (it is foo speaking, not a system card). Keyboard: Ctrl+Enter = Yes. Narrator: "Suggestion: {body}". Groups: never. Toast: only through the interruption budget: "{chat} · Want me to remind you about {Airtel} each month?" [ Open ].
- Logged: the `suggestions` row with key `{kind}:{subject}` (e.g. `routine_offer:pay_bill:airtel`; UNIQUE, 08-0 §G.13, X-76) is what enforces Article 20; activity: none. `cards.state` (08-0 §G.2): `offered`, `accepted` (Yes), `dismissed` (No thanks, or no answer in 7 days).
- Test ids: root `card-routine-offer`; `card-routine-offer-yes`, `card-routine-offer-no`, `card-routine-offer-why`.

**Payload `source`** (08-0 §B.2 `RoutineOfferSource`, §B.3 `RoutineOfferPayload`): `source: 'habit' | 'idea' | 'after_job'`. The anatomy above is the `habit` layout.
- `idea` (12-1 §12.24.5 step 5): title row `ArrowRepeatAll` 20 + the idea title, then the §5.13 rows (Checks, How often, Tells you, Where, Uses about; same copy keys), buttons `cards.routine_offer.button.start_it` "Start it" (Primary) and `cards.routine_offer.button.not_now` "Not now" (Secondary); summaries `cards.routine_offer.summary.accepted` "Started · {9:04 AM}" and `cards.routine_offer.summary.dismissed_idea` "Not started. It's still in Ideas if you want it later." Prompted (the user started it); writes no `suggestions` row; no answer in 24 h → `dismissed`. Test ids `card-routine-offer-start-it`, `card-routine-offer-not-now`.
- `after_job` (12-1 §12.0.6, X-97): one sentence + two buttons posted directly under a DONE job's result (PNR watch after a booking or ticket, recharge reminder after a recharge; body and button keys owned by 12-1, e.g. `thread.trains.offer_pnr_watch`, `cards.routine_offer.button.yes_remind`). It is prompted: it does not count toward `notifications.unpromptedPerDay`, is never held, and at most one is posted per job; it is still a `suggestions` row (never offered twice, 08-0 §G.13). No "Why am I getting this?" link.
- Sources: JRN J11, J14 trigger B/C; OpenClaw promotion of repeated asks (OCL §9.9); Hermes never re-offer (HRM §9.8); BP1 "Offer to make it a habit".

---

## §5.15 Proof chip + receipt footer

**Purpose.** "Done" only with proof, and a short receipt of time and cost `[Article 11; JRN C12; PPX receipt]`.

**Trigger.** A job reaches DONE with a proof object (confirmation number, screenshot, received email, delivered ticks, Gmail Sent item). The chip row sits under foo's result bubble (4px gap), the footer under the chips.

### 5.15.1 Anatomy

```
Booked. Taj Holiday Village, 12–14 Dec, 2 nights, ₹14,600 paid. Added to your calendar.   ← foo bubble
[✓ Proof: booking #TJ88213 · email from MakeMyTrip]                                       ← chip 24 (40 hit)
Done in 6 min · 4 steps · used about ₹4 of your AI                                         ← --t-caption --fg-3
```
- Chip: 0.3 Chip; bg `--ok-soft`, text `--ok`, `--t-caption-strong`; `CheckmarkCircle` 16 `--ok`; confirmation numbers in `tabular-nums`. Max width = bubble max; ellipsis in the middle part (never the number).
- Several proofs: one chip each, row wraps with 4px gaps.

### 5.15.2 Copy (final)

| Slot | Copy |
|---|---|
| Chip | "Proof: {booking #TJ88213 | screenshot | email from {sender} | in your Gmail Sent folder | Delivered}" (the "✓" of JRN copy is the icon) |
| Footer | "Done in {m} min · {n} steps · used about ₹{x} of your AI" / plan-based "… · used about {p}% of your {Claude} plan" |
| Chip click | number → popover: number in `--t-mono` + Secondary "Copy" + the screenshot it came from (if any) + Link "See in activity" (06 §9); screenshot → attachment viewer (06 §13); email → opens the message in the default browser; Sent folder → opens Gmail Sent in the browser; Delivered → nothing (Narrator says "Delivered, confirmed by WhatsApp") |
| Chip, PNR (`cards.proof_chip.chip.pnr`) | "Proof: PNR {2134567890}" (train bookings and tickets; 08-0 §H) |
| Chip, messages read (`cards.proof_chip.chip.read_source`) | "Proof: {Family group} · {n} messages read" (proof kind `read_source`, 12-2 §12.27; click → nothing, Narrator reads the text) |
| Proof file missing (screenshot deleted after 7 days) | chip stays; click shows "This screenshot was deleted after 7 days. The booking number is still here." |

### 5.15.3 States, keyboard, Narrator, groups, logged, sources

- States: rest, hover (`--ok-soft` + underline on text), pressed (scale 0.97), focus ring, read-only in history (same, still clickable). Offline: email/Sent links disabled with tooltip "You're offline. This needs the internet."
- Keyboard: chip is one Tab stop; Enter opens. Narrator: "Proof: {text}, button". Footer is plain text read after the chip.
- Motion: chip appears with the result bubble (0.8). Groups: allowed on shareable results ("Booked. Barbeque Nation, Sat 8:00 PM, table for 6." + chip) but never a payment receipt amount (Article 14).
- Toast: the result's toast carries no chip. Logged: the proof id is in the activity row of the action (`proof`, 08-0 §G.4).
- Copy keys: `cards.proof_chip.chip.{variant}` (08-0 §D, X-105). Test ids (area `thread`, not a card): `thread-proof-chip` (`data-index`; `data-state` = the proof's `ProofKind`, 08-0 §B.2), `thread-receipt-footer`, popover `thread-proof-copy`, `thread-proof-see-activity`.
- Sources: JRN C12; Tab done only with proof (TAB §9.3); Perplexity receipt (PPX §9.3); BP1 `.proof` chip.

---

## §5.16 "Not checked live" chip

**Purpose.** Say plainly when a result was not checked on the live site `[Article 11; Gemini fake results lesson]`.

**Trigger.** A job is DONE (unverified) or an answer used cached/remembered data instead of a live page.

- Chip: 0.3 Chip; bg `--warn-soft`, text `--warn`, `--t-caption-strong`, `Warning` 16 `--warn`. Copy: "Not checked live" (JRN "⚠" = the icon). Right of it, a Link button "Check for real".
- foo's bubble above says why in its own words, e.g. "Couldn't open Amazon, so these prices are from memory." `[BP1]`.
- Chip click → popover `--t-small`: "I couldn't check this on the live site, so it may be out of date."
- "Check for real" → starts a new job "Checking {title} live" linked to the old one; the chip changes to spinner + "Checking…" and, when done, to a Proof chip (§5.15) or stays with the line "Still couldn't check. {Site} didn't open."
- Keyboard: chip and link are two Tab stops. Narrator: "Not checked live. Button: Check for real." Groups: allowed. Toast: none. Logged: the action's activity row has `proof: 'unverified'` (badge `done_unverified`, 08-0 §F); "Check for real" starts a normal job (tech-log line, no activity row).
- Test ids: `thread-not-live-chip`, `thread-check-for-real`.
- Sources: JRN C12; Gemini Spark unopened-browser results (blueprint "Mistakes"); BP1 `.unv` chip.

---

## §5.17 Memory chip

**Purpose.** Show, at the moment it happens, that foo saved or used a fact, with one tap to undo or forget `[JRN C14, J17; HRM §9.12; PPX §9.6]`.

**Trigger.** A foo message changed memory (saved, updated, guessed) or used a memory fact to decide something.

### 5.17.1 Anatomy and copy

```
{foo's reply to the user's message}                   ← foo bubble (never a "Got it." bubble: Article 23, X-05)
[🧠 I'll remember: Allergic to peanuts · Undo]                ← chip 24, --bg-sunken, --fg-2
```
The chip is a marker message (`messages.kind='marker'`, `marker_kind='memory_chip'`, 08-0 §G.1). When foo has nothing else to say, it reacts 👍 to the user's bubble and the chip stands alone under that bubble's reply slot; there is no "Got it." text (UJ-34: the table below is binding).
- Chip: 0.3 Chip; bg `--bg-sunken`, text `--fg-2`, `--t-caption`; `Brain` 16 `--fg-2` (JRN "🧠" = the icon). The fact is ellipsised at 48 characters (full text in tooltip/Narrator). "Undo" / "✕" are separate 40px-hit Link/Icon buttons inside the pill's right end.

| Kind | Copy (final) | Action |
|---|---|---|
| Saved (you said) | "I'll remember: {fact}" + "Undo" [settled: X-05] | Undo → chip becomes "Undone. I won't remember that." `--fg-3` |
| Guessed | "I'll remember: {you pick window seats} · I guessed" + "Undo" [settled: X-05] | same |
| Updated | "Updated: {you live in Pune} (was {Mumbai})" + "Undo" | Undo restores the old fact |
| Used | "Used: {hates early flights}" + `Dismiss` 16 icon button (Narrator "Forget this") | ✕ → chip becomes "Forgot it. I won't use that again." |
| Not saving | `LockClosed` 16 + "Not saving this one." | none |
| Ask-before-remembering mode | a §5.3 Choice card with `purpose: memory_confirm` (08-0 §G.1): "Remember that {you're allergic to peanuts}?" [ Remember ] [ Don't ] | — |

- Undo is offered for 24 h after the save; after that the chip reads "I'll remember: {fact}" + Link "See in memory" (opens 06 §7 at the fact) `[foo decision]`.
- States: rest, hover (text `--fg-1`), pressed, focus, undone, forgotten, read-only in history (chip text stays; actions removed after 24 h). Offline: works (local).
- Keyboard: chip → Undo/✕ are Tab stops. Narrator: "Memory: I'll remember, {fact}. Button: Undo." Motion: chip change `--m-normal`.
- Groups: never (memory is private, Article 14). Toast: never.
- Logged: saves are tech-log lines (source you-said / I-guessed, no fact text); a forget from the chip is activity `forgot_facts` (kind `changed`, count only, never the text, 08-0 §G.4); files per J17.
- Test ids: chip `thread-marker` (`data-state="memory"`), `thread-memory-undo`, `thread-memory-forget`, `thread-memory-see`.
- Sources: JRN C14, J17; Hermes saved chip (HRM §9.12); Perplexity memories as sources (PPX §9.6); Tab you said / I guessed (TAB §9.10).

---

## §5.18 Handoff marker + job link card

**Purpose.** Show, without a helper speaking in foo's chat, that work moved between foo and a helper, and mirror its live state `[Article 1; JRN C15, J15]`.

### 5.18.1 Handoff marker (centred system line)

```
              foo asked Trips to find flights to Delhi on Fri 23 Oct              ← --t-caption --fg-2, centred
```
- Centred, max width 80% of the column, `--t-caption` `--fg-2`, 12px (`--s2`) above and below; no bubble, no background `[MSG/OCL notice line]`. Helper names are Link buttons in `--fg-1` (underline on hover) that open that chat scrolled to the job.

| Event | Copy (final) |
|---|---|
| foo → helper | "{agentName} asked {helperName} to {task}" |
| Helper back | "{helperName} is back: {one-line result}" |
| Helper → helper | "{Trips} told {Money} about {₹14,600 for Taj Holiday Village}" |
| New helper | "You made a new helper: {helperName}" |
| Brief action | "Opened in {helperName}" |
| Receiving helper's reply (its own bubble, not a marker; X-128) | "Added: ₹{14,600} {Taj Holiday Village} (via {Trips}) to {December} spending." (`thread.handoff.received_spend`) |

### 5.18.2 Job link card (in the chat that asked, while the job runs elsewhere)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [helper avatar 26] Flights to Delhi · in Trips                [Open Trips]   │ whole card = button
│ Working · step 2 of 4                                                        │ status pill
└──────────────────────────────────────────────────────────────────────────────┘
```
- Card frame 0.2, `--card-w`; whole surface clickable (hover `--shadow-4`). Avatar `--avatar-inline` 26px. Status pill 24px (0.3 Chip): Working = `--accent-soft`/`--accent`; Needs you = `--warn-soft`/`--warn` + `HandRight` 16; Done = `--ok-soft`/`--ok` + `CheckmarkCircle`; Failed = `--bad-soft`/`--bad`; Stopped = `--bg-sunken`/`--fg-2`. Status words: "Working · step {k} of {n}", "Needs you", "Done", "Didn't finish", "Stopped" (state from the runner, Article 12).
- Done: the card becomes "✓ Done · in {Trips}" and a marker "{Trips} is back: …" follows.

### 5.18.3 Keyboard, Narrator, groups, toast, logged, sources

- Marker: names are Tab stops; Narrator reads the line as a list item "{text}". Job link card: one Tab stop, Enter opens the chat; label "{title} in {helper}, {status}".
- Groups: markers yes ("Trips asked Money to work out the split"); job link cards yes (no private data in title).
- Toast: none. Logged: the marker (`marker_kind='handoff'`) and a tech-log line (from, to, job); activity: none. Job link card: card row, `cards.state` (08-0 §G.2) `live` (Working, Needs you), `done`, `failed`, `stopped`, read from the runner.
- Test ids: marker `thread-marker` (`data-state="handoff"`; helper names `thread-marker-link`, `data-index`); job link card root `card-job-link` (whole card is the button), status pill `card-job-link-status`.
- Sources: JRN C15, J15, J16; Grok "Messaged ◆ Chief of Staff" system line (GRK §2 row 20; AGT A14); OpenClaw notice line (OCL §7.4).

---

## §5.19 Stuck card

**Purpose.** When a job stops making progress, stop and ask instead of burning money `[Articles 12, 13; JRN J19.4]`.

**Trigger.** Any rule of 08-2 §5.6 fires (no step finished for 3 min; the same step failed 3 times; AI cost over 2× the estimate; the same page 5 times in a row; a turn or time ceiling of 08-4 §26.3). The "What's wrong" row for a ceiling uses `cards.stuck.whats_wrong.ceiling` "This is taking longer than I planned." (X-131). Job → NEEDS YOU; the user's bubble badge shows ⏳ (`waiting`); ⚠ appears only in this card's header, never on a bubble (X-61, 08-0 §F, 07-2 SM-A2).

### 5.19.1 Anatomy and copy (`--card-w` 440px)

```
┌══════════════════════════ 1.5px --warn top edge ═══════════════════════════┐
│ [Warning 20 --warn] I'm stuck on the Goa job                                 │ 22
│ What's wrong   MakeMyTrip keeps sending me back to the search page           │ label/value grid
│ Spent so far   about ₹6 of your AI · 9 minutes                               │
│ What I'd do    try Booking.com instead                                       │
│ [ Try another way ]  [ Take over ]  [ Stop ]                                 │ 40
│                                                                     9:41 AM │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Slot | Copy (final) |
|---|---|
| Title | "I'm stuck on the {Goa} job" |
| Rows | "What's wrong", "Spent so far", "What I'd do" |
| What's wrong | one cheap `classify` turn over the last 5 redacted tool results (08-4 §26.4 item 1); on failure "I keep ending up in the same place on {site}." (`cards.stuck.whats_wrong.fallback`) |
| Spent so far | key billing "about ₹{x} of your AI · {m} minutes" (`cards.stuck.spent_line.key`); plan or local "{m} minutes" (`cards.stuck.spent_line.minutes`) (08-4 §26.4 item 3) |
| What I'd do | written by the runner from facts, never by the AI (08-4 §26.4 item 2, 08-0 §H): "try {site} instead" (`cards.stuck.suggestion.try_site`) · "email {business} instead (I'll ask first)" (`cards.stuck.suggestion.email`) · "open the page for you" (`cards.stuck.suggestion.open_page`) |
| Buttons | "Try another way" (Primary), "Take over" (Secondary, only when the job uses the browser), "Stop" (Secondary) |
| Try another way | summary "Trying another way · {time}"; counters reset |
| Stuck again on the new route | new stuck card with only [ Take over ] [ Stop ] |
| Stop | job **CANCELLED**, `stop_reason='stuck_stop'`, badge ⛔ `stopped` (X-80, 08-0 §G.16: the user stopped it); foo: "Stopped. Nothing was booked or paid. Here's what I found before I got stuck:" + partial results |
| No answer 15 min | job FAILED automatically, same report; toast |

- States (`cards.state`, 08-0 §G.2): `asking` (pending; submitting and offline are looks of it), `other_way` (Try another way), `taken_over` (Take over), `stopped` (Stop), `timed_out` (no answer 15 min: job FAILED, summary grey "Stopped after 15 minutes without an answer. Nothing was booked or paid."); read-only in history shows the summary.
- Keyboard: Ctrl+Enter = Try another way. Narrator: "Stuck: I'm stuck on the {Goa} job." (assertive on arrival). Groups: never. Toast: "{agentName} · I'm stuck on the {Goa} job." [ Open ]; taskbar yellow.
- Logged: tech log (rule that fired, cost so far, the choice); activity `stopped_job` (kind `stopped`) only when the user taps Stop; site note "search loop on {date}".
- Test ids: root `card-stuck`; `card-stuck-other-way`, `card-stuck-take-over`, `card-stuck-stop`.
- Sources: JRN J19.4; ChatGPT blocker brief (GPT §9.8); Perplexity loop rule (PPX §9.2); Hermes stuck warning, fail closed (HRM §5, §9.2).

---

## §5.20 Error card

**Purpose.** Every problem in one shape: what happened, what is safe, one fix button `[Article 2; JRN C16, J19]`.

**Trigger.** Any failure the user must know about (J19). Posted in the chat where the user is, else foo's chat.

### 5.20.1 Anatomy (`--card-w` 440px)

```
┌══════════════════════════ 1.5px --bad top edge (failures) ══════════════════┐
│ [icon 20] Claude isn't answering right now.                                  │ 22 --t-body-strong
│ Your Goa job is saved at step 3. Nothing was booked or paid.                 │ --t-body --fg-1
│ [ Try again ]  Use ChatGPT instead                                           │ one Primary + ≤ 1 Link
│                                                                     9:44 AM │
└──────────────────────────────────────────────────────────────────────────────┘
```
Edge: `--bad` for failures, `--warn` for paused/limits. Icon: `ErrorCircle` `--bad` (failures), `Clock` `--warn` (limits, waiting), `Key` `--warn` (signed out), `Globe` `--warn` (offline, site), `ArrowClockwise` `--fg-2` (recovery). JRN's leading emoji (😴 📡 🔑 🔌 💬 🚫 💾 ⏰ 🌐 🧾 🔁) are replaced by these icons (0.2 rule).

### 5.20.2 Copy (final; line 1 / line 2 / button)

| Case | Line 1 | Line 2 | Button · link |
|---|---|---|---|
| No internet | "You're offline." | "Your jobs are saved. Nothing was booked, paid or sent while offline." | [ Try again ] |
| AI service down | "{Claude} isn't answering right now." | "Your {Goa} job is saved at step {3}. Nothing was booked or paid." | [ Try again ] · "Use {ChatGPT} instead" (only if another AI passed its test) |
| Signed out of the AI | "You've been signed out of {Claude}." | "Sign in again and I'll carry on." | [ Sign in ] |
| Plan limit | "You've hit your {Claude} plan's limit until {3:00 PM}." | "Your jobs are paused, not lost." | [ Remind me at {3:00 PM} ] · "Use {ChatGPT} instead" |
| Plan limit, no reset time | "You've hit your {Claude} plan's limit until it resets." | "I'll check every 15 minutes." | [ Try again ] |
| Site changed · Site timed out · Google access revoked · Google rate limit (`SITE_CHANGED`, `SITE_TIMEOUT`, `CONN_REVOKED`, `CONN_RATE_LIMITED`) | the line 1 / line 2 / button words are the 08-3 §21.2 rows for these kinds, keys `errors.{kind_lower}.{what_happened,what_is_safe,button}` (X-136); `SITE_CAPTCHA` shows no C16 card (Sign-in-here card, §5.10) | | |
| App connection expired | "Your {Gmail} connection expired." | "Bills and drafts are on hold." | [ Reconnect ] |
| WhatsApp unlinked | "WhatsApp unlinked {agentName}." | "I can't read or send WhatsApp messages until you link again." | [ Link again ] |
| Site blocks foo | "{Site} won't let me in." | "Nothing was booked." | [ Open the page myself ] |
| Disk nearly full | "Your PC is almost out of space." | "I've stopped saving screenshots." | [ Open storage settings ] |
| Clock wrong | "Your PC's clock looks wrong." | "Reminders could fire at the wrong time." | [ Fix the clock ] |
| Browser broken | "I can't open my browser." | "Web jobs are on hold." | [ Repair {agentName} ] |
| Update failed | "{agentName} couldn't update." | "You're still on {version} and everything works." | [ Try again ] |
| Microphone blocked | "I can't hear you." | "Windows is blocking the microphone for {agentName}." | [ Open microphone settings ] |
| No microphone | "I can't find a microphone." | "Plug one in and try again." | none |
| File too big | "That file is too big." | "I can take up to 25 MB." | none |
| Crash recovery | "I closed unexpectedly at {9:42 AM}." | "{Goa stay} was at step {3} of {4}. Nothing was paid." | [ Pick up where I left off ] · "Stop it" |
| Crash mid-payment | "I closed unexpectedly at {9:42 AM}." | "I was in the middle of paying ₹{14,600}. Checking whether it went through before anything else." | none (Payment card goes CHECKING) |
| Safe mode | "{agentName} had trouble starting." | "I've paused everything so nothing runs twice." | [ Start normally ] · "Send a report" |
| Unknown | "Something went wrong on my side." | "Nothing was booked, paid or sent." | [ Try again ] |

- "Nothing was booked, paid or sent" is shown only when the activity log confirms it; otherwise line 2 lists what was done ("The email to Rakesh was sent at 9:14 AM.") `[JRN J19.6]`.
- Offline is shown only by the 03 banner strip ("Offline", `--warn`) and the composer placeholder (04-2 §20.4). There is no composer bar (X-13, UJ-08).
- Recovered: when the condition clears, the card collapses to a summary `--ok` "Fixed · {time}" and foo posts "Back on it. Picking up from step {n}."
- States (`cards.state`, 08-0 §G.2): `shown` (no fix button, e.g. No microphone, File too big), `asking` (a fix button is waiting; submitting and "still failing" (line `--t-small` "Still not working. I'll keep trying every {2} minutes.") are looks of it), `fixed` (recovered summary), `resumed` ("Pick up where I left off" tapped), `stopped` ("Stop it" tapped), `dismissed` (the condition cleared before an answer). `error.variant = 'recovery'` for the two crash rows; `'error'` for every other row. Resume edits the error card in place, it never posts a new message (08-0 §F).
- Keyboard: Ctrl+Enter = the fix button. Narrator: "Problem: {line 1}. {line 2}" assertive for failures, polite for limits.
- Groups: only group-level errors ("We're going in circles. Pausing until you reply."); job errors go to 1:1.
- Toast: per J19 notifications table (e.g. "{agentName} · Claude isn't answering. Your jobs are paused, not lost."). Logged: tech log line in `{DATA}\logs\app-*.log` (class = the `ErrorKind`, job, what was safe; redacted); activity: none (08-0 §G.4).
- Test ids: root `card-error`; the one fix button `card-error-fix`; the one Link button `card-error-link`.
- Sources: JRN C16, J19; OpenClaw terminal-command errors (OCL §8.6); Tab honest status (TAB §5); ChatGPT blocker brief (GPT §9.8); Grok "Try again" (AGT A18).

---

## §5.21 Spend-cap card

**Purpose.** Hard stop at the monthly AI cap or the monthly purchase cap, then ask `[Article 13; JRN J19.3]`.

**Trigger.** AI meter reaches 100% of the AI cap (default ₹1,000); or a pending payment would take the month's purchases over the purchase cap (default ₹25,000) `[foo decision for the purchase variant, from Article 13]`. At 80% of the AI cap foo posts one plain line, not a card: "You've used ₹{800} of your ₹{1,000} AI cap this month." (no toast).

### 5.21.1 Anatomy and copy (`--card-w` 440px)

```
┌══════════════════════════ 1.5px --warn top edge ═══════════════════════════┐
│ [Money 20 --warn] You've reached this month's AI cap (₹1,000).               │
│ I've paused 2 jobs and 4 routines. Nothing was lost.                         │
│ [ Raise cap ]  Wait until Sun 1 Nov                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```
[ Raise cap ] never edits on the card: it opens a plain confirm dialog (X-15, UJ-12): **06-3 §14 C-21** for the AI cap (typed new cap) and **C-20** for the purchase cap. There is no inline editor and no chips.

| Variant | Line 1 | Line 2 | Buttons |
|---|---|---|---|
| AI cap | "You've reached this month's AI cap (₹{1,000})." | "I've paused {2} jobs and {4} routines. Nothing was lost." | [ Raise cap ] · "Wait until {Sun 1 Nov}" |
| Purchase cap | "This payment would go over this month's purchase cap (₹{25,000})." | "You've spent ₹{21,300} this month. Nothing was paid." | [ Raise cap ] · "Not now" |
| Raised (after C-20 / C-21 confirm) | summary `--ok` footer: "Cap raised to ₹{1,500} on {Fri 16 Oct, 3:10 PM}. Carrying on."; paused jobs and routines resume (07-2 SM-A4) | | |
| Waited | summary grey: "Paused until {Sun 1 Nov}." | | |

- Raising either cap is a plain confirm dialog (06-3 §14: C-21 AI cap, C-20 purchase cap); Windows Hello is only for single payments ≥ ₹10,000 [settled: X-15]. States (`cards.state`, 08-0 §G.2): `shown`, `raised`, `dismissed` (Waited / Not now).
- The cap is a hard stop: no AI call for jobs or routines until raised or the month changes (J19.3). Purchase variant: after raising, the original Payment card (§5.6) is re-shown with a fresh 10-minute timer.
- Keyboard: Ctrl+Enter = Raise cap (opens the dialog). Narrator: "Spending cap: {line 1}". Groups: never. Toast: "{agentName} · You've reached this month's AI cap. {2} jobs paused." [ Raise cap ] (opens the chat at the card; raising happens in the app). Taskbar yellow.
- Logged: activity `cap_changed` (kind `changed`; old, new) when a cap is raised; reaching a cap and waiting are tech-log lines.
- Test ids: root `card-spend-cap`; `card-spend-cap-raise`, `card-spend-cap-wait`, `card-spend-cap-not-now`.
- Sources: JRN J19.3; Autopilot alert-not-stop complaint (APL §9.11); OpenClaw/Perplexity cost incidents (OCL §8.1; PPX §8); BP1 side panel "Spent this month".

---

## §5.22 Table card

**Purpose.** Show a structured comparison a job produced (flights, bills, plans) as a real table with a title, instead of a markdown table in a bubble `[foo decision; AIC #8 rules-only tables; GRK morning report sections]`. Markdown tables inside ordinary replies are rendered by 04 with the same cell styles.

**Trigger.** A job result with ≥ 3 rows and ≥ 2 columns of like items.

**Payload.** 08-5 §4.1 `TablePayload`; one field per element below (`bestRowIndex` is the highlighted row) (X-129).

### 5.22.1 Anatomy (`--card-w-wide` 600px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Delhi flights on Fri 23 Oct                                     6 options    │ 22 title · count --t-caption --fg-3
│ ┌──────────┬────────────┬─────────┬──────────┐                               │
│ │ AIRLINE  │ LEAVES     │ ARRIVES │    PRICE │  header --t-caption-strong     │ bg --bg-sunken
│ ├──────────┼────────────┼─────────┼──────────┤                               │ 1px --line rules (rows only)
│ │ IndiGo   │ 10:15 AM   │ 12:20 PM│   ₹5,240 │  --t-small, padding 8×12       │
│ │ Air India│ 7:10 AM    │ 9:15 AM │   ₹4,890 │                               │
│ └──────────┴────────────┴─────────┴──────────┘                               │
│ Show all 12 rows · Copy table                                       9:22 AM │ Link buttons
└──────────────────────────────────────────────────────────────────────────────┘
```
- Header cells: `--t-caption-strong` uppercase, tracking +0.08em, `--fg-2`, bg `--bg-sunken`. Body cells `--t-small` `--fg-1`; padding 8px 12px (`--s1` `--s2`); horizontal rules only, 1px `--line`; numeric columns right-aligned `tabular-nums`; first column `--t-small` at weight 600.
- Max 6 columns; max 10 rows visible, then "Show all {n} rows" expands in place. Wider than the card → the table scrolls horizontally inside the card (visible scrollbar, no fade).
- Copy: "Show all {n} rows", "Copy table" (copies tab-separated text; toast-free confirmation: the link reads "Copied" for 2s).
- States: rest, row hover `--bg-hover` (only when rows are clickable: a row may open a §5.3-style pick), focus, expanded, read-only. Offline: unchanged.
- Keyboard: the table is `role="table"`; Tab reaches the two links; when rows are clickable the table is a `role="grid"` with arrow navigation. Narrator: "Table: {title}, {rows} rows, {cols} columns".
- Test ids: root `card-table`; `card-table-show-all`, `card-table-copy`; rows `card-table-row` (`data-index`).
- Groups: allowed. Toast: none. Logged: card row (data); `cards.state` `shown`. Sources: AIC #8 (Claude rules-only tables); OCL §19 tables → "label: value" lines on chat channels (foo is its own app, so it keeps real tables); GRK §2 row 28.

---

## §5.23 File card and link preview

**Purpose.** Show files foo made or received and links, so the user can open them in one click `[AGT A13; MSG §7]`.

### 5.23.1 File card (height 56px, `--card-w`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [▢ Document 24 in 40×40 tile]  Goa trip plan.pdf                              │ name --t-body-strong, middle ellipsis
│                                PDF · 240 KB                                  │ --t-caption --fg-3
└──────────────────────────────────────────────────────────────────────────────┘
```
- Padding 8px 12px; icon tile 40×40, `--r-sm`, bg `--bg-sunken`, `Document` (or `Image`) 24px `--fg-2`. Whole card is a button: click = Open (default app). Context menu: "Open", "Show in folder", "Save as…". Files live in `Documents\foo\{job title}\` (JRN §3).
- States: generating (spinner 16 in the tile + "Making {name}…"), ready, hover (`--shadow-4`), focus, missing ("I can't find this file. It was moved or deleted." + Link "Show folder"), deleted ("File removed" grey), read-only.
- Images: shown inline, radius `--r-md`, max `--card-w` wide and `--card-w` tall, click → attachment viewer (06 §13). Alt text = file name.
- Payload: 08-5 §4.1 `FilePayload`; one field per element above (X-129).

### 5.23.2 Link preview (`--card-w`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [ image, full width, aspect 1.91:1, top corners --r-lg ]                      │ optional
│ Taj Holiday Village Goa | Official site                                      │ --t-body-strong, 2-line clamp
│ Beachfront cottages in Sinquerim with three restaurants and a spa.           │ --t-small --fg-2, 2-line clamp
│ tajhotels.com                                                                │ --t-caption --fg-3
└──────────────────────────────────────────────────────────────────────────────┘
```
- Info block bg `--bg-sunken` (WhatsApp grey info block); whole card = button; click opens the **default browser** (never foo's job browser). The domain line is always shown, so the user sees where the link goes.
- Preview fetched locally by foo, only for links foo found or the user sent; failures show a link-only row (`Globe` 16 + domain + URL `--fg-2`).
- Payload: 08-5 §4.1 `LinkPreviewPayload`; one field per element above (X-129).
- Keyboard: one Tab stop; Enter opens. Narrator: "Link: {title}, {domain}". "File: {name}, {type}, {size}".
- Groups: allowed (files and links are shareable; private documents from `Documents` attached by the user to a 1:1 stay 1:1). Toast: as the message ("{chat} · 📎 {name}"). Logged: card row (`cards.state` `shown`); a file foo created is a tech-log line (path), not activity.
- Test ids: `card-file` (whole card; menu `card-file-menu-open`, `card-file-menu-show`, `card-file-menu-save-as`, missing-file link `card-file-show-folder`); `card-link-preview` (whole card).
- Sources: AGT A13 file chip 56; MSG §7 WhatsApp/Signal link preview; GRK §2 rows 14–15; Gemini real files (GEM §9.10).

---

## §5.24 Place card (location) — v1 decision

**Decision.** v1 ships a **Place card without a map image**. A live map needs a third-party map service, a key, and sending locations to that service; the blueprint lists no map, and the user's location is not read in v1 `[foo decision; Article 15 privacy; Article 30 do less]`. An embedded map is "Later" (log in `GAPS.md` if a journey needs it).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Location 20] Pizza by the Bay                                               │ 22
│ 143 Marine Drive, Churchgate, Mumbai 400020                                  │ --t-small --fg-2
│ 2 min walk from the beach · Open until 11:30 PM                              │ --t-small --fg-2
│ [ Open in Maps ]  [ Copy address ]                                           │ 40, Secondary both
└──────────────────────────────────────────────────────────────────────────────┘
```
- Payload: 08-5 §4.1 `PlacePayload`; one field per element above (`mapsUrl` opens Maps) (X-129).
- "Open in Maps" opens `payload.mapsUrl` (`https://www.google.com/maps/search/?api=1&query={url-encoded name + address}`) in the default browser. "Copy address" copies the address; the button reads "Copied" for 2s.
- Trigger: a result names a place the user may go to (booking result, restaurant pick, "where is…"). Never shows the user's own home address in a group (Article 14); in 1:1 the user's home is shown only when the user asked for it.
- States: rest, hover, focus, offline ("Open in Maps" disabled with the offline tooltip), read-only. Keyboard: two Tab stops. Narrator: "Place: {name}, {address}". Groups: allowed except home/private addresses. Toast: none. Logged: card row (`cards.state` `shown`). Test ids: root `card-place`; `card-place-open-maps`, `card-place-copy`. Sources: INS location notice (INS §2); foo decision.

---

## §5.25 Voice note (in and out)

**Purpose.** Talk instead of type; foo answers with a voice note when the user sent one `[Article 23; JRN J7; BP1 pin 10]`.

**Trigger.** In: the user releases the hold-to-talk (Ctrl+Space or the mic, 04 composer). Out: foo replies to a voice note and Settings → Chat and voice → "Voice replies" [X-07] is "When I send voice" (default) or "Always".

### 5.25.1 Anatomy (a bubble, not a card frame; width `min(--card-w, --bubble-max)`)

```
User (right, --bubble-me):
┌──────────────────────────────────────────────────────────────┐
│ (▶)  ▂▃▅▇▅▃▂▁▂▃▅▆▅▃▂▁▂▃▅▇▆▅▃▂   0:14                 9:41 ✓✓ │  play 36, waveform, duration
└──────────────────────────────────────────────────────────────┘
  ok book the Goa hotel then, under ₹8k a night, near the…  more   ← transcript --t-small --fg-2, 2 lines
foo (left, --bubble-foo):
┌──────────────────────────────────────────────────────────────┐
│ (▶)  ▂▃▅▇▅▃▂▁▂▃▅▆▅▃▂▁▂▃▅   0:09   [1×]                  9:42 │  speed chip
└──────────────────────────────────────────────────────────────┘
  Show text                                                       ← Link; expands foo's text, word highlight
```

| Part | Value | Test id |
|---|---|---|
| Play/Pause | round button `--btn-round` 36px, `--r-full`; foo bubble: bg `--accent`, icon `Play`/`Pause` 20 `--on-accent`; user bubble: bg `--on-bubble-me`, icon `--bubble-me` | `bubble-voice-play` |
| Waveform | bars 2px wide (`--s-1`), 2px gaps, heights 4–24px from the audio level (40 bars max), `--r-full`; played part `--accent` (foo) / `--on-bubble-me` (user); unplayed `--fg-3` / `--on-bubble-me-2` | `bubble-voice-wave` |
| Duration | `--t-caption`, `tabular-nums`; counts down while playing | `bubble-voice-duration` |
| Speed chip | 0.3 Chip "1×" → "1.5×" → "2×" → "1×"; foo voice notes only | `bubble-voice-speed` |
| Transcript | under the bubble, `--t-small` `--fg-2`, collapsed to 2 lines + Link "more" | `bubble-voice-transcript`, `bubble-voice-more`, `bubble-voice-show-text` |
| Word highlight (foo, while playing with text shown) | current word bg `--accent-soft` `[GRK §2 row 18]` | — |

### 5.25.2 Copy and states (final)

| State | Copy / look |
|---|---|
| Transcribing (≤ 3s) | transcript line: spinner 16 + "Writing it down…" |
| Transcribed | transcript text |
| Low confidence | foo: "I heard: '{text}'. Right?" [ Yes ] [ No, let me retype ] |
| Transcription failed | transcript line `--bad`: "I couldn't make out that voice note. Try again, or type it." (bubble stays playable) |
| foo voice skipped (numbers, links, addresses, > 60 s) | text reply only, ending "(Too long to read out, here it is in text.)" |
| Text-to-speech failed | text reply only, no error |
| Playing / paused / played | icon swap; played bars coloured |
| Deleted after the kept time | bubble replaced by `--fg-3` line "Voice note deleted after {30} days. The text is still here." (`{30}` = `privacy.voiceDays`, 7 or 30; never deleted when it is `null` "Keep", 08-0 §A) |
| Offline | playback works (local file); transcription waits; ⏳ badge per J19 |
| Read-only in history | playable until deleted |

- Never auto-plays `[JRN J7]`. Recording UI is 04's.
- Keyboard: play button Tab stop, Space/Enter toggles; the waveform is a `role="slider"` (← / → seek 5s, Home/End); speed chip Enter cycles. Narrator: "Voice note from {sender}, {14} seconds. Transcript: {text}". Motion: none beyond icon swap (no animated waveform).
- Groups: allowed (helpers reply in voice only to a user voice note). Toast: "{chat} · 🎙 Voice note (0:12)" [ Open ], never auto-plays.
- Logged: message row (`messages.kind='voice'`, not a card) with duration and transcript; audio in `{DATA}\voice\` kept per `privacy.voiceDays`; activity: none.
- Sources: JRN J7; Grok voice memo with highlighted transcript and speed (GRK §2 row 18); OpenClaw voice in/out (OCL §4); Instinct voice notes (INS §2); BP1 "Human manners" ▶ 0:14.

---

## §5.26 New tokens requested (for `02-foundations.md`)

[settled: all tokens and icons below were added to `02-foundations.md` F2/F5/F6/F7 on 2026-10-16]

Tokens already requested by 06 §0.11 and used here unchanged: `--on-bad`, `--on-warn`, `--live`, `--banner-h`, `--qr-bg`, `--qr-fg`.

| Token | Light | Dark | Used for | Reason |
|---|---|---|---|---|
| `--card-w` | 440px | 440px | standard card width (§0.2) | BP1 card = 82% of ≈536px column ≈ 440px [measured]; fits a 72-char line at 15px |
| `--card-w-wide` | 600px | 600px | brief, option tiles, table card | 3 tiles of ≥ 180px + gaps; stays under the 680px rich-bubble cap (02 F5) |
| `--thumb` | 72px | 72px | option photo in the narrow tile layout | AIC #21 72px attachment tile; OCL 64px option thumbnail rounded to the 4px grid |
| `--logo` | 32px | 32px | app logo on Connect cards and permission approvals | AGT A9 "app logo 32" |
| `--qr-size` | 200px | 200px | WhatsApp link QR | foo decision: scannable from 30–40 cm by phone cameras; 06 requested only its colours |
| `--signin-w` / `--signin-h` | — | — | removed from 02 F5 (X-66, X-121): sign-in happens in the real Edge window with a docked banner (§5.10.3); Edge is never resized | — |
| Motion **M-1** `--m-card` | = `--m-normal` (167ms) with `--ease-standard` | same | card state change: content cross-fade + height (§0.8) | 02 F7 "what animates (and nothing else)" has no line for card collapse; without it every collapse is an instant jump |
| Icons (02 F6 list) | Fluent Regular: `TaskListLtr`, `Location`, `Play`, `Pause`, `Delete`, `Send`, `Info` | — | Plan card, Place card, voice note, delete approvals, WhatsApp send approval, banners (06 uses `Info`) | not in the required icon list |

No new colours are requested.

---

## §5.27 Conflicts and how this chapter resolves them

| # | Conflict | Resolution |
|---|---|---|
| 1 | Card buttons: BP1 draws pills (`border-radius:999px`); 06 §0.4 uses `--r-sm` and says 05 wins on a mismatch. | Cards use `--r-full` pills (BP1 is Vikas-approved). 06 dialogs/pages may keep `--r-sm`; **main must decide** whether to unify. Logged here, not guessed further. [settled: X-01: pills everywhere] |
| 2 | JRN C4 and BP1 show scope chips (Just this once / For this chat / Always) on a **send email** approval; J12 offers "Don't ask for Rakesh". Article 4 ("approving one send never approves the next") and Article 5 ("anything that cannot be undone … always ask") forbid skipping a send. | Articles win. Scope is never shown on sends; send cards say "I'll always ask for this one." Scope stays for using an app, calendar changes and reversible email moves (§5.5.3). J12 step 7 ("Next time, send emails to Rakesh without asking?") is dropped. [settled: X-03] |
| 3 | JRN C4/C6 decline label "No"; JRN "Book it"; 02 F10 says buttons name action + object and soft cancel is "Not now". | F10 wins: "Not now"; "Book table / Book stay"; "Send email / Send message". The Draft card's Send is labelled "Send email"/"Send message" (matches GRK). "Go" (Plan) and "I'm done / Take over / Skip" (Sign-in) are kept as drafted. [settled: X-04] |
| 4 | JRN C4 "2 px coloured border"; AGT A4 "3 DIP amber left edge"; 02 F4 "1.5px `--accent` on a pending approval card's top edge". | 02 F4 wins: 1.5px top edge, `--accent` pending; `--bad` failed; `--warn` held/checking/stuck/limits. |
| 5 | JRN copy uses leading emoji as card icons (💳 📝 🔑 ⏰ 🗺 🧠 ✓ ⚠ 😴 …); 02 F6 "emoji are content, never icons". | System cards render the mapped Fluent icon and keep the words (§0.2). The brief greeting "☀️" and foo's chat text keep emoji. |
| 6 | JRN C4 footer "Expires {time}" (time only) vs Article 21 absolute times. | "Expires Fri 16 Oct, 10:14 AM". Countdowns ("Expires in 9:59") stay, with the absolute time in tooltip and Narrator. |
| 7 | BP1 secret box title "OpenAI **API** key"; Article 2 bans "API". | "OpenAI key" (JRN C7 already says so). |
| 8 | Brief asked for memory chip copy "I'll remember: …"; JRN C14 says "Saved: {fact} · Undo". | Kept JRN ("Saved: …"): the task says keep drafted copy unless an article breaks; none does. Main may switch with one string change. [settled: X-05: "I'll remember: {fact}" + "Undo"; §5.17 updated] |
| 9 | JRN J16 "I've asked Vikas in **his** own chat". | "their own chat" (no gender is guessed). |
| 10 | JRN C3 "★" before option 1. 02 F6 has no star icon; emoji/glyphs are not icons. | The "Best fit" tag carries the meaning; no ★. "4.4★" ratings stay as content text. |
| 11 | JRN example dates use 2025 weekdays (e.g. "Thu 16 Oct", "Sat 18 Oct", "Wed 10 Dec"); in 2026 these are Fri 16 Oct, Sun 18 Oct, Thu 10 Dec. | Examples here use 2026 weekdays. Copy templates are unaffected. [settled: X-10] |
| 12 | JRN J12 5-second undo "bar"; 02 F7 has no progress-bar animation. | "Sending in 5…" text countdown (number swaps, no animation). |
| 13 | AGT A4 lets a 👍 reaction approve low-risk actions; Article 6 says reactions never approve Approval or Payment cards. | Article 6 wins; reactions answer Choice cards only. |
| 14 | 06 §0.4 icon button 36px; 02 F5 touch target ≥ 40px. | Card icon buttons are 40×40 (§0.3). |
| 15 | Purchase-cap behaviour is in Article 13 but not in JRN. | §5.21 purchase variant, marked `[foo decision]`. |
| 16 | Location/map card is not in BP1 or JRN. | v1 = Place card without a map (§5.24). |
| 18 | Toast buttons and receipt window: JRN J20 gives non-hard-limit approval toasts an [ Approve ] button and payments a separate receipt window. | Coordinator binding decision (03/09): approval and payment toasts carry only [ Review ] [ Not now ]; Review opens the card in the main window; no receipt window. §5.5.6 and §5.6.5 follow it; 06 §11.4 "Receipt window" should be removed. [settled: X-02; 06 §11.4 removed] |
| 19 | §5.10.3 drew a 720×640 foo window showing the site; X-66 makes Edge always external. | The sign-in and take-over surface is the real Edge window plus the docked `signin-banner.html` (§5.10.3; 09 §9.27 owns the window). [settled: X-66] |
| 20 | §5.9 showed the first 7 characters of a caught secret and unmasked it on Esc; 04 masks the whole span. | Whole span "••••", stays masked on Esc (08-0 §H). |
| 21 | §5.21 had an inline "Raise cap" editor with chips; X-15 says raising a cap is a plain confirm dialog. | Dialogs C-20 (purchase) and C-21 (AI) in 06-3 §14; the card only opens them. [settled: X-15, UJ-12] |
| 22 | J11 and the walkthrough show a Bill card that 05 did not define. | §5.29 Bill card (type `bill`, X-56): UX-06 look, UJ-01 reminder and duplicate rules, UX-31 scam copy. |
| 17 | Ctrl+J (jump to the card that needs you) and Alt+D (sign-in window "I'm done") are new shortcuts. | Listed here; 09-windows must list them and wins on a clash. [settled: X-09, X-21: 09 §9.17.1 lists both; the Details toggle moved to Ctrl+Shift+D] |

---

## §5.28 Source index (evidence used, by file and section)

| File | Sections used |
|---|---|
| `research/journeys-1.md` | §2 C1–C17, §3 storage map, §4 job state machine, §5 approval state machine, J4 |
| `research/journeys-2.md` | J6 brief, J7 voice, J8 choices, J9 restaurant, J10 hotel + payment, J11 bills + habit offer, J12 drafts, J13 sign-in |
| `research/journeys-3.md` | J14 routines, J15 helpers + handoff, J16 groups, J17 memory, J18 watch live + stop |
| `research/journeys-4.md` | J19 errors, stuck, caps, crash; J20 toasts |
| `ui-evidence/agent-surfaces-2.md` | A3 progress, A4 approval, A5 draft, A6 secret, A8 take over, A9 connect, A10 payment, A11 question, A12 routine, A13 files, A14 handoff, A18 errors |
| `ui-evidence/ai-chat-apps.md` | §6.3 progress, §7 cards, #8 tables, #20 Ctrl+Enter, #21 72px tiles, #31 question card, #32 progress card, #34 take over |
| `ui-evidence/openclaw-ui-1.md` | §7.1 question card (rows, Other, secret field, eye 40px), §7.2 approval card (scope line, shortcuts), §7.4 notice line, progress card |
| `ui-evidence/hermes-desktop-1.md` | §7 approval card stack, Always-allow confirm, secret/sudo/OTP dialogs, clarify rows |
| `ui-evidence/messenger-shell.md` | §7 link preview, file row, WhatsApp reply buttons |
| `grok/04-deep-dive.md` | §1.1 four lanes, §1.2 secret card, §1.3 Secure Form, §1.4 take over + connect, §1.5 leaks, §2 card catalogue |
| `instinct/04-deep-dive.md` | §1.1–1.5 bookings, options, paying; §2 touches; §3 output; §5 steal list |
| BP1 `foo-blueprint.html` | hero pins 3–10; pattern gallery (secret box, paste catcher, sign-in, approval, choices, draft, plan, proof, routine, manners, groups, habit offer, toasts); key flows |

---

## §5.29 Bill card

**Purpose.** One card per bill: what is due, by when, and one tap to pay, be reminded, or say it is already paid. This card never pays: "Pay now" leads to the Payment card (§5.6), which is the only tap that authorises money `[Articles 5, 7; JRN J11; walkthrough ch. 11; UX-06, UJ-01, UJ-26, UX-31]`.

**Type and payload.** `cards.type = 'bill'` (08-0 §G.1). Field names are 08-5 §4.1 `BillPayload` (X-115); this list only says what each draws: `billId` (`bill_` id, never shown), `biller` ("Airtel": title, source chip, buttons), `billerSite` ("airtel.in", from `billers.json` or the sender domain: the live-amount check and the scam rule), `payUrl?` (the pay link checked by the scam rule; never opened unless it is on `billerSite`), `amountPaise` (title), `dueOn` (title, Remind me, overdue look), `accountMasked?` ("••7741", source line), `period?` ("September"), `source` (`BillSource`, 08-0 §B.2: which source line) with `sourceRef?` (gmail or wa message id: the source chip) and `sourceAttachmentId?` (photo or file bills, J28: the source chip opens it), `receivedAt` (source line date), `alsoReceived` (epoch ms of folded duplicate emails: the "Also received" lines), `remindAt?` (Reminder set summary), `duplicate` and `scam` (the two looks), `lastPaid?` `{ amountPaise, at, paymentId }` (duplicate body, only when `duplicate`), `paidAt?` (Paid summary).

**Where and trigger.** The Money helper's 1:1 chat; foo's 1:1 chat when there is no Money helper. The `bill_watch` builtin (08-3 §13.3; X-115) posts the card when a bill email arrives, or when the user forwards or pastes a bill and asks to pay it. The brief item "Airtel bill ₹1,179 due Fri 23 Oct. Sent to Money." (§5.1) opens this card. Never in groups (Article 14).

### 5.29.1 Anatomy (`--card-w` 440px; frame §0.2, no status edge: the card is not gated)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Receipt 20] Airtel bill ₹1,179 due Fri 23 Oct.                         bill │ 22  --t-body-strong · label --t-caption --fg-3
│ From your email on Fri 9 Oct · account ••7741                                │ --t-small --fg-2
│ Also received Sat 10 Oct                                                     │ --t-caption --fg-3 (only when folded)
│ [ Pay now ]  [ Remind me Thursday ]  I already paid                          │ 40  Primary · Secondary · Link
│                                                                     8:02 AM │
└──────────────────────────────────────────────────────────────────────────────┘
[✓ From: Airtel email, Fri 9 Oct · open]                                  ← source chip, §5.15 chip look, 4px below
```

| Part | Value | Test id |
|---|---|---|
| Header icon | `Receipt` 20 `--fg-2`; duplicate and scam looks: `Warning` 20 `--warn` | — |
| Title | `--t-body-strong`, wraps, never ellipsised | `card-bill-title` |
| Right label | "bill" `--t-caption` `--fg-3`; overdue: "Overdue" `--t-caption-strong` `--bad` | `card-bill-label` |
| Source line | `--t-small` `--fg-2` | `card-bill-source` |
| Also received | `--t-caption` `--fg-3`, one line per folded copy (max 3, then "+{n} more") | `card-bill-also` |
| Pay now | Primary (§0.3), label "Pay now" | `card-bill-pay-now` |
| Remind me | Secondary; hidden when the due date is today or past | `card-bill-remind` |
| I already paid | Link button | `card-bill-already-paid` |
| Source chip | §0.3 Chip with the §5.15 proof-chip colours (`--ok-soft` / `--ok`), `Mail` 16 instead of the check; opens the bill email in the default browser (forwarded bills: opens the message in the chat) | `card-bill-source-chip` |
| Duplicate buttons | Secondary "Not now" first, then Secondary "Pay again" in the destructive outline style (text `--bad`, 1px `--bad` border; 06-2 §8.3 "Delete" style); never a Primary (§0.3) | `card-bill-not-now`, `card-bill-pay-again` |
| Scam button | Secondary "Open {Airtel}'s site"; no Primary on this look | `card-bill-open-site` |

### 5.29.2 Copy (final; key per §0.4)

| Slot | Copy | Copy key |
|---|---|---|
| Title | "{Airtel} bill ₹{1,179} due {Fri 23 Oct}." | `cards.bill.title` |
| Title, overdue | "{Airtel} bill ₹{1,179} was due {Fri 23 Oct}." | `cards.bill.title.overdue` |
| Right label | "bill" / "Overdue" | `cards.bill.right_label`, `cards.bill.right_label.overdue` |
| Source line (`source = gmail`) | "From your email on {Fri 9 Oct} · account {••7741}" | `cards.bill.source.gmail` |
| Source line (`chat`: forwarded or pasted) | "You sent this on {Fri 16 Oct}" | `cards.bill.source.chat` |
| Source line (`whatsapp`) | "From WhatsApp on {Fri 16 Oct}" | `cards.bill.source.whatsapp` |
| Source line (`photo`, 12-2 §12.28.4) | "From your photo, {Fri 16 Oct}" ("From a photo you sent") | `cards.bill.source.photo` |
| Source line (`file`, 12-2 §12.28.4) | "From {Electricity-Sep.pdf}, {Fri 16 Oct}" ("From {file name}") | `cards.bill.source.file` |
| Source line (`biller_site`, 12-1 §12.26.4) | "From {BESCOM}'s site, {Fri 16 Oct}" | `cards.bill.source.biller_site` |
| Also received | "Also received {Sat 10 Oct}" | `cards.bill.also_received` |
| Source chip | "From: {Airtel} email, {Fri 9 Oct} · open" | `cards.bill.source_chip` |
| Pay now | "Pay now" | `cards.bill.pay_now` |
| Remind me | "Remind me {Thursday}" / "Remind me {Thu 29 Oct}" / "Remind me tomorrow" (rule 5.29.3 #1) | `cards.bill.remind`, `cards.bill.remind.date`, `cards.bill.remind.tomorrow` |
| I already paid | "I already paid" | `cards.bill.already_paid` |
| Paper amount differs (`paper_amount_differs`, photo or file bills on Pay now, 12-2 §12.28.4) | "Your {photo} says ₹{1,179}; {Airtel}'s site now says ₹{1,279}. I'm using the site's amount." (`{photo}` = "photo" or "file"; `--t-small` `--fg-2`, shown above the Payment card) | `cards.bill.paper_amount_differs` |
| Paying | the buttons give way to one line `--t-small` `--fg-2`: "Paying… see the card below." + Link "See it" (focuses the Payment card) | `cards.bill.paying`, `cards.bill.see_it` |
| Reminder set (summary) | "Reminder set · {Thu 22 Oct, 9:00 AM}" (`Clock` 16 `--fg-3`) | `cards.bill.summary.reminded` |
| Reminder fires (foo line in this chat) | "Reminder: your {Airtel} bill of ₹{1,179} is due tomorrow, {Fri 23 Oct}." + Link "See the bill" | `cards.bill.reminder_message` |
| Reminded footer (after the reminder fires; the card is back to its buttons) | footer `--t-caption` `--fg-3`: "I reminded you on {Thu 22 Oct}." (X-115) | `cards.bill.footer.reminded_on` |
| No due date in the email (X-136; 08-4 §26.14: treated as due in 7 days) | due line replaced by `--t-caption` `--fg-3`: "Due date not in the email" | `cards.bill.no_due_date` |
| Paid (summary) | receipt line "Paid ₹{1,179} · {Airtel} · ref {ref}" (same as the Payment card's COMPLETED line, §5.6.3) (`CheckmarkCircle` 16 `--ok`) + the Payment card's proof chip (§5.15) | `cards.bill.summary.paid` |
| Already paid (summary, state `already_paid`) | "Noted. I won't mention this bill again." (`--fg-2`) + the §5.16 chip "⚠ Not checked live" (foo did not check the payment on the live site) | `cards.bill.summary.already_paid`, `cards.not_live_chip.chip` |
| Duplicate: title | "You already paid this bill" | `cards.bill.title.duplicate` |
| Duplicate: body | "You paid {Airtel} ₹{1,179} on {Fri 16 Oct, 8:31 AM}. Pay it again?" | `cards.bill.body.duplicate` |
| Duplicate: buttons | "Not now" · "Pay again" | `cards.bill.not_now`, `cards.bill.pay_again` |
| Duplicate: Not now (summary) | "Okay, I won't pay it again." (`--fg-2`) | `cards.bill.summary.not_again` |
| Scam: title (rule 7 below, UX-31) | "This bill looks odd" | `cards.bill.title.scam` |
| Scam: body | "This email's pay link doesn't go to {Airtel}'s own site, so I won't use it." (`--t-small` `--warn`) | `cards.bill.body.scam` |
| Scam: button | "Open {Airtel}'s site" | `cards.bill.open_site` |
| Expired (summary) | "Past due. Tell me if you still want to pay it." (`--fg-2`) | `cards.bill.summary.expired` |
| Offline | the §0.5 offline line; Pay now and Pay again disabled; Remind me and I already paid stay enabled | `cards.common.offline_line` |

### 5.29.3 Rules (MUST)

1. **Which day "Remind me" names (UJ-01, UJ-26).** Let *r* = the due date minus 1 day. If *r* is after today and within the next 6 days, the button reads "Remind me {weekday}" in full ("Thursday"). If *r* is 7 or more days away, it reads "Remind me {Thu 29 Oct}" (Article 21). If *r* is today or past and the due date is after today, it reads "Remind me tomorrow" and reminds on the due date. If the due date is today or past, the button is hidden. Weekdays are always computed from the real date (X-10). The reminder fires at **9:00 AM** local time on that day (UJ-01, 07-2 D-41; X-103 corrects the walkthrough's 10:00 AM); inside quiet hours it waits for the end of quiet hours (Article 19).
2. **Remind me** creates a `once` routine owned by this chat (08-3 §13.2) with a notification on; it counts as something the user asked for, so it is outside the 3-a-day budget. The card collapses to "Reminder set · …". When it fires, foo posts the reminder line, the card returns to `waiting` with its buttons and the "I reminded you on …" footer.
3. **Pay now** starts a normal job in this chat: the checklist (§5.2) first shows "Checking the live amount on {airtel.in}" (foo's Edge window, 08-0 §G.8), then the Payment card (§5.6) appears with the exact live amount (a different amount uses §5.6.2 "Live amount differs"). Payment COMPLETED → this card `paid`; Payment DECLINED, EXPIRED, FAILED or WITHDRAWN → this card returns to `waiting`.
4. **I already paid** → `already_paid`; the bill routine marks this `billId` as handled so it never posts it again; no proof and no activity row are written (Article 11 covers only foo's own actions).
5. **Folded copies.** A second bill email from the same biller for the same amount within 3 days is folded into the open card as an "Also received" line; there is never a second card for it.
6. **Duplicate look** (`duplicate = true`): a `paid` activity row (outcome `done` or `unknown`) to this biller for the same amount exists in the last 7 days. The card shows the duplicate title, body and buttons instead of Pay now / Remind me / I already paid. "Pay again" runs rule 3; "Not now" → `already_paid` with the "Okay, I won't pay it again." summary. For bills this replaces the §5.6.2 duplicate Choice card.
7. **Scam look** (`scam = true`, the 08-2 §5 scam guard: the email's pay link does not go to the biller's own site): no Primary; the scam title and body; "Open {Airtel}'s site" opens `billerSite` from foo's biller list in the user's default browser, never the email's link; "I already paid" stays as a Link. 08-2 §5's unfinished "This bill email looks odd…" line points here (UX-31).
8. **Overdue and expiry.** After the due date the title and right label switch to their overdue copy and the buttons stay (Remind hidden). At due date + 30 days, unpaid: `expired`, buttons removed, expired summary.
9. Typing "pay it" or "pay the Airtel bill" in this chat equals tapping Pay now (it only leads to the Payment card, Article 3). A 👍 reaction does nothing to this card.

### 5.29.4 States (`cards.state`, 08-0 §G.2)

| State | Look |
|---|---|
| `waiting` | as anatomy (also the duplicate, scam and overdue looks, and after a reminder fired) |
| `reminded` | summary row "Reminder set · …" |
| `paying` | the "Paying… see the card below." line in place of the buttons |
| `paid` | summary row `--ok` + proof chip |
| `already_paid` | summary row `--fg-2` + "⚠ Not checked live" chip (§5.16) |
| `expired` | summary row `--fg-2` |
| Read-only in history | summary; expanded view shows the card as it was, with the source chip |

### 5.29.5 Keyboard, Narrator, motion, groups, toast, logged, tests, sources

- Tab: Pay now → Remind me → I already paid → source chip. Ctrl+Enter does nothing on this card (it only leads to money; 09 §9.17.4).
- Narrator card name "Bill"; label "Bill: {Airtel} bill, ₹1,179, due Friday 23 October." Buttons: "Pay now, ₹1,179 to Airtel", "Remind me Thursday 22 October at 9 AM", "I already paid". Duplicate and scam looks are announced assertively with their title.
- Motion: arrival; M-1 for collapses. Groups: never. Toast (window not focused; follows the routine's notification setting): "{Money} · {Airtel} bill ₹{1,179} due {Fri 23 Oct}." [ Open ].
- Logged: card row; activity: none from this card (the Payment card writes `paid`, §5.6.5); remind, already paid, duplicate and scam are tech-log lines.
- Test ids: root `card-bill`; the Test id column of 5.29.1.
- Tests (10-acceptance, group F): AT-151 the card appears from a bill email with the exact amount and due date; AT-152 "Remind me {day}" names the right day (rule 1) and creates a once routine at 9:00 AM; AT-153 "I already paid" silences that bill; AT-154 a second copy within 3 days folds, never two cards.
- Sources: JRN J11; walkthrough ch. 11 steps 87, 93, 94 (Bill, duplicate, scam); UX-06; UJ-01; UJ-26; UX-31.
