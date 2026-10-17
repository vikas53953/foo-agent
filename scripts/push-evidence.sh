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
copy golden/ref/bp refs/bp
copy golden/ref/ux refs/ux
copy golden/out/tier-r tier-r
copy test-results/fid-14.json fid-14.json
printf '%s\n' "run ${GITHUB_RUN_ID:-local} · commit $HEAD_SHA · milestone $MILESTONE" > "$stage/RUN.txt"

auth="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\n')"
url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}.git"
cd "$work"
git init -q
git config core.autocrlf false
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git remote add origin "$url"
g() { git -c "http.extraheader=$auth" "$@"; }

for attempt in 1 2 3 4 5; do
  if g fetch -q --depth 1 origin evidence 2>/dev/null; then
    git checkout -q -B evidence FETCH_HEAD
  else
    git checkout -q --orphan "evidence-$attempt"
    git rm -rq --cached . 2>/dev/null || true
  fi
  rm -rf "${SOURCE_BRANCH:?}/$short" "${SOURCE_BRANCH:?}/latest"
  mkdir -p "$SOURCE_BRANCH/$short" "$SOURCE_BRANCH/latest"
  cp -R "$stage/." "$SOURCE_BRANCH/$short/"
  cp -R "$stage/." "$SOURCE_BRANCH/latest/"
  git add -A -- "$SOURCE_BRANCH"
  if git diff --cached --quiet; then echo "evidence unchanged"; exit 0; fi
  git commit -q -m "Evidence: $SOURCE_BRANCH@$short (run ${GITHUB_RUN_ID:-local}, $MILESTONE)"
  if g push -q origin HEAD:refs/heads/evidence; then
    echo "evidence pushed to evidence:$SOURCE_BRANCH/$short and $SOURCE_BRANCH/latest"
    exit 0
  fi
  echo "push raced another run (attempt $attempt); retrying"
  sleep $((attempt * 3))
done
echo "could not push evidence after 5 attempts" >&2
cd "$repo_dir"
exit 1
