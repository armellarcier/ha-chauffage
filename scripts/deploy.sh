#!/usr/bin/env bash
# Puts the working tree on a real Home Assistant, without a release, and takes it back.
#
#   scripts/deploy.sh [--no-restart] [<target>]   → installs the working tree, then restarts HA
#   scripts/deploy.sh --rollback [<target>]       → puts back the release and its data
#
#   <target> = HA configuration folder, local     e.g. /config
#            = or host:folder, over SSH           e.g. home-assistant:/docker/homeassistant/config
#   Without <target>: PROD_HA_CONFIG from .env.
#
# The installed version is the repository version with a dev suffix, for example
# 0.9.0-beta.4.dev.20261118153000.g5b20a33, or 0.9.1-dev.… for release 0.9.0. It sorts after
# the release, and changes the card's URL, so browsers load the new card.
#
# The first deploy saves the installed release and its data (.storage/chauffage) in
# <target>/.chauffage-backup. The backup stays until a rollback has put everything back, so later
# deploys, a deploy cut short or a HACS update never replace it.
#
# Restart: with PROD_HA_CONTAINER (.env), `docker` on the target host. Otherwise, with
# PROD_HA_URL / PROD_HA_TOKEN, the homeassistant.restart service (PROD_CURL_OPTS: extra curl
# options). Without a container, the rollback cannot stop Home Assistant to put the data back:
# it puts back the code, keeps the backup, and says what to do.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/_ha.sh
ha_load_env
ha_target prod

mode=install
restart=yes
while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --rollback) mode=rollback ;;
    --no-restart) restart=no ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
target="${1:-${PROD_HA_CONFIG:-}}"
[ -n "$target" ] || { echo "Usage: scripts/deploy.sh [--rollback] [--no-restart] <HA config folder | host:folder>, or set PROD_HA_CONFIG in .env" >&2; exit 2; }
container="${PROD_HA_CONTAINER:-}"
[ "$restart" = yes ] || container=""
source_dir="${DEPLOY_SOURCE:-custom_components/chauffage}" # another source: for the tests

# Script run on the target host, with: mode, folder, container
remote=$(cat <<'EOF'
set -euo pipefail
mode=$1; folder=$2; container=$3
cd -- "$folder"
test -f configuration.yaml || { echo "No configuration.yaml in $folder" >&2; exit 1; }
code=custom_components/chauffage
backup=.chauffage-backup
case "$mode" in
  install)
    if [ ! -f "$backup/complete" ]; then
      rm -rf "$backup" && mkdir -p "$backup"
      if [ -d "$code" ]; then cp -a "$code" "$backup/chauffage"; fi
      if [ -f .storage/chauffage ]; then cp -a .storage/chauffage "$backup/storage"; fi
      touch "$backup/complete"
      echo "  release saved in $folder/$backup"
    fi
    rm -rf "$code.new" && mkdir -p "$code.new"
    tar -C "$code.new" -xof -
    test -f "$code.new/manifest.json" || { echo "Transfer incomplete: nothing changed" >&2; rm -rf "$code.new"; exit 1; }
    rm -rf "$code" && mv "$code.new" "$code"
    if [ -n "$container" ]; then docker restart "$container" >/dev/null && echo "  $container restarted"; fi ;;
  rollback)
    test -f "$backup/complete" || { echo "No backup in $folder/$backup: nothing to roll back" >&2; exit 1; }
    if [ -n "$container" ]; then
      docker stop "$container" >/dev/null
      trap 'docker start "$container" >/dev/null' EXIT
    fi
    rm -rf "$code.new"
    if [ -d "$backup/chauffage" ]; then cp -a "$backup/chauffage" "$code.new"; fi
    rm -rf "$code"
    if [ -d "$code.new" ]; then mv "$code.new" "$code"; fi
    echo "  code of the release put back"
    if [ -z "$container" ]; then
      echo "  Home Assistant not restarted: it would start the release on the data of the dev version."
      if [ -f "$backup/storage" ]; then
        echo "  Stop Home Assistant, copy $folder/$backup/storage to $folder/.storage/chauffage, start it,"
      else
        echo "  Stop Home Assistant, delete $folder/.storage/chauffage, start it,"
      fi
      echo "  then delete $folder/$backup."
      exit 0
    fi
    if [ -f "$backup/storage" ]; then cp -a "$backup/storage" .storage/chauffage; else rm -f .storage/chauffage; fi
    echo "  data of the release put back"
    rm -rf "$backup"
    echo "  $container started" ;;
