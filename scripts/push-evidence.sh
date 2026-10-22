#!/usr/bin/env bash
# Spec: 11-fidelity §11.6.1 (fresh evidence: every picture and result comes from the commit and CI run the report names).
# CI artifacts cannot be read by the build agents, so the golden lane pushes this run's evidence to the orphan branch
# `evidence`: <source-branch>/<short-sha>/ and <source-branch>/latest/ (overwritten each run). Only the report, its JSON,
# the runner identity, the milestone's reference PNGs/JSON and Tier R output are pushed, never the 490 UX frames.
# Env: GITHUB_TOKEN, GITHUB_REPOSITORY, SOURCE_BRANCH, HEAD_SHA, MILESTONE; optional GITHUB_SERVER_URL, GITHUB_RUN_ID.
set -euo pipefail
: "${GITHUB_TOKEN:?}" "${GITHUB_REPOSITORY:?}" "${SOURCE_BRANCH:?}" "${HEAD_SHA:?}" "${MILESTONE:?}"
short="${HEAD_SHA:0:7}"
repo_dir="$(pwd)"
stage="$(mktemp -d)"
work="$(mktemp -d)"

copy() { # copy <src> <dest under the stage>, skipping what this run did not produce
  if [ -e "$1" ]; then
    mkdir -p "$stage/$(dirname "$2")"
    cp -R "$1" "$stage/$2"
  fi
}
copy "qa-evidence/$MILESTONE/fidelity.html" fidelity.html
copy "qa-evidence/$MILESTONE/fidelity.json" fidelity.json
copy golden/runner.json runner.json
copy golden/ref/determinism.json determinism.json
copy golden/ref/determinism-second determinism-second
copy golden/ref/bp refs/bp
copy golden/ref/ux refs/ux
copy golden/out/tier-r tier-r
for f in test-results/fid-14*.json; do copy "$f" "$(basename "$f")"; done # one per E2E that measures spec values
printf '%s\n' "run ${GITHUB_RUN_ID:-local} · commit $HEAD_SHA · milestone $MILESTONE" > "$stage/RUN.txt"

auth="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\n')"
url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}.git"
cd "$work"
git init -q --bare
git config core.autocrlf false
git remote add origin "$url"
g() { git -c "http.extraheader=$auth" "$@"; }
export GIT_NO_LAZY_FETCH=1 # never pull in the contents of the other folders
export GIT_AUTHOR_NAME="github-actions[bot]" GIT_AUTHOR_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
# This run's two folders, laid out as they sit on the branch.
tree_dir="$(mktemp -d)"
mkdir -p "$tree_dir/$SOURCE_BRANCH/$short" "$tree_dir/$SOURCE_BRANCH/latest"
cp -R "$stage/." "$tree_dir/$SOURCE_BRANCH/$short/"
cp -R "$stage/." "$tree_dir/$SOURCE_BRANCH/latest/"

# No checkout: the branch's trees are fetched without file contents (other branches' pictures filled the runner's disk,
# #123), this run's folders are swapped in the index, and the commit is built on the fetched tip. Nothing is pruned.
for attempt in 1 2 3 4 5; do
  rm -f index
  parent=()
  # A fetch that fails is retried, never taken for "no branch yet": a parentless commit would drop every other folder.
  if g ls-remote --exit-code -q origin refs/heads/evidence >/dev/null; then
    if ! g fetch -q --depth 1 --filter=blob:none origin "+refs/heads/evidence:refs/remotes/origin/evidence"; then
      echo "evidence fetch failed (attempt $attempt); retrying"
      sleep $((attempt * 3))
      continue
    fi
    tip="$(git rev-parse refs/remotes/origin/evidence)"
    parent=(-p "$tip")
    git read-tree "$tip"
  fi
  git --work-tree="$tree_dir" add -A -- "$SOURCE_BRANCH/$short" "$SOURCE_BRANCH/latest"
  tree="$(git write-tree --missing-ok)"
  if [ ${#parent[@]} -gt 0 ] && [ "$tree" = "$(git rev-parse "$tip^{tree}")" ]; then echo "evidence unchanged"; exit 0; fi
  commit="$(git commit-tree "$tree" "${parent[@]}" -m "Evidence: $SOURCE_BRANCH@$short (run ${GITHUB_RUN_ID:-local}, $MILESTONE)")"
  if g push -q origin "$commit:refs/heads/evidence"; then
    echo "evidence pushed to evidence:$SOURCE_BRANCH/$short and $SOURCE_BRANCH/latest"
    exit 0
  fi
  echo "push raced another run (attempt $attempt); retrying"
  sleep $((attempt * 3))
done
echo "could not push evidence after 5 attempts" >&2
cd "$repo_dir"
exit 1
