#!/usr/bin/env bash
# Dokploy — yalnızca web arayüzü (React/Vite) hızlı redeploy
#
# VERİ GÜVENLİĞİ: PostgreSQL verisi named volume saas_postgres_data içindedir.
# Bu script postgres'e DOKUNMAZ, volume silmez, migration çalıştırmaz.
#
# Tam stack (16 sync + postgrest + …) yerine UI güncellemesi için kullanın.
# Dokploy terminal:
#   cd /etc/dokploy/compose/app-retailex-*/code
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-frontend.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.dokploy.frontend.yml}"
FULL_COMPOSE="${FULL_COMPOSE:-${REPO_ROOT}/docker-compose.dokploy.yml}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli (Dokploy secret ile aynı)}"

export POSTGRES_PASSWORD
export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-1}"

cd "${REPO_ROOT}"

echo "=== Git: main ==="
git fetch origin main 2>/dev/null || true
git checkout main 2>/dev/null || true
git pull origin main 2>/dev/null || true

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "HATA: ${COMPOSE_FILE} yok — git pull origin main"
  exit 1
fi

echo "=== Yalnızca frontend imajı (docker-compose.dokploy.frontend.yml) ==="
docker compose -f "${COMPOSE_FILE}" build --progress=plain retailex_frontend

echo "=== Frontend konteyneri yenile (bridge/whatsapp dokunulmaz) ==="
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate retailex_frontend

sleep 2
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E 'retailex_frontend|retailex_bridge' || true
echo ""
echo "OK. Tarayıcıda Ctrl+F5 — index.html cache bypass."
echo "Chunk doğrulama: curl -sS http://127.0.0.1:\${RETAILEX_WEB_PORT:-8080}/ | grep -o 'InvoiceListModule-[^\"]*' | head -1"
