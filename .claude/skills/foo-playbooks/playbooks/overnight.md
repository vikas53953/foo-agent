### Overnight (any run Vikas is not watching)

**You own the exit condition. Define done, then drive to it.** Source: pstack guide 07 "Run work while you sleep" + `autonomous-run`.

Write this contract at the top of the decision log (`docs/decisions/M<n>.tsv`, phase `contract`) before the first change:

```
goal        one sentence
done means  checkable: e.g. "all M4 tickets merged into the milestone branch, each with a PASS proof block; CI green on the PR; checker green"
branch      own branch / worktree off <base>; one worktree per helper
may do      commit, push, open/mark-ready/merge the PR when CI + checker are green (Vikas's standing rule), approve forks on his behalf after an independent reviewer passes them
may not     real-world actions outside the repo (payments, messages to people, production), Vikas's own setup items, spec/golden edits without a CR
escape      truly stuck after real attempts: stop, write why in the log and the thread, leave the branch clean
```

The loop: check done → smallest change the evidence justifies → verify on the real app → commit if it moved, discard if not → one log row. A plateau means change approach, not stop. Never relax "done" to declare victory. foo-verify must work (doctor PASS) before any unattended loop starts.

Pitfalls (pstack guide 10): a green build is not proof; sort every review comment act / consider / noted / dismissed with a reason, never accept all; one worktree per parallel helper; a duration ("work 4 hours") is not a finish condition.

**Reply (morning):** done or not against the contract, what landed (PRs), what was discarded, decisions taken on Vikas's behalf (log rows), anything only he can do.
