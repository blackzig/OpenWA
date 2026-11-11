#!/usr/bin/env bash
# Stage (DO NOT DEPLOY) upstream OpenWA v0.30.0 over the customized PR chain.
# Usage: bash scripts/stage-openwa-v030.sh [/opt/openwa-vps-stage] [/opt/openwa-v030-stage]
set -euo pipefail

ROOT="${1:-/opt/openwa-vps-stage}"
STAGE="${2:-/opt/openwa-v030-stage}"
FEATURE_REF="refs/heads/feature/bulk-results-report-0250"
UPSTREAM_REF="refs/tags/v0.30.0"
INTEGRATION_BRANCH="integration/openwa-v0.30.0"

if ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Repository not found in $ROOT" >&2
  exit 2
fi
if [ -e "$STAGE" ]; then
  echo "Refusing to reuse existing staging path: $STAGE" >&2
  exit 2
fi
if git -C "$ROOT" show-ref --verify --quiet "refs/heads/$INTEGRATION_BRANCH"; then
  echo "Integration branch already exists locally; refusing to overwrite it" >&2
  exit 2
fi

echo "Fetching feature branch from blackzig/OpenWA (no running container is changed)..."
git -C "$ROOT" fetch --no-tags https://github.com/blackzig/OpenWA.git "$FEATURE_REF"
FEATURE_SHA="$(git -C "$ROOT" rev-parse 'FETCH_HEAD^{commit}')"

echo "Fetching upstream release v0.30.0..."
git -C "$ROOT" fetch --no-tags https://github.com/rmyndharis/OpenWA.git "$UPSTREAM_REF"
UPSTREAM_SHA="$(git -C "$ROOT" rev-parse 'FETCH_HEAD^{commit}')"

echo "Customized base: $FEATURE_SHA"
echo "Upstream release: $UPSTREAM_SHA"

# The customized fork currently has a separate Git history from upstream v0.30.0.
# An unrelated-histories merge is not an upgrade strategy: avoid mass unrelated conflicts.
if ! git -C "$ROOT" merge-base "$FEATURE_SHA" "$UPSTREAM_SHA" >/dev/null 2>&1; then
  echo "UPGRADE NOT APPLIED: customized branch and upstream v0.30.0 have unrelated histories."
  echo "Safely transplant the custom bulk features onto a fresh v0.30.0 branch and validate migrations."
  echo "Do not use --allow-unrelated-histories as an automatic upgrade."
  echo "Running container and current working tree were not changed."
  exit 3
fi
echo "Creating isolated worktree: $STAGE"
git -C "$ROOT" worktree add --detach "$STAGE" "$FEATURE_SHA"
git -C "$STAGE" switch -c "$INTEGRATION_BRANCH"

echo "Attempting non-committing merge in isolated worktree..."
set +e
git -C "$STAGE" -c user.name="OpenWA Upgrade Staging" -c user.email="upgrade-staging@example.invalid" \
  merge --no-ff --no-commit "$UPSTREAM_SHA"
CODE=$?
set -e

if [ "$CODE" -eq 0 ]; then
  echo "Merge staged without conflicts. No commit, push, build or deploy was performed."
  echo "Before any deployment, inspect the full diff, migrations and custom bulk behavior;"
  echo "then run dashboard/backend tests and verify sessions and existing SQLite data."
else
  echo "Merge stopped with conflicts (expected when customizations touch upstream files)."
  echo "Conflicted files:"
  git -C "$STAGE" diff --name-only --diff-filter=U || true
  echo "Do NOT deploy or force a merge. Resolve and test conflicts in the staging worktree."
fi

echo "Staging status:"
git -C "$STAGE" status --short | sed -n '1,80p'
echo "Production container and active worktree were not restarted or rebuilt."
echo "Staging directory: $STAGE"
