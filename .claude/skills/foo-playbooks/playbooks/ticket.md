### Ticket (one thread, one ticket, built against the spec)

**You own one ticket in its own thread. The spec is the design; your job is to make it true and prove it.** Sources: pstack `feature` (the design steps are removed because the spec replaces them) and Matt Pocock `tdd`.

1. Read your section of `/mnt/project-files/foo/prep/M<n>-tickets.md`, then only the spec sections it cites.
2. Branch `claude/foo-m<n>-tNN-<slug>` off the milestone branch and open a **draft PR into the milestone branch** after your first commit.
3. Write the **seams** you will test at in the PR body: public interfaces such as an IPC channel, an engine function, or a rendered surface found by test id. Give each one a line on what it catches.
4. Build **red → green, one slice at a time** (`matt-tdd`): one failing test at one seam, then the least code that passes it, then repeat. Don't write all the tests first. Expected values come from the spec text, never recomputed the way the code computes them.
5. Follow the repo rules:
   - words through `t(key)` and test ids through `TID`;
   - tokens only;
   - a `// Spec:` header on every source file;
   - `typescript-best-practices`.

   Touch only the files your brief **OWNS**.
6. **Prove it in the real app** (`foo-verify`): write `test/verify/<NN-slug>.journey.ts` and run it. Keep before and after shots when the ticket changes something visible. Paste the proof block into the PR.
7. Commit in small ordered units: the test, then the code. Log any fork in the milestone's decision log.
8. When a ticket you depend on lands, or the lead asks, merge the milestone branch into yours (a merge commit, no rebase) and re-run the checks.
9. Before opening the PR, run the **fresh-eyes self-check** (`foo-review` §0) and `pnpm review:tier`; paste the tier line in the PR.
10. When the fast checks and the proof are green, **message the lead** (`send_message`) with the PR link and head SHA. Fix what the lead's review sends back. Never merge your own PR.

If the spec is silent or contradicts itself, take the most conservative option, write it in `implementation-notes.md`, log it, and flag it to the lead. Never invent a screen, word or flow.

**Reply:**
- what works now, from the user's side;
- the seams tested;
- the proof block;
- the PR link;
- any deviations.
