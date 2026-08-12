#!/usr/bin/env bash
# Tüm aktif retail kiracı DB'lerine 099 system_settings.menu_preferences
#
# Uzak:
#   PGHOST=... PGUSER=postgres PGPASSWORD='...' \
#   bash database/scripts/apply-099-all-retail-tenants.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_099="${SCRIPT_DIR}/../migrations/099_system_settings_menu_preferences.sql"
MIGRATION_NAME="099_system_settings_menu_preferences.sql"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:?PGPASSWORD gerekli}"
MERKEZ_DB="${MERKEZ_DB:-merkez_db}"

# RetailEX dışı DB'ler (non-retailex-databases.mjs ile uyumlu)
NON_RETAILEX=(ilsasupport pagetin_kurye siti_pdks)

export PGPASSWORD

psql_q() {
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 "$@"
}

is_non_retailex() {
  local db="$1"
  for x in "${NON_RETAILEX[@]}"; do
    [[ "$db" == "$x" ]] && return 0
  done
  return 1
}

echo "== Retail kiracı listesi (merkez_db.tenant_registry) =="
mapfile -t RETAIL_DBS < <(
  psql_q -d "$MERKEZ_DB" -At -c \
    "SELECT database_name FROM tenant_registry WHERE is_active = true AND database_name IS NOT NULL ORDER BY code;" \
    2>/dev/null || true
)

if [[ ${#RETAIL_DBS[@]} -eq 0 ]]; then
  echo "tenant_registry boş — pg_database listesinden deneniyor..."
  mapfile -t RETAIL_DBS < <(
    psql_q -d postgres -At -c \
      "SELECT datname FROM pg_database WHERE datistemplate = false AND datallowconn AND datname NOT IN ('postgres','template0','template1','merkez_db') ORDER BY datname;"
  )
fi

echo "Kiracı DB sayısı: ${#RETAIL_DBS[@]}"
ok=0
skip=0
fail=0

for db in "${RETAIL_DBS[@]}"; do
  echo ""
  echo "---- ${db} ----"
  if is_non_retailex "$db"; then
    echo "  atlandı: RetailEX kiracısı değil"
    ((skip++)) || true
    continue
  fi

  has_settings="$(psql_q -d "$db" -At -c \
    "SELECT to_regclass('public.system_settings') IS NOT NULL;" 2>/dev/null || echo f)"
  if [[ "${has_settings}" != "t" ]]; then
    echo "  atlandı: system_settings tablosu yok"
    ((skip++)) || true
    continue
  fi

  already="$(psql_q -d "$db" -At -c \
    "SELECT 1 FROM public.schema_migrations WHERE filename = '${MIGRATION_NAME}' LIMIT 1;" 2>/dev/null || echo "")"
  if [[ -n "$already" ]]; then
    echo "  zaten uygulanmış (schema_migrations)"
    ((ok++)) || true
    continue
  fi

  if ! psql_q -d "$db" -c "
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT now()
    );" 2>/dev/null; then
    echo "  HATA: schema_migrations oluşturulamadı"
    ((fail++)) || true
    continue
  fi

  if psql_q -d "$db" -f "$MIGRATION_099"; then
    psql_q -d "$db" -c \
      "INSERT INTO public.schema_migrations (filename) VALUES ('${MIGRATION_NAME}') ON CONFLICT (filename) DO NOTHING;"
    psql_q -d "$db" -c "NOTIFY pgrst, 'reload schema';" 2>/dev/null || true
    col="$(psql_q -d "$db" -At -c \
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='system_settings' AND column_name='menu_preferences' LIMIT 1;")"
    echo "  OK — menu_preferences kolonu: ${col:+var}${col:-yok}"
    ((ok++)) || true
  else
    echo "  HATA: migration uygulanamadı"
    ((fail++)) || true
  fi
done

echo ""
echo "Bitti: ${ok} uygulandı/zaten vardı, ${skip} atlandı, ${fail} hatalı."
[[ "$fail" -eq 0 ]]
