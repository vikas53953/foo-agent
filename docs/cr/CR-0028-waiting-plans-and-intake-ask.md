# CR-0028: a plan waiting for Go needs the user, and an intake question is a Choice card

- **Asked by:** Vikas, 2026-10-21 07:14Z (project chat): "keep on doing the end-to-end testing until you see that everything is
  working … Do not wait for any go or approval from me". The coordinator routed two bugs from the real-PC run (main 501aa1a,
  his laptop, the Claude CLI; `/mnt/project-files/foo/real-test/findings.md`, J09 and J10) to the thread "Waiting plans block
  new asks".
- **Why:**
  1. Two Plan cards waiting for Go showed in Doing now as "Waiting for another job to finish", and the chat list said
     "Working 1", while nothing ran. The engine was right (08-2 §5.3.3: such a job is QUEUED and `startNext` skips it, so it
     holds no slot and blocks nothing), but every surface drew QUEUED as "running" and named a cause that did not exist.
  2. "Find me a hotel in Goa for 2 nights next weekend under 6000 rupees a night" got "I didn't get that. Say it another
     way?". Replaying foo's real intake prompt (same conversation, clock 21 Oct) through the Claude CLI with foo's flags: 5 of 6
     runs planned a hotel job, 1 of 6 asked "Which dates for the Goa hotel (2 nights)?" (on Wed 21 Oct "next weekend" can mean
     24 Oct or 31 Oct). Intake kind `ask` was never built in the chat lane, so it fell through to the empty-reply line. The
     waiting plans did not cause it.
- **Spec sections:** 03-shell-1 §3.4.4 (chips); 03-shell-2 §3.7.3.1 (Doing now Line 2); 05-1 §5.3 (Trigger); 08-2 §5.3.3;
  08-4 §25.5 item 5; DECISIONS X-186.
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-186 (his messages 2026-10-18 14:56Z and 14:59Z, and 2026-10-21 07:14Z; after the independent review in §(d))
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

None. The tests are `test/integration/jobs/waiting-plans.test.ts`, which replays the real sequence (two Plan cards pending,
then the hotel message answered with the CLI's real `ask` reply), titled by CR rather than by AT id.

## (b) Spec before → after

| #   | What Vikas saw                                         | Spec before                                                                                        | Spec after                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Two waiting plans: "Waiting for another job to finish" | 03-2 §3.7.3.1 Line 2: every QUEUED row says it                                                     | A QUEUED job whose Plan card is `pending` is drawn as NEEDS YOU: Warning glyph, "Needs you: {job title}" (existing copy), `data-state="needs_you"`, sorted with NEEDS YOU. Other QUEUED rows keep the old line                               |
| 2   | Chip "Working 1" while nothing runs                    | 03-1 §3.4.4: "Working" = any job QUEUED, WORKING or WAITING; "Needs you" = approval or choice card | "Needs you" also counts a Plan card waiting for Go; "Working" leaves its job out. §3.4.5's pill rule already said "PENDING card", so the pill reads Needs you. The chat-list preview keeps 3a "Waiting to start {job}…" (true)               |
| 3   | (same)                                                 | 08-2 §5.3.3 said only "stays queued until Go"                                                      | Adds that it holds no slot and every surface shows it as waiting on the user; main derives `JobRow.awaitingGo` (optional; set only then) and re-sends a job whenever its Plan card moves, so Go clears it at once                            |
| 4   | "I didn't get that" for a clear hotel ask              | 08-4 §25.5 item 5 named `ask` but nothing said where the answer goes                               | `ask` → a Choice card with no job (`intakeAsk: { messageId }`), ⏳ on the user's bubble, no auto-pick or 24 h stop. An answer (tap, typed, Skip) sends the same message to a new intake turn with a part 8 `Decisions:` line `- Q: … → A: …` |
| 5   | (same)                                                 | 05-1 §5.3 Trigger: "Inside a job"                                                                  | "Inside a job, or at intake before any job"                                                                                                                                                                                                  |

## (c) Picks where the spec is silent

1. **Where the answer goes.** The `file_in` purpose (05-1 §5.3) already has "not part of a job until answered; the answer creates
   the job". An intake question works the same way, through one more intake turn, so the AI decides the kind again with the answer
   in hand (it may plan a job, reply, or ask one more question).
2. **The answer's form** is the part 8 `Decisions:` line the step turns already read (08-4 §24.22), so the AI sees one form for
   every answered question.
3. **No timeouts.** J8's auto-pick, reminder and 24 h stop end a job; there is no job here, so the card simply waits. The AI's
   `reversible` is ignored (no job → never reversible, as §26.7 computes it).
4. **Restart.** The answers live in engine RAM. After a restart an answered card stays answered and the message is not asked again;
   the user can ask again. Recovering chat-lane turns after a restart is a separate fix.
5. **Not built here.** Intake kinds `handoff`, `routine`, `setting`, `catch_up` still post the empty-reply line until their
   milestones (M7, M10, M12, M13). The real-PC replay never chose them for these asks.

## (d) Review

An independent Fable review of this CR and its diff, recorded in the PR and in `docs/decisions/real-pc.tsv` ("approved on
Vikas's behalf" on pass).
