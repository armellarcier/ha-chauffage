# Run by scripts/deploy.sh on the host of the Home Assistant configuration, with bash.
#   _deploy_remote.sh install  <folder> <container> <files> <version>   (the tar archive on stdin)
#   _deploy_remote.sh rollback <folder> <container> <stopped>
# <container>: empty when the script must not stop nor start Home Assistant.
# <files>: the number of files in the archive, to detect a transfer cut short.
# <stopped>: "yes" when the developer stopped Home Assistant by hand.
# Kept in its own file: bash 3.2 (macOS) misreads a heredoc with `case` inside $( ).
set -euo pipefail
mode=$1; folder=$2; container=$3
cd -- "$folder"
test -f configuration.yaml || { echo "No configuration.yaml in $folder" >&2; exit 1; }
code=custom_components/chauffage
backup=.chauffage-backup

# Whether the container runs, or an error when there is no such container
running() { docker inspect -f '{{.State.Running}}' "$container"; }

case "$mode" in
  install)
    files=$4; version=$5
    if [ -n "$container" ]; then
      was_running=$(running) || { echo "No container $container" >&2; exit 1; }
    fi
    rm -rf "$code.new" && mkdir -p "$code.new"
    if ! tar -C "$code.new" -xof - || [ "$(find "$code.new" -type f | wc -l | tr -d ' ')" != "$files" ]; then
      rm -rf "$code.new"
      echo "Transfer incomplete: nothing changed" >&2
      exit 1
    fi
    # Stopped first: Home Assistant writes its pending changes when it stops
    if [ -n "$container" ] && [ "$was_running" = true ]; then docker stop "$container" >/dev/null; fi
    if [ -f "$backup/complete" ]; then
      echo "  backup kept: $(cat "$backup/complete")"
    else
      rm -rf "$backup" && mkdir -p "$backup"
      if [ -d "$code" ]; then cp -a "$code" "$backup/chauffage"; fi
      if [ -f .storage/chauffage ]; then cp -a .storage/chauffage "$backup/storage"; fi
      saved=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$code/manifest.json" 2>/dev/null || true)
      echo "${saved:-no Chauffage}, saved on $(date -u '+%Y-%m-%d %H:%M') UTC" > "$backup/complete"
      echo "  backup made: $(cat "$backup/complete"), in $folder/$backup"
    fi
    rm -rf "$code" && mv "$code.new" "$code"
    echo "  $version installed"
    if [ -n "$container" ] && [ "$was_running" = true ]; then
      docker start "$container" >/dev/null && echo "  $container started"
    elif [ -n "$container" ]; then
      echo "  $container was stopped: left stopped"
    fi ;;
  rollback)
    stopped=$4
    test -f "$backup/complete" || { echo "No backup in $folder/$backup: nothing to roll back" >&2; exit 1; }
    if [ -z "$container" ] && [ "$stopped" != yes ]; then
      echo "Nothing changed. The release must not start on the data of the dev version, so:" >&2
      echo "  1. Stop Home Assistant." >&2
      echo "  2. Run: scripts/deploy.sh --rollback --stopped, with the same target." >&2
      echo "  3. Start Home Assistant." >&2
      exit 1
    fi
    was_running=false
    if [ -n "$container" ]; then
      was_running=$(running) || { echo "No container $container" >&2; exit 1; }
      if [ "$was_running" = true ]; then
        docker stop "$container" >/dev/null
        trap 'docker start "$container" >/dev/null' EXIT # if a step fails half-way
      fi
    fi
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
    rm -rf "$code.new"
    if [ -d "$backup/chauffage" ]; then cp -a "$backup/chauffage" "$code.new"; fi
    rm -rf "$code"
    if [ -d "$code.new" ]; then mv "$code.new" "$code"; fi
    if [ -d "$backup/chauffage" ]; then
      echo "  $(sed 's/, saved on.*//' "$backup/complete") put back, with its data"
    else
      echo "  Chauffage removed: it was not installed before the first deploy"
    fi
    rm -rf "$backup"
    trap - EXIT
    if [ "$was_running" = true ]; then
      docker start "$container" >/dev/null
      echo "  $container started"
    elif [ -z "$container" ]; then
      echo "  Start Home Assistant."
    fi ;;
esac
