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
