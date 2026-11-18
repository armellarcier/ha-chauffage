#!/usr/bin/env bash
# Puts the working tree on a real Home Assistant, without a release, and takes it back.
#
#   scripts/deploy.sh [<target>]              → installs the working tree, then restarts HA
#   scripts/deploy.sh --rollback [<target>]   → puts back the release and its data, then restarts HA
#
#   <target> = HA configuration folder, local     e.g. /config
#            = or host:folder, over SSH           e.g. home-assistant:/docker/homeassistant/config
#   Without <target>: PROD_HA_CONFIG from .env.
#
# The installed version is the repository version with a dev suffix, for example
# 0.9.0-beta.4.dev.20261118153000.g5b20a33, so browsers load the new card.
#
# Before the first deploy, the installed release and its data (.storage/chauffage) are saved in
# <target>/.chauffage-backup. Later deploys keep this backup. --rollback puts it back.
#
# Restart: with PROD_HA_CONTAINER (.env), `docker restart` on the target host. Otherwise, with
# PROD_HA_URL / PROD_HA_TOKEN, the homeassistant.restart service. Otherwise, restart HA by hand.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/_ha.sh
ha_load_env
ha_target prod

mode=install
if [ "${1:-}" = "--rollback" ]; then mode=rollback; shift; fi
target="${1:-${PROD_HA_CONFIG:-}}"
[ -n "$target" ] || { echo "Usage: scripts/deploy.sh [--rollback] <HA config folder | host:folder>, or set PROD_HA_CONFIG in .env" >&2; exit 2; }
container="${PROD_HA_CONTAINER:-}"

# host:folder (SSH), but not a Windows drive letter (C:/…)
if [[ "$target" == *:* && ! "$target" =~ ^[A-Za-z]:[\\/] ]]; then
  host="${target%%:*}"; folder="${target#*:}"
  run() { ssh "$host" "$1"; }
else
  host=""; folder="$target"
  run() { bash -c "$1"; }
fi

# Script run on the target host
remote=$(cat <<EOF
set -e
cd '$folder'
test -f configuration.yaml || { echo "No configuration.yaml in $folder" >&2; exit 1; }
code=custom_components/chauffage
backup=.chauffage-backup
container='$container'
case "\$1" in
  install)
    # A dev version is already installed: the backup holds the release, keep it
    if ! grep -qs '"version": *"[^"]*dev\.' "\$code/manifest.json"; then
      rm -rf "\$backup" && mkdir -p "\$backup"
      if [ -d "\$code" ]; then cp -a "\$code" "\$backup/chauffage"; fi
      if [ -f .storage/chauffage ]; then cp -a .storage/chauffage "\$backup/storage"; fi
      echo "  release saved in \$backup"
    fi
    rm -rf "\$code" && mkdir -p "\$code"
    tar -C "\$code" -xof -
    if [ -n "\$container" ]; then docker restart "\$container" >/dev/null && echo "  \$container restarted"; fi ;;
  rollback)
    test -d "\$backup" || { echo "No backup in $folder/\$backup: nothing to roll back" >&2; exit 1; }
    if [ -n "\$container" ]; then docker stop "\$container" >/dev/null; fi
    rm -rf "\$code"
    if [ -d "\$backup/chauffage" ]; then cp -a "\$backup/chauffage" "\$code"; fi
    if [ -n "\$container" ] && [ -f "\$backup/storage" ]; then
      cp -a "\$backup/storage" .storage/chauffage && echo "  data put back"
      rm -f "\$backup/storage"
    elif [ -f "\$backup/storage" ]; then
      echo "  data not put back while Home Assistant runs: stop it, then copy $folder/\$backup/storage to .storage/chauffage"
    fi
    if [ -n "\$container" ]; then docker start "\$container" >/dev/null && echo "  \$container started"; fi
    rm -rf "\$backup/chauffage"
    rmdir "\$backup" 2>/dev/null || true ;;
esac
EOF
)

restart_through_api() {
  [ -z "$container" ] || return 0
  if ha_configured; then
    curl -sS ${CURL_OPTS:-} -o /dev/null -X POST -H "Authorization: Bearer ${HA_TOKEN}" \
      "${HA_URL}/api/services/homeassistant/restart" && echo "  Home Assistant restarting"
  else
    echo "  Restart Home Assistant by hand (or set PROD_HA_CONTAINER, or PROD_HA_URL and PROD_HA_TOKEN)."
  fi
}

if [ "$mode" = rollback ]; then
  echo "Rolling back ${host:+$host:}$folder"
  run "bash -c $(printf '%q' "$remote") _ rollback </dev/null"
  restart_through_api
  exit 0
fi

# The working tree, with a dev version in the integration and the card
release=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' custom_components/chauffage/manifest.json)
sha=g$(git rev-parse --short HEAD 2>/dev/null || echo local) # g: a sha of digits only may start with 0
version="${release}$([[ "$release" == *-* ]] && echo . || echo -)dev.$(date -u +%Y%m%d%H%M%S).${sha}"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp -R custom_components/chauffage/. "$stage/"
find "$stage" -name __pycache__ -type d -prune -exec rm -rf {} +
# -i.orig: the same on GNU and BSD (macOS) sed
sed -i.orig "s/\"version\": *\"[^\"]*\"/\"version\": \"$version\"/" "$stage/manifest.json"
sed -i.orig "s/^const VERSION = '[^']*';/const VERSION = '$version';/" "$stage/frontend/chauffage-programme-card.js"
rm "$stage/manifest.json.orig" "$stage/frontend/chauffage-programme-card.js.orig"

echo "Deploying $version to ${host:+$host:}$folder"
tar -C "$stage" -cf - . | run "bash -c $(printf '%q' "$remote") _ install"
restart_through_api
echo "Done. Roll back with: scripts/deploy.sh --rollback${1:+ $1}"
