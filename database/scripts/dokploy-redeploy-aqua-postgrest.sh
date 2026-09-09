#!/usr/bin/env bash
# Dokploy — Aqua PostgREST havuz sıkışması (PGRST003) / force-recreate
#
# Kullanım (VPS / Dokploy terminal):
#   cd <repo-kökü>
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-aqua-postgrest.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.dokploy.yml}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli}"

export POSTGRES_PASSWORD
cd "${REPO_ROOT}"

echo "=== Git: main güncelle ==="
git fetch origin main && git checkout main && git pull origin main

grep -q 'postgrest_aqua_beauty:' "${COMPOSE_FILE}" || {
  echo "FATAL: docker-compose.dokploy.yml içinde postgrest_aqua_beauty yok."
  exit 1
}

echo "=== Force-recreate aqua PostgREST + pool watchdog ==="
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate --no-deps \
  postgrest_aqua_beauty \
  postgrest_pool_watchdog

sleep 4

echo "=== Konteyner durumu ==="
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' \
  | grep -E 'saas_postgrest_aqua_beauty|retailex_postgrest_pool_watchdog|NAMES' || true

echo "=== İç test (gateway) ==="
code="$(docker exec retailex_api_gateway wget -qO- --server-response --timeout=15 \
  'http://postgrest_aqua_beauty:3000/firms?select=firm_nr&limit=1' 2>&1 \
  | awk '/HTTP\//{print $2}' | tail -1 || echo '?')"
echo "  postgrest_aqua_beauty /firms → HTTP ${code}"

echo ""
echo "Dış test:"
echo '  curl -sS -m 15 "https://api.retailex.app/aqua/firms?select=firm_nr&limit=1"'
