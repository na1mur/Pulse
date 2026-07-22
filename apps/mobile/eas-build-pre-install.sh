#!/usr/bin/env bash
set -euo pipefail

echo ">>> EAS pre-install hook: running pnpm install --no-frozen-lockfile"
# Run install without frozen-lockfile constraint first so that the lockfile is
# regenerated to match the EAS server's pnpm version.  EAS will then run its
# own `pnpm install --frozen-lockfile` which will succeed because the lockfile
# now matches.
pnpm install --no-frozen-lockfile
echo ">>> EAS pre-install hook: done"
