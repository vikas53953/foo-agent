# foo release gate on Vikas's PC: FAIL

Commit 1c381545e5057f54acac51e71fefc4e8da5cf1b1, 1 round(s), AI: the signed-in Claude app (Claude Code 2.1.323 (Claude Code)), no API key.

| Feature | Verdict | Checkpoints | Broken | Wrong vs design |
|---|---|---|---|---|
| Install and open foo (the app as downloaded, restart, quit) | works | 13 | 0 | 0 |
| Connect your AI (find it, your own key, a wrong key) | wrong-design | 25 | 0 | 10 |
| Name, face and vibe | wrong-design | 28 | 0 | 7 |
| Just chatting, in your language | broken | 92 | 1 | 9 |
| Settings, by page or by asking | wrong-design | 35 | 0 | 7 |
| What batch 1 must refuse plainly (tasks, memory) | wrong-design | 33 | 0 | 1 |

Installer smoke test: skipped: foo is already installed at C:\Users\vikasmit\AppData\Local\Programs\foo; journeys drive the built app (dist/win-unpacked)
Not run on this PC (need a real API key): 35 step(s).
Report: C:\Users\vikasmit\foo-pc-gate\gate-report\index.html
