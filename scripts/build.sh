#!/usr/bin/env bash
# Builds the card: esbuild bundles frontend/src into custom_components/chauffage/frontend/.
# Uses the installed Node when available, otherwise Docker (nothing to install apart from Docker).
#   scripts/build.sh          → in this repository
#   scripts/build.sh <dir>    → in <dir>, a copy of the repository: scripts/deploy.sh builds a commit
set -euo pipefail
cd "${1:-$(dirname "$0")/..}"

if command -v node >/dev/null && command -v npm >/dev/null; then
  npm install --no-audit --no-fund --silent && node scripts/build.mjs
else
  # Git Bash on Windows: a Windows path, no MSYS conversion
  root="$(pwd -W 2>/dev/null || pwd)"
  MSYS_NO_PATHCONV=1 docker run --rm -v "$root:/app" -v ha-chauffage-build-modules:/app/node_modules -w /app \
    node:24-alpine sh -c 'npm install --no-audit --no-fund --silent && node scripts/build.mjs'
fi
