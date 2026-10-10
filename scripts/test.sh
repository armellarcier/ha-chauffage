#!/usr/bin/env bash
# Runs the project's tests. Uses the installed Node / Python when available,
# otherwise Docker (nothing to install apart from Docker).
#   scripts/test.sh               → all tests
#   scripts/test.sh js            → card (node --test + jsdom)
#   scripts/test.sh ha            → HA package (pytest + in-memory Home Assistant)
#   scripts/test.sh integration   → Chauffage integration (custom_components/chauffage)
#   scripts/test.sh ha -k ends    → extra arguments are passed to pytest
set -euo pipefail
cd "$(dirname "$0")/.."
what="${1:-all}"; shift || true

# Repository path for Docker (Git Bash on Windows: Windows path, no MSYS conversion)
root="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1

js_tests() {
  echo "=== Card tests (JavaScript) ==="
  if command -v node >/dev/null && command -v npm >/dev/null; then
    npm install --no-audit --no-fund --silent && npm test
  else
    docker run --rm -v "$root:/app" -v ha-chauffage-node-modules:/app/node_modules -w /app node:22-alpine \
      sh -c 'npm install --no-audit --no-fund --silent && npm test'
  fi
}

# pytest in an in-memory Home Assistant; $1 = suite directory (tests/ha or tests/integration)
pytest_suite() {
  local suite="$1"; shift
  if python3 -c 'import pytest_homeassistant_custom_component' 2>/dev/null; then
    python3 -m pytest -c "$suite/pytest.ini" "$suite" "$@"
  else
    docker build -q -t ha-chauffage-tests -f tests/ha/Dockerfile . >/dev/null
    docker run --rm -v "$root:/app" -w /app ha-chauffage-tests python -m pytest -c "$suite/pytest.ini" "$suite" "$@"
  fi
}

ha_tests() {
  echo "=== HA package tests (Python) ==="
  pytest_suite tests/ha "$@"
}

integration_tests() {
  echo "=== Integration tests (Python) ==="
  pytest_suite tests/integration "$@"
}

case "$what" in
  js) js_tests ;;
  ha) ha_tests "$@" ;;
  integration) integration_tests "$@" ;;
  all) js_tests && ha_tests "$@" && integration_tests "$@" ;;
  *) echo "Usage: scripts/test.sh [js|ha|integration|all] [pytest arguments]" >&2; exit 2 ;;
esac
