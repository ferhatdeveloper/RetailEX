#!/usr/bin/env bash
# merkez_db.tenant_registry köprü ayarlarını kiracı DB stores ana mağazaya kopyalar.
#
# Uzak PG:
#   PGHOST=72.60.182.107 PGUSER=postgres PGPASSWORD='...' \
#   bash database/scripts/sync-scale-bridge-stores-from-registry.sh
#
# Dokploy (docker):
#   POSTGRES_PASSWORD='...' bash database/scripts/sync-scale-bridge-stores-from-registry.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-${PGPASSWORD:-}}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-}"

if [[ -z "${POSTGRES_PASSWORD}" ]]; then
  echo "PGPASSWORD veya POSTGRES_PASSWORD gerekli" >&2
  exit 1
fi

export PGPASSWORD="${POSTGRES_PASSWORD}"

psql_exec() {
  local db="$1"
  shift
  if [[ -n "${POSTGRES_CONTAINER}" ]] && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${POSTGRES_CONTAINER}"; then
    docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" -i "${POSTGRES_CONTAINER}" \
      psql -v ON_ERROR_STOP=1 -U "${PGUSER}" -d "${db}" "$@"
  else
    psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${db}" "$@"
  fi
}

TENANT_CODES="${TENANT_CODES:-kasap testere mettu canon lovan}"

echo "== merkez_db tenant_registry → stores senkronu =="
for code in ${TENANT_CODES}; do
  row="$(psql_exec merkez_db -tA -F $'\t' -c \
    "SELECT COALESCE(scale_bridge_url,''), COALESCE(scale_bridge_token,'') FROM tenant_registry WHERE code='${code}' AND is_active IS DISTINCT FROM false LIMIT 1;" 2>/dev/null || true)"
  url="${row%%$'\t'*}"
  token="${row#*$'\t'}"
  if [[ -z "${url}" ]]; then
    echo "  SKIP ${code} (merkez scale_bridge_url boş)"
    continue
  fi
  if ! psql_exec postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${code}'" | grep -q 1; then
    echo "  SKIP ${code} (DB yok)"
    continue
  fi
  has_stores="$(psql_exec "${code}" -tAc "SELECT to_regclass('public.stores') IS NOT NULL" 2>/dev/null || echo f)"
  if [[ "${has_stores}" != "t" ]]; then
    echo "  SKIP ${code} (stores tablosu yok)"
    continue
  fi
  echo "  -- ${code} → ${url}"
  psql_exec "${code}" -v url="${url}" -v token="${token}" <<'SQL'
UPDATE public.stores
SET
  scale_bridge_url = NULLIF(:'url', ''),
  scale_bridge_token = NULLIF(:'token', ''),
  updated_at = now()
WHERE is_main = true OR "default" = true;
SQL
  psql_exec "${code}" -c "NOTIFY pgrst, 'reload schema';" >/dev/null 2>&1 || true
done

psql_exec merkez_db -c "NOTIFY pgrst, 'reload schema';" >/dev/null 2>&1 || true

echo ""
echo "TAMAMLANDI."
