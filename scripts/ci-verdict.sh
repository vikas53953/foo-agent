#!/usr/bin/env bash
# Spec: docs/build-method.md §8; retro lever 3. Marks each failing CI test of a PR mine / known / new and prints a short
# digest (scripts/ci-verdict.ts holds the rules). `--post` also writes it as one PR comment, updated in place.
# Usage: scripts/ci-verdict.sh <pr> [--post]   |   scripts/ci-verdict.sh --log <saved-job-log> [--base origin/main]
set -euo pipefail
cd "$(dirname "$0")/.."
NODE_USE_ENV_PROXY="${HTTPS_PROXY:+1}" NODE_NO_WARNINGS=1 exec pnpm exec tsx scripts/ci-verdict.ts "$@"
