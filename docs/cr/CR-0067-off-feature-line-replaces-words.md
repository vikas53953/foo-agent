# CR-0067: a switched-off feature's line replaces the words foo already showed

- **Asked by:** QA-X-F29, from the real-AI run on main 20c8ba0 (B1-batch1, "remember that I am vegetarian"). This is a
  batch-1 bug under Vikas's 26 Oct 06:00Z ask ("fix all the bugs … one baseline of the full app").
- **Spec sections:** 08-4 §25.5 item 5 ("text already released stands"); CR-0054 (X-211) and CR-0042 (the off-feature and
  not-built lines); X-216 item 6.
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-224 (independent review, every check green; no spec clash).

## (a) What was wrong

With memory off, the real AI wrote "Noted: Vegetarian." and decided `memory`. Those words streamed into a bubble, and then
the memory-off line followed in a second bubble: "I can't remember things for you yet…". The two bubbles disagree, and
the first one claims something foo did not do. The same can happen with jobs and settings switched off.

## (b) Decision

1. When intake decides a kind whose feature this build left off, and words of that answer are already showing, the
   feature's line replaces them in the same bubble. There is no second bubble.
2. When nothing showed yet, the line is posted as before.
3. Kinds that are not built yet (CR-0042) keep 08-4 §25.5 item 5: the shown words stand and the not-built line follows.

## (c) Evidence

| Test                                                                        | main 20c8ba0 | this change |
| --------------------------------------------------------------------------- | ------------ | ----------- |
| `feature-switches.test.ts`: words already shown give way to the memory line | red          | green       |
| QA-X-F29 (QA's PR #166, slow fake AI)                                       | red          | green       |
