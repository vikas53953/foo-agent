### Ticket (feature against the spec)

**You own one ticket. The spec is the design; your job is to make it true and prove it.** Source: pstack `feature` (design steps removed, the spec replaces them) + Matt Pocock `tdd`.

1. Read the ticket file, then only the spec sections it cites. Write down in the ticket the **seams** you will test at (public interfaces: an IPC channel, an engine function, a rendered surface by test id), one line each on what it catches.
2. **Red → green, one slice at a time** (`matt-tdd`): one failing test at one seam, the least code that passes it, repeat. No bulk tests first. Expected values come from the spec text, never recomputed the way the code does.
3. Follow the repo rules: words via `t(key)`, test ids via `TID`, tokens only, `@spec`/`// Spec:` header on every source file, `typescript-best-practices`.
4. **Prove it in the real app** (`foo-verify`): write `test/verify/<NN-slug>.journey.ts`, run it, keep before/after when the ticket changes something visible.
5. Commit in small ordered units (test, then code). Keep the decision log for any fork.
6. Report with the helper brief's REPORT fields. Do not merge yourself.

Spec silent or contradictory: take the most conservative option, write it in `implementation-notes.md`, log it, and flag it in the report. Never invent a screen, word or flow.

**Reply:** what works now (from the user's side), seams tested, the proof block, deviations.
