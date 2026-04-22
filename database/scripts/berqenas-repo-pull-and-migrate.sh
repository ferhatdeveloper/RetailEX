#!/usr/bin/env bash
# VPS: RetailEX reposunu GitHub'dan günceller, ardından her kiracı PostgreSQL
# veritabanında bekleyen numaralı migration'ları uygular (002+, 000/001 hariç).
#
# Ön koşul: saas_postgres ayakta; repo yolu INSTALL_DIR/projects/retailex.
# Migration takibi: public.schema_migrations (database/scripts/run-pending-migrations.mjs).
#
# Kullanım:
#   sudo RETAILEX_GIT_URL=https://github.com/org/RetailEX.git bash berqenas-repo-pull-and-migrate.sh
#   (repo zaten klonluysa URL opsiyonel; sadece pull için TARGET yeterli)
#
# Ortam:
#   INSTALL_DIR          — varsayılan: /opt/berqenas-cloud
#   RETAILEX_GIT_URL     — ilk klon için (berqenas-deploy-web.sh ile aynı)
#   RETAILEX_GIT_BRANCH  — varsayılan: main
#   TENANT_DBS           — boşlukla ayrılmış DB listesi (ör: "merkez_db retailex_db aqua_beauty_db")
#   POSTGRES_CONTAINER   — varsayılan: saas_postgres
#   POSTGRES_PASSWORD    — .env yoksa bu veya varsayılan root_password_2026 (kurulumla aynı olmalı)
#   MIGRATE_DRY          — 1 ise --dry-run
#
# Not: İlk kurulumda 000_master_schema.sql her DB için ayrı uygulanır; bu betik sadece
#      artımlı migration dosyalarını (run-pending-migrations kurallarına göre) işler.

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/berqenas-cloud}"
RETAILEX_GIT_URL="${RETAILEX_GIT_URL:-}"
RETAILEX_GIT_BRANCH="${RETAILEX_GIT_BRANCH:-main}"
TARGET="${INSTALL_DIR}/projects/retailex"
CONTAINER="${POSTGRES_CONTAINER:-saas_postgres}"
TENANT_DBS="${TENANT_DBS:-retailex_db}"

if [[ -f "${INSTALL_DIR}/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${INSTALL_DIR}/.env" || true
  set +a
fi
PGPASS="${POSTGRES_PASSWORD:-root_password_2026}"

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

echo "=== Tamam ==="
