#!/usr/bin/env bash
# Records docs/demo.gif (the README animation) from the development HA.
# Needs the dev HA running: docker compose -f dev/compose.yaml up -d
# A second, new development HA (CONTRIBUTING.md): DEMO_NETWORK=ha-chauffage-fresh_default
# Everything runs in Docker (Playwright for the browser, ffmpeg for the GIF).
set -euo pipefail
cd "$(dirname "$0")/.."
root="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1

PLAYWRIGHT=1.55.0
rm -rf dev/demo/out && mkdir -p dev/demo/out docs

echo "Recording the demo…"
docker run --rm --network "${DEMO_NETWORK:-ha-chauffage-dev_default}" --ipc=host \
  -e LANG=fr_FR.UTF-8 -e LANGUAGE=fr_FR:fr -e TZ=Europe/Paris \
  -v "$root/dev/demo:/demo" -v ha-chauffage-demo-node-modules:/demo/node_modules -w /demo \
  "mcr.microsoft.com/playwright:v${PLAYWRIGHT}-noble" \
  sh -c "npm install --silent --no-save --no-audit --no-fund playwright@${PLAYWRIGHT} >/dev/null && node record.mjs"

echo "Converting to GIF…"
docker run --rm -v "$root:/work" -w /work alpine:3.20 sh -c '
  apk add -q --no-progress ffmpeg jq >/dev/null
  t=dev/demo/out/timing.json
  video=$(jq -r .video "$t" | sed "s|^/demo|dev/demo|")
  start=$(jq -r .start "$t"); duration=$(jq -r ".end - .start" "$t")
  ffmpeg -loglevel error -y -ss "$start" -t "$duration" -i "$video" \
    -vf "fps=12,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
    -loop 0 docs/demo.gif'
echo "docs/demo.gif: $(du -h docs/demo.gif | cut -f1)"
