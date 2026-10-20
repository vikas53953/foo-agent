# CR-0012: M8 trace rows, the connector seams, and the picks the M8 build makes where the spec forks

- **Asked by:** the M8 lead (ticket T1, `/mnt/project-files/foo/prep/M8-tickets.md`), 2026-10-18, while building M8 (foo-plan §5 M8).
- **Spec sections:** 08-3 §16.1–§16.7, §19.4, §21.2–§21.3, §22.4; 08-2 §8.1–§8.2, §11.2; 08-1 §2.1, §2.4, §3.2–§3.3, §4.5;
  08-0 §A.1, §B.2, §D, §E.8, §G.3–§G.12; 08-5 §3.3, §4.1; 05-2 §5.7; 05-3 §5.11; 06-2 §6.8; 06-3 §14 C-8/C-10/C-11;
  10-acceptance-1 §B, §B.10; 10-acceptance-2 §D; 11-fidelity §11.12.
- **Status:** Approved by Vikas's approve-on-my-behalf rule (his message 2026-10-18 14:56Z), after the independent review in §(e), DECISIONS X-165
- **Change:** `spec/trace.csv` (rows below), `spec/constitution/DECISIONS.md` (row X-165); `scripts/golden-manifest.ts`
  (`BP_M8`, `EARLY_STEPS`) and `golden/manifest.json` regenerated (`pnpm golden:manifest`). No other `spec/` or `golden/` file
  changes. Numbering: CR-0009…0014 / X-162…167 are reserved for M5…M10 so the parallel milestone leads do not collide.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows (`spec/trace.csv`), Milestone M8

| Id                     | Test file                                   | Ticket                                      |
| ---------------------- | ------------------------------------------- | ------------------------------------------- |
| AT-014, AT-093         | `test/e2e/m8-connectors.spec.ts`            | T2                                          |
| AT-020                 | `test/integration/m8-gmail-read.test.ts`    | T4                                          |
| AT-145                 | `test/integration/m8-contacts.test.ts`      | T4 (engine) · T6 (Choice card)              |
| AT-220                 | `test/integration/m8-expiry.test.ts`        | T5                                          |
| AT-015, AT-053, AT-055 | `test/integration/m8-gmail-drafts.test.ts`  | T6                                          |
| AT-051, AT-052         | `test/e2e/m8-drafts.spec.ts`                | T6                                          |
| ART-04a, ART-04b       | `test/articles/ART-04.test.ts`              | T6                                          |
| ART-09                 | `test/articles/ART-09.test.ts`              | T6                                          |
| AT-018, AT-070         | `test/integration/m8-whatsapp-send.test.ts` | T7                                          |
| AT-054                 | `test/integration/m8-x.test.ts`             | T7                                          |
| AT-269, AT-270         | `test/e2e/m8-whatsapp.spec.ts`              | T3 (ingest, mirror) · T7 (composer → draft) |
| ART-15b (hosts so far) | `test/articles/ART-15b.test.ts`             | T8                                          |
| UX-16-01…10            | `test/fidelity/ux/UX-16.drafts.spec.ts`     | T8                                          |
| UX-04-04…09 (early)    | `test/fidelity/ux/UX-04.connect.spec.ts`    | T8                                          |
| BP-CARD-11             | `test/fidelity/bp/BP-cards-m8.spec.ts`      | T2                                          |

Every row is `pending` until its ticket lands the test and flips it to `live` in the same commit (FID-18 checks live rows
only). Not added here: ART-08c (M5's row in CR-0009; M8 extends that test with a Gmail OTP case) and BP-CARD-07 (M5's row in CR-0009; the email /
WhatsApp / X variant states are compared against the same panel).

Blueprint id (`BP_M8`): `#cardgal > .panel:nth-child(11) > .mini` (Connect). Drawn in a 350px panel, so its R2 box is disputed
by construction (CR-0003 §b). `EARLY_STEPS` gains UX-04-04…09 as `M8` (G-PREP-03); M12 still owns and blesses UX-04, and
UX-04-05 is Google's own page (UNVERIFIABLE, not foo's UI). UX-11 stays with M10 (G-M8-08).

## (b) Picks for the M8 gaps (pack `prep/M8.md` §8; each is the pack's "Recommended" option, approved in GAPS-for-review.md by Vikas 2026-10-18 13:34Z)

