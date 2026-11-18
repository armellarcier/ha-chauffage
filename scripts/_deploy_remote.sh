# Run by scripts/deploy.sh on the host of the Home Assistant configuration, with bash.
#   _deploy_remote.sh install  <folder> <container> <files> <version>   (the tar archive on stdin)
#   _deploy_remote.sh rollback <folder> <container>
# <container>: the Docker container of Home Assistant, stopped and started around the changes.
# <files>: the number of files in the archive, to detect a transfer cut short.
# Kept in its own file: bash 3.2 (macOS) misreads a heredoc with `case` inside $( ).
set -euo pipefail
mode=$1; folder=$2; container=$3
cd -- "$folder"
test -f configuration.yaml || { echo "No configuration.yaml in $folder" >&2; exit 1; }
code=custom_components/chauffage
backup=.chauffage-backup
# Outside custom_components: Home Assistant would try to load any folder there
new=.chauffage-new
old=.chauffage-old-$(date -u +%Y%m%d%H%M%S)

# Home Assistant is stopped around the changes. At the end, on success or failure, it starts again.
stopped=false
finish() {
  local status=$?
  rm -rf "$new"
  if [ "$status" != 0 ]; then
    if [ "$mode" = install ]; then
      echo "  Failed: the integration in $folder/$code is unchanged" >&2
    else
      echo "  Failed: run the rollback again" >&2
    fi
  fi
  if [ "$stopped" = true ]; then
    docker start "$container" >/dev/null || { echo "  Could not start $container" >&2; exit 1; }
    echo "  $container started"
  fi
}
trap finish EXIT
check_container() { docker inspect "$container" >/dev/null || { echo "No container $container" >&2; exit 1; }; }
stop_ha() {
  # Set first: docker stop can fail after the stop signal, for example on Ctrl-C
  stopped=true
  # 120 s: time for Home Assistant to write its pending changes before a kill
  docker stop -t 120 "$container" >/dev/null
}

# Puts the folder $1 in place of the integration, or removes the integration without $1. By
# renames only: if one fails, the integration as it was goes back in place.
swap_in() {
  mkdir -p "$(dirname "$code")"
  if [ -d "$code" ]; then mv "$code" "$old"; fi
  if [ -n "${1:-}" ] && ! mv "$1" "$code"; then
    if [ -d "$old" ]; then mv "$old" "$code"; fi
    return 1
  fi
  if [ -d "$old" ]; then rm -rf "$old" || echo "  Warning: remove $folder/$old by hand" >&2; fi
}

installed() { sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$code/manifest.json" 2>/dev/null || true; }
# The backup is out of date as soon as something else than a dev version is installed, for
# example the release of the commit you tried, or the saved release installed again.
outdated() {
  local version; version=$(installed)
  [ -f "$backup/complete" ] && [ -n "$version" ] && [[ "$version" != *[.-]dev.* ]]
}

case "$mode" in
  install)
    files=$4; version=$5
    check_container
    rm -rf "$new" && mkdir -p "$new"
    if ! tar -C "$new" -xof - || [ "$(find "$new" -type f | wc -l | tr -d ' ')" != "$files" ]; then
      echo "Transfer incomplete" >&2
      exit 1
    fi
    # Readable by every user, whatever the umask here
    chmod -R u=rwX,go=rX "$new"
    if [ -f "$backup/complete" ] && ! outdated; then
      stop_ha
      echo "  backup kept: $(cat "$backup/version")"
    else
      rm -rf "$backup" && mkdir -p "$backup"
      # The code while Home Assistant runs: it only writes __pycache__ there, which is not needed
      if [ -d "$code" ]; then cp -a "$code" "$backup/chauffage"; fi
      version_saved=$(installed)
      echo "${version_saved:-no Chauffage}" > "$backup/version"
      # The data once Home Assistant is stopped: it writes its pending changes when it stops
      stop_ha
      if [ -f .storage/chauffage ]; then cp -a .storage/chauffage "$backup/storage"; fi
      touch "$backup/complete"
      echo "  backup made: $(cat "$backup/version"), in $folder/$backup"
    fi
    swap_in "$new"
    echo "  $version installed" ;;
  rollback)
    test -f "$backup/complete" || { echo "No backup in $folder/$backup: nothing to roll back" >&2; exit 1; }
    if outdated; then
      rm -rf "$backup"
      echo "Nothing to roll back: $(installed) is installed, not a dev version. Out of date backup deleted."
      exit 0
    fi
    check_container
    stop_ha
    # The data first: the dev code can read the release data, not the other way round
    if [ -f .storage/chauffage ]; then
      dev_data=".chauffage-dev-data-$(date -u +%Y%m%d%H%M%S)"
      cp -a .storage/chauffage "$dev_data"
      echo "  data of the dev version kept in $folder/$dev_data"
    fi
    if [ -f "$backup/storage" ]; then
      cp -a "$backup/storage" .storage/chauffage.new && mv .storage/chauffage.new .storage/chauffage
    else
      rm -f .storage/chauffage
    fi
    if [ -d "$backup/chauffage" ]; then
      swap_in "$backup/chauffage"
      echo "  $(cat "$backup/version") put back, with its data"
    else
      swap_in
      echo "  Chauffage removed: it was not installed before the first deploy"
    fi
    rm -rf "$backup" ;;
esac
