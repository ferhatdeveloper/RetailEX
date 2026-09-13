#!/usr/bin/env bash
# Kuç Oglu — restoran kiracısı (DB: kucoglu, modül: restaurant)
#
#   PGPASSWORD='...' PGHOST=72.60.182.107 API_BASE_URL='https://api.retailex.app' \
#     bash database/scripts/provision-kucoglu-restaurant.sh
#
# Menü ürün seed (görsellerle):
#   MENU_JSON=/path/to/kucoglu-menu.json node scripts/seed-kucoglu-retailex.mjs
#
# API route:
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-kucoglu-only.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
KUCOGLU_APP_MENU="${KUCOGLU_MENU_JSON:-/Users/ferhatnas/App/Kucoglu/src/data/kucoglu-menu.json}"

export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGUSER="${PGUSER:-postgres}"
export PGPORT="${PGPORT:-5432}"
export API_BASE_URL="${API_BASE_URL:-https://api.retailex.app}"
export TENANT_USER_PASSWORD="${TENANT_USER_PASSWORD:-admin}"

if [[ -z "${PGPASSWORD}" ]]; then
  echo "HATA: PGPASSWORD veya POSTGRES_PASSWORD gerekli." >&2
  exit 1
fi

echo "== Kuç Oglu restoran kiracısı (kucoglu) =="
node "${REPO_ROOT}/scripts/provision-tenant.mjs" \
  --code kucoglu \
  --display "Kuç Oglu" \
  --db-name kucoglu \
  --module restaurant

if [[ -f "${KUCOGLU_APP_MENU}" ]]; then
  echo "== Menü ürün seed =="
  MENU_JSON="${KUCOGLU_APP_MENU}" PGDATABASE=kucoglu \
    node "${REPO_ROOT}/scripts/seed-kucoglu-retailex.mjs"
else
  echo "UYARI: Menü JSON yok (${KUCOGLU_APP_MENU}) — seed atlandı."
  echo "  Kucoglu app: node scripts/scrape-kucoglu-menu.mjs"
fi

echo ""
echo "Tamam. Giriş: retailex.app → kiracı kodu kucoglu → mudur / ${TENANT_USER_PASSWORD}"
echo "REST URL: ${API_BASE_URL}/kucoglu"
echo "Sonraki: bash database/scripts/dokploy-redeploy-kucoglu-only.sh"
