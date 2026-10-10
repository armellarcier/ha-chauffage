#!/usr/bin/env bash
# Shows the end of the HA log through the API.
#   scripts/logs.sh                   → dev HA, last 50 lines about the project
#   scripts/logs.sh prod 200          → production, 200 lines about the project
#   scripts/logs.sh dev 200 all       → unfiltered
set -euo pipefail
. "$(dirname "$0")/_ha.sh"
ha_load_env
ha_target "${1:-dev}"
ha_configured || { echo "Missing token for '${1:-dev}': see .env.example" >&2; exit 1; }

lines="${2:-50}"
log=$(curl -sS ${CURL_OPTS:-} -H "Authorization: Bearer ${HA_TOKEN}" "${HA_URL}/api/error_log")
if [ "${3:-}" = "all" ]; then
  echo "$log" | tail -n "$lines"
else
  echo "$log" | grep -iE 'chauffage|derogation|template|versatile|zha' | tail -n "$lines" || echo "(nothing relevant)"
fi
