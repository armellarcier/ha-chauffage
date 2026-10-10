#!/usr/bin/env bash
# Checks the configuration, then reloads template sensors, automations and input_select.
#   scripts/reload.sh                 → dev HA
#   scripts/reload.sh prod            → production HA
#   scripts/reload.sh dev --check     → check only
set -euo pipefail
. "$(dirname "$0")/_ha.sh"
ha_load_env
ha_target "${1:-dev}"
ha_configured || { echo "Missing token for '${1:-dev}': see .env.example" >&2; exit 1; }

ha_check_config
[ "${2:-}" = "--check" ] && exit 0
echo "Reloading (${HA_URL}):"
ha_reload
