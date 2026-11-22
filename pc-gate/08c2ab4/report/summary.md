# foo release gate on Vikas's PC: FAIL

Commit 08c2ab4edfc3ce6a41c0bcfe999abedeabf54645, 1 round(s), AI: the signed-in Claude app (Claude Code 2.1.323 (Claude Code)), no API key.

| Feature | Verdict | Checkpoints | Broken | Wrong vs design |
|---|---|---|---|---|
| Install and open foo (the app as downloaded, restart, quit) | not-reviewed | 13 | 0 | 0 |
| Connect your AI (find it, your own key, a wrong key) | broken | 25 | 1 | 0 |
| Name, face and vibe | not-reviewed | 28 | 0 | 0 |
| Just chatting, in your language | not-reviewed | 91 | 0 | 0 |
| Settings, by page or by asking | not-reviewed | 29 | 0 | 0 |
| What batch 1 must refuse plainly (tasks, memory) | broken | 33 | 1 | 0 |
| Steps no feature claims (a failure here still turns the gate red) | not-reviewed | 5 | 0 | 0 |

Installer smoke test: skipped: foo is already installed at C:\Users\vikasmit\AppData\Local\Programs\foo; journeys drive the built app (dist/win-unpacked)
Not run on this PC (need a real API key): 35 step(s).
Report: C:\Users\vikasmit\foo-pc-gate\gate-report\index.html
