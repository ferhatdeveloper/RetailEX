#!/usr/bin/env bash
# aqua.sql + PostgREST — aqua_beauty import
# Kullanım: bash database/scripts/run-aqua-beauty-import.sh
set -euo pipefail

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-saas_postgres}"
DB_NAME="${DB_NAME:-aqua_beauty}"
PGUSER="${PGUSER:-postgres}"
RECREATE="${RECREATE_DB:-0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AQUA_DUMP="$REPO_ROOT/aqua.sql"
POSTGREST_SQL="$SCRIPT_DIR/aqua_beauty_postgrest.sql"
COMBINED="$SCRIPT_DIR/aqua_beauty_complete.sql"

[[ -f "$AQUA_DUMP" ]] || { echo "Bulunamadı: $AQUA_DUMP" >&2; exit 1; }
[[ -f "$POSTGREST_SQL" ]] || { echo "Bulunamadı: $POSTGREST_SQL" >&2; exit 1; }

{
  echo "-- aqua_beauty_complete.sql (otomatik üretim)"
  echo "-- $(date -Iseconds)"
  cat "$AQUA_DUMP"
  echo ""
  echo "-- ========== PostgREST (anon + verify_login) =========="
  cat "$POSTGREST_SQL"
} > "$COMBINED"

if [[ "$RECREATE" == "1" ]]; then
  docker exec -i "$POSTGRES_CONTAINER" psql -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS $DB_NAME;"
  docker exec -i "$POSTGRES_CONTAINER" psql -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE $DB_NAME;"
fi

docker exec -i "$POSTGRES_CONTAINER" psql -U "$PGUSER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$COMBINED"

docker restart saas_postgrest_aqua_beauty 2>/dev/null || true

echo "Tamam: $COMBINED"
echo "Kontrol: docker exec -it $POSTGRES_CONTAINER psql -U $PGUSER -d $DB_NAME -c \"SELECT COUNT(*) FROM public.firms;\""
