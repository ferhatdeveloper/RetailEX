#!/usr/bin/env bash
# Dokploy / Ubuntu VPS — terazi köprüsü kolonları (merkez_db + kiracı stores) + PostgREST yenileme
#
# Kullanım (Dokploy terminal, repo kökünde):
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-scale-bridge-setup.sh
#
# İsteğe bağlı:
#   COMPOSE_FILE=./docker-compose.dokploy.yml
#   POSTGRES_CONTAINER=saas_postgres
#   FILL_SAMPLE_URLS=1   # merkez tenant_registry örnek IP'leri yazar (boş satırlara)
#   TENANT_DBS="kasap testere"   # boş = tüm retail kiracıları

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.dokploy.yml}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-saas_postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli (Dokploy secret ile aynı)}"

MERKEZ_SQL="${REPO_ROOT}/database/scripts/merkez_tenant_registry_add_scale_bridge_fields.sql"
STORES_SQL="${REPO_ROOT}/database/migrations/045_stores_scale_bridge.sql"
FILL_URLS_SQL="${REPO_ROOT}/database/scripts/tenant_registry_fill_scale_bridge_urls.sql"

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
  zetem
  ferhat
  ozbek
)

if [[ -n "${TENANT_DBS:-}" ]]; then
  # shellcheck disable=SC2206
  DBS=(${TENANT_DBS})
else
  DBS=("${DEFAULT_TENANT_DBS[@]}")
fi

POSTGREST_CONTAINERS=(
  merkez_db:saas_postgrest_merkez
  aqua_beauty:saas_postgrest_aqua_beauty
  berzin_com:saas_postgrest_berzin_com
  retailex_demo:saas_postgrest_retailex_demo
  kasap:saas_postgrest_kasap
  testere:saas_postgrest_testere
  mettu:saas_postgrest_mettu
  canon:saas_postgrest_canon
  lovan:saas_postgrest_lovan
  zetem:saas_postgrest_zetem
  ferhat:saas_postgrest_ferhat
  ozbek:saas_postgrest_ozbek
)

psql_db() {
  local db="$1"
  shift
  docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" -i "${POSTGRES_CONTAINER}" \
    psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${db}" "$@"
}

db_exists() {
  local db="$1"
  docker exec "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1
}

if [[ ! -f "${MERKEZ_SQL}" || ! -f "${STORES_SQL}" ]]; then
  echo "SQL dosyaları eksik. Önce: git pull origin main" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "${POSTGRES_CONTAINER}"; then
  echo "Postgres konteyneri çalışmıyor: ${POSTGRES_CONTAINER}" >&2
  echo "Önce: docker compose -f ${COMPOSE_FILE} up -d postgres" >&2
  exit 1
fi

echo "== 1) merkez_db.tenant_registry — scale_bridge kolonları =="
if db_exists merkez_db; then
  psql_db merkez_db -f - < "${MERKEZ_SQL}"
  if [[ "${FILL_SAMPLE_URLS:-0}" == "1" && -f "${FILL_URLS_SQL}" ]]; then
    echo "  -- örnek köprü URL + token (gerçek mağaza IP'lerini sonra güncelleyin)"
    psql_db merkez_db -f - < "${FILL_URLS_SQL}"
    if [[ -f "${REPO_ROOT}/database/scripts/sync-scale-bridge-stores-from-registry.sh" ]]; then
      POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" POSTGRES_CONTAINER="${POSTGRES_CONTAINER}" \
        bash "${REPO_ROOT}/database/scripts/sync-scale-bridge-stores-from-registry.sh"
    fi
  fi
  psql_db merkez_db -c "NOTIFY pgrst, 'reload schema';" >/dev/null 2>&1 || true
else
  echo "  -- atlandı: merkez_db yok"
fi

echo "== 2) Kiracı DB — stores.scale_bridge kolonları (045) =="
for db in "${DBS[@]}"; do
  [[ "${db}" == "merkez_db" ]] && continue
  if ! db_exists "${db}"; then
    echo "  -- atlandı (DB yok): ${db}"
    continue
  fi
  echo "  -- ${db}"
  psql_db "${db}" -f - < "${STORES_SQL}"
  psql_db "${db}" -c \
    "INSERT INTO public.schema_migrations (filename) VALUES ('045_stores_scale_bridge.sql') ON CONFLICT (filename) DO NOTHING;" \
    2>/dev/null || true
  psql_db "${db}" -c "NOTIFY pgrst, 'reload schema';" >/dev/null 2>&1 || true
done

echo "== 3) PostgREST konteynerlerini yeniden başlat =="
for entry in "${POSTGREST_CONTAINERS[@]}"; do
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

if docker ps -a --format '{{.Names}}' | grep -qx retailex_api_gateway; then
  docker restart retailex_api_gateway >/dev/null 2>&1 || true
  echo "  restarted retailex_api_gateway"
fi

echo "== 4) Doğrulama =="
if db_exists merkez_db; then
  docker exec "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d merkez_db -tAc \
    "SELECT column_name FROM information_schema.columns WHERE table_name='tenant_registry' AND column_name LIKE 'scale_bridge%';" \
    | sed 's/^/  merkez: /'
fi
for db in kasap testere; do
  if db_exists "${db}"; then
    docker exec "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${db}" -tAc \
      "SELECT column_name FROM information_schema.columns WHERE table_name='stores' AND column_name LIKE 'scale_bridge%';" \
      | sed "s/^/  ${db}: /"
  fi
done

echo ""
echo "TAMAMLANDI."
echo "Merkez köprü URL'leri: merkez_db.tenant_registry (scale_bridge_url / scale_bridge_token)"
echo "Mağaza override: kiracı DB stores tablosu"
echo "API test: curl -s 'https://api.retailex.app/merkez/tenant_registry?code=eq.kasap&select=code,scale_bridge_url'"
