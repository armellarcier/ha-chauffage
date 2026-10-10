# Fonctions communes aux scripts (à sourcer). Lit .env (ou $ENV_FILE) et choisit
# l'instance HA visée : "dev" (DEV_HA_URL / DEV_HA_TOKEN) ou "prod" (PROD_HA_URL / PROD_HA_TOKEN).

ha_load_env() {
  local f="${ENV_FILE:-$(dirname "${BASH_SOURCE[0]}")/../.env}"
  if [ -f "$f" ]; then set -a; . "$f"; set +a; fi
}

# ha_target dev|prod → définit HA_URL et HA_TOKEN (vides si non configurés)
ha_target() {
  case "${1:-dev}" in
    dev)  HA_URL="${DEV_HA_URL:-http://localhost:8124}"; HA_TOKEN="${DEV_HA_TOKEN:-}" ;;
    prod) HA_URL="${PROD_HA_URL:-}"; HA_TOKEN="${PROD_HA_TOKEN:-}" ;;
    *) echo "Cible inconnue : $1 (dev ou prod)" >&2; return 2 ;;
  esac
}

ha_configured() { [ -n "${HA_URL:-}" ] && [ -n "${HA_TOKEN:-}" ]; }

# ha_api METHODE chemin [données] → corps de la réponse
ha_api() {
  curl -sS -X "$1" -H "Authorization: Bearer ${HA_TOKEN}" -H 'Content-Type: application/json' \
    -d "${3:-{}}" "${HA_URL}/api/$2"
}

# Vérifie la configuration sur disque ; affiche les erreurs et renvoie 1 si invalide
ha_check_config() {
  local r
  r=$(ha_api POST config/core/check_config)
  if echo "$r" | grep -q '"result": *"valid"'; then
    echo "✅ Configuration HA valide"
  else
    echo "❌ Configuration HA invalide :" >&2
    echo "$r" >&2
    return 1
  fi
}

# Recharge ce que le package utilise, sans redémarrer HA
ha_reload() {
  local svc code
  for svc in template/reload automation/reload input_select/reload; do
    code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
      -H "Authorization: Bearer ${HA_TOKEN}" -H 'Content-Type: application/json' -d '{}' \
      "${HA_URL}/api/services/${svc}")
    echo "  ${svc} → HTTP ${code}"
  done
}
