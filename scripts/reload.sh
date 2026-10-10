#!/usr/bin/env bash
# Vérifie la configuration puis recharge capteurs template, automatisations et input_select.
#   scripts/reload.sh                 → HA de dev
#   scripts/reload.sh prod            → HA de production
#   scripts/reload.sh dev --check     → vérification seule
set -euo pipefail
. "$(dirname "$0")/_ha.sh"
ha_load_env
ha_target "${1:-dev}"
ha_configured || { echo "Jeton manquant pour '${1:-dev}' : voir .env.example" >&2; exit 1; }

ha_check_config
[ "${2:-}" = "--check" ] && exit 0
echo "Rechargement (${HA_URL}) :"
ha_reload
