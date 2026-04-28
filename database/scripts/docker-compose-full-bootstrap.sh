#!/usr/bin/env bash
set -euo pipefail

# RetailEX full bootstrap with Docker Compose:
# - starts all core services
# - creates tenant databases
# - applies schema (000) + PostgREST grants (007) + login rpc (008)
# - ensures firms/periods/users
# - updates merkez_db.tenant_registry for REST API routing
#
# Usage:
#   POSTGRES_PASSWORD='...' API_BASE_URL='https://api.retailex.app' \
#   bash database/scripts/docker-compose-full-bootstrap.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.dokploy.yml}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-saas_postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-root_password_2026}"
API_BASE_URL="${API_BASE_URL:-https://api.retailex.app}"
TENANT_USER_PASSWORD="${TENANT_USER_PASSWORD:-admin}"

MASTER_SQL="${REPO_ROOT}/database/migrations/000_master_schema.sql"
ROLE_SQL="${REPO_ROOT}/database/migrations/007_postgrest_anon_role.sql"
RPC_SQL="${REPO_ROOT}/database/migrations/008_postgrest_verify_login_rpc.sql"

DBS=(
  merkez_db
  dismarco_pdks
  aqua_beauty
  m10_pdks
  bestcom_db
  siti_pdks
  pdks_demo
  retailex_demo
  berzin_com
  sho_aksesuar
  kupeli
)

POSTGREST_SERVICES=(
  postgrest_merkez
  postgrest_dismarco_pdks
  postgrest_aqua_beauty
  postgrest_m10_pdks
  postgrest_bestcom
  postgrest_siti_pdks
  postgrest_pdks_demo
  postgrest_retailex_demo
  postgrest_berzin_com
  postgrest_sho_aksesuar
  postgrest_kupeli
)

ALL_SERVICES=(
  postgres
  pgadmin
  retailex_bridge
  retailex_frontend
  "${POSTGREST_SERVICES[@]}"
)

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Compose file not found: ${COMPOSE_FILE}" >&2
  exit 1
fi

if [[ ! -f "${MASTER_SQL}" || ! -f "${ROLE_SQL}" || ! -f "${RPC_SQL}" ]]; then
  echo "Required migration file is missing under database/migrations." >&2
  exit 1
fi

export POSTGRES_PASSWORD

echo "== 1) Docker compose services up =="
docker compose -f "${COMPOSE_FILE}" up -d "${ALL_SERVICES[@]}"

echo "== 2) Wait postgres =="
for _ in {1..60}; do
  if docker exec "${POSTGRES_CONTAINER}" pg_isready -U "${POSTGRES_USER}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker exec "${POSTGRES_CONTAINER}" pg_isready -U "${POSTGRES_USER}" >/dev/null

echo "== 3) Ensure tenant databases =="
for db in "${DBS[@]}"; do
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres -v dbname="${db}" <<'SQL'
SELECT 'CREATE DATABASE ' || quote_ident(:'dbname')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'dbname') \gexec
SQL
done

echo "== 4) Apply schema + PostgREST SQL =="
for db in "${DBS[@]}"; do
  echo "-- ${db}"
  has_firms="$(docker exec -i "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${db}" -tAc "SELECT to_regclass('public.firms') IS NOT NULL;")"
  if [[ "${has_firms}" != "t" ]]; then
    docker exec -i "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${db}" -f /dev/stdin < "${MASTER_SQL}"
  fi
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${db}" -f /dev/stdin < "${ROLE_SQL}"
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${db}" -f /dev/stdin < "${RPC_SQL}"
done

echo "== 5) Ensure firms, periods, app users =="
for db in "${DBS[@]}"; do
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${db}" -v pwd="${TENANT_USER_PASSWORD}" <<'SQL'
INSERT INTO public.firms (
  id, firm_nr, name, ana_para_birimi, raporlama_para_birimi,
  regulatory_region, gib_integration_mode, gib_ubl_profile, "default", is_active
)
SELECT
  '00000000-0000-4000-a000-000000000001',
  '001',
  'RetailEx OS',
  'IQD',
  'IQD',
  'IQ',
  'mock',
  'TICARIFATURA',
  true,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.firms WHERE firm_nr = '001');

INSERT INTO public.periods (id, firm_id, nr, beg_date, end_date, is_active)
SELECT
  '4a23375d-c180-4459-9043-49f3f131bd58',
  '00000000-0000-4000-a000-000000000001',
  1,
  DATE '2026-01-01',
  DATE '2026-12-31',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.periods
  WHERE firm_id = '00000000-0000-4000-a000-000000000001' AND nr = 1
);

