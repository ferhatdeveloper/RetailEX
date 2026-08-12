#!/usr/bin/env bash
# Özbek — restoran kiracısı (DB: ozbek, modül: restaurant)
#
# VPS / Dokploy:
#   POSTGRES_PASSWORD='...' PGHOST=127.0.0.1 API_BASE_URL='https://api.retailex.app' \
#   bash database/scripts/provision-ozbek-restaurant.sh
#
# Uzak PG:
#   PGHOST=72.60.182.107 PGUSER=postgres PGPASSWORD='...' \
#   API_BASE_URL='https://api.retailex.app' \
#   bash database/scripts/provision-ozbek-restaurant.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGUSER="${PGUSER:-postgres}"
export PGPORT="${PGPORT:-5432}"
export API_BASE_URL="${API_BASE_URL:-https://api.retailex.app}"
export TENANT_USER_PASSWORD="${TENANT_USER_PASSWORD:-admin}"

if [[ -z "${PGPASSWORD}" ]]; then
  echo "HATA: PGPASSWORD veya POSTGRES_PASSWORD gerekli." >&2
  exit 1
fi

echo "== Özbek restoran kiracısı (ozbek) =="
node "${REPO_ROOT}/scripts/provision-tenant.mjs" \
  --code ozbek \
  --display "Özbek Restoran" \
  --db-name ozbek \
  --module restaurant

echo "== Restoran kat / masa seed =="
if command -v psql >/dev/null 2>&1; then
  PGPASSWORD="${PGPASSWORD}" PGHOST="${PGHOST}" PGUSER="${PGUSER}" PGPORT="${PGPORT}" \
    psql -v ON_ERROR_STOP=1 -d ozbek -f "${SCRIPT_DIR}/seed-ozbek-restaurant.sql"
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'saas_postgres'; then
  docker exec -e PGPASSWORD="${PGPASSWORD}" -i saas_postgres \
    psql -v ON_ERROR_STOP=1 -U "${PGUSER}" -d ozbek -f - < "${SCRIPT_DIR}/seed-ozbek-restaurant.sql"
else
  echo "UYARI: psql yok — seed-ozbek-restaurant.sql elle uygulayın." >&2
fi

echo ""
echo "Tamam. Giriş: retailex.app → kiracı kodu ozbek → mudur / ${TENANT_USER_PASSWORD}"
echo "REST URL: ${API_BASE_URL}/ozbek"
echo "Sonraki: docker compose -f docker-compose.dokploy.yml up -d postgrest_ozbek sync_ozbek retailex_api_gateway"
