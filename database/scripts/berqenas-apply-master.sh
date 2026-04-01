#!/usr/bin/env bash
# Berqenas Cloud — 000_master_schema.sql'i retailex_db'ye uygular.
# Kullanım (sunucuda, /opt/berqenas-cloud içinde 000_master_schema.sql varsa):
#   chmod +x database/scripts/berqenas-apply-master.sh
#   ./database/scripts/berqenas-apply-master.sh
#
# Veya tek satır (proje kökünden, dosyayı önce scp ile attıysanız):
#   ssh user@72.60.182.107 'docker cp /opt/berqenas-cloud/000_master_schema.sql saas_postgres:/tmp/ && docker exec saas_postgres psql -U postgres -d retailex_db -f /tmp/000_master_schema.sql'

set -e
CONTAINER="${PG_CONTAINER:-saas_postgres}"
DB="${PG_DATABASE:-retailex_db}"
USER="${PG_USER:-postgres}"

# Script'in yanındaki migrations klasörü veya /opt/berqenas-cloud
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$(cd "$SCRIPT_DIR/../migrations" 2>/dev/null && pwd)"
CLOUD_DIR="/opt/berqenas-cloud"

if [[ -f "$MIGRATIONS_DIR/000_master_schema.sql" ]]; then
  SQL_FILE="$MIGRATIONS_DIR/000_master_schema.sql"
elif [[ -f "$CLOUD_DIR/000_master_schema.sql" ]]; then
  SQL_FILE="$CLOUD_DIR/000_master_schema.sql"
else
  echo "Hata: 000_master_schema.sql bulunamadı. Önce scp ile sunucuya kopyalayın."
  exit 1
fi

echo "Uygulanıyor: $SQL_FILE -> $CONTAINER / $DB"
docker cp "$SQL_FILE" "$CONTAINER:/tmp/000_master_schema.sql"
docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -f /tmp/000_master_schema.sql
echo "Master şema uygulandı."
