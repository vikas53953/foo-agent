#!/usr/bin/env bash
# Spec: 11-fidelity §11.6.1 (fresh evidence from the commit it names); docs/build-method.md "Proof".
# Pushes one foo-verify folder (qa-evidence/verify/<name>) to the orphan branch `evidence` at
# verify/<branch>/<sha7>/<name>/ and prints the PR body's proof block with picture links that render on the public repo.
# Usage: bash scripts/push-verify-evidence.sh qa-evidence/verify/<name>
set -euo pipefail
src="${1:?usage: push-verify-evidence.sh qa-evidence/verify/<name>}"
[ -f "$src/after/run.json" ] || { echo "no $src/after/run.json: run foo-verify first" >&2; exit 2; }
name="$(basename "$src")"
short="$(git rev-parse --short=7 HEAD)"
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" != "HEAD" ] || branch="detached"
dest="verify/$branch/$short/$name"
slug="$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
repo_dir="$(pwd)"
work="$(mktemp -d)"
trap 'cd "$repo_dir"; git worktree remove --force "$work" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

pushed=""
for attempt in 1 2 3 4 5; do
  git fetch -q origin evidence
  git worktree remove --force "$work" >/dev/null 2>&1 || true
  rm -rf "$work"
  git worktree add -q --detach "$work" FETCH_HEAD
  rm -rf "${work:?}/$dest"
  mkdir -p "$work/$dest"
  cp -R "$src/." "$work/$dest/"
  cd "$work"
  git add -A -- "$dest"
  if git diff --cached --quiet; then pushed="unchanged"; cd "$repo_dir"; break; fi
  git commit -q -m "Evidence: foo-verify $name on $branch@$short"
  if git push -q origin HEAD:refs/heads/evidence; then pushed="yes"; cd "$repo_dir"; break; fi
  cd "$repo_dir"
  echo "push raced another run (attempt $attempt); retrying" >&2
  sleep $((attempt * 3))
done
[ -n "$pushed" ] || { echo "could not push evidence after 5 attempts" >&2; exit 1; }
echo "evidence: $dest ($pushed)" >&2
pnpm -s tsx scripts/foo-verify.ts --markdown "$src" --base-url "https://raw.githubusercontent.com/$slug/evidence/$dest"
