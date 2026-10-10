#!/usr/bin/env bash
# Deploys the project into a Home Assistant configuration (real installation).
#
#   scripts/deploy.sh <target>
#
#   <target> = HA configuration folder, local       e.g. /config, /docker/homeassistant/config
#            = or host:folder, over SSH             e.g. nas:/docker/homeassistant/config
#
# Copies:  www/                 → <target>/www/chauffage/
#          packages/chauffage/  → <target>/packages/chauffage/
# Then, if PROD_HA_URL / PROD_HA_TOKEN are set (.env): checks the HA configuration, restores the
# previous version if it is invalid, otherwise reloads template sensors + automations.
# Without a token: copy only (reload or restart HA by hand).
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/_ha.sh
ha_load_env
ha_target prod

target="${1:?Usage: scripts/deploy.sh <HA config folder | host:folder>}"

# host:path (SSH) — but not a Windows drive letter (C:/…)
if [[ "$target" == *:* && ! "$target" =~ ^[A-Za-z]:[\\/] ]]; then
  host="${target%%:*}"; folder="${target#*:}"
  run() { ssh "$host" "$1"; }
else
  host=""; folder="$target"
  run() { bash -c "$1"; }
fi

# Script run on the target: backup, replacement, then (if needed) restore
remote=$(cat <<EOF
set -e
cd '$folder'
test -f configuration.yaml || { echo "No configuration.yaml in $folder" >&2; exit 1; }
case "\${1:-}" in
  install)
    # Backup of the installed version (restored if the configuration is invalid)
    rm -rf .chauffage-previous .chauffage-precedent
    mkdir -p .chauffage-previous/www .chauffage-previous/packages www/chauffage packages/chauffage
    cp -a www/chauffage/. .chauffage-previous/www/
    cp -a packages/chauffage/. .chauffage-previous/packages/
    find www/chauffage packages/chauffage -mindepth 1 -delete
    tar -xf - --no-same-owner ;;
  restore)
    find www/chauffage packages/chauffage -mindepth 1 -delete
    cp -a .chauffage-previous/www/. www/chauffage/
    cp -a .chauffage-previous/packages/. packages/chauffage/ ;;
esac
EOF
)

echo "Deploying to ${host:+$host:}$folder"
# Destination tree prepared separately (portable: no tar --transform)
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/www/chauffage" "$stage/packages/chauffage"
cp -R www/. "$stage/www/chauffage/"
cp -R packages/chauffage/. "$stage/packages/chauffage/"
tar -C "$stage" -cf - www packages | run "bash -c $(printf '%q' "$remote") _ install"
echo "  files copied"

if ! ha_configured; then
  echo "PROD_HA_URL / PROD_HA_TOKEN not set: reload (or restart) HA by hand."
  exit 0
fi

if ! ha_check_config; then
  echo "Restoring the previous version…" >&2
  run "bash -c $(printf '%q' "$remote") _ restore </dev/null"
  exit 1
fi
echo "Reloading (${HA_URL}):"
ha_reload
echo "Done. The card updates on the next page reload."
