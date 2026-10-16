#!/usr/bin/env bash
# Refuses a push that would update, create or delete the default branch on the remote.
#
# GitHub branch protection is unavailable on this plan (the API answers 403), so this local
# hook is the only guard. It stops an accident, not a determined bypass: `--no-verify` skips
# every git hook, and a checkout whose branch predates this file runs its own lefthook.yml.
#
# It reads the REMOTE ref from stdin, not the current branch: `git push origin HEAD:master`
# from a feature branch lands on master just the same, and `git push origin :master` deletes it.
# It is a lefthook script, not a command, on purpose: lefthook skips a command when the push
# has no changed files, which would let a no-net-change push to master through.
#
# Deliberate exception: ALLOW_MASTER_PUSH=1
set -euo pipefail

[[ "${ALLOW_MASTER_PUSH:-}" == 1 ]] && exit 0

# pre-push receives one line per ref on stdin: <local ref> <local sha> <remote ref> <remote sha>
while read -r local_ref _ remote_ref _; do
  if [[ "$remote_ref" =~ ^refs/heads/(master|main)$ ]]; then
    echo "❌ Refusing to push ${local_ref} to ${remote_ref#refs/heads/}."
    echo "   Push a branch and open a PR: git push -u origin <branch> && gh pr create"
    echo "   Deliberate exception: ALLOW_MASTER_PUSH=1"
    exit 1
  fi
done
