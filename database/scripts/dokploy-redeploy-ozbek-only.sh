#!/usr/bin/env bash
# Dokploy — yalnızca ozbek PostgREST + sync + api_gateway (yeni kiracı route)
#
# Kullanım (VPS / Dokploy terminal):
#   cd <repo-kökü>
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-ozbek-only.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.dokploy.yml}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli}"

export POSTGRES_PASSWORD
cd "${REPO_ROOT}"

echo "=== Git: main güncelle ==="
git fetch origin main && git checkout main && git pull origin main

grep -q 'postgrest_ozbek:' "${COMPOSE_FILE}" || {
  echo "FATAL: docker-compose.dokploy.yml içinde postgrest_ozbek yok — git pull kontrol edin."
  exit 1
}
grep -q 'handle_path /ozbek/\*' database/docker/Caddyfile.api-gateway || {
  echo "FATAL: Caddyfile.api-gateway içinde /ozbek route yok — git pull kontrol edin."
  exit 1
}

echo "=== DB ozbek var mı? ==="
if docker exec saas_postgres psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='ozbek'" | grep -q 1; then
  echo "  OK: database ozbek mevcut"
else
  echo "FATAL: PostgreSQL'de ozbek yok — önce:"
  echo "  bash database/scripts/provision-ozbek-restaurant.sh"
  exit 1
fi

echo "=== PostgREST ozbek (port 3021) ==="
docker compose -f "${COMPOSE_FILE}" up -d postgrest_ozbek

if ! docker image inspect retailex-sync-service:latest >/dev/null 2>&1; then
  echo "=== Sync imajı yok — tek seferlik build (sync_ozbek) ==="
  docker compose -f "${COMPOSE_FILE}" build sync_ozbek
fi

echo "=== sync_ozbek + api_gateway (Caddy route yenile) ==="
docker compose -f "${COMPOSE_FILE}" up -d sync_ozbek
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate api_gateway

sleep 3
docker exec retailex_api_gateway caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || true

echo "=== İç test ==="
for path in ozbek/ ozbek/firms ozbek/sync/health; do
  code="$(docker exec retailex_api_gateway wget -qO- --server-response \
    "http://127.0.0.1/${path}?limit=1" 2>&1 | awk '/HTTP/{print $2}' | tail -1 || echo "?")"
  echo "  /${path} → HTTP ${code}"
done

echo ""
echo "Dış test:"
echo '  curl -s -o /dev/null -w "%{http_code}" "https://api.retailex.app/ozbek/"'
echo '  curl -s "https://api.retailex.app/ozbek/" | head -c 200'
echo '  curl -s -o /dev/null -w "%{http_code}" "https://api.retailex.app/ozbek/firms?limit=1" -H "Accept: application/json"'
