#!/usr/bin/env bash
# Tüm aktif retail (ve rex_*_products olan) kiracı DB'lerine 053 SKT kolonları + PostgREST reload
#
# Uzak:
#   PGHOST=72.60.182.107 PGUSER=postgres PGPASSWORD='...' \
#   bash database/scripts/apply-053-all-retail-tenants.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_053="${SCRIPT_DIR}/../migrations/053_rex_products_expiry_tracking.sql"
MIGRATION_047="${SCRIPT_DIR}/../migrations/047_rex_products_is_scale_product.sql"

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
    "SELECT database_name FROM tenant_registry WHERE is_active AND module = 'retail' ORDER BY code;"
)

echo "Retail DB sayısı: ${#RETAIL_DBS[@]}"
for db in "${RETAIL_DBS[@]}"; do
  echo ""
  echo "---- ${db} ----"
  has_products="$(psql_q -d "$db" -At -c \
    "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename ~ '^rex_[0-9]+_products$';" 2>/dev/null || echo 0)"
  if [[ "${has_products}" == "0" ]]; then
    echo "  atlandı: rex_*_products yok"
    continue
  fi

  psql_q -d "$db" -c "
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT now()
    );" 2>/dev/null || true

  if [[ -f "$MIGRATION_047" ]]; then
    psql_q -d "$db" -f "$MIGRATION_047"
    psql_q -d "$db" -c \
      "INSERT INTO public.schema_migrations (filename) VALUES ('047_rex_products_is_scale_product.sql') ON CONFLICT (filename) DO NOTHING;"
  fi

  psql_q -d "$db" -f "$MIGRATION_053"
  psql_q -d "$db" -c \
    "INSERT INTO public.schema_migrations (filename) VALUES ('053_rex_products_expiry_tracking.sql') ON CONFLICT (filename) DO NOTHING;"

  psql_q -d "$db" -c "NOTIFY pgrst, 'reload schema';"
  cols="$(psql_q -d "$db" -At -c \
    "SELECT string_agg(column_name, ', ' ORDER BY column_name)
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='rex_001_products'
       AND column_name IN ('expiry_date','expiry_tracking','shelf_life_days','is_scale_product');")"
  echo "  OK — rex_001_products kolonları: ${cols}"
done

echo ""
echo "Bitti. Tarayıcıda Ctrl+F5; hata sürerse PostgREST konteynerlerini yeniden başlatın."
