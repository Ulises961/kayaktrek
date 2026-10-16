#!/usr/bin/env bash
# Refuses a commit made on the default branch.
#
# GitHub branch protection is unavailable on this plan (the API answers 403), so this local
# hook is the only guard. It stops an accident, not a determined bypass: `--no-verify` skips
# every git hook, and a checkout whose branch predates this file runs its own lefthook.yml.
#
# This is a lefthook script, not a command, on purpose: lefthook skips a command that has no
# staged files to look at, which would let an empty commit on master through. Scripts always run.
#
# Deliberate exception: ALLOW_MASTER_COMMIT=1
set -euo pipefail

[[ "${ALLOW_MASTER_COMMIT:-}" == 1 ]] && exit 0

# Empty while HEAD is detached (mid-rebase, cherry-pick), which is never the default branch.
current_ref=$(git symbolic-ref -q HEAD || true)

if [[ "$current_ref" =~ ^refs/heads/(master|main)$ ]]; then
  echo "❌ Refusing to commit on ${current_ref#refs/heads/}."
  echo "   Cut a branch first: git switch -c <type>/<short-description>"
  echo "   (the work you staged moves with you). Deliberate exception: ALLOW_MASTER_COMMIT=1"
  exit 1
fi
