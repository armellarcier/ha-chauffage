#!/usr/bin/env bash
# Records the demos of the README (docs/media/<name>.gif).
#   scripts/demo.sh                 every demo: week, override, panel
#   scripts/demo.sh override        one demo (dev/demo/scenarios/override.mjs)
# The script starts a new demo HA (http://localhost:8127) whose clock runs on a Tuesday at
# 17:30, records the demos against it, then removes it. DEMO_TIME picks another time, for
# example DEMO_TIME="wednesday 08:00"; DEMO_KEEP=1 keeps the demo HA running.
# Everything runs in Docker: Home Assistant with libfaketime, Playwright, ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
root="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1

PLAYWRIGHT=1.55.0
PROJECT=ha-chauffage-demo
names=("$@")
[ ${#names[@]} -eq 0 ] && names=(week override panel)
for name in "${names[@]}"; do
  [ -f "dev/demo/scenarios/$name.mjs" ] || { echo "No scenario dev/demo/scenarios/$name.mjs" >&2; exit 1; }
done

# 1. A new demo HA, at the demo's time
compose=(docker compose --progress quiet -p "$PROJECT" -f dev/compose.yaml -f dev/demo/compose.yaml)
# Paris time, written out: Git Bash on Windows has no time zone database
paris="CET-1CEST,M3.5.0,M10.5.0/3"
target=$(TZ="$paris" date -d "${DEMO_TIME:-tuesday 17:30}" +%s)
export DEMO_FAKETIME=$(printf "%+d" $(( target - $(date +%s) )))
export DEV_HASS="$root/dev/demo/hass" DEV_PORT=8127
"${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
rm -rf dev/demo/hass && mkdir -p dev/demo/hass/packages
cp dev/hass/configuration.yaml dev/demo/hass/ && cp dev/hass/packages/simulation.yaml dev/demo/hass/packages/
cleanup() { [ "${DEMO_KEEP:-}" = 1 ] || "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
echo "Starting the demo HA at $(TZ="$paris" date -d "@$target" '+%A %H:%M')…"
"${compose[@]}" up -d --build --quiet-pull >/dev/null
# The setup installs the integration, the dashboards and the sample week, then exits
while [ -z "$("${compose[@]}" ps -a --status exited -q setup)" ]; do sleep 5; done
[ "$(docker inspect -f '{{.State.ExitCode}}' "$("${compose[@]}" ps -a -q setup)")" = 0 ] \
  || { "${compose[@]}" logs setup | tail -20; exit 1; }

# 2. Each demo: lossless frames from the browser, then a GIF at 15 frames a second
mkdir -p dev/demo/out docs/media
for name in "${names[@]}"; do
  rm -rf "dev/demo/out/$name" "dev/demo/out/$name.txt"
  echo "Recording $name…"
  docker run --rm --network "${PROJECT}_default" --ipc=host \
    -e LANG=fr_FR.UTF-8 -e LANGUAGE=fr_FR:fr \
    -v "$root/dev/demo:/demo" -v ha-chauffage-demo-node-modules:/demo/node_modules -w /demo \
    "mcr.microsoft.com/playwright:v${PLAYWRIGHT}-noble" \
    sh -c "npm install --silent --no-save --no-audit --no-fund playwright@${PLAYWRIGHT} >/dev/null && node scenarios/$name.mjs"

  echo "Converting $name to GIF…"
  docker run --rm -v "$root:/work" -w /work/dev/demo/out -e NAME="$name" alpine:3.20 sh -c '
    apk add -q --no-progress ffmpeg >/dev/null
    # One palette for the whole GIF, built from what changes, then each frame redrawn only where
    # it changes: flat colours stay flat, and the GIF stays small
    ffmpeg -loglevel error -y -f concat -safe 0 -i "$NAME.txt" \
      -vf "fps=15,split[a][b];[a]palettegen=max_colors=256:stats_mode=diff:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
      -loop 0 "/work/docs/media/$NAME.gif"'
  echo "docs/media/$name.gif: $(du -h "docs/media/$name.gif" | cut -f1)"
done
