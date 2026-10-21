# CR-0030: M9 take-over gaps: Stop everything, "You took over", the save-login offer, the code box line

- **Asked by:** the end-to-end audit of main (2026-10-21, scorecard bugs 14–17; open M9 follow-ups in
  `docs/decisions/M9.tsv`), under Vikas's ask of 2026-10-21 07:14Z: "test each and every feature which we have implemented
  ... Do not wait for any go or approval from me".
- **Why:** six M9 walkthrough steps were traced `pending` because the drawn behaviour was never built (CR-0013 close-out
  addendum): UX-15-08/09 (C-13 "Stop everything" confirm, the header ⋯ item, the combined report), UX-15-05 (the checklist row
  "You took over"), UX-14-05/06 (the "Save your {site} login?" offer after a sign-in and its Login box) and UX-14-08 (the code
  box's "Your bank sent a code to {phone}." line).
- **Milestone check:** all six rows are `M9` in `spec/trace.csv`; none was moved to a paused milestone (M7, M10–M15). Two
  pieces of the same frames do belong to paused milestones and stay out: the tray's "Stop everything…" (09 §9.8, M11) and the
  "Pause all routines" link under the report (it calls `routine:pauseAll`, 08-1 §3.2, J14 / J20: M7 / M11).
- **Spec sections:** 06-3 §14 C-13; 07 J18 + research/journeys-3 J18 "Steps (stop everything)"; 06-3 §11.2 Take over /
  Hand back; 05-1 §5.2.2 "Took over" row; 05-2 §5.8.4 Login and Code box variants, §5.8.6 `saved_login`; 05-3 §5.10.2
  "After first success on a site"; 08-2 §8.4; 08-0 §G.13 / 08-3 §15 `save_login:{domain}`.
- **Status:** Approved by Vikas on his behalf, DECISIONS X-188 (his rule 2026-10-18 14:56Z and his 2026-10-21 07:14Z message), after the
  independent review in §(c).
- **Change:** no chapter text changes; `spec/constitution/DECISIONS.md` row X-188 records the picks. `spec/trace.csv`: UX-14-05, UX-14-06, UX-14-08, UX-15-05,
  UX-15-08 and UX-15-09 move `pending` → `live`. Code as in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Not changed

- A typed "Stop everything" still stops at once with no confirm (08-4 §26.9 item 1); only the menu path asks (C-13).
- "Stop all jobs in this chat…" (C-13b) is untouched; it is a separate follow-up (03 §3.6.2.2), not one of these steps.
- A typed "Stop everything" now also gets the combined line in foo's chat (instead of a per-job line for a job there).
- "Carrying on from here." was already posted on Hand back (X-135); only the checklist row was missing.
- The code box's `requestId` bug noted in the CR-0013 addendum (the box's stored `requestId` read `[hidden]`) is not in this
  CR; UX-14-08 still does not assert the code reaching the bank page.

- Found by the Windows picture run: writing a stopped job's `plan.md` threw when a stored step's key was not in the phrase
  catalogue, which ended "Stop everything" before its report (and before later jobs). `phraseText` now gives null for an
  unknown key (its callers already fall back to the stored key); integration test added.

## (b) Picks (spec gaps, filled the conservative way)

1. **Combined report** (J18 gives one example, no template): in foo's chat, "Stopped {n} jobs: {titles}." (one job: "Stopped
   1 job: {title}.") then, from the stopped jobs' activity rows only (08-2 §5.7 step 4): no done rows → "Nothing was booked,
   paid or sent."; done rows and no payment → "Nothing was paid. Already done before the stop: {summaries}."; a payment →
   only "Already done before the stop: …" (never "Nothing was paid."). Keys `thread.stop.all.*`. A job in another chat keeps
   its own report line there; a job in foo's chat gets none, so foo's chat has one line, not two.
2. **Where "Stop everything" lives:** J18 says "Chat header ⋮ → Stop everything", 03 §3.6.2.2's menu table does not list it.
   It is added to foo's chat ⋯ only (not the private chat), while any job is unfinished, after "Stop all jobs in this chat…";
   test id `chat-header-menu-stop-everything`, label "Stop everything…" (09 §9.8's tray wording). C-13 uses 06-3 §14's
   words: [ Stop all ] [ Cancel ] (the walkthrough's "Keep them running" is a drawing dispute; the table wins). One job
   reads "Stop the job that's running?".
3. **"You took over" row:** stored as `ChecklistPayload.tookOver: number[]` (the step index the user took over at; not a
   steps row, so step counts, "step n of m" and the runner's plan stay as they were). The checklist draws the row just before
   that step, or at the end. Both a running job's Take over and a Sign-in card's Take over (UX-14-09 f) add it.
4. **Save-login offer:** posted by the sign-in lanes after a password sign-in that succeeded (`reason: 'sign_in'` only, so
   not after Skip, a CAPTCHA, passkey or bank check, nor when a saved login failed, nor in a group chat), once per site: the engine checks and
   writes `suggestions` `save_login:{host}` (`offered`). It is a jobless Choice card (`purpose: 'job'`, marker
   `saveLogin: { site }`, like M9 T8's `flightScope`), so main answers it: Save → the key `accepted` and a Login Secret box
   ("{site} login", `vaultName` = host, `afterSignIn: true`; never in a group); Don't save → `dismissed` for good. The
   box's Save logs `saved_login` (kind `connected`, "Saved your login for {site}", 06-3 §9.4) instead of `secret_saved`.
   Values typed on the page are never read; the person types them again in the box (05-2 §5.8.4).
5. **Code box line:** the box shows "Your bank sent a code to {phone}." from its masked `sentTo` (the engine already carried
   it); `cards.secret.otp.reason` leaves `scripts/copy-pending.json`.

## (c) Independent review

Fable reviewer, 2026-10-21 ~09:25Z, read-only, against 06-3 §14 C-13, §11.2, §9.4, 05-1 §5.2.2, 05-2 §5.8.4–§5.8.6, 05-3
§5.10.2, 08-3 §15, J18 and the diff; ran typecheck, check:copy and five test files (105 tests). **Verdict: PASS WITH
FIXES**; applied:

- Consider 1 (fixed): no offer in a group chat (its Save could post no box and would still mark the site asked); test added.
- Consider 4 (fixed, docs): §(a) says the typed "Stop everything" report changed too.
- Consider 2 (watch on Windows CI): the C-13 count is the renderer's job store; the UX-15-08 spec expects the database's
  count. Consider 3 (kept): an unanswered offer still counts as asked ("once per site", 08-3 §15 "never twice").
- Noted, no issue: copy, test ids and icons match the spec; no page value reaches the offer, the AI or the activity row; the
  code box line uses the engine-masked number; nothing from M7 or M10–M15 is pulled in.

Recorded as approved on Vikas's behalf under his standing rule; listed for his later review.
