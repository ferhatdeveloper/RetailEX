#!/usr/bin/env bash
# Dokploy / Ubuntu VPS — WhatsApp messaging tabloları + PostgREST yenileme
#
# Kullanım (repo kökünde, POSTGRES_PASSWORD Dokploy secret ile aynı):
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-messaging-setup.sh
#
# İsteğe bağlı:
#   COMPOSE_FILE=./docker-compose.dokploy.yml
#   POSTGRES_CONTAINER=saas_postgres
#   TENANT_DBS="berzin_com kasap lovan"   # boş = varsayılan retail listesi

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.dokploy.yml}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-saas_postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli}"

MIGRATION_SQL="${REPO_ROOT}/database/migrations/044_messaging_postgrest_sync.sql"

DEFAULT_TENANT_DBS=(
  merkez_db
  aqua_beauty
  berzin_com
  retailex_demo
  kasap
  testere
  mettu
  canon
  lovan
)

if [[ -n "${TENANT_DBS:-}" ]]; then
  # shellcheck disable=SC2206
  DBS=(${TENANT_DBS})
else
  DBS=("${DEFAULT_TENANT_DBS[@]}")
fi

POSTGREST_MAP=(
  merkez_db:saas_postgrest_merkez
  aqua_beauty:saas_postgrest_aqua_beauty
  berzin_com:saas_postgrest_berzin_com
  retailex_demo:saas_postgrest_retailex_demo
  kasap:saas_postgrest_kasap
  testere:saas_postgrest_testere
  mettu:saas_postgrest_mettu
  canon:saas_postgrest_canon
  lovan:saas_postgrest_lovan
)

if [[ ! -f "${MIGRATION_SQL}" ]]; then
  echo "Migration bulunamadı: ${MIGRATION_SQL}" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "${POSTGRES_CONTAINER}"; then
  echo "Postgres konteyneri çalışmıyor: ${POSTGRES_CONTAINER}" >&2
  echo "Önce: docker compose -f ${COMPOSE_FILE} up -d postgres" >&2
  exit 1
fi

echo "== 1) WhatsApp köprüsü + frontend (nginx /__wa_bridge) =="
export POSTGRES_PASSWORD
docker compose -f "${COMPOSE_FILE}" up -d --build retailex_whatsapp_bridge retailex_frontend

echo "== 2) Migration 044 — messaging_settings / notification_queue =="
for db in "${DBS[@]}"; do
  if ! docker exec "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
    echo "  -- atlandı (DB yok): ${db}"
    continue
  fi
  echo "  -- ${db}"
  docker exec -i "${POSTGRES_CONTAINER}" psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${db}" \
    < "${MIGRATION_SQL}"
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${db}" -c \
    "INSERT INTO public.schema_migrations (filename) VALUES ('044_messaging_postgrest_sync.sql') ON CONFLICT (filename) DO NOTHING;" \
    2>/dev/null || true
done

echo "== 3) PostgREST şema önbelleği yenile =="
for db in "${DBS[@]}"; do
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${db}" -c \
    "NOTIFY pgrst, 'reload schema';" >/dev/null 2>&1 || true
done

echo "== 4) PostgREST konteynerlerini yeniden başlat =="
for entry in "${POSTGREST_MAP[@]}"; do
  d="${entry%%:*}"
  c="${entry##*:}"
  for target_db in "${DBS[@]}"; do
    if [[ "${target_db}" == "${d}" ]]; then
      if docker ps -a --format '{{.Names}}' | grep -qx "${c}"; then
        docker restart "${c}" >/dev/null
        echo "  restarted ${c}"
      fi
      break
    fi
  done
done

echo "== 5) Sağlık kontrolü =="
if docker ps --format '{{.Names}}' | grep -qx retailex_whatsapp_bridge; then
  docker exec retailex_frontend wget -qO- http://retailex_whatsapp_bridge:3000/status 2>/dev/null | head -c 200 || true
  echo ""
fi

for db in berzin_com kasap lovan; do
  c="saas_postgrest_${db}"
  if docker ps --format '{{.Names}}' | grep -qx "${c}"; then
    path="/rex_001_messaging_settings?select=id&limit=1"
    docker exec "${c}" wget -qO- "http://127.0.0.1:3000/${path}" 2>/dev/null | head -c 120 && echo " (${db})" || echo "WARN: ${db} messaging_settings hâlâ erişilemiyor"
  fi
done

echo ""
echo "TAMAMLANDI."
echo "Backoffice → WhatsApp Entegrasyonu:"
echo "  Sağlayıcı: Doğrudan (Baileys QR köprüsü)"
echo "  Köprü URL: /__wa_bridge"
echo "  (Kaydet → QR panelinden telefonla okutun)"
