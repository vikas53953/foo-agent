# CR-0068: a reply's answer shows once when untagged text is followed by a <say> block

- **Asked by:** QA-X-F31, from the real-AI run on main 2467a76 (run 40595003833, B1-batch1 step 27, "did you book the
  cab?"). This is a batch-1 bug under Vikas's 26 Oct 06:00Z ask ("fix all the bugs … one baseline of the full app").
- **Spec sections:** 08-4 §25.5 item 1 (untagged text; text outside the two blocks is stray) and item 2 (the release gate).
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-225 (independent review, every check green; no spec clash).

## (a) What was wrong

Real Claude wrote the answer as plain text, then the same answer again inside `<say>…</say>`, then `<act>`. The release
gate saw no `<say>` at the start, so it took everything before `<act>` as the say. The bubble showed the answer twice, the
second copy with raw `<say>` tags. parseEnvelope read the same reply the other way: the tagged text is the say and the
text before the tag is stray. The spec does not say what the gate does when a `<say>` tag comes after untagged text.

## (b) Decision

1. Before any untagged sentence was queued for release, a `<say>` tag that comes before `<act>` makes the reply tagged:
   the block's text is the say, and the text before the tag is stray (item 1, as parseEnvelope reads it).
2. Once untagged sentences were already released (item 2's sentence mode), they cannot be taken back, so the say ends
   at the `<say>` tag and the block is not shown.
3. While untagged text streams, a partial `<say` at its end is held like a partial `</say>` or `<act>`.

## (c) Evidence

| Test                                                                                    | main 2467a76 | this change |
| --------------------------------------------------------------------------------------- | ------------ | ----------- |
| `m3-prompt-gate.test.ts`: three late-`<say>` cases (whole, small pieces, sentence mode) | red          | green       |
| QA-X-F31 (QA's PR #166, fake AI)                                                        | red          | green       |