1. **G-M8-01** ART-15b allow-list for connector traffic: `oauth2.googleapis.com`, `gmail.googleapis.com`, `www.googleapis.com` (Calendar v3), `people.googleapis.com`, `web.whatsapp.com`, and the other WhatsApp hosts Baileys opens on the pinned version (captured once by T3 and listed in implementation-notes). `accounts.google.com` and `x.com` open in the default browser and are not foo traffic.
2. **G-M8-02** `twitter-text` is pinned now (3.1.0) with `@whiskeysockets/baileys` (7.0.0-rc14, the npm `latest` tag) and `qrcode` (1.5.4), exact versions (08-1 §1.1).
3. **G-M8-03** The `draft` card payload gains `gmailDraftId?`, `gmailMessageId?`, `threadId?`, `waJid?`, `isGroup?` (added by T6 on M5's payload type).
4. **G-M8-04** Without `gmail.compose`, `draft = send = false`: the Draft card stays in foo (`sendAllowed:false`, state `pending`); Primary "Open in Gmail" opens Gmail's compose page prefilled (`https://mail.google.com/mail/?authuser={email}&view=cm&to=…&su=…&body=…`, hand-back rung, no proof), plus the `allow_send` Connect card once. "Partly granted" copy is used only for a missing Calendar or Contacts scope. The 05-2 §5.7.2 "No send permission" row ("I can't send from your Gmail, so I've saved this as a draft there.", 05-2 line 271) would be false under this pick (no Gmail draft exists without `gmail.compose`), so it is not rendered in v1; the `allow_send` Connect card carries the explanation. No new words.
5. **G-M8-05** M8 builds the Connections page body `screens/settings/ConnectionsPage.tsx` (Gmail, Calendar, Contacts, WhatsApp, X rows), `dialog-link-whatsapp`, C-8, C-10, C-11; M13 adds the Settings frame and the Browser / AI / Internet rows.
6. **G-M8-06** If `fetchLatestBaileysVersion()` on the pinned version calls a non-WhatsApp host, the call is dropped and the pinned version is used.
7. **G-M8-07** `connections.vault_name` for WhatsApp is `wa-session` (08-3 §16.4; matches `SecretKind 'wa_session'`). The 0001 DDL comment `'vault\wa-session.bin'` is read as a file path note only; no migration.
8. **G-M8-08** UX-11 stays with M10; M8 proves only that a fake Gmail bill email reaches the `on_email` hook (integration test).
9. **G-M8-09** The Draft card keeps "Discard" (it deletes the Gmail draft); UX-16-02 is disputed.
10. **G-M8-10** Emoji in error copy are icons (R-05): the Fluent icon for 🔌 is drawn and the text has no emoji, so AT-220's words match.
11. **G-M8-11** New fake `test/fakes/connectors/contacts.ts` (People `connections.list` + `searchContacts`).
12. **G-M8-12** `message:send` in a `wa_mirror` chat is intake → `whatsapp.draft { to: group }` in foo's chat; nothing is stored in the mirror; the mirror gets the `thread.wa_mirror.draft_made` marker.

Picks T1 made where the spec is silent (also in implementation-notes "M8"):

13. **Settings.** `connections.google` and `connections.whatsapp` join the settings schema with 08-0 §A.1 defaults; `connections.web` stays M9's; `permissions.apps.*` and `permissions.actions.post` are added by M5 with the rest of `permissions.*`.
14. **Connector seams.** `src/engine/tools/connectors/types.ts` fixes `HttpFetch`, `GoogleAccess` and `ConnTokenStore` so the Google sign-in ticket and the Gmail / Calendar / Contacts ticket build in parallel. Until M5's SecretVault lands, the Google refresh token sits behind `ConnTokenStore` in memory (never on disk); the swap to `foo/conn_token/google` in the vault is a "needs M5" line in the ticket map.
15. **Lane order.** Tickets that need M5 (Draft card, ApprovalGate, SecretVault, Choice card) start after M5 merges into main and main is merged into the M8 branch; the M8 PR to main opens only after M5 is on main.

## (c) Not changed

No new screen, word or flow. One existing row goes unused: the 05-2 §5.7.2 "No send permission" line (pick 4). Copy keys, test ids, IPC channels and DbOp tables are added by the ticket that first uses them
(append-only edits to the shared files; the ticket map names the owner of each).

## (e) Independent review

Fable reviewer, 2026-10-18 ~18:16Z, read-only, against pack `prep/M8.md` §4–§8, GAPS-for-review (G-M8 answers), 08-0 §A.1 /
§B.2, 08-5 §3.3 / §4.1, 10-acceptance-1/-2, golden/manifest.json. **Verdict: PASS.**

- Trace ids exist, J columns match, no duplicate rows; settings defaults and the three shared types match the spec verbatim;
  picks 1–12 match the pack's recommended answers and the approved GAPS answers; BP_M8 / EARLY_STEPS follow CR-0003 / CR-0008.
- Acted on: pick 4 now says the 05-2 "No send permission" line goes unused (it would be false); `web.whatsapp.com` named in
  pick 1; ART-08c / BP-CARD-07 rows named as CR-0009's. The UX rows' R column stays blank for now (trace-check's per-R rule
  waits); T8 fills it with the Tier R spec.

Recorded as approved on Vikas's behalf under his standing rule (his message 2026-10-18 14:56Z: "take care of it on my
behalf and then keep on working"); listed for his later review.

## (f) Addendum: M8 T6 email drafts (2026-10-20)

Two forks the T6 review found the spec does not settle. Each was put to an independent Fable check before it was recorded.

16. **G-M8-13** `opened_in_app` for Gmail is a summary row (05-2 §5.7.3 "Sent / Discarded / Opened in X / Queued"): `Mail`
    icon, muted, "Opened in Gmail · not sent by {agentName}" (new key `cards.draft.summary.opened_in_gmail`, worded after
    `cards.draft.summary.opened_in_x`), and the Link "Open in Gmail" opens the compose page again. The spec has no words for
    the Gmail case because 05-2 §5.7.2 "No send permission" assumed a Gmail draft exists, which G-M8-04 rules out. One new
    word string; no new screen or flow.
17. **G-M8-14** Art. 9 "switch how" in M8 (05-2 §5.5.2 Switch how row, verb `switch`, `Globe`, activity `switched_route`):
    M8 has no website route yet, so the trigger is an email drafted inside a job whose `book`/`buy`/`pay` approval was
    approved but did not complete (APPROVED, RUNNING, CHECKING or FAILED). A finished booking followed by an email to a
    known person is a plain Draft. The M9 browser ticket narrows this to the rung change itself (X-125 `rungOf`) and adds
    the "new site" switch (ART-09 row for M9, pending). The card's primary reads "Send email" as M5's Approval card already
    draws for `switch`; "{Email them}" has no copy key yet and stays with the spec-keeper.

## (g) Addendum: M8 T7 WhatsApp and X drafts (2026-10-20)

Forks the T7 build and its review found the spec does not settle. Each was put to an independent Fable check before it was
recorded (docs/decisions/M8.tsv, T7 rows).

18. **G-M8-15** WhatsApp send correlation and no answer. The bridge sends with key id `waSendKeyId(draftCardId)`, so the
    server's ack names the Draft it answers; one send in flight, FIFO, ≥ 3 s apart (08-3 §16.4 Send). "✓ Sent" on the
    server ack (level 1); "Proof: Delivered" and the `wa_delivered` approvals proof on ack ≥ 2. The bridge's SEND_FAILED is
    "WhatsApp didn't send it. Nothing went out." (`cards.draft.line.wa_failed`, worded after 08-3 §21.2 SEND_FAILED with
    the app named). No answer in 30 s is not "nothing went out": the row goes CHECKING (08-2 §10.5) and the card keeps
    "Sending…"; a late server ack (engine `wa.report { event: 'sent' }`) completes it with `sent_whatsapp`, never a resend.
    Fifteen minutes with no ack is M5's CHECKING → FAILED (G-M5-33); the Draft card's words for that case are the open M5
    gap shared with email crash recovery, not new here.
19. **G-M8-16** Recipient Choice (08-3 §16.4.2 "Who is {Mom} on WhatsApp?" over "the last 5 chats"): the Choice card holds
    at most 4 options (05-1 §5.3, `ChoiceCardSpec`), so it lists the last 4. Dispute for the close-out CR. The answer comes
    back to the AI as its label (Part 8 "Decisions:"); the next call may name the label, the option id, or the name before
    " · " when only one option has it. The AI never picks a recipient.
20. **G-M8-17** A group is what its jid says (`@g.us`): main derives `isGroup` from the jid and refuses a caller's flag
    that says otherwise (AT-070 cannot be skipped by a wrong flag).
21. **G-M8-18** X drafts (08-3 §16.3, X-34): no approvals row, no expiry, no footer (nothing is ever sent from the card).
    The label is `cards.draft.label_post` "Draft, not sent: {channel}" (05-2 §5.7.4's label assumes a recipient). "Shorten
    it" opens Change. The page opens only through the card: `app:openExternal` `x_intent` with the card's nonce, or
    `x.openCompose` with the job's id (`draft.openX`); `draft:openInApp` refuses X.
22. **G-M8-19** The mirror composer (04 §10.11): main makes a finished job in foo's chat (origin `user`) that carries the
    group Draft card. (a) The typed text is kept as the user's own message in foo's chat, just above the Draft, so the
    second look reads the user's words (08-2 §9.6); nothing is copied into the mirror's `messages` (08-3 §16.4.3). (b) The
    job's title reuses `composer.placeholder.wa_mirror` "Draft a message for {group}" (no job-title key exists for it).
    (c) The job is `done` at once, so it shows the usual 24 h "Done" pill. (d) The "Draft ready in {agentName}'s chat."
    marker is the renderer's until restart; the draft itself stays in foo's chat. (e) The paste catcher's secret check
    runs as on any send (08-2 §11.4 R1); "Send anyway" goes on.
23. **G-M8-20** Port rows the spec names only in words: main → engine requests `wa.send` and `wa.check`, engine → main
    request `draft.openX`, and `wa.report` events `delivered`, `sent` and `open` (08-1 §2.4 table rows for the close-out CR).
24. **G-M8-21** New copy keys: `cards.choice.question.who_on_whatsapp`, `cards.draft.line.wa_not_on`,
    `cards.draft.line.wa_failed`, `cards.draft.label_post`, `thread.wa_mirror.draft_made`, `thread.wa_mirror.open`
    (the words are the spec's own where it has them: 04 §10.11, 08-3 §16.4.2).
