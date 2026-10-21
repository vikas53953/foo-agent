# CR-0040: a job that needs Google while it is not connected shows the Connect card first

- **Asked by:** Vikas, 2026-10-21 07:14Z (project chat): "keep on doing the end-to-end testing until you see that everything is
  working … Do not wait for any go or approval from me". The real-AI run 8 (Claude CLI, main 516a344) found it. The coordinator
  routed it to the thread "Waiting plans block new asks" and gave the number.
- **Why:** with Google not connected, "Read my latest Gmail" got a Choice card "Which email do you want me to read?" (Gmail /
  Outlook / Yahoo Mail / Something else) instead of a Connect Gmail card. Intake did the right thing: replayed 3 times through
  the Claude CLI with foo's intake prompt, all 3 chose `kind: 'job'` with `needsApps: ["gmail"]`. But the engine never reads
  `needsApps`. The job started, its catalogue listed no Gmail tools (08-4 §27.1: Google tools only while a Google connection
  exists), and its first step asked which email. 05-3 §5.11 names "a job that needs an app that isn't connected" as a Connect
  card trigger, but no engine section says when or how the card is posted.
- **Spec sections:** 08-2 §5.3.3 (job creation, new first rule); 05-3 §5.11 Trigger and the `one_app` row of §5.11.2 (the fixed
  lines); DECISIONS X-198.
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-198 (his messages 2026-10-18 14:56Z and 14:59Z, and
  2026-10-21 07:14Z; after the independent review in §(d))
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

None. The test is `test/integration/connect-first.test.ts`, which replays run 8 with the CLI's real intake answer, titled by CR.

## (b) Spec before → after

| #   | What the run saw                                 | Spec before                                                     | Spec after                                                                                                                                                                                             |
| --- | ------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | "Which email do you want me to read?" (job step) | 08-2 §5.3.3: every `kind:'job'` inserts a job row and its steps | First rule: `needsApps` with a Google app while Google is not connected → the Connect card, no job, bubble NEEDS_YOU; Google connecting within 24 h sends the message back to intake (engine RAM only) |
| 2   | (same)                                           | 05-3 §5.11 Trigger names the case; `one_app` line is a sample   | Trigger points at 08-2 §5.3.3; three fixed lines (Gmail, Calendar, Contacts) for a job from intake                                                                                                     |

## (c) Picks where the spec is silent

1. **No job until connected.** The ideas flow already works this way (12-1 §12.24.5 step 3: the Connect card first, and the
   job continues once connected); catch-up does the same for its source (12-2 §12.27.6). A job started without its app can
   only ask the wrong question or fail.
2. **"Not connected" means no Google rows, or all `disconnected`.** A connection that needs sign-in is not this case: its jobs
   start and wait on the `CONN_EXPIRED` error card with Reconnect (08-3 §21.2), as today. A build without Google (no client id)
   is not this case either; the job runs and fails honestly.
3. **Fixed words, not the AI's.** The card's line is fixed per app ("So I can read your email for this.") so no AI text lands
   on a card that leads to a sign-in.
4. **Back to intake, not straight to a job.** Once Google connects, the same message gets a new intake turn (as a CR-0028
   answer does), so the plan is made with the Gmail tools in view. Within 24 h only (the ideas flow's limit); "Not now" is kept
   only in the renderer today, so a later connect inside 24 h still answers the message. Engine RAM only: after a restart the
   user asks again.
5. **WhatsApp, X and Outlook are out of scope.** WhatsApp has its own link card and the step tools say when it is unlinked; X
   has no connection; Outlook is not in v1.

## (d) Review

An independent Fable review of this CR and its diff, recorded in the PR and in `docs/decisions/real-pc.tsv` ("approved on
Vikas's behalf" on pass).

Passed with no act items. Two "consider" items are done: the engine asks for the Connect card only after main has said Google
is not connected (before main's first answer the job starts as before, so a connected Google never gets the card on a boot
race), and the section cite is 12-1 §12.24.5 step 3. Left as is: the ⏳ badge stays on the bubble after "Not now" (the renderer
keeps "Not now" to itself today), and a helper's `allowedApps` is not checked here (J15's app ask covers it once the job runs).
