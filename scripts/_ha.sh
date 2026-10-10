# Helpers shared by the scripts (to be sourced). Reads .env (or $ENV_FILE) and picks the
# target HA instance: "dev" (DEV_HA_URL / DEV_HA_TOKEN) or "prod" (PROD_HA_URL / PROD_HA_TOKEN).

ha_load_env() {
  local f="${ENV_FILE:-$(dirname "${BASH_SOURCE[0]}")/../.env}"
  if [ -f "$f" ]; then set -a; . "$f"; set +a; fi
}

# ha_target dev|prod → sets HA_URL and HA_TOKEN (empty when not configured)
ha_target() {
  case "${1:-dev}" in
    dev)  HA_URL="${DEV_HA_URL:-http://localhost:8124}"; HA_TOKEN="${DEV_HA_TOKEN:-}"
          # Token created by the dev HA's first-run setup (dev/setup/setup.py)
          local dev_token_file; dev_token_file="$(dirname "${BASH_SOURCE[0]}")/../dev/hass/.dev-token"
          [ -z "$HA_TOKEN" ] && [ -f "$dev_token_file" ] && HA_TOKEN="$(tr -d '\r\n' < "$dev_token_file")" ;;
    prod) HA_URL="${PROD_HA_URL:-}"; HA_TOKEN="${PROD_HA_TOKEN:-}" ;;
    *) echo "Unknown target: $1 (dev or prod)" >&2; return 2 ;;
  esac
}

ha_configured() { [ -n "${HA_URL:-}" ] && [ -n "${HA_TOKEN:-}" ]; }

# ha_api METHOD path [data] → response body
ha_api() {
  curl -sS ${CURL_OPTS:-} -X "$1" -H "Authorization: Bearer ${HA_TOKEN}" -H 'Content-Type: application/json' \
    -d "${3:-{}}" "${HA_URL}/api/$2"
}

# Checks the configuration on disk; prints the errors and returns 1 if it is invalid
# (or if HA cannot be reached: nothing can be guaranteed then)
ha_check_config() {
  local r
  if ! r=$(ha_api POST config/core/check_config 2>&1); then
    echo "❌ Cannot reach HA at ${HA_URL}: ${r}" >&2
    echo "   Check PROD_HA_URL / DEV_HA_URL (http or https? port? is HA running?)" >&2
    return 1
  fi
  if echo "$r" | grep -q '401: Unauthorized'; then
    echo "❌ Token rejected by ${HA_URL} (401): check the token in the environment file" >&2
    return 1
  fi
  if echo "$r" | grep -q '"result": *"valid"'; then
    echo "✅ HA configuration is valid"
  else
    echo "❌ Invalid HA configuration:" >&2
    echo "$r" >&2
    return 1
  fi
}

# Reloads what the package uses, without restarting HA
ha_reload() {
  local svc code
  for svc in template/reload automation/reload input_select/reload; do
    code=$(curl -sS ${CURL_OPTS:-} -o /dev/null -w '%{http_code}' -X POST \
      -H "Authorization: Bearer ${HA_TOKEN}" -H 'Content-Type: application/json' -d '{}' \
      "${HA_URL}/api/services/${svc}")
    echo "  ${svc} → HTTP ${code}"
  done
}
