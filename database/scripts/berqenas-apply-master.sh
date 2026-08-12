#!/usr/bin/env bash
# Berqenas Cloud — 000_master_schema.sql'i PostgreSQL konteynerine uygular.
#
# ÖNEMLİ: Bu dosyanın içeriğini SSH oturumuna satır satır yapıştırmayın; BASH_SOURCE
# bozulur, oturum kapanabilir. Dosyayı kaydedin veya aşağıdaki TEK SATIRI kullanın.
#
# --- Seçenek A — SQL zaten sunucuda (/opt/berqenas-cloud/000_master_schema.sql) ---
#   docker cp /opt/berqenas-cloud/000_master_schema.sql saas_postgres:/tmp/000_master_schema.sql \
#     && docker exec saas_postgres psql -U postgres -d bestcom_db -f /tmp/000_master_schema.sql
#
# --- Seçenek B — Repo klonluysa ---
#   cd .../RetailEX/database/scripts && chmod +x berqenas-apply-master.sh && ./berqenas-apply-master.sh
#
# Ortam: PG_CONTAINER PG_DATABASE PG_USER (varsayılan: saas_postgres, bestcom_db, postgres)

set -e
CONTAINER="${PG_CONTAINER:-saas_postgres}"
DB="${PG_DATABASE:-bestcom_db}"
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
