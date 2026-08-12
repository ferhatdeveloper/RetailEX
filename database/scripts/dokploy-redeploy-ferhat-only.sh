#!/usr/bin/env bash
# Dokploy — yalnızca ferhat PostgREST + sync + api_gateway (yeni kiracı route)
#
# Kullanım (VPS / Dokploy terminal):
#   cd <repo-kökü>
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-ferhat-only.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.dokploy.yml}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli}"

export POSTGRES_PASSWORD
cd "${REPO_ROOT}"

echo "=== Git: main güncelle ==="
git fetch origin main && git checkout main && git pull origin main

grep -q 'postgrest_ferhat:' "${COMPOSE_FILE}" || {
  echo "FATAL: docker-compose.dokploy.yml içinde postgrest_ferhat yok — git pull kontrol edin."
  exit 1
}
grep -q 'handle_path /ferhat/\*' database/docker/Caddyfile.api-gateway || {
  echo "FATAL: Caddyfile.api-gateway içinde /ferhat route yok — git pull kontrol edin."
  exit 1
}

echo "=== PostgREST ferhat (port 3020) ==="
docker compose -f "${COMPOSE_FILE}" up -d postgrest_ferhat

if ! docker image inspect retailex-sync-service:latest >/dev/null 2>&1; then
  echo "=== Sync imajı yok — tek seferlik build (sync_ferhat) ==="
  docker compose -f "${COMPOSE_FILE}" build sync_ferhat
fi

echo "=== sync_ferhat + api_gateway (Caddy route yenile) ==="
docker compose -f "${COMPOSE_FILE}" up -d sync_ferhat
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate api_gateway

sleep 3
docker exec retailex_api_gateway caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || true

echo "=== İç test ==="
for path in ferhat/firms ferhat/sync/health; do
  code="$(docker exec retailex_api_gateway wget -qO- --server-response \
    "http://127.0.0.1/${path}?limit=1" 2>&1 | awk '/HTTP/{print $2}' | tail -1 || echo "?")"
  echo "  /${path} → HTTP ${code}"
done

echo ""
echo "Dış test:"
echo '  curl -s -o /dev/null -w "%{http_code}" "https://api.retailex.app/ferhat/firms?limit=1" -H "Accept: application/json"'
echo '  curl -s "https://api.retailex.app/ferhat/sync/health"'
