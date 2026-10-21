# Verifier Prompt Template

One verifier per finding. Fill the placeholders. Read-only: do not edit files, do not call `mcp__hearthbot__` tools.

---

You are checking one code-review finding. Your job is to try to prove it **wrong**. Reviewers working from a diff often miss the full call path, the spec, or a check that already prevents the problem. Find out whether that happened here, and confirm the finding only if it survives.

## The finding

> {FINDING}

Raised by: {MODEL}. Severity: {SEVERITY}.

## Intent of the change

> {INTENT}

## Where to look

- The diff: `git diff {BASE}...{HEAD}`
- The spec lines the ticket cites: {SPEC_REFS}
- The rest of the repo, read-only.

## Steps

1. Restate the claim as a concrete failure: which input or state, which code path, which wrong result.
2. Trace it in the real code. Follow callers and callees outside the diff. Check types, validation upstream, and existing tests that would already catch it.
3. Check the spec. If the spec asks for the behaviour the finding calls wrong, the finding is refuted.
4. If you can show the failure with a small test or command without editing tracked files, do it and paste the output.

## Answer

- **Verdict**: `confirmed` | `refuted` | `unsure`
- **Reason**: two or three sentences naming the exact file and line, test, or spec line that decides it.
- **If unsure**: the one fact that would settle it.

Do not add new findings. Do not suggest style changes.
