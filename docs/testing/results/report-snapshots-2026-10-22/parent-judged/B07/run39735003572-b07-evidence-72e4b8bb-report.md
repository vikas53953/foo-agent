# B07 live viewer review â€” run 39735003572

Run: https://github.com/vikas53953/foo-agent/actions/runs/39735003572
Run result: success
Tested app SHA: `4fd0d51c0516efb239123704dd1deb3af16dc219`
Immutable evidence commit: https://github.com/vikas53953/foo-agent/commit/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176
Provider reviewed: `4fd0d51-claude/s0` only. The matching `latest-claude` files were duplicate-provider copies and were excluded.

Reviewed all 20 PNGs in the unique `4fd0d51-claude/s0` evidence: 8 first-run PNGs and 12 B07 PNGs. Local copy: `[LOCAL_WORKSPACE]\run39735003572-b07-evidence-72e4b8bb`.

## B07 raw result

`summary.json` reports 25 steps and 12 failed assertions. The precondition did run far enough to create a real browser job:

- Step 1 produced a three-step plan: `Check IRCTC`, `Find trains on IRCTC`, and compare timings.
- Step 2 `Go` succeeded.
- After the 45-second wait, step 4 found `chat-header-watch-live` and opened the live window.
- Step 5 timed out after 30 seconds waiting for the live window to reach `live`.
- Step 6 timed out after 30 seconds waiting for a masked picture.
- Checks for the live state, masked picture, Take over, control mode, Hand back, and post-stop report all found no required elements or timed out.

B07 `log.jsonl` pairs the screenshots with these failures. The first screenshot shows the main chat with the IRCTC request and live plan. Every subsequent B07 screenshot shows the same blank foo-owned live window: header `Checking IRCTC Â· step 3 of 3`, green `Done`, and an empty picture area. There is no masked frame, site image, `Live`/`You're in control` pill, Take over button, control bar, Hand back button, or Stop control.

- [01-irctc.png](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/01-irctc.png)
- [02-error-step5.png](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/02-error-step5.png)
- [03-live.png](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/03-live.png)
- [04-error-step6.png](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/04-error-step6.png)
- [05-masked.png](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/05-masked.png)
- [06-error-step10.png](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/06-error-step10.png)
- [07-taken-over.png](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/07-taken-over.png)
- [08-error-step12.png](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/08-error-step12.png)
- [09-error-step17.png](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/09-error-step17.png)
- [10-handed-back.png](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/10-handed-back.png)
- [11-stopped.png](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/11-stopped.png)
- [12-error-step22.png](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/12-error-step22.png)

Paired logs: [summary.json](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/summary.json), [log.jsonl](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/log.jsonl), [app-log.jsonl](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/app-log.jsonl), [ai-turns.jsonl](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/ai-turns.jsonl), [thread.json](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/real-ai/4fd0d51-claude/s0/2026-10-22T06-39-44-927Z-B07-live/thread.json).

## Diagnosis and severity

This is a technical blank-live-viewer result, not a login or sign-in precondition. The run had an active browser job when `chat-header-watch-live` was found and clicked. `app-log.jsonl` records `browser.ensure` and no sign-in, OTP, login card, or `LIVE_UNAVAILABLE`; all 10 recorded AI turns have `outcome: "ok"`. The job later ended `done_unverified` with an IRCTC-blocked fallback answer while the live waits were still timing out. That timing caveat means the run does not prove the Take over or Hand back controls themselves are broken: those states were never reached.

The user impact is still severe for the live path. Opening Watch live on an active browser job produced a blank window and gave the user neither a masked view nor a way to inspect/control the job. Against the acceptance contract, AT-079 and AT-058 are P0 (masked live picture and no clicks until Hand back); AT-272 is P1 (only Hand back plus Stop in control, then resume). I would report this as a P0 live-viewer contract blocker if reproducible on an active job, with Take over/Hand back marked blocked/unproven in this run rather than failed.

Expected contract evidence is in [10-acceptance-1.md](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/spec/constitution/10-acceptance-1.md#L117), [10-acceptance-1.md#L138](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/spec/constitution/10-acceptance-1.md#L138), [10-acceptance-1.md#L378](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/spec/constitution/10-acceptance-1.md#L378), and [09-windows.md#L704-L734](https://github.com/vikas53953/foo-agent/blob/72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176/spec/constitution/09-windows.md#L704-L734).

## Installer upgrade mapping

The separate Lane E run's 11 upgrade rows are all `pass`, but they prove bounded installer and persistence promises:

- old `04f01dd` installer exits and contains `foo.exe`;
- old first launch uses isolated data roots;
- the fixture seed creates two chats, memory, and one working job;
- current installer overlays the old fixture and exits;
- the verification query finds the chats, memory, and running job after current startup;
- current uninstall exits and removes `foo.exe`; isolated data remains.

The `chats, memory and running job survive current release startup` row is a persisted-row/job-presence witness from `verify/lane-e-upgrade-verify.json`. It does not prove the job resumed execution, produced a new step, reached DONE, or completed an external action. The â€œfixture createsâ€¦â€ row is seed setup, not a post-upgrade assertion. No full job-resume or completion acceptance should be promoted from these 11 gates.

Raw upgrade JSON: `[LOCAL_WORKSPACE]\run39733907955-installer-evidence-d908da3\lane-e-results\upgrade\lane-e-upgrade.json`.
