#!/usr/bin/env bash
# Spec: 10-acceptance-2 §G.10 (performance traces per PERF id, 20 runs, p95 table: trace files + CSV), §E.2 (compare with
# the last build), G-M14-31 (evidence lives on the `evidence` orphan branch; agents cannot read CI artifacts).
# Pushes qa-evidence/<build>/perf to evidence:perf/<source-branch>/<short-sha>/ and perf/<source-branch>/latest/. Its own
# `perf/` tree, so the golden lane's <branch>/latest/ refresh never removes it; perf/main/latest/summary.json is the E.2
# baseline every PR run compares with.
# Env: GITHUB_TOKEN, GITHUB_REPOSITORY, SOURCE_BRANCH, HEAD_SHA, BUILD; optional GITHUB_SERVER_URL, GITHUB_RUN_ID.
set -euo pipefail
: "${GITHUB_TOKEN:?}" "${GITHUB_REPOSITORY:?}" "${SOURCE_BRANCH:?}" "${HEAD_SHA:?}" "${BUILD:?}"
short="${HEAD_SHA:0:7}"
src="$(pwd)/qa-evidence/$BUILD/perf"
[ -d "$src" ] || { echo "no perf evidence at $src"; exit 0; }
work="$(mktemp -d)"
auth="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\n')"
url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}.git"
cd "$work"
git init -q
git config core.autocrlf false
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git remote add origin "$url"
g() { git -c "http.extraheader=$auth" "$@"; }

dest="perf/$SOURCE_BRANCH"
for attempt in 1 2 3 4 5; do
  if g fetch -q --depth 1 origin evidence 2>/dev/null; then
    git checkout -q -B evidence FETCH_HEAD
  else
    git checkout -q --orphan "evidence-$attempt"
    git rm -rq --cached . 2>/dev/null || true
  fi
  rm -rf "${dest:?}/$short" "${dest:?}/latest"
  mkdir -p "$dest/$short" "$dest/latest"
  cp -R "$src/." "$dest/$short/"
  cp -R "$src/." "$dest/latest/"
  printf '%s\n' "run ${GITHUB_RUN_ID:-local} · commit $HEAD_SHA · build $BUILD" > "$dest/latest/RUN.txt"
  git add -A -- "$dest"
  if git diff --cached --quiet; then echo "perf evidence unchanged"; exit 0; fi
  git commit -q -m "Perf evidence: $SOURCE_BRANCH@$short (run ${GITHUB_RUN_ID:-local})"
  if g push -q origin HEAD:refs/heads/evidence; then
    echo "perf evidence pushed to evidence:$dest/$short and $dest/latest"
    exit 0
  fi
  echo "push raced another run (attempt $attempt); retrying"
  sleep $((attempt * 3))
done
echo "could not push perf evidence after 5 attempts" >&2
exit 1
