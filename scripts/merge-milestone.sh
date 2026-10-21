#!/usr/bin/env bash
# Spec: docs/build-method.md §1 and §3 (only the lead merges; shared files have one owner at a time); retro lever 1
# (/mnt/project-files/foo/retro/findings.md). Merges a ticket or milestone branch into the current branch and settles
# the files every ticket appends to, so a lead never hand-merges them again:
#   spec/trace.csv, docs/decisions/*.tsv           row merge (scripts/merge-rows.ts)
#   scripts/copy-pending.json, src/shared/copy/en-IN.json   key-by-key JSON merge
#   spec/SPEC-MANIFEST.json                         regenerated from the merged spec/ (pnpm spec:verify --write)
# Anything else that conflicts, or a row or key changed differently on both sides, is a real clash: the script stops,
# lists it, and leaves the merge open for a person to finish. It never pushes.
# Usage: scripts/merge-milestone.sh <branch-or-ref> [--no-commit]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

ref="${1:-}"
[ -n "$ref" ] && [ "$ref" != "--no-commit" ] || { echo "usage: scripts/merge-milestone.sh <branch-or-ref> [--no-commit]" >&2; exit 2; }
commit=1
[ "${2:-}" = "--no-commit" ] && commit=0
git rev-parse --verify -q "$ref^{commit}" > /dev/null || { echo "no such ref: $ref" >&2; exit 2; }
git diff --quiet && git diff --cached --quiet || { echo "the working tree has changes; commit or stash them first" >&2; exit 2; }

tsx() { pnpm exec tsx "$@"; }

if git merge-base --is-ancestor "$ref" HEAD; then
  echo "nothing to merge: $ref is already in $(git branch --show-current)"
  exit 0
fi
git merge --no-ff --no-commit "$ref" > /dev/null 2>&1 || true
git rev-parse -q --verify MERGE_HEAD > /dev/null || { echo "git could not start the merge of $ref" >&2; exit 2; }

real=()
regen=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in
    spec/trace.csv) kind=csv ;;
    docs/decisions/*.tsv) kind=tsv ;;
    scripts/copy-pending.json | src/shared/copy/en-IN.json) kind=json ;;
    spec/SPEC-MANIFEST.json) regen=1; continue ;;
    *) real+=("$f"); continue ;;
  esac
  if tsx scripts/merge-rows.ts "$kind" "$f"; then
    git add -- "$f"
    case "$f" in spec/*) regen=1 ;; esac # the manifest pins every spec/ file, trace.csv too
  else
    real+=("$f")
  fi
done < <(git diff --name-only --diff-filter=U)

if [ "$regen" = 1 ]; then
  case " ${real[*]:-} " in
    *" spec/"*) spec_clash=1 ;;
    *) spec_clash=0 ;;
  esac
  if [ "$spec_clash" = 0 ]; then
    git diff --name-only --diff-filter=U -- spec/SPEC-MANIFEST.json | grep -q . && git checkout --theirs -- spec/SPEC-MANIFEST.json
    tsx scripts/spec-verify.ts --write > /dev/null
    git add -- spec/SPEC-MANIFEST.json
    echo "spec/SPEC-MANIFEST.json: regenerated from the merged spec/"
  else
    real+=("spec/SPEC-MANIFEST.json (regenerate once the spec/ clash above is settled: pnpm spec:verify --write)")
  fi
fi

# The JSON merge writes 2-space JSON; prettier owns the final layout.
json=$(git diff --cached --name-only -- scripts/copy-pending.json src/shared/copy/en-IN.json)
[ -z "$json" ] || { pnpm exec prettier --write $json > /dev/null && git add -- $json; }

if [ ${#real[@]} -gt 0 ]; then
  echo "real clashes, settle these by hand, then commit:" >&2
  printf '  %s\n' "${real[@]}" >&2
  exit 1
fi

for check in spec-verify trace-check; do
  tsx "scripts/$check.ts" > /dev/null || { echo "merged, but $check fails on the result: fix it, then commit (the merge is staged)" >&2; exit 1; }
done
if [ "$commit" = 1 ]; then
  git commit -q --no-edit
  echo "merge committed: $(git log -1 --format='%h %s')"
else
  echo "merge staged, not committed (--no-commit)"
fi
