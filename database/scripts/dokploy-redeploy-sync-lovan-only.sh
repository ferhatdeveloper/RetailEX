#!/usr/bin/env bash
# Dokploy — yalnızca lovan Sync + api_gateway (hızlı test, ~10 dk build)
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-sync-lovan-only.sh
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.dokploy.yml}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli}"

export POSTGRES_PASSWORD
cd "${REPO_ROOT}"

echo "=== Git: main güncelle ==="
git fetch origin main && git checkout main && git pull origin main
grep -qF '=1.11.0' src/sync-service/Cargo.toml || { echo "FATAL: git pull başarısız veya eski repo"; exit 1; }

echo "=== Build sync_lovan (cache’siz) ==="
docker compose -f "${COMPOSE_FILE}" build --no-cache --pull sync_lovan

echo "=== Up sync_lovan + api_gateway (Caddy route yenile) ==="
docker compose -f "${COMPOSE_FILE}" up -d sync_lovan
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate api_gateway

sleep 3
echo "=== İç test ==="
docker exec retailex_api_gateway wget -qO- http://127.0.0.1/lovan/sync/health 2>/dev/null || \
  echo "Henüz hazır değil — docker logs saas_sync_lovan --tail 30"

echo ""
echo "Dış: curl -s https://api.retailex.app/lovan/sync/health"
