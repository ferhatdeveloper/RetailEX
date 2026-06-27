#!/usr/bin/env bash
# Tüm aktif retail kiracı DB'lerine 065 sync_queue inbound indeksleri + schema_migrations kaydı
#
# Uzak (doğrudan PG):
#   PGHOST=72.60.182.107 PGUSER=postgres PGPASSWORD='...' \
#   bash database/scripts/apply-065-all-retail-tenants.sh
#
# VPS (Docker postgres):
#   bash database/scripts/berqenas-repo-pull-and-migrate.sh
#   veya: npm run db:migrate:tenants

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_065="${SCRIPT_DIR}/../migrations/065_sync_queue_target_store_index.sql"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:?PGPASSWORD gerekli}"
MERKEZ_DB="${MERKEZ_DB:-merkez_db}"

export PGPASSWORD

psql_q() {
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 "$@"
}

echo "== Retail kiracı listesi (merkez_db.tenant_registry) =="
mapfile -t RETAIL_DBS < <(
  psql_q -d "$MERKEZ_DB" -At -c \
    "SELECT database_name FROM tenant_registry WHERE is_active = true AND database_name IS NOT NULL ORDER BY code;"
)

if [[ ${#RETAIL_DBS[@]} -eq 0 ]]; then
  echo "tenant_registry boş — npm run db:migrate:tenants deneyin."
  exit 1
fi

echo "Kiracı DB sayısı: ${#RETAIL_DBS[@]}"
ok=0
skip=0

for db in "${RETAIL_DBS[@]}"; do
  echo ""
  echo "---- ${db} ----"
  has_sq="$(psql_q -d "$db" -At -c \
    "SELECT to_regclass('public.sync_queue') IS NOT NULL;" 2>/dev/null || echo f)"
  if [[ "${has_sq}" != "t" ]]; then
    echo "  atlandı: sync_queue yok"
    ((skip++)) || true
    continue
  fi

  already="$(psql_q -d "$db" -At -c \
    "SELECT 1 FROM public.schema_migrations WHERE filename = '065_sync_queue_target_store_index.sql' LIMIT 1;" 2>/dev/null || echo "")"
  if [[ -n "$already" ]]; then
    echo "  zaten uygulanmış (schema_migrations)"
    ((ok++)) || true
    continue
  fi

  psql_q -d "$db" -c "
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT now()
    );" 2>/dev/null || true

  psql_q -d "$db" -f "$MIGRATION_065"
  psql_q -d "$db" -c \
    "INSERT INTO public.schema_migrations (filename) VALUES ('065_sync_queue_target_store_index.sql') ON CONFLICT (filename) DO NOTHING;"

  idx_count="$(psql_q -d "$db" -At -c \
    "SELECT count(*)::text FROM pg_indexes WHERE tablename = 'sync_queue' AND indexname LIKE 'idx_sync_queue_target%';")"
  echo "  OK — target indeks sayısı: ${idx_count}"
  ((ok++)) || true
done

echo ""
echo "Bitti: ${ok} uygulandı/zaten vardı, ${skip} atlandı."
