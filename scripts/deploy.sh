#!/usr/bin/env bash
# Puts a commit of this repository on a real Home Assistant, without a release, and takes it back.
#
#   scripts/deploy.sh [--branch <branch>] [<target>]    → installs the commit, then restarts HA
#   scripts/deploy.sh --rollback [--stopped] [<target>] → puts back what was installed before
#   --branch <branch>  a local branch, or a branch of origin. Default: HEAD of the current branch.
#   --no-restart       never stops nor starts HA
#   --stopped          you stopped HA yourself (needed to roll back without a container)
#
#   <target> = HA configuration folder, local     e.g. /config
#            = or host:folder, over SSH           e.g. home-assistant:/docker/homeassistant/config
#   Without <target>: PROD_HA_CONFIG from .env.
#
# The script deploys a commit, with `git archive`, never the working tree. The installed version
# is the repository version with a dev suffix made of the commit's date and sha, for example
# 0.9.0-beta.4.dev.20261118153000.g5b20a33, or 0.9.1-dev.… for release 0.9.0.
#
# The first deploy saves what is installed and its data (.storage/chauffage) in
# <target>/.chauffage-backup. The backup stays until a rollback has put everything back.
#
# With PROD_HA_CONTAINER, the script stops and starts the container on the target host. Otherwise
# it calls the homeassistant.restart service through PROD_HA_URL and PROD_HA_TOKEN, with
# PROD_CURL_OPTS. The steps on the target are in scripts/_deploy_remote.sh.
set -euo pipefail
caller_dir=$PWD
cd "$(dirname "$0")/.."
. scripts/_ha.sh
ha_load_env
ha_target prod

mode=install
restart=yes
stopped=no
branch=""
while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --rollback) mode=rollback ;;
    --no-restart) restart=no ;;
    --stopped) stopped=yes ;;
    --branch) branch="${2:?--branch needs a branch name}"; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
usage="scripts/deploy.sh [--rollback [--stopped]] [--branch <branch>] [--no-restart] [<target>]"
# An option after the target would be ignored: a rollback would become a deploy
[ $# -le 1 ] || { echo "Options go before the target: $usage" >&2; exit 2; }
target="${1:-${PROD_HA_CONFIG:-}}"
[ -n "$target" ] || { echo "Usage: $usage, or set PROD_HA_CONFIG in .env" >&2; exit 2; }
container="${PROD_HA_CONTAINER:-}"
[ "$restart" = yes ] || container=""
[ "$mode" = install ] || [ -z "$branch" ] || { echo "--branch only applies to a deploy" >&2; exit 2; }

# 'text' for a shell: the remote login shell may be sh, without bash's $'…'
quote() { local s=${1//\'/\'\\\'\'}; printf "'%s'" "$s"; }
remote=$(cat scripts/_deploy_remote.sh)

# host:folder (SSH), but not a Windows drive letter (C:/…)
if [[ "$target" == *:* && ! "$target" =~ ^[A-Za-z]:[\\/] ]]; then
  host="${target%%:*}"; folder="${target#*:}"
  on_target() {
    local args="" arg
    for arg in "$@"; do args+=" $(quote "$arg")"; done
    ssh -- "$host" "bash -c $(quote "$remote") _$args"
  }
else
  host=""; folder="$target"
  case "$folder" in /* | [A-Za-z]:[\\/]*) ;; *) folder="$caller_dir/$folder" ;; esac
  on_target() { bash -c "$remote" _ "$@"; }
fi
shown="${host:+$host:}$folder"

restart_through_api() {
  [ "$restart" = yes ] && [ -z "$container" ] || return 0
  if ! ha_configured; then
    echo "  Restart Home Assistant by hand (or set PROD_HA_CONTAINER, or PROD_HA_URL and PROD_HA_TOKEN)."
    return 0
  fi
  case "$HA_URL" in
    http://localhost[:/]* | http://localhost | http://127.* | "http://[::1]"*) ;;
    http://*) echo "  Warning: the token goes unencrypted to $HA_URL. Prefer https://." ;;
  esac
  # The token goes through stdin, not the command line (ps)
  if printf 'header = "Authorization: Bearer %s"\n' "$HA_TOKEN" |
    curl -fsS --max-time 30 ${PROD_CURL_OPTS:-} --config - -o /dev/null -X POST "${HA_URL}/api/services/homeassistant/restart"; then
    echo "  Home Assistant restarting"
  else
    echo "  The restart request failed: restart Home Assistant by hand."
  fi
}

if [ "$mode" = rollback ]; then
  echo "Rolling back $shown"
  on_target rollback "$folder" "$container" "$stopped" </dev/null
  exit 0
fi

# The commit to deploy
integration=custom_components/chauffage
if [ -n "$branch" ]; then
  if ! commit=$(git rev-parse --verify --quiet "refs/heads/$branch^{commit}"); then
    echo "Fetching $branch from origin"
    git fetch --quiet origin "refs/heads/$branch" || { echo "No branch $branch, here or on origin" >&2; exit 1; }
    commit=$(git rev-parse --verify FETCH_HEAD^{commit})
  fi
else
  commit=$(git rev-parse --verify HEAD^{commit})
  if [ -n "$(git status --porcelain -- "$integration")" ]; then
    echo "  Changes not committed in $integration: not deployed. Commit them first."
  fi
fi

# A symbolic link would deploy a file of this machine, for example an SSH key
if git ls-tree -r "$commit" -- "$integration" | grep -q '^120000 '; then
  echo "The commit has a symbolic link in $integration: refused" >&2
  exit 1
fi

# The version: checked before any use, because bash arithmetic would run a command hidden in it.
# After the release, so that an open card asks for a reload, not a restart.
release=$(git show "$commit:$integration/manifest.json" | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p')
if [[ ! "$release" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Not a version in $integration/manifest.json: $release" >&2
  exit 1
fi
stamp="dev.$(TZ=UTC git show -s --format=%cd --date=format-local:%Y%m%d%H%M%S "$commit").g$(git rev-parse --short "$commit")"
if [ -n "${BASH_REMATCH[4]}" ]; then
  version="${release}.${stamp}"
else
  version="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.$((10#${BASH_REMATCH[3]} + 1))-${stamp}"
fi

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
git archive --format=tar "$commit:$integration" | tar -C "$stage" -xf -
# -i.orig: the same on GNU and BSD (macOS) sed
sed -i.orig "s/\"version\": *\"[^\"]*\"/\"version\": \"$version\"/" "$stage/manifest.json"
sed -i.orig "s/^const VERSION = '[^']*';/const VERSION = '$version';/" "$stage/frontend/chauffage-programme-card.js"
rm "$stage/manifest.json.orig" "$stage/frontend/chauffage-programme-card.js.orig"
# Readable by every user on the target, whatever the local umask
chmod -R u=rwX,go=rX "$stage"
files=$(find "$stage" -type f | wc -l | tr -d ' ')

echo "Deploying $version to $shown"
# COPYFILE_DISABLE: no ._* files from macOS tar
COPYFILE_DISABLE=1 tar -C "$stage" -cf - . | on_target install "$folder" "$container" "$files" "$version"
restart_through_api
echo "Done. Roll back with: scripts/deploy.sh --rollback $(quote "$target")"
