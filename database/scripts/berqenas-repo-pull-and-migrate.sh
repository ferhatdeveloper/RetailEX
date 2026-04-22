#!/usr/bin/env bash
# VPS: RetailEX reposunu GitHub'dan günceller, ardından seçilen PostgreSQL
# veritabanlarında bekleyen numaralı migration'ları uygular (002+, 000/001 hariç).
#
# Ön koşul: saas_postgres ayakta; repo yolu TARGET (varsayılan INSTALL_DIR/projects/retailex).
# Migration takibi: public.schema_migrations (database/scripts/run-pending-migrations.mjs).
#
# Kullanım:
#   bash berqenas-repo-pull-and-migrate.sh
#   TENANT_DBS="bestcom_db retailex_demo" bash berqenas-repo-pull-and-migrate.sh   # etkileşimsiz
#   sudo RETAILEX_GIT_URL=https://github.com/org/RetailEX.git bash berqenas-repo-pull-and-migrate.sh
#
# Ortam:
#   INSTALL_DIR          — varsayılan: /opt/berqenas-cloud
#   RETAILEX_GIT_URL     — ilk klon için
#   RETAILEX_GIT_BRANCH  — varsayılan: main
#   TENANT_DBS           — boşlukla ayrılmış DB listesi (doluysa soru sorulmaz)
#   POSTGRES_CONTAINER   — varsayılan: saas_postgres
#   POSTGRES_PASSWORD    — .env veya root_password_2026
#   MIGRATE_DRY          — 1 ise --dry-run
#
# Etkileşimli mod: TENANT_DBS tanımlı değilse veya boşsa, terminalde (tty) menü sunulur.
# Otomasyon (cron/SSH -T): TENANT_DBS boşsa tüm varsayılan Berqenas DB'leri seçilir.

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/berqenas-cloud}"
RETAILEX_GIT_URL="${RETAILEX_GIT_URL:-}"
RETAILEX_GIT_BRANCH="${RETAILEX_GIT_BRANCH:-main}"
TARGET="${INSTALL_DIR}/projects/retailex"
CONTAINER="${POSTGRES_CONTAINER:-saas_postgres}"

# Berqenas Cloud ile uyumlu varsayılan kiracı DB sırası (numaralar menüde buna göre)
BERQENAS_DEFAULT_DBS=(
  merkez_db
  dismarco_pdks
  aqua_beauty
  m10_pdks
  bestcom_db
  siti_pdks
  pdks_demo
  retailex_demo
)

if [[ -f "${INSTALL_DIR}/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${INSTALL_DIR}/.env" || true
  set +a
fi

PGPASS="${POSTGRES_PASSWORD:-root_password_2026}"

# TENANT_DBS: ortamda doluysa olduğu gibi; boş + tty → menü; boş + !tty → hepsi
if [[ -n "${TENANT_DBS:-}" ]]; then
  echo "=== Hedef DB'ler (TENANT_DBS): ${TENANT_DBS} ==="
elif [[ -t 0 ]]; then
  echo ""
  echo "=== Hangi veritabanlarına migration uygulansın? ==="
  echo "  a) Tümü (${#BERQENAS_DEFAULT_DBS[@]} adet — Berqenas varsayılan listesi)"
  i=1
  for d in "${BERQENAS_DEFAULT_DBS[@]}"; do
    printf "  %2d) %s\n" "$i" "$d"
    ((i++)) || true
  done
  echo "  m) Manuel — boşlukla veritabanı adları yaz"
  echo ""
  read -r -p "Seçim [a]: " _pick
  _pick="${_pick:-a}"
  case "${_pick,,}" in
    a|all|tum|"")
      TENANT_DBS="${BERQENAS_DEFAULT_DBS[*]}"
      echo "→ Seçilen: tümü"
      ;;
    m|manuel)
      read -r -p "Veritabanı adları (boşlukla): " TENANT_DBS
      if [[ -z "${TENANT_DBS// }" ]]; then
        echo "Hata: Manuel liste boş." >&2
        exit 1
      fi
      echo "→ Seçilen: ${TENANT_DBS}"
      ;;
    *)
      _sel="${_pick//,/ }"
      while [[ "$_sel" == *"  "* ]]; do _sel="${_sel//  / }"; done
      _chosen=()
      read -ra _parts <<< "$_sel"
      for _tok in "${_parts[@]}"; do
        if [[ "$_tok" =~ ^[0-9]+$ ]]; then
          _idx=$((10#_tok - 1))
          if ((_idx >= 0 && _idx < ${#BERQENAS_DEFAULT_DBS[@]})); then
            _chosen+=("${BERQENAS_DEFAULT_DBS[_idx]}")
          else
            echo "Hata: Geçersiz numara '${_tok}' (1-${#BERQENAS_DEFAULT_DBS[@]})." >&2
            exit 1
          fi
        else
          echo "Hata: Tanınmayan seçim '${_pick}'. a, m veya 1,3,8 gibi numaralar kullanın." >&2
          exit 1
        fi
      done
      if [[ ${#_chosen[@]} -eq 0 ]]; then
        echo "Hata: Hiç veritabanı seçilmedi." >&2
        exit 1
      fi
      TENANT_DBS="${_chosen[*]}"
      echo "→ Seçilen: ${TENANT_DBS}"
      ;;
  esac
else
  TENANT_DBS="${BERQENAS_DEFAULT_DBS[*]}"
  echo "=== TTY yok — TENANT_DBS tüm varsayılanlar: ${TENANT_DBS} ==="
fi

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
