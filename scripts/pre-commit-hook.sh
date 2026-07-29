#!/usr/bin/env sh
# pre-commit-hook.sh — committed to the repo so "install-hooks" can copy it.
#
# Blocks any commit that includes a package-lock.json containing Replit's
# internal registry hostname. Run install-hooks.cjs once after cloning to
# wire this into your local .git/hooks/pre-commit.

# Only run when a lockfile is part of the staged files; skip otherwise.
if ! git diff --cached --name-only | grep -q 'package-lock\.json'; then
  exit 0
fi

node "$(git rev-parse --show-toplevel)/scripts/check-lockfiles.cjs"
