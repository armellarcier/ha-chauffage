#!/usr/bin/env bash
# Vérifie la configuration HA puis recharge ce que le package utilise
# (capteurs template, automatisations, input_select), sans redémarrer HA.
#   scripts/reload.sh            → vérification + rechargement
#   scripts/reload.sh --check    → vérification seule
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=/dev/null
set -a; . ./.env; set +a

api() { curl -sS -X POST -H "Authorization: Bearer ${HA_TOKEN}" -H 'Content-Type: application/json' "${HA_URL}/api/$1"; }

echo "Vérification de la configuration…"
check=$(api config/core/check_config)
if [ "$(echo "$check" | jq -r .result)" != "valid" ]; then
  echo "❌ Configuration invalide :"
  echo "$check" | jq -r '.errors // .'
  exit 1
fi
echo "✅ Configuration valide"
[ "${1:-}" = "--check" ] && exit 0

for svc in template/reload automation/reload input_select/reload; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
    -H "Authorization: Bearer ${HA_TOKEN}" -H 'Content-Type: application/json' \
    "${HA_URL}/api/services/${svc}")
  echo "${svc} → HTTP ${code}"
done