INSERT INTO public.users (
  id, firm_nr, username, password_hash, full_name, email, role, role_id, is_active
)
VALUES
  (
    '10000000-0000-4000-a000-000000000010',
    '001',
    'mudur',
    crypt(:'pwd', gen_salt('bf')),
    'Magaza Muduru',
    NULL,
    'manager',
    '00000000-0000-0000-0000-000000000002',
    true
  ),
  (
    '10000000-0000-4000-a000-000000000011',
    '001',
    'kasiyer',
    crypt(:'pwd', gen_salt('bf')),
    'Kasiyer',
    NULL,
    'cashier',
    '00000000-0000-0000-0000-000000000003',
    true
  )
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  role_id = EXCLUDED.role_id,
  firm_nr = EXCLUDED.firm_nr,
  is_active = true,
  updated_at = now();
SQL
done

echo "== 6) Update merkez tenant_registry to rest_api =="
docker exec -i "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d merkez_db -v api="${API_BASE_URL}" <<'SQL'
INSERT INTO tenant_registry (id, code, display_name, module, connection_provider, rest_base_url, database_name)
VALUES
  (gen_random_uuid(), 'merkez', 'Merkez Yapi', 'tenant_registry', 'rest_api', :'api' || '/merkez', 'merkez_db'),
  (gen_random_uuid(), 'aqua_beauty', 'Aqua Beauty', 'clinic', 'rest_api', :'api' || '/aqua', 'aqua_beauty'),
  (gen_random_uuid(), 'bestcom', 'BESTCOM', 'hrm', 'rest_api', :'api' || '/bestcom', 'bestcom_db'),
  (gen_random_uuid(), 'dismarco_pdks', 'DISMARCO PDKS', 'pdks', 'rest_api', :'api' || '/dismarco_pdks', 'dismarco_pdks'),
  (gen_random_uuid(), 'm10_pdks', 'M10 PDKS', 'pdks', 'rest_api', :'api' || '/m10_pdks', 'm10_pdks'),
  (gen_random_uuid(), 'siti_pdks', 'Siti PDKS', 'pdks', 'rest_api', :'api' || '/siti_pdks', 'siti_pdks'),
  (gen_random_uuid(), 'pdks_demo', 'PDKS Demo', 'pdks', 'rest_api', :'api' || '/pdks_demo', 'pdks_demo'),
  (gen_random_uuid(), 'retailex_demo', 'RetailEX Demo', 'retail', 'rest_api', :'api' || '/retailex_demo', 'retailex_demo'),
  (gen_random_uuid(), 'berzin_com', 'Berzin Company - Magaza', 'retail', 'rest_api', :'api' || '/berzin_com', 'berzin_com'),
  (gen_random_uuid(), 'sho_aksesuar', 'Sho Aksesuar - Magaza', 'retail', 'rest_api', :'api' || '/sho_aksesuar', 'sho_aksesuar'),
  (gen_random_uuid(), 'kupeli', 'Kupeli - Magaza', 'retail', 'rest_api', :'api' || '/kupeli', 'kupeli')
ON CONFLICT (code) DO UPDATE SET
  connection_provider = EXCLUDED.connection_provider,
  rest_base_url = EXCLUDED.rest_base_url,
  database_name = EXCLUDED.database_name,
  updated_at = now();
SQL

echo "== 7) PostgREST schema cache reload =="
for db in "${DBS[@]}"; do
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${db}" -c "NOTIFY pgrst, 'reload schema';" >/dev/null || true
done

echo "== 8) Restart bridge + postgrest services =="
docker compose -f "${COMPOSE_FILE}" restart retailex_bridge "${POSTGREST_SERVICES[@]}" >/dev/null

echo "== 9) Quick checks =="
curl -fsS "${API_BASE_URL}/merkez/tenant_registry?code=eq.berzin_com&select=code,connection_provider,rest_base_url,database_name" | head -c 400 && echo
curl -fsS "${API_BASE_URL}/berzin_com/firms?select=*&limit=1" | head -c 400 && echo

echo "DONE."
echo "Login defaults:"
echo "  admin / admin (000_master_schema)"
echo "  mudur / ${TENANT_USER_PASSWORD}"
echo "  kasiyer / ${TENANT_USER_PASSWORD}"
