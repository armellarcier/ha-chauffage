#!/bin/sh
# Runs a review script in the Playwright Docker image, against the development HA.
#   dev/review/run.sh <script.mjs> [arguments…]
# Environment:
#   OUT       where the screenshots go (default: ./out, next to this file)
#   HA_PORT   the port of the development HA on this machine (default: 8124)
#   REPO      the ha-chauffage repository, for dev/hass/.dev-token (default: the repository of this folder)
PLAYWRIGHT=1.55.0
[ $# -ge 1 ] && [ -f "$1" ] || { echo "usage: run.sh <script.mjs> [arguments…]" >&2; exit 2; }
script="$1"; shift
here="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
dir="$(cd "$(dirname "$script")" && (pwd -W 2>/dev/null || pwd))"
out="${OUT:-$here/out}"
mkdir -p "$out"
out="$(cd "$out" && (pwd -W 2>/dev/null || pwd))"
repo="${REPO:-$(cd "$here/../.." && (pwd -W 2>/dev/null || pwd))}"
# Docker would create a missing file to mount as an empty directory, and the setup could no
# longer write the token there
[ -f "$repo/dev/hass/.dev-token" ] || {
  echo "run.sh: no $repo/dev/hass/.dev-token. Start the development HA first (docker compose -f dev/compose.yaml up -d), or set REPO." >&2
  exit 2
}
# The script and its arguments reach node as positional parameters, never as shell text.
# The volume is named after the Playwright version: the npm package must match the browsers
# of the image.
MSYS_NO_PATHCONV=1 docker run --rm --ipc=host --add-host=host.docker.internal:host-gateway \
  -e TZ=Europe/Paris -e HA_URL="http://host.docker.internal:${HA_PORT:-8124}" -e OUT_DIR=/out \
  -v "$here:/review" -v "$dir:/work" -v "$out:/out" -v "$repo/dev/hass/.dev-token:/token:ro" \
  -v "ha-review-playwright-$PLAYWRIGHT:/review/node_modules" -w /work \
  "mcr.microsoft.com/playwright:v$PLAYWRIGHT-noble" \
  sh -c '[ -d /review/node_modules/playwright ] || (cd /review && npm install --silent --no-save --no-audit --no-fund "playwright@$0" >/dev/null); script="$1"; shift; exec node "/work/$script" "$@"' \
  "$PLAYWRIGHT" "$(basename "$script")" "$@"
