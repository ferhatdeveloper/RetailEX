#!/usr/bin/env bash
# Dokploy — yalnızca kucoglu PostgREST + sync + api_gateway
#
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-kucoglu-only.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.dokploy.yml"

export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-${PGPASSWORD:-}}"
if [[ -z "${POSTGRES_PASSWORD}" ]]; then
  echo "FATAL: POSTGRES_PASSWORD gerekli." >&2
  exit 1
fi

cd "${REPO_ROOT}"

grep -q 'postgrest_kucoglu:' "${COMPOSE_FILE}" || {
  echo "FATAL: docker-compose.dokploy.yml içinde postgrest_kucoglu yok." >&2
  exit 1
}
grep -q 'handle_path /kucoglu/\*' database/docker/Caddyfile.api-gateway || {
  echo "FATAL: Caddyfile.api-gateway içinde /kucoglu route yok." >&2
  exit 1
}

echo "=== DB kucoglu var mı? ==="
if docker exec saas_postgres psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='kucoglu'" | grep -q 1; then
  echo "  OK: database kucoglu mevcut"
else
  echo "FATAL: PostgreSQL'de kucoglu yok — önce:"
  echo "  bash database/scripts/provision-kucoglu-restaurant.sh"
  exit 1
fi

echo "=== PostgREST kucoglu (port 3022) ==="
docker compose -f "${COMPOSE_FILE}" up -d postgrest_kucoglu

if ! docker image inspect retailex-sync-service:latest >/dev/null 2>&1; then
  echo "=== Sync imajı yok — tek seferlik build (sync_kucoglu) ==="
  docker compose -f "${COMPOSE_FILE}" build sync_kucoglu
fi

echo "=== sync_kucoglu + api_gateway (Caddy route yenile) ==="
docker compose -f "${COMPOSE_FILE}" up -d sync_kucoglu
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate api_gateway

sleep 2
for path in kucoglu/ kucoglu/firms kucoglu/rex_001_products; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:443/${path}?limit=1" -H "Accept: application/json" 2>/dev/null || echo "000")
  echo "  local /${path} → ${code}"
done

echo ""
echo "Dış test:"
echo '  curl -s -o /dev/null -w "%{http_code}" "https://api.retailex.app/kucoglu/"'
echo '  curl -s "https://api.retailex.app/kucoglu/rex_001_products?select=code,name,image_url&limit=3" -H "Accept: application/json"'
