#!/usr/bin/env bash
# Spec: Test-First Pipeline G5 (a monthly real-AI spend cap with an alert). Opens one GitHub issue per month and level
# (alert at the budget's percent, over at the cap), assigned to the repo owner so GitHub notifies him; never a second
# copy. Reads the JSON that `real-ai-budget.ts check` prints. Needs GH_TOKEN with issues: write.
# Usage: scripts/real-ai-alert.sh '<check json>' <YYYY-MM>
set -euo pipefail
json="$1"
month="$2"
field() { node -e "process.stdout.write(String(JSON.parse(process.argv[1])[process.argv[2]]))" "$json" "$1"; }
state=$(field state)
[ "$state" = "ok" ] && { echo "spend ok: ₹$(field spentInr) of ₹$(field capInr)"; exit 0; }
tag="[real-ai-spend $month $state]"
if [ -n "$(gh issue list --repo "$GITHUB_REPOSITORY" --state all --search "\"$tag\" in:title" --json number --jq '.[].number')" ]; then
  echo "already raised: $tag"
  exit 0
fi
if [ "$state" = "over" ]; then
  title="Real-AI spend cap reached for $month: real-AI runs paused $tag"
  what="New real-AI runs will not start until the month ends or the cap in test/real-pc/budget.json is raised."
else
  title="Real-AI spend at $(field percent)% of the monthly cap for $month $tag"
  what="Runs continue. They stop by themselves at the cap."
fi
body="Real-AI test spend this month (UTC): **₹$(field spentInr) of ₹$(field capInr)** ($(field percent)%), \$$(field spentUsd) over $(field runs) run(s).

$what

Ledger: \`real-ai/spend/$month.tsv\` on the \`evidence\` branch. Workflow run: $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
gh issue create --repo "$GITHUB_REPOSITORY" --title "$title" --body "$body" --assignee "$GITHUB_REPOSITORY_OWNER"
