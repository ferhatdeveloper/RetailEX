#!/usr/bin/env bash
# VPS: RetailEX reposunu GitHub'dan günceller; seçilen DB'lerde önce pg_dump yedeği,
# ardından bekleyen numaralı migration'ları uygular (run-pending-migrations.mjs).
#
# Ön koşul: saas_postgres ayakta; repo TARGET (varsayılan INSTALL_DIR/projects/retailex).
#
# Kullanım:
#   bash berqenas-repo-pull-and-migrate.sh
#   TENANT_DBS="bestcom_db retailex_demo" bash berqenas-repo-pull-and-migrate.sh
#   BACKUP_BEFORE_MIGRATE=0 bash berqenas-repo-pull-and-migrate.sh   # yedek alma
#   MIGRATE_DRY=1 bash berqenas-repo-pull-and-migrate.sh              # yedek + migrate dry-run
#
# Ortam:
#   INSTALL_DIR, RETAILEX_GIT_URL, RETAILEX_GIT_BRANCH, TENANT_DBS, POSTGRES_CONTAINER,
#   POSTGRES_PASSWORD, MIGRATE_DRY, BACKUP_BEFORE_MIGRATE (varsayılan 1), BACKUP_ROOT
#
# Şema uyarısı: merkez_db ile retail/pdks DB'leri aynı tabloları paylaşmayabilir; migration
# dosyası tüm hedeflerde çalışacak şekilde yazılmalı veya TENANT_DBS ile alt küme seçin.

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/berqenas-cloud}"
RETAILEX_GIT_URL="${RETAILEX_GIT_URL:-}"
RETAILEX_GIT_BRANCH="${RETAILEX_GIT_BRANCH:-main}"
TARGET="${INSTALL_DIR}/projects/retailex"
CONTAINER="${POSTGRES_CONTAINER:-saas_postgres}"

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

WEB_NET=$(docker inspect "$CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | awk '{print $1}')
if [[ -z "${WEB_NET:-}" ]]; then
  echo "Hata: '$CONTAINER' yok veya Docker agi okunamadi." >&2
  exit 1
fi

command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; }

mkdir -p "${INSTALL_DIR}/projects"

if [[ -d "${TARGET}/.git" ]]; then
  echo "Git guncelleniyor: ${TARGET} (${RETAILEX_GIT_BRANCH})"
  git -C "${TARGET}" fetch origin "${RETAILEX_GIT_BRANCH}"
  git -C "${TARGET}" reset --hard "origin/${RETAILEX_GIT_BRANCH}"
elif [[ -n "$RETAILEX_GIT_URL" ]]; then
  echo "Klonlaniyor: ${RETAILEX_GIT_URL} -> ${TARGET}"
  git clone --depth 1 -b "${RETAILEX_GIT_BRANCH}" "${RETAILEX_GIT_URL}" "${TARGET}"
else
  echo "Hata: ${TARGET} yok ve RETAILEX_GIT_URL bos." >&2
  exit 1
fi

if [[ ! -f "${TARGET}/database/scripts/run-pending-migrations.mjs" ]]; then
  echo "Hata: run-pending-migrations.mjs bulunamadi (yanlis repo?)." >&2
  exit 1
fi

BACKUP_BEFORE_MIGRATE="${BACKUP_BEFORE_MIGRATE:-1}"
if [[ "${MIGRATE_DRY:-0}" == "1" ]]; then
  echo "=== MIGRATE_DRY=1 — yedek alınmıyor (dry-run) ==="
elif [[ "${BACKUP_BEFORE_MIGRATE}" != "0" ]]; then
  berqenas_backup_databases "$CONTAINER" "$PGPASS" "${BACKUP_ROOT:-${INSTALL_DIR}/backups}"
else
  echo "=== BACKUP_BEFORE_MIGRATE=0 — yedek atlandı ==="
fi

DRY_FLAG=()
if [[ "${MIGRATE_DRY:-0}" == "1" ]]; then
  DRY_FLAG=(--dry-run)
fi

for db in ${TENANT_DBS}; do
  echo "=== Migration: ${db} (Docker agi: postgres:5432) ==="
  docker run --rm \
    --network "$WEB_NET" \
    -v "${TARGET}:/app" \
    -w /app \
    -e PGHOST=postgres \
    -e PGPORT=5432 \
    -e PGUSER=postgres \
    -e PGPASSWORD="$PGPASS" \
    -e PGDATABASE="$db" \
    node:22-bookworm \
    bash -lc "set -e
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -qq && apt-get install -y -qq postgresql-client >/dev/null
      npm ci --omit=dev
      node database/scripts/run-pending-migrations.mjs --env-only ${DRY_FLAG[*]:-}"
done

echo "=== Tamam (son yedek dizini: ${BERQENAS_LAST_BACKUP_DIR:-dry-run veya yedek yok}) ==="
