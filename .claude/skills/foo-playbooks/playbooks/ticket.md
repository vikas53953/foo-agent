### Ticket (one thread, one ticket, built against the spec)

**You own one ticket in its own thread. The spec is the design; your job is to make it true and prove it.** Sources: pstack `feature` (the design steps are removed because the spec replaces them) and Matt Pocock `tdd`.

0. **Container set-up:** start `pnpm install --frozen-lockfile` in the background as your first command. Don't run `pnpm rebuild:electron` or `rebuild:node` in the cloud (the proxy returns 403; the prebuilt binaries already work). Wait for long runs with `run_in_background` and an `until grep -q …; do sleep 3; done` loop; a bare `sleep N` is blocked.
1. Read your section of `/mnt/project-files/foo/prep/M<n>-tickets.md`, then only the spec sections it cites. Read files in slices (`sed -n`, `grep`), never whole large files or CI logs.
2. Branch `claude/foo-m<n>-tNN-<slug>` off the milestone branch and open a **draft PR into the milestone branch** after your first commit.
3. Write the **seams** you will test at in the PR body: public interfaces such as an IPC channel, an engine function, or a rendered surface found by test id. Give each one a line on what it catches.
4. Build **red → green, one slice at a time** (`matt-tdd`): one failing test at one seam, then the least code that passes it, then repeat. Don't write all the tests first. Expected values come from the spec text, never recomputed the way the code computes them.
   - Quote each AT row's exact words in the test title, so "cross-fades" cannot quietly become "gone at once". For a state machine (moods, retry phases), one test per state and per way into it.
   - Put the test in the file the `spec/trace.csv` row names (unit vs e2e), and run `pnpm trace:check` right after flipping a row. In P1 + R1 a row naming the e2e file for a unit test failed the full chain five times.
   - CSS takes tokens only, comments included: ART-24a flags `8px`, `60ms` or `font-weight: 700` anywhere in a `.module.css`. It failed late in all four P1 wave-1 tickets.
   - Any e2e that reads an animation, style or clipboard state polls (`expect.poll`); a single read after a click passed on Linux and failed on Windows (AT-324).
   - Touching something always on screen (Face/Avatar, list rows, headers, a store selector): run the PERF-02/03/04 specs on your head and on the milestone build before the PR, and paste both p95 numbers. No `Intl.*` or `new Date` formatting inside selectors.
5. Follow the repo rules:
   - words through `t(key)` and test ids through `TID`;
   - tokens only;
   - a `// Spec:` header on every source file;
   - `typescript-best-practices`.

   Touch only the files your brief **OWNS**.
6. **Prove it in the real app** (`foo-verify`): write `test/verify/<NN-slug>.journey.ts` and run it. Keep before and after shots when the ticket changes something visible. Paste the proof block into the PR.
7. Commit in small ordered units: the test, then the code. Log any fork in the milestone's decision log.
8. When a ticket you depend on lands, or the lead asks, merge the milestone branch into yours (a merge commit, no rebase) and re-run the checks. Never `git stash`: commit work in progress, and compare against the base in a `git worktree`. Regenerate `spec/SPEC-MANIFEST.json` with `pnpm spec:verify --write` instead of editing its conflict markers; combine both sides row by row in `spec/trace.csv` and `docs/decisions/*.tsv`; for `scripts/copy-pending.json` take the base's version, then delete only the keys your ticket now uses.
9. **Ready**, in this order: merge `origin/<milestone branch>` in; `pnpm format`; the full check line; the proof at this head; confirm GitHub shows the PR as mergeable (a conflicting PR never starts CI: T7 waited 50 minutes on one). Then post `Ready: <sha>` as a PR comment **and** message the lead (`send_message`) with the PR link and SHA. Ready goes out when local checks and proof pass; don't wait for CI. Fix what the lead's review sends back, re-run the proof at the new head, and never merge your own PR. Assign Vikas to the PR; GitHub refuses him as reviewer because he is the author.
10. **Red CI:** save the job log to a file and grep it (`FAIL|✘|Error:|Expected|Received`); never read the whole log into context. Compare the failing tests with the lead's known-failures list; if a test is new, root-cause it. Report the result in one PR comment and one line to the lead. Re-running jobs returns 403 for this integration, so a fix lands as a push.

If the spec is silent or contradicts itself, take the most conservative option, write it in `implementation-notes.md`, log it, and flag it to the lead. Never invent a screen, word or flow.

**Reply** (three messages per ticket at most: PR open, ready, merged; each under 8 lines, plain words, times in IST, no "lane" or "tier" jargon; seams, proof and forks go in the PR body):
- what works now, from the user's side;
- whether anything is needed from Vikas (usually not);
- the PR link;
- anything not built and who owns it.

Over about 180k tokens in context: stop adding work, commit, and send the lead a one-paragraph state so a fresh thread can finish.
