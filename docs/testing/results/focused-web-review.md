# Real-PC settle repair review: run 39901998316

This review is read-only against run `39901998316`, tested application commit `1166b72f8893ecd630a4773e13fd4b56d5a89e0e`, and immutable evidence commit `f2563fde5fb4dad939ff60d844962eb62b787d2f`. The workflow ran `J05-web` and `B14-restart-mid-reply` with Claude Sonnet 5-5 on one Windows worker.

## Verdicts

| Journey and request                      | Terminal reply | No premature close while live | Evidence-backed result                                                                                                                                                          |
| ---------------------------------------- | -------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J05 ISRO news                            | **NO**         | **YES**                       | The driver waited `240138 ms`; the live checklist remained visible and the product posted a real `card-stuck` terminal state at three minutes. There was no early driver close. |
| B14 tortoise request after reopen        | **YES**        | **YES**                       | `waitReply` passed with `endState:true`, one new bubble, no duplicates, and the complete tortoise answer.                                                                       |
| B14 news request after the second reopen | **NO**         | **YES**                       | The driver waited `150222 ms`; the live checklist was still present at the shot and the app was closed only during final journey cleanup.                                       |

## J05 evidence

The send passed. The first reply appeared after `8641 ms`, but the wait stayed `stillWorking:true` through the full `240138 ms` timeout. The actual terminal content was a stuck card: “I’m stuck on the Looking on the web job”, with `Spent so far 3 minutes`; it was not a news answer and had no source/citation kit. The two source checks each found zero elements, while the unrelated setup text check passed.

The screenshot shows the live checklist and the asking stuck card together:

- [J05 terminal screenshot](https://github.com/vikas53953/foo-agent/blob/f2563fde5fb4dad939ff60d844962eb62b787d2f/real-ai/1166b72-claude/s0/2026-10-23T04-49-47-237Z-J05-web/01-news.png)
- [J05 driver log](https://github.com/vikas53953/foo-agent/blob/f2563fde5fb4dad939ff60d844962eb62b787d2f/real-ai/1166b72-claude/s0/2026-10-23T04-49-47-237Z-J05-web/log.jsonl)
- [J05 app log](https://github.com/vikas53953/foo-agent/blob/f2563fde5fb4dad939ff60d844962eb62b787d2f/real-ai/1166b72-claude/s0/2026-10-23T04-49-47-237Z-J05-web/app-log.jsonl)
- [J05 thread dump](https://github.com/vikas53953/foo-agent/blob/f2563fde5fb4dad939ff60d844962eb62b787d2f/real-ai/1166b72-claude/s0/2026-10-23T04-49-47-237Z-J05-web/thread.json)

The app log records `browser.ensure` for Edge and `job.stuck.budget`; it does not record `web.no_window`, `SEARCH_BUSY`, or an app-quit event before the terminal shot. This is an actual web-job stall after the settle fix, not evidence of the old premature-close bug.

## B14 evidence

The first post-reopen tortoise request passed: `endState:true`, `firstReplyMs:511`, `newBubbles:1`, `duplicates:0`, and a complete answer. The app log records `chat.turn_recovered` after relaunch. The pre-send cleanup stopped the prior journey's stale job (`stoppedStuckJob:true`); it is separate from the B14 target request.

- [B14 first post-reopen screenshot](https://github.com/vikas53953/foo-agent/blob/f2563fde5fb4dad939ff60d844962eb62b787d2f/real-ai/1166b72-claude/s0/2026-10-23T04-53-53-408Z-B14-restart-mid-reply/01-after-reopen.png)

The second post-reopen news request sent, waited, and relaunched successfully, but its final wait remained `stillWorking:true` for `150222 ms`. The terminal screenshot still shows “Looking on the web”, “Still working, this one takes a while”, and the Stop control. The app log ends with `job.waiting kind app_quit` during final cleanup, after the screenshot; no premature settle or early close occurred.

- [B14 second-request screenshot](https://github.com/vikas53953/foo-agent/blob/f2563fde5fb4dad939ff60d844962eb62b787d2f/real-ai/1166b72-claude/s0/2026-10-23T04-53-53-408Z-B14-restart-mid-reply/02-news-after-reopen.png)
- [B14 driver log](https://github.com/vikas53953/foo-agent/blob/f2563fde5fb4dad939ff60d844962eb62b787d2f/real-ai/1166b72-claude/s0/2026-10-23T04-53-53-408Z-B14-restart-mid-reply/log.jsonl)
- [B14 app log](https://github.com/vikas53953/foo-agent/blob/f2563fde5fb4dad939ff60d844962eb62b787d2f/real-ai/1166b72-claude/s0/2026-10-23T04-53-53-408Z-B14-restart-mid-reply/app-log.jsonl)
- [B14 thread dump](https://github.com/vikas53953/foo-agent/blob/f2563fde5fb4dad939ff60d844962eb62b787d2f/real-ai/1166b72-claude/s0/2026-10-23T04-53-53-408Z-B14-restart-mid-reply/thread.json)

The repair is therefore verified for its intended timing behavior: the driver preserves live web work until the configured wait expires. It does not make the underlying web task complete; J05 and B14's second request remain product/job-stall failures.
