#!/usr/bin/env bash
# Runs the project's tests. Uses the installed Node / Python when available,
# otherwise Docker (nothing to install apart from Docker).
#   scripts/test.sh               → all tests
#   scripts/test.sh js            → card (node --test + jsdom)
#   scripts/test.sh integration   → Chauffage integration (pytest + in-memory Home Assistant)
#   scripts/test.sh integration -k ends → extra arguments are passed to pytest
#   HA=min scripts/test.sh integration → on the minimum supported Home Assistant (hacs.json)
#   scripts/test.sh coverage      → card and integration with coverage (fails below the minimum)
set -euo pipefail
cd "$(dirname "$0")/.."
what="${1:-all}"; shift || true

# Repository path for Docker (Git Bash on Windows: Windows path, no MSYS conversion)
root="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1

coverage() {
  echo "=== Card coverage (JavaScript, minimum 95 % of the lines) ==="
  if command -v node >/dev/null && command -v npm >/dev/null; then
    npm install --no-audit --no-fund --silent && npm run coverage
  else
    docker run --rm -v "$root:/app" -v ha-chauffage-node-modules:/app/node_modules -w /app node:22-alpine \
      sh -c 'npm install --no-audit --no-fund --silent && npm run coverage'
  fi
  rm -f lcov.info
  echo "=== Integration coverage (Python, minimum 97 % of the lines) ==="
  pytest_suite tests/integration --cov=custom_components/chauffage --cov-report=term-missing --cov-fail-under=97 "$@"
}

js_tests() {
  echo "=== Card tests (JavaScript) ==="
  if command -v node >/dev/null && command -v npm >/dev/null; then
    npm install --no-audit --no-fund --silent && npm test
  else
    docker run --rm -v "$root:/app" -v ha-chauffage-node-modules:/app/node_modules -w /app node:22-alpine \
      sh -c 'npm install --no-audit --no-fund --silent && npm test'
  fi
}

# pytest in an in-memory Home Assistant; $1 = suite directory
pytest_suite() {
  local suite="$1"; shift
  if [ "${HA:-}" != min ] && python3 -c 'import pytest_homeassistant_custom_component' 2>/dev/null; then
    python3 -m pytest -c "$suite/pytest.ini" "$suite" "$@"
  else
    local req=tests/integration/requirements.txt image=ha-chauffage-tests
    if [ "${HA:-}" = min ]; then req=tests/integration/requirements-min.txt; image=ha-chauffage-tests-min; fi
    docker build -q -t "$image" --build-arg REQUIREMENTS="$req" -f tests/integration/Dockerfile . >/dev/null
    docker run --rm -v "$root:/app" -w /app "$image" python -m pytest -c "$suite/pytest.ini" "$suite" "$@"
  fi
}

integration_tests() {
  echo "=== Integration tests (Python) ==="
  pytest_suite tests/integration "$@"
}

case "$what" in
  js) js_tests ;;
  integration) integration_tests "$@" ;;
  coverage) coverage "$@" ;;
  all) js_tests && integration_tests "$@" ;;
  *) echo "Usage: scripts/test.sh [js|integration|coverage|all] [pytest arguments]" >&2; exit 2 ;;
esac
