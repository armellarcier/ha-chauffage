#!/usr/bin/env bash
# Affiche la fin du journal HA via l'API.
#   scripts/logs.sh                   → HA de dev, 50 dernières lignes concernant le projet
#   scripts/logs.sh prod 200          → production, 200 lignes concernant le projet
#   scripts/logs.sh dev 200 all       → sans filtre
set -euo pipefail
. "$(dirname "$0")/_ha.sh"
ha_load_env
ha_target "${1:-dev}"
ha_configured || { echo "Jeton manquant pour '${1:-dev}' : voir .env.example" >&2; exit 1; }

lignes="${2:-50}"
log=$(curl -sS ${CURL_OPTS:-} -H "Authorization: Bearer ${HA_TOKEN}" "${HA_URL}/api/error_log")
if [ "${3:-}" = "all" ]; then
  echo "$log" | tail -n "$lignes"
else
  echo "$log" | grep -iE 'chauffage|derogation|template|versatile|zha' | tail -n "$lignes" || echo "(rien de pertinent)"
fi
