#!/usr/bin/env bash
# Dokploy — yalnızca API gateway (Caddy sync_queue yönlendirme düzeltmesi: /sync/*)
#
# Kullanım (VPS / Dokploy terminal):
#   cd <repo-kökü>
#   bash database/scripts/dokploy-redeploy-api-gateway.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.dokploy.yml}"

cd "${REPO_ROOT}"

echo "=== Git: main (Caddyfile.api-gateway) ==="
git fetch origin main
git checkout main
git pull origin main

if grep -q 'handle /lovan/sync\*' database/docker/Caddyfile.api-gateway 2>/dev/null; then
  echo "FATAL: Caddyfile hâlâ /sync* kullanıyor — /sync/* olmalı."
  exit 1
fi

echo "=== api_gateway yeniden oluştur (Caddy mount güncel) ==="
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate api_gateway

sleep 2
docker exec retailex_api_gateway caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || true

echo "=== Doğrulama (gateway içi) ==="
for slug in lovan kasap testere mettu canon; do
  code="$(docker exec retailex_api_gateway wget -qO- --server-response \
    "http://127.0.0.1/${slug}/sync_queue?select=id&limit=1" 2>&1 | awk '/HTTP/{print $2}' | tail -1 || echo "?")"
  echo "  /${slug}/sync_queue → HTTP ${code}"
done

echo ""
echo "Dış test:"
echo '  curl -s -o /dev/null -w "%{http_code}" "https://api.retailex.app/lovan/sync_queue?select=id&limit=1" -H "Accept: application/json" -H "Accept-Profile: public"'