esac
EOF
)

# 'text' for a shell: the remote login shell may be sh, without bash's $'…'
quote() { local s=${1//\'/\'\\\'\'}; printf "'%s'" "$s"; }

# host:folder (SSH), but not a Windows drive letter (C:/…)
if [[ "$target" == *:* && ! "$target" =~ ^[A-Za-z]:[\\/] ]]; then
  host="${target%%:*}"; folder="${target#*:}"
  on_target() { ssh -- "$host" "bash -c $(quote "$remote") _ $(quote "$1") $(quote "$folder") $(quote "$container")"; }
else
  host=""; folder="$target"
  on_target() { bash -c "$remote" _ "$1" "$folder" "$container"; }
fi

restart_through_api() {
  [ "$restart" = yes ] && [ -z "$container" ] || return 0
  if ha_configured; then
    # The token goes through stdin, not the command line (ps)
    printf 'header = "Authorization: Bearer %s"\n' "$HA_TOKEN" |
      curl -fsS ${PROD_CURL_OPTS:-} --config - -o /dev/null -X POST "${HA_URL}/api/services/homeassistant/restart"
    echo "  Home Assistant restarting"
  else
    echo "  Restart Home Assistant by hand (or set PROD_HA_CONTAINER, or PROD_HA_URL and PROD_HA_TOKEN)."
  fi
}

if [ "$mode" = rollback ]; then
  echo "Rolling back ${host:+$host:}$folder"
  on_target rollback </dev/null
  exit 0
fi

# The version: after the release, so that an open card asks for a reload, not a restart
release=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$source_dir/manifest.json")
sha=g$(git rev-parse --short HEAD 2>/dev/null || echo local) # g: a sha of digits only may start with 0
stamp="dev.$(date -u +%Y%m%d%H%M%S).${sha}"
if [[ "$release" == *-* ]]; then
  version="${release}.${stamp}"
else
  IFS=. read -r major minor patch <<<"$release"
  version="${major}.${minor}.$((patch + 1))-${stamp}"
fi

# The files git does not ignore, as in the working tree: no __pycache__, but new files too
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
chmod 755 "$stage"
if files=$(git ls-files --cached --others --exclude-standard -- "$source_dir" 2>/dev/null) && [ -n "$files" ]; then
  while IFS= read -r file; do
    [ -f "$file" ] || continue # deleted in the working tree
    mkdir -p "$stage/$(dirname "${file#"$source_dir"/}")"
    cp "$file" "$stage/${file#"$source_dir"/}"
  done <<<"$files"
else
  cp -R "$source_dir/." "$stage/"
  find "$stage" -name __pycache__ -type d -prune -exec rm -rf {} +
fi
# -i.orig: the same on GNU and BSD (macOS) sed
sed -i.orig "s/\"version\": *\"[^\"]*\"/\"version\": \"$version\"/" "$stage/manifest.json"
sed -i.orig "s/^const VERSION = '[^']*';/const VERSION = '$version';/" "$stage/frontend/chauffage-programme-card.js"
rm "$stage/manifest.json.orig" "$stage/frontend/chauffage-programme-card.js.orig"

echo "Deploying $version to ${host:+$host:}$folder"
# COPYFILE_DISABLE: no ._* files from macOS tar
COPYFILE_DISABLE=1 tar -C "$stage" -cf - . | on_target install
restart_through_api
echo "Done. Roll back with: scripts/deploy.sh --rollback${1:+ $1}"
