#!/usr/bin/env bash
# Dokploy — WebSocket Sync Service + API gateway (Caddy /{kiracı}/ws, /{kiracı}/sync/*)
# Not: /sync* değil /sync/* — aksi halde /sync_queue PostgREST yerine sync servisine gider.
#
# Dokploy arayüzü: Compose docker-compose.dokploy.yml → Redeploy
# veya terminal:
#   cd <repo-kökü>
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-sync.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.dokploy.yml}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli (Dokploy secret ile aynı)}"

export POSTGRES_PASSWORD

cd "${REPO_ROOT}"

echo "=== Git: main güncelle (Sync Dockerfile + Cargo.lock) ==="
git fetch origin main
git checkout main
git pull origin main
if ! grep -qF '=1.11.0' src/sync-service/Cargo.toml 2>/dev/null; then
  echo "FATAL: src/sync-service/Cargo.toml uuid pin yok — repo güncellenemedi."
  exit 1
fi

SYNC_SERVICES=(
  sync_aqua
  sync_berzin_com
  sync_canon
  sync_kasap
  sync_lovan
  sync_mettu
  sync_pdks_demo
  sync_retailex_demo
  sync_siti_pdks
  sync_testere
  sync_zetem
  sync_ferhat
  sync_ozbek
)

echo "=== Dokploy: Sync Service imajları (cache’siz — Rust 1.88 + locked Cargo.lock) ==="
docker compose -f "${COMPOSE_FILE}" build --no-cache --pull "${SYNC_SERVICES[@]}"

echo "=== Sync konteynerleri + api_gateway (Caddy ws/sync route yenile) ==="
docker compose -f "${COMPOSE_FILE}" up -d "${SYNC_SERVICES[@]}"
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate api_gateway

echo "=== Sağlık kontrolü (gateway içinden lovan) ==="
sleep 3
if docker exec retailex_api_gateway wget -qO- http://127.0.0.1/lovan/sync/health 2>/dev/null | head -c 200; then
  echo ""
  echo "OK: /lovan/sync/health"
else
  echo "Uyarı: /lovan/sync/health henüz yanıt vermedi — sync_lovan loglarına bakın:"
  echo "  docker logs saas_sync_lovan --tail 40"
fi

echo ""
echo "Dış URL test:"
echo "  curl -s https://api.retailex.app/lovan/sync/health"
echo "  curl -s https://api.retailex.app/lovan/firms?select=firm_nr&limit=1"
