# CR-0065: PERF-02 measures keydown → the frame that shows the character

- **Asked by:** the batch-1 baseline (Vikas, 26 Oct 06:00Z: "fix all the bugs … one baseline of the full app"). PERF-02 is
  the last red check on main 92de004 (CI run 40476231772, Full suite shard 1: p95 18.1 ms against < 16; p50 4.5 ms; control
  p95 2.5 ms). The Golden lane on ef43c1d read 18.8 ms.
- **Spec sections:** 10-acceptance-2 §E PERF-02 ("keydown in composer → character painted", p95 < 16 ms); 02-2 §F13.3;
  DECISIONS X-158 ("keydown → paint … less the wait for the next display refresh"); CR-0005; `spec/trace.csv` PERF-02
  (`test/e2e/m2-composer.spec.ts`).
- **Status:** Approved by Vikas, 2026-10-27 14:35Z ("A", relayed by the coordinator). It replaces CR-0005 (b)2;
  `spec/` is unchanged (the spec row and X-158 already say "keydown → paint"). Merged in #161 as 4d7e1f9.

## (a) What was wrong

CR-0005 (b)2 times a key as keydown → "the first task after the frame that shows the character" (a `setTimeout(0)` queued
in that frame's `requestAnimationFrame`). A devtools trace of the slow keys on the 5,000-message chat shows the letter's
frame starting 3–7 ms after keydown and the main thread then idle. The probe's task still ran a full frame later: rAF →
timer 15.7 ms on those keys, against about 2 ms on the others. A `MessageChannel` task was held back the same way. So the
p95 tail was the browser's choice of when to run a task, not app work and not the paint.

Ruled out as causes (8–10 runs each): foo's face Listening mood, the cross-fade, `will-change`, the icon turn and the
field's height transition. The wrap key's second layout is the correct cost (a full height measure). A change that skipped
it left a long paste one line too tall (#160), so the app has no per-key cost to cut.

## (b) Decision

1. **Probe:** keydown → the end of the observer phase of the frame that shows the character. That frame is the first one
   to start after the character is in the DOM. A frame that starts before then cannot show it, so the probe waits for the
   next one and that time counts (as before). In that frame's `requestAnimationFrame` the probe makes a new
   `ResizeObserver` on a 1 px hidden sentinel. Its first report runs after the frame's rAF callbacks, style, layout and
   every observer made before it, so the app's mount-time observers are inside the time. Paint itself (display-list
   recording and commit) is not counted. No task is queued after the frame.
2. **Kept from CR-0005:** the pace (one key at a time, a random 0–16.7 ms after the last one painted), the display wait
   (taken off, at most one refresh), the nothing-focused control in the same run, and **p95 < 16 ms** with no runner
   exception.
3. **New guards:** "PERF-02 · the probe goes red when every key costs 20 ms of main-thread work in a keydown (CR-0065)"
   and "… in a resize observer (CR-0065)". One adds 20 ms of busy work in a keydown listener, before the character reaches
   the DOM. The other adds it in a `ResizeObserver` the page makes after the probe, which runs in the frame that shows the
   character, after layout and before paint. Each asserts p95 ≥ 16 ms and p50 ≥ 20 ms. A probe that cannot see real
   slowness fails them.

## (c) Evidence (local, Electron under Xvfb, 4 cores)

| Run                                    | Typing p95 (p50)           | Control p95 | 20 ms in keydown, p95 | 20 ms in an observer, p95 |
| -------------------------------------- | -------------------------- | ----------- | --------------------- | ------------------------- |
| New probe, idle, 3 runs                | 3.5 – 3.9 ms (2.2 – 2.5)   | 1.4 – 1.6   | 24.0 – 24.4 ms        | 23.6 – 23.8 ms            |
| New probe, 3 cores busy, 3 runs        | 4.5 – 6.1 ms (2.7 – 3.0)   | 1.6 – 2.4   | 24.8 – 27.4 ms        | 25.6 – 25.8 ms            |
| Old probe (main), 3 cores busy, 3 runs | 11.2 – 12.5 ms (5.3 – 6.4) | 2.7 – 3.6   | not run               | not run                   |
| Old probe (main), idle, 2 runs         | not run                    | not run     | 28.9 – 31.6 ms        | not run                   |

The old probe also goes red on the keydown work. The new one reads lower on the same keys because it stops at the frame,
not at a task the browser may hold back. The observer guard read 4.2 ms (green, wrongly) on the first draft of the probe,
which shared one observer made at install; it reads red on the probe above.

Windows CI on PR #161 (run 40486285672, Full suite shard 1): typing p95 3.6 ms (p50 2.4), control p95 1.9 ms, 20 ms in
keydown 23.9 ms, 20 ms in an observer 24.4 ms. Main 92de004 on the old probe read 18.1 ms on the same shard.

## (d) Review

Tier **medium**: one independent reviewer (Fable), read-only, ran both tests and three scratch experiments.

| #   | Finding                                                                                                                 | Outcome                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | An observer the app makes after the probe runs after the probe's timestamp: 20 ms per key there read p95 4.7 ms (green) | Fixed: a new observer per key; the observer guard added, green (wrongly) before, red after |
| 2   | The display wait hides a task run between "in the DOM" and the frame                                                    | No change: 20 ms in a `setTimeout(0)` ran after the frame in 80/80 keys                    |
| 3   | The keydown guard does not cover frame-phase work                                                                       | Fixed with 1: the observer guard is frame-phase work                                       |
| 4   | The CR said all of the app's frame work is counted; paint is not                                                        | Fixed: (b)1 says paint is not counted                                                      |

## (e) Proposals for the spec keeper

- **P1.** X-158: "keydown → the end of the observer phase of the frame that shows the character, less the wait for the
  next display refresh (at most one frame); p95 < 16 ms; 20 ms of work per key, in keydown or in a resize observer, must
  read ≥ 16 ms".
