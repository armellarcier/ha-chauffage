#!/usr/bin/env bash
# Puts a commit of this repository on the Home Assistant of PROD_HA_CONFIG, without a release, and
# takes it back. Home Assistant runs in the Docker container PROD_HA_CONTAINER.
# The maintainer's tool, unsupported, at your own risk: see CONTRIBUTING.md.
#
#   scripts/deploy.sh [--branch <branch>]   → installs the commit, with Home Assistant stopped
#   scripts/deploy.sh --rollback            → puts back what was installed before, and its data
#   --branch <branch>  a branch or a commit of your clone. Default: HEAD. Fetch first what is only
#                      on origin, for example `git fetch origin x`, then `--branch origin/x`.
#
# .env: PROD_HA_CONFIG = the configuration folder, local (/config) or over SSH
# (home-assistant:/docker/homeassistant/config). PROD_HA_CONTAINER = the container, on that host.
#
# The script deploys a commit, with `git archive`, never the working tree. The installed version
# is the repository version with a dev suffix made of the commit's date and sha, for example
# 0.9.0-beta.4.dev.20261118153000.g5b20a33, or 0.9.1-dev.… for release 0.9.0.
#
# The first deploy saves what is installed and its data (.storage/chauffage) in
# <config>/.chauffage-backup. The backup stays until a rollback has put everything back. The steps
# on the target are in scripts/_deploy_remote.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/_ha.sh
ha_load_env

mode=install
branch=""
while [ $# -gt 0 ]; do
  case "$1" in
    --rollback) mode=rollback ;;
    --branch) branch="${2:?--branch needs a branch name}"; shift ;;
    *) echo "Unknown argument: $1. Usage: scripts/deploy.sh [--branch <branch>] | --rollback" >&2; exit 2 ;;
  esac
  shift
done
[ "$mode" = install ] || [ -z "$branch" ] || { echo "--branch only applies to a deploy" >&2; exit 2; }
target="${PROD_HA_CONFIG:?Set PROD_HA_CONFIG in .env: see .env.example}"
container="${PROD_HA_CONTAINER:?Set PROD_HA_CONTAINER in .env: see .env.example}"

# host:/folder over SSH, or a local folder. C:/… is a drive letter on Windows only.
drive='^[A-Za-z]:[\/]' # in a variable: written in [[ =~ ]], bash drops the backslash
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) windows=yes ;; *) windows=no ;; esac
host=""; folder=$target
if [[ "$target" == *:* ]] && ! { [ "$windows" = yes ] && [[ "$target" =~ $drive ]]; }; then
  host=${target%%:*}; folder=${target#*:}
  [[ "$folder" == /* ]] || { echo "PROD_HA_CONFIG: over SSH, give an absolute folder, host:/folder" >&2; exit 2; }
fi

# 'text' for a shell: the remote login shell may be sh, without bash's $'…'
quote() { local s=${1//\'/\'\\\'\'}; printf "'%s'" "$s"; }
remote=$(cat scripts/_deploy_remote.sh)
on_target() {
  if [ -z "$host" ]; then bash -c "$remote" _ "$@"; return; fi
  local args="" arg
  for arg in "$@"; do args+=" $(quote "$arg")"; done
  ssh -- "$host" "bash -c $(quote "$remote") _$args"
}

if [ "$mode" = rollback ]; then
  echo "Rolling back $target"
  on_target rollback "$folder" "$container" </dev/null
  exit 0
fi

# The commit to deploy, printed in full before anything changes: the one you reviewed?
integration=custom_components/chauffage
if [ -n "$branch" ]; then
  commit=$(git rev-parse --verify --quiet "$branch^{commit}") ||
    { echo "No branch or commit $branch here. For a branch of origin: git fetch origin $branch" >&2; exit 1; }
else
  commit=$(git rev-parse --verify HEAD^{commit})
  if [ -n "$(git status --porcelain -- "$integration")" ]; then
    echo "  Changes not committed in $integration: not deployed. Commit them first."
  fi
fi
echo "Commit $(git show -s --format='%H %s' "$commit")"

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
stamp="dev.$(TZ=UTC git show -s --format=%cd.g%h --date=format-local:%Y%m%d%H%M%S "$commit")"
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
files=$(find "$stage" -type f | wc -l | tr -d ' ')

echo "Deploying $version to $target"
# COPYFILE_DISABLE: no ._* files from macOS tar
COPYFILE_DISABLE=1 tar -C "$stage" -cf - . | on_target install "$folder" "$container" "$files" "$version"
echo "Done. Roll back with: scripts/deploy.sh --rollback"
