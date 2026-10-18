# CR-0005: how PERF-02 measures "keydown → character painted"

- **Asked by:** M2 CI fixer, 2026-10-18, from the Full suite on dc9d4e7 (job 117538367418, PERF-02); revised 2026-10-18 after
  the cause was found (implementation-notes, M2 CI fixes 36).
- **Spec sections:** 10-acceptance-2 §E (PERF-02, typing latency p95 < 16 ms); 08-3 PERF-02; 04-2 §20.3;
  `spec/trace.csv` PERF-02 (`test/e2e/m2-composer.spec.ts`).
- **Status:** Approved under overnight instruction (Vikas, 2026-10-17 18:52Z/18:59Z: continue the overnight build, don't wait
  for my approval), for morning review
- **Approved by Vikas:** pending morning review (overnight instruction above, foo project M2 build thread)

## (a) What was wrong

The first PERF-02 test pressed 80 keys in a bare loop, one every ~5 ms, and timed each key from keydown to the first task
after the next frame. A key per 5 ms is far faster than a frame (16.7 ms), so keys queued behind earlier keys' frames: the
per-key log on the real app (Electron under Xvfb) shows groups of keys whose times fall in steps of 5 ms down to the same
late frame, with **no long task** in the renderer, and the same pattern with **nothing focused** (the app doing no work).
CI p95 swung 17 → 209 ms on the same code; the earlier bisect (notes 35) found no per-key work to blame.

A second, smaller part: a key lands at a random moment in the screen's refresh cycle, so even an app with zero work waits up
to one refresh (16.7 ms at 60 Hz) before anything can be painted. At p95 that wait alone reaches ~14–16 ms (control, local).
"< 16 ms" as wall-clock from keydown cannot be met at p95 on a 60 Hz screen by any app; the spec's own wording is "within a
frame".

## (b) Decision

PERF-02 keeps its budget (p95 < 16 ms, everywhere, no runner exception; the hosted-runner rule from the first version of
this CR is withdrawn). The measurement changes:

1. **Pace:** one key at a time; the next key goes after the last one painted, plus a random 0–16.7 ms, so keys land at every
   point of the refresh cycle (a person types a few keys a frame at most).
2. **Probe:** keydown → the first task after the frame that shows the character. If a frame starts before the character is
   in the DOM, the probe waits for the next one and that time counts.
3. **Display wait:** from the moment the character is in the DOM to the start of the next frame is the screen's wait, not
   the app's. The probe takes it off, **at most one refresh (16.7 ms)**; anything longer counts in full. The test logs the
   wait and a nothing-focused control in the same run.

Local, three runs: typing p95 7.0–7.1 ms (p50 4.4–4.7); control p95 2.5–2.6 ms. Without step 3: typing p95 15.3–17.9 ms
against a control of 13–14 ms, i.e. the tail is the refresh wait.

## (c) Proposals for the spec keeper

- **P1.** 10-acceptance-2 §E PERF-02 measurement column: "keys paced as a person types; keydown → character painted, less
  the wait for the screen's next refresh (at most one refresh)".
