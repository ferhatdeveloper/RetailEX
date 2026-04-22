#!/usr/bin/env bash
# Host üzerindeki bir .sql dosyasını seçilen tüm PostgreSQL veritabanlarına sırayla uygular.
# Ön koşul: saas_postgres (veya POSTGRES_CONTAINER) ayakta; dosya UTF-8 / düz SQL olmalı.
#
# Önce pg_dump yedekleri alınır (BACKUP_BEFORE_APPLY=0 ile kapatılabilir).
#
# Kullanım:
#   SQL_FILE=/opt/RetailEX/database/migrations/031_rex_customers_heard_from.sql bash berqenas-apply-sql-all-dbs.sh
#
# Ortam:
#   INSTALL_DIR, POSTGRES_CONTAINER, POSTGRES_PASSWORD — berqenas-repo-pull-and-migrate ile aynı
#   TENANT_DBS — doluysa menü yok; boşsa berqenas_pick_tenant_dbs
#   BACKUP_BEFORE_APPLY — varsayılan 1; 0 yedek alma
#   BACKUP_ROOT — varsayılan ${INSTALL_DIR}/backups

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/berqenas-cloud}"
CONTAINER="${POSTGRES_CONTAINER:-saas_postgres}"
SQL_FILE="${SQL_FILE:-}"

if [[ -z "$SQL_FILE" ]] || [[ ! -f "$SQL_FILE" ]]; then
  echo "Hata: SQL_FILE gecerli bir dosya olmali (ornek: SQL_FILE=/path/migration.sql)." >&2
  exit 1
fi

if [[ -f "${INSTALL_DIR}/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${INSTALL_DIR}/.env" || true
  set +a
fi

PGPASS="${POSTGRES_PASSWORD:-root_password_2026}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=berqenas-cloud-dbs.inc.sh
source "${SCRIPT_DIR}/berqenas-cloud-dbs.inc.sh"

berqenas_pick_tenant_dbs || exit 1

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Hata: '$CONTAINER' calismiyor." >&2
  exit 1
fi

BACKUP_BEFORE_APPLY="${BACKUP_BEFORE_APPLY:-1}"
if [[ "${BACKUP_BEFORE_APPLY}" != "0" ]]; then
  berqenas_backup_databases "$CONTAINER" "$PGPASS" "${BACKUP_ROOT:-${INSTALL_DIR}/backups}"
else
  echo "=== BACKUP_BEFORE_APPLY=0 — yedek atlandı ==="
fi

docker cp "$SQL_FILE" "${CONTAINER}:/tmp/berqenas_apply_all.sql"

for db in ${TENANT_DBS}; do
  echo "=== SQL uygulanıyor: ${db} ==="
  docker exec -e PGPASSWORD="$PGPASS" "$CONTAINER" \
    psql -U postgres -d "$db" -v ON_ERROR_STOP=1 -f /tmp/berqenas_apply_all.sql
done

docker exec "$CONTAINER" rm -f /tmp/berqenas_apply_all.sql

echo "=== Tamam (yedek: ${BERQENAS_LAST_BACKUP_DIR:-yok}) ==="
