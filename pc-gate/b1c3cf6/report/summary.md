# foo release gate on Vikas's PC: FAIL

Commit b1c3cf60468841a68ee418216dea150013d4eb0d, 1 round(s), AI: the signed-in Claude app (Claude Code 2.1.323 (Claude Code)), no API key.

| Feature | Verdict | Checkpoints | Broken | Wrong vs design |
|---|---|---|---|---|
| Install and open foo (the app as downloaded, restart, quit) | broken | 13 | 1 | 0 |
| Connect your AI (find it, your own key, a wrong key) | broken | 30 | 7 | 0 |
| Name, face and vibe | not-reviewed | 27 | 0 | 0 |
| Just chatting, in your language | not-reviewed | 91 | 0 | 0 |
| Settings, by page or by asking | not-reviewed | 28 | 0 | 0 |
| What batch 1 must refuse plainly (tasks, memory) | not-reviewed | 33 | 0 | 0 |
| Steps no feature claims (a failure here still turns the gate red) | broken | 9 | 3 | 0 |

Installer smoke test: skipped: foo is already installed at C:\Users\vikasmit\AppData\Local\Programs\foo; journeys drive the built app (dist/win-unpacked)
Not run on this PC (need a real API key): 35 step(s).
Report: C:\Users\vikasmit\foo-pc-gate\gate-report\index.html
