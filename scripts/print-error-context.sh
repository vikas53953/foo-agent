#!/usr/bin/env bash
# Spec: foo-plan §2 (CI). Prints Playwright's error-context.md (the page's state when a test failed) for every failed e2e
# test, one log group each. CI artifacts are out of reach for the agents that fix CI; the job log is not.
set -u
found=0
while IFS= read -r -d '' f; do
  found=1
  echo "::group::${f}"
  cat "$f"
  echo
  echo "::endgroup::"
done < <(find test-results -name error-context.md -print0 2>/dev/null)
[ "$found" = 1 ] || echo "No error-context.md under test-results/."
exit 0
