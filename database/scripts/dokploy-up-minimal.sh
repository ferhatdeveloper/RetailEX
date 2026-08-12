#!/usr/bin/env bash
# Minimum çalışır web yığını: postgres + bridge + wa + frontend (+ api_gateway)
# Sync/postgrest rebuild ETMEZ — deploy takılınca siteyi ayağa kaldırmak için.
#
# VERİ GÜVENLİĞİ:
# - Mevcut saas_postgres_data volume'u KULLANILIR (yeni volume açılmaz).
# - down -v / volume rm / DROP DATABASE YAPILMAZ.
# - POSTGRES_PASSWORD Dokploy'daki mevcut değerle AYNI olmalı (değiştirmeyin).
#
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-up-minimal.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE="${REPO_ROOT}/docker-compose.dokploy.yml"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli}"

export POSTGRES_PASSWORD
export COMPOSE_PARALLEL_LIMIT=1
cd "${REPO_ROOT}"

if docker volume inspect saas_postgres_data >/dev/null 2>&1; then
  echo "=== Veri volume mevcut: saas_postgres_data (korunuyor) ==="
else
  echo "UYARI: saas_postgres_data volume yok — ilk kurulum olabilir; mevcut veri bekliyorsanız DURUN."
  echo "Devam: 10 sn içinde Ctrl+C"
  sleep 10
fi

if docker ps -a --format '{{.Names}}' | grep -qx saas_postgres; then
  echo "=== saas_postgres zaten var — yeniden oluşturulmaz, volume bağlanır ==="
fi

echo "=== Postgres + köprüler (mevcut imaj, veri volume aynı) ==="
docker compose -f "${COMPOSE}" up -d postgres retailex_bridge retailex_whatsapp_bridge

echo "=== Postgres healthy bekleniyor (max 120s) ==="
for i in $(seq 1 24); do
  if docker compose -f "${COMPOSE}" exec -T postgres pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    echo "Postgres hazır."
    break
  fi
  sleep 5
  if [[ "$i" -eq 24 ]]; then
    echo "HATA: Postgres hazır değil"
    docker compose -f "${COMPOSE}" logs postgres --tail 30
    exit 1
  fi
done

echo "=== Frontend build (yalnızca UI) ==="
docker compose -f "${REPO_ROOT}/docker-compose.dokploy.frontend.yml" build --progress=plain retailex_frontend
docker compose -f "${REPO_ROOT}/docker-compose.dokploy.frontend.yml" up -d --force-recreate retailex_frontend

echo "=== API gateway (PostgREST proxy — mevcut imaj) ==="
docker compose -f "${COMPOSE}" up -d api_gateway postgrest_merkez postgrest_lovan 2>/dev/null || \
  docker compose -f "${COMPOSE}" up -d api_gateway || true

sleep 3
curl -sI --max-time 5 http://127.0.0.1:8080/ | head -5 || true
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'retailex|saas_postgres|api_gateway|NAMES'

echo ""
echo "Tamam. https://retailex.app hâlâ 404 ise Dokploy → Domains → retailex.app → retailex_frontend:80"
