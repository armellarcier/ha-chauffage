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

# Home Assistant, around the steps that change the files. A container that was stopped stays
# stopped. At the end, on success or failure, a container stopped here starts again.
was_running=false
stopped_by_us=false
# What a failure leaves: unchanged, the release data put back, or the whole release put back
done_so_far=unchanged
finish() {
  local status=$?
  rm -rf "$new"
  if [ "$status" != 0 ]; then
    case "$done_so_far" in
      unchanged) echo "  Failed: the integration in $folder/$code is unchanged" >&2 ;;
      data) echo "  Failed: the release data is back, but the dev code is still installed: run the rollback again" >&2 ;;
      release) echo "  Failed after the release was put back: run the rollback again to finish" >&2 ;;
    esac
  fi
  if [ "$stopped_by_us" = true ]; then
    docker start "$container" >/dev/null || { echo "  Could not start $container" >&2; exit 1; }
    echo "  $container started"
  elif [ "$status" = 0 ]; then
    echo "  $container was stopped: left stopped"
  fi
}
trap finish EXIT
check_container() {
  was_running=$(docker inspect -f '{{.State.Running}}' "$container") || { echo "No container $container" >&2; exit 1; }
}
stop_ha() {
  [ "$was_running" = true ] || return 0
  # 120 s: time for Home Assistant to write its pending changes before a kill
  docker stop -t 120 "$container" >/dev/null
  stopped_by_us=true
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

saved() { echo "$(cat "$backup/version"), saved on $(cat "$backup/complete")"; }
installed() { sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$code/manifest.json" 2>/dev/null || true; }
# An update replaced the dev version, for example with the release of the commit you tried: the
# installed version is neither a dev version nor the saved one. The backup is then out of date.
outdated() {
  local version; version=$(installed)
  [ -f "$backup/complete" ] && [ -n "$version" ] && [[ "$version" != *[.-]dev.* ]] &&
    [ "$version" != "$(cat "$backup/version")" ]
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
      echo "  backup kept: $(saved)"
    else
      if outdated; then echo "  backup of $(saved) dropped: $(installed) replaced the dev version"; fi
      rm -rf "$backup" && mkdir -p "$backup"
      # The code while Home Assistant runs: it only writes __pycache__ there, which is not needed
      if [ -d "$code" ]; then cp -a "$code" "$backup/chauffage"; fi
      version_saved=$(installed)
      echo "${version_saved:-no Chauffage}" > "$backup/version"
      # The data once Home Assistant is stopped: it writes its pending changes when it stops
      stop_ha
      if [ -f .storage/chauffage ]; then cp -a .storage/chauffage "$backup/storage"; fi
      date -u '+%Y-%m-%d %H:%M UTC' > "$backup/complete"
      echo "  backup made: $(saved), in $folder/$backup"
    fi
    swap_in "$new"
    echo "  $version installed" ;;
  rollback)
    test -f "$backup/complete" || { echo "No backup in $folder/$backup: nothing to roll back" >&2; exit 1; }
    if outdated; then
      echo "Nothing to roll back: $(installed) is installed, not a dev version. The backup of $(saved) is out of date." >&2
      exit 1
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
    done_so_far=data
    # The release is moved out of the backup. The version file says what the backup held, so a
    # rollback run again after a failure knows the release is already in place.
    if [ -d "$backup/chauffage" ]; then
      swap_in "$backup/chauffage"
      echo "  $(cat "$backup/version") put back, with its data"
    elif [ "$(cat "$backup/version")" = "no Chauffage" ]; then
      swap_in
      echo "  Chauffage removed: it was not installed before the first deploy"
    else
      echo "  $(cat "$backup/version") already in place, with its data"
    fi
    done_so_far=release
    rm -rf "$backup" ;;
esac
