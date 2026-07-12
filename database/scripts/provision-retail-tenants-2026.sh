#!/usr/bin/env bash
# Yeni retail kiracıları — DB, şema, PostgREST SQL, merkez tenant_registry, messaging
#
# Firmalar: kasap, testere, mettu, canon, lovan
#
# Dokploy terminali / VPS:
#   POSTGRES_PASSWORD='...' API_BASE_URL='https://api.retailex.app' \
#   bash database/scripts/provision-retail-tenants-2026.sh
#
# Uzak PG (host port açıksa):
#   PGHOST=72.60.182.107 PGUSER=postgres PGPASSWORD='...' \
#   API_BASE_URL='https://api.retailex.app' \
#   bash database/scripts/provision-retail-tenants-2026.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-saas_postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli}"
API_BASE_URL="${API_BASE_URL:-https://api.retailex.app}"
TENANT_USER_PASSWORD="${TENANT_USER_PASSWORD:-admin}"

MASTER_SQL="${REPO_ROOT}/database/migrations/000_master_schema.sql"
ROLE_SQL="${REPO_ROOT}/database/migrations/007_postgrest_anon_role.sql"
RPC_SQL="${REPO_ROOT}/database/migrations/008_postgrest_verify_login_rpc.sql"
MESSAGING_SQL="${REPO_ROOT}/database/migrations/044_messaging_postgrest_sync.sql"

# code|display_name|db_name
TENANTS=(
  'kasap|Kasaphane|kasap'
  'testere|Usta Testere|testere'
  'mettu|Mettu Market|mettu'
  'canon|Canon Retail|canon'
  'lovan|Lovan Retail|lovan'
)

psql_exec() {
  local db="$1"
  shift
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${POSTGRES_CONTAINER}"; then
    docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" -i "${POSTGRES_CONTAINER}" \
      psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${db}" "$@"
  elif command -v psql >/dev/null 2>&1; then
    PGPASSWORD="${POSTGRES_PASSWORD}" PGHOST="${PGHOST:-127.0.0.1}" PGUSER="${POSTGRES_USER}" \
      psql -v ON_ERROR_STOP=1 -d "${db}" "$@"
  else
    echo "HATA: psql veya ${POSTGRES_CONTAINER} yok." >&2
    exit 1
  fi
}

psql_file() {
  local db="$1"
  local file="$2"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${POSTGRES_CONTAINER}"; then
    docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" -i "${POSTGRES_CONTAINER}" \
      psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${db}" -f - < "${file}"
  else
    PGPASSWORD="${POSTGRES_PASSWORD}" PGHOST="${PGHOST:-127.0.0.1}" PGUSER="${POSTGRES_USER}" \
      psql -v ON_ERROR_STOP=1 -d "${db}" -f "${file}"
  fi
}

echo "== 1) Veritabanları oluştur =="
for entry in "${TENANTS[@]}"; do
  IFS='|' read -r _code _name db <<<"${entry}"
  exists="$(psql_exec postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" 2>/dev/null || true)"
  if [[ "${exists}" != "1" ]]; then
    psql_exec postgres -c "CREATE DATABASE \"${db}\";"
  fi
  echo "  OK: ${db}"
done

echo "== 2) Şema + PostgREST + messaging =="
for entry in "${TENANTS[@]}"; do
  IFS='|' read -r _code display_name db <<<"${entry}"
  echo "  -- ${db} (${display_name})"
  has_firms="$(psql_exec "${db}" -tAc "SELECT to_regclass('public.firms') IS NOT NULL;" 2>/dev/null || echo f)"
  has_rex_items="$(psql_exec "${db}" -tAc "SELECT to_regclass('public.rex_001_items') IS NOT NULL;" 2>/dev/null || echo f)"
  if [[ "${has_firms}" != "t" ]] || [[ "${has_rex_items}" != "t" ]]; then
    if [[ "${has_firms}" == "t" && "${has_rex_items}" != "t" ]]; then
      echo "    (yarım şema — master yeniden uygulanıyor)"
    fi
    psql_file "${db}" "${MASTER_SQL}"
  fi
  psql_file "${db}" "${ROLE_SQL}"
  psql_file "${db}" "${RPC_SQL}"
  if [[ -f "${MESSAGING_SQL}" ]]; then
    psql_file "${db}" "${MESSAGING_SQL}" || true
    psql_exec "${db}" -c \
      "INSERT INTO public.schema_migrations (filename) VALUES ('044_messaging_postgrest_sync.sql') ON CONFLICT (filename) DO NOTHING;" 2>/dev/null || true
  fi
  psql_exec "${db}" -v firm_name="${display_name}" -v pwd="${TENANT_USER_PASSWORD}" <<'SQL'
