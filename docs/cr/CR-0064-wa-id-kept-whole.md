# CR-0064: WhatsApp addresses are kept whole in the store

- **Asked by:** Windows CI on PR #159 (27 Oct, run 40427749410, Full suite shard 2), on the way to the batch-1 baseline
  Vikas asked for at 06:00Z on 26 Oct ("fix all the bugs … one baseline of the full app"). No known-red check may stay.
- **Why:** `test/integration/m8-whatsapp-send.test.ts` "a late server ack completes it once" failed with
  `wa_919800000011@s.whatsapp.net:FOO•••• 2078A7F` stored where `…:FOO6499929902078A7F` was sent. The card id is random per
  run, so its `waSendKeyId` hex now and then holds a digit run that passes P12's Luhn check (here 6499929902078), and the
  store's R2 scrub masked it as a card number (about 3 in 20,000 keys). The review found the wider case: a phone number of
  13 or more digits that passes Luhn (`4915112345678@s.whatsapp.net`, a German mobile) is stored in the Draft card's
  `waJid` as `•••• 5678@s.whatsapp.net`. The send then goes to the masked jid, and the id rebuilt from it never matches
  the bridge's ack, so the card never shows "Proof: Delivered".
- **Spec sections:** 08-1 §4.6 rule 2 (`cards.payload` is written through the Redactor, leaf by leaf), 04-2 / 08-2 §11.4 P12,
  CR-0009 G-M5-25 (a leaf that is exactly a foo id is kept), 0001 `wa_messages.id`, 08-3 §16.4 (proof `wa_delivered`);
  DECISIONS X-221.
- **Status:** Approved by Vikas's approve-on-my-behalf rule (independent review, every check green; no spec clash),
  DECISIONS X-221.

## (a) Picks

1. **Kept, like a foo id.** `writeRedactedJson` (`src/main/store/writeRedacted.ts`) passes unchanged a leaf that is exactly
   a WhatsApp jid (`{digits}[-{digits}]@s.whatsapp.net | @g.us | @lid`) or exactly a `wa_messages` id (`wa_{jid}:{key}`).
   Jids are already stored in clear in `wa_messages` and `wa_contacts`, so this adds no new exposure. A jid or id inside a
   longer string, or a number under any other domain, is still scrubbed.
   Rejected: changing `waSendKeyId` to avoid digit runs. A phone number in the jid would still be masked, and ids of
   messages already sent would change.

## (b) Trace rows

No AT id: the behaviour is the existing AT-018 send and delivery proof. A unit case in
`test/unit/m5-redaction-store.test.ts` names the failing id from the CI run, a Luhn-valid 13-digit phone jid, an id built
on it and an `@lid` jid. All four are masked by the plain scrub, so the case fails without the fix and passes with it. The
same case shows that a card number beside the id, a jid inside a sentence and a number under another domain are still
masked.

Neighbours re-tested: the whole of `m5-redaction-store` (G-M5-25 foo ids, card numbers, registry scrub) and
`m8-whatsapp-send` (AT-018 send, undo, refusal, late ack).

## (c) Review

Tier **medium**: one independent reviewer, read-only, on the working-tree diff.

| #   | Finding                                                                                                  | Outcome                                                    |
| --- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | The card's `waJid` leaf is still masked for a Luhn-valid 13+ digit phone number, so the send goes astray | Fixed: a leaf that is exactly a jid is kept too            |
| 2   | The CR said an 18-digit `120363…` group jid passes P12; P12 needs a first digit 2–6, so it never does    | Fixed: the reason is the phone number; text corrected      |
| 3   | The group half of the test passed with or without the fix                                                | Fixed: every case is shown masked by the plain scrub first |
| 4   | `@lid` jids (Baileys 7) and group jids over 20 digits got no exemption                                   | Fixed: `@lid` and up to 30 digits                          |
| 5   | Could a secret pass? Only as a whole leaf shaped exactly like a jid; jids are already stored in clear    | No change                                                  |
| 6   | Other stores of the id (`activity.proof_ref`, `approvals.proof`, `wa_messages.id`) are not redacted      | No change needed                                           |
