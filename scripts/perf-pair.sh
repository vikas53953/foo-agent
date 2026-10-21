#!/usr/bin/env bash
# Spec: 10-acceptance-2 §E PERF-02/03/04 (typing, chat switch, fling scroll budgets); docs/build-method.md (a ticket that
# changes something always on screen reports speed on its head and on the base). Runs the PERF specs on this checkout and
# on a base worktree with the same machine, and prints both sets of numbers side by side. In the cloud container the
# absolute numbers come from a software renderer and are not budgets (docs/known-red.tsv); the head-vs-base change is the
# signal. Windows CI stays the judge of the budgets.
# Usage: bash scripts/perf-pair.sh [base-ref] [grep]   (defaults: origin/main, "PERF-0[234]")
set -euo pipefail
base="${1:-origin/main}"
grep_re="${2:-PERF-0[234]}"
here="$(pwd)"
wt="$(dirname "$here")/foo-perf-base"
out="$here/qa-evidence/perf-pair"
mkdir -p "$out"
run_perf() { # <dir> <label>
  (cd "$1" && xvfb-run -a pnpm exec playwright test -g "$grep_re" --reporter=list) >"$out/$2.log" 2>&1 || true
}
cleanup() { git -C "$here" worktree remove --force "$wt" >/dev/null 2>&1 || true; }
trap cleanup EXIT

git fetch -q origin "${base#origin/}" || true
cleanup
git worktree add --detach "$wt" "$base" >/dev/null
(cd "$wt" && pnpm install --frozen-lockfile --ignore-scripts >/dev/null && node node_modules/electron/install.js >/dev/null && pnpm build >/dev/null)
pnpm build >/dev/null

echo "Running $grep_re on $base ($(git -C "$wt" rev-parse --short HEAD)) ..."
run_perf "$wt" base
echo "Running $grep_re on HEAD ($(git rev-parse --short HEAD)) ..."
run_perf "$here" head

pick() { grep -E 'p95|fps|frames|PERF-0[0-9]+ ' "$out/$1.log" | grep -vE '^\s*$' | sed 's/^\s*//' || echo "(no numbers; see $out/$1.log)"; }
echo
echo "## perf:pair ($grep_re)"
echo
echo "### base $base"
pick base
echo
echo "### head"
pick head
echo
echo "Logs: $out/base.log, $out/head.log"