UPDATE public.firms SET name = :'firm_name', is_active = true, "default" = true
WHERE firm_nr = '001';
INSERT INTO public.firms (
  id, firm_nr, name, ana_para_birimi, raporlama_para_birimi,
  regulatory_region, gib_integration_mode, gib_ubl_profile, "default", is_active
)
SELECT
  '00000000-0000-4000-a000-000000000001', '001', :'firm_name',
  'TRY', 'TRY', 'TR', 'mock', 'TICARIFATURA', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.firms WHERE firm_nr = '001');

INSERT INTO public.periods (id, firm_id, nr, beg_date, end_date, is_active)
SELECT
  '4a23375d-c180-4459-9043-49f3f131bd58',
  '00000000-0000-4000-a000-000000000001', 1,
  DATE '2026-01-01', DATE '2026-12-31', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.periods WHERE firm_id = '00000000-0000-4000-a000-000000000001' AND nr = 1
);

INSERT INTO public.users (id, firm_nr, username, password_hash, full_name, email, role, role_id, is_active)
VALUES
  ('10000000-0000-4000-a000-000000000010', '001', 'mudur', crypt(:'pwd', gen_salt('bf')), 'Mağaza Müdürü', NULL, 'manager', '00000000-0000-0000-0000-000000000002', true),
  ('10000000-0000-4000-a000-000000000011', '001', 'kasiyer', crypt(:'pwd', gen_salt('bf')), 'Kasiyer', NULL, 'cashier', '00000000-0000-0000-0000-000000000003', true)
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash, is_active = true, updated_at = now();

NOTIFY pgrst, 'reload schema';
SQL
done

echo "== 3) merkez_db tenant_registry =="
psql_file merkez_db "${REPO_ROOT}/database/scripts/merkez_tenant_registry_add_scale_bridge_fields.sql" 2>/dev/null || true
psql_exec merkez_db -v api="${API_BASE_URL}" <<'SQL'
INSERT INTO tenant_registry (id, code, display_name, module, connection_provider, rest_base_url, database_name, is_active)
VALUES
  (gen_random_uuid(), 'kasap', 'Kasaphane', 'retail', 'rest_api', :'api' || '/kasap', 'kasap', true),
  (gen_random_uuid(), 'testere', 'Usta Testere', 'retail', 'rest_api', :'api' || '/testere', 'testere', true),
  (gen_random_uuid(), 'mettu', 'Mettu Market', 'retail', 'rest_api', :'api' || '/mettu', 'mettu', true),
  (gen_random_uuid(), 'canon', 'Canon Retail', 'retail', 'rest_api', :'api' || '/canon', 'canon', true),
  (gen_random_uuid(), 'lovan', 'Lovan Retail', 'retail', 'rest_api', :'api' || '/lovan', 'lovan', true)
ON CONFLICT (code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  module = EXCLUDED.module,
  connection_provider = EXCLUDED.connection_provider,
  rest_base_url = EXCLUDED.rest_base_url,
  database_name = EXCLUDED.database_name,
  is_active = EXCLUDED.is_active,
  updated_at = now();
SQL

echo ""
echo "== 4) Doğrulama =="
for entry in "${TENANTS[@]}"; do
  IFS='|' read -r code _name db <<<"${entry}"
  cnt="$(psql_exec "${db}" -tAc "SELECT COUNT(*) FROM public.firms;" 2>/dev/null || echo 0)"
  echo "  ${db}: firms=${cnt}"
done
psql_exec merkez_db -tAc "SELECT code, display_name, rest_base_url FROM tenant_registry WHERE code IN ('kasap','testere','mettu','canon','lovan') ORDER BY code;"

echo ""
echo "TAMAMLANDI."
echo "Sonraki adım (Dokploy):"
echo "  git pull origin main"
echo "  docker compose -f docker-compose.dokploy.yml up -d --build postgrest_kasap postgrest_testere postgrest_mettu postgrest_canon postgrest_lovan retailex_api_gateway"
