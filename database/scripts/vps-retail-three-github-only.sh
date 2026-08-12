#!/usr/bin/env bash
# VPS-only: Git pull / merge gerekmez. GitHub main'den ham dosyalar cekilir.
# Ön: Docker stack /opt/berqenas-cloud, saas_postgres, .env POSTGRES_PASSWORD
#
# Kullanim:
#   export INSTALL_DIR=/opt/berqenas-cloud
#   export GH_BRANCH=main
#   export MERKEZ_API_PUBLIC_DOMAIN=api.retailex.app
#   sudo -E bash ./vps-retail-three-github-only.sh
#
# veya tek satir (repo public ise):
#   curl -fsSL "https://raw.githubusercontent.com/ferhatdeveloper/RetailEX/main/database/scripts/vps-retail-three-github-only.sh" | sudo -E bash
#
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/berqenas-cloud}"
GH_USER_REPO="${GH_USER_REPO:-ferhatdeveloper/RetailEX}"
GH_BRANCH="${GH_BRANCH:-main}"
MERKEZ_API_PUBLIC_DOMAIN="${MERKEZ_API_PUBLIC_DOMAIN:-api.retailex.app}"
GH_RAW="https://raw.githubusercontent.com/${GH_USER_REPO}/${GH_BRANCH}"

echo "=== Kaynak: ${GH_RAW} ==="

_tmp="$(mktemp)"
curl -fsSL "${GH_RAW}/database/docker/docker-compose.postgrest-per-db.yml" -o "${_tmp}"
install -m 0644 "${_tmp}" "${INSTALL_DIR}/docker-compose.postgrest-per-db.yml"
rm -f "${_tmp}"
echo "=== Compose guncellendi: ${INSTALL_DIR}/docker-compose.postgrest-per-db.yml ==="

RETAIL_DBS=(berzin_com sho_aksesuar kupeli)
for _db in "${RETAIL_DBS[@]}"; do
  _ex="$(docker exec saas_postgres psql -U postgres -Atc "SELECT 1 FROM pg_database WHERE datname='${_db}'" 2>/dev/null | tr -d '\r' || true)"
  if [[ "${_ex}" != "1" ]]; then
    echo "CREATE DATABASE ${_db}"
    docker exec saas_postgres psql -U postgres -c "CREATE DATABASE ${_db} WITH ENCODING 'UTF8'"
  else
    echo "DB var: ${_db}"
  fi
done

cd "${INSTALL_DIR}"
docker compose -f docker-compose.yml -f docker-compose.postgrest-per-db.yml up -d --remove-orphans
echo "=== PostgREST up ==="

if docker exec saas_postgres psql -U postgres -d merkez_db -c 'SELECT 1' >/dev/null 2>&1; then
  curl -fsSL "${GH_RAW}/database/scripts/tenant_registry_fill_rest_base_urls.sql" | \
    docker exec -i saas_postgres psql -U postgres -d merkez_db -v ON_ERROR_STOP=1 -f -
  echo "=== merkez_db tenant_registry guncellendi ==="
else
  echo "Uyari: merkez_db yok, tenant SQL atlandi." >&2
fi

_caddy_tmp="$(mktemp)"
curl -fsSL "${GH_RAW}/database/scripts/berqenas-caddy-merge-merkez-api.sh" -o "${_caddy_tmp}"
chmod +x "${_caddy_tmp}"
export INSTALL_DIR
export MERKEZ_API_PUBLIC_DOMAIN
bash "${_caddy_tmp}"
rm -f "${_caddy_tmp}"

echo ""
echo "=== Her retail DB: bos DB ise 000; ardindan 007 + 008 ==="
for _db in "${RETAIL_DBS[@]}"; do
  echo "--- ${_db} ---"
  _firms="$(docker exec saas_postgres psql -U postgres -d "${_db}" -Atc "SELECT to_regclass('public.firms')" 2>/dev/null | tr -d '\r' || true)"
  if [[ -z "${_firms}" ]]; then
    echo "  000_master_schema.sql uygulaniyor..."
    curl -fsSL "${GH_RAW}/database/migrations/000_master_schema.sql" | \
      docker exec -i saas_postgres psql -U postgres -d "${_db}" -v ON_ERROR_STOP=1 -f -
  else
    echo "  000 atlandi (public.firms var)."
  fi
  curl -fsSL "${GH_RAW}/database/migrations/007_postgrest_anon_role.sql" | \
    docker exec -i saas_postgres psql -U postgres -d "${_db}" -v ON_ERROR_STOP=1 -f - || true
  curl -fsSL "${GH_RAW}/database/migrations/008_postgrest_verify_login_rpc.sql" | \
    docker exec -i saas_postgres psql -U postgres -d "${_db}" -v ON_ERROR_STOP=1 -f - || true
done

echo ""
docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep -E 'berzin|sho_aksesuar|kupeli|NAME' || docker ps | head -15
echo "Bitti."
