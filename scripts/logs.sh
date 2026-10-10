#!/usr/bin/env bash
# Affiche la fin du journal HA (via l'API, sans accès Docker).
#   scripts/logs.sh              → 50 dernières lignes concernant le projet
#   scripts/logs.sh 200          → 200 dernières lignes concernant le projet
#   scripts/logs.sh 200 all      → 200 dernières lignes, sans filtre
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=/dev/null
set -a; . ./.env; set +a

lignes="${1:-50}"
filtre='chauffage|derogation|template|versatile|zha'
log=$(curl -sS -H "Authorization: Bearer ${HA_TOKEN}" "${HA_URL}/api/error_log")
if [ "${2:-}" = "all" ]; then
  echo "$log" | tail -n "$lignes"
else
  echo "$log" | grep -iE "$filtre" | tail -n "$lignes" || echo "(rien de pertinent)"
fi
