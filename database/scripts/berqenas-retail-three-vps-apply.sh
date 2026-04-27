#!/usr/bin/env bash
# VPS: berzin_com, sho_aksesuar, kupeli — PostgreSQL DB + PostgREST (3010–3012) + merkez_db tenant URL
#
# Not: 007/008 ve verify_login icin once her DB'de 000_master_schema.sql (veya tam migration) calistirin;
#      bu betik yalnizca DB olusturur, compose kopyalar ve PostgREST'i baslatir.
#
# Kullanim:
#   sudo bash /opt/RetailEX/database/scripts/berqenas-retail-three-vps-apply.sh
#
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/berqenas-cloud}"
RETAILEX_REPO="${RETAILEX_REPO:-}"
if [[ -z "${RETAILEX_REPO}" ]]; then
  for _c in "${INSTALL_DIR}/projects/retailex" "/opt/RetailEX"; do
    if [[ -f "${_c}/database/docker/docker-compose.postgrest-per-db.yml" ]]; then
      RETAILEX_REPO="${_c}"
      break
    fi
  done
fi
if [[ -z "${RETAILEX_REPO}" || ! -f "${RETAILEX_REPO}/database/docker/docker-compose.postgrest-per-db.yml" ]]; then
  echo "Hata: RetailEX klonu bulunamadi. RETAILEX_REPO=/path/to/RetailEX export edin." >&2
  exit 1
fi

COMPOSE_SRC="${RETAILEX_REPO}/database/docker/docker-compose.postgrest-per-db.yml"
COMPOSE_DST="${INSTALL_DIR}/docker-compose.postgrest-per-db.yml"
TENANT_SQL="${RETAILEX_REPO}/database/scripts/tenant_registry_fill_rest_base_urls.sql"

echo "=== RetailEX repo: ${RETAILEX_REPO} ==="
echo "=== PostgREST compose -> ${COMPOSE_DST} ==="
cp -a "${COMPOSE_SRC}" "${COMPOSE_DST}"

RETAIL_DBS=(berzin_com sho_aksesuar kupeli)
echo "=== Veritabanlari ==="
for _db in "${RETAIL_DBS[@]}"; do
  _exists="$(docker exec saas_postgres psql -U postgres -Atc "SELECT 1 FROM pg_database WHERE datname='${_db}'" 2>/dev/null | head -1 | tr -d '\r' || true)"
  if [[ "${_exists}" != "1" ]]; then
    echo "CREATE DATABASE ${_db}"
    docker exec saas_postgres psql -U postgres -c "CREATE DATABASE ${_db} WITH ENCODING 'UTF8'"
  else
    echo "DB zaten var: ${_db}"
  fi
done

echo "=== PostgREST (3010-3012 dahil) ==="
cd "${INSTALL_DIR}"
docker compose -f docker-compose.yml -f docker-compose.postgrest-per-db.yml up -d --remove-orphans

echo "=== merkez_db tenant_registry ==="
if docker exec saas_postgres psql -U postgres -d merkez_db -c 'SELECT 1' >/dev/null 2>&1 && [[ -f "${TENANT_SQL}" ]]; then
  docker exec -i saas_postgres psql -U postgres -d merkez_db -v ON_ERROR_STOP=1 -f - <"${TENANT_SQL}" || echo "Uyari: tenant_registry SQL." >&2
else
  echo "Not: merkez_db veya tenant SQL yok — atlandi."
fi

echo ""
echo "=== Sonraki (her retail DB) ==="
echo "  psql -f database/migrations/000_master_schema.sql"
echo "  psql -f database/migrations/007_postgrest_anon_role.sql"
echo "  psql -f database/migrations/008_postgrest_verify_login_rpc.sql"
echo ""
echo "=== Caddy ==="
echo "  export INSTALL_DIR='${INSTALL_DIR}' MERKEZ_API_PUBLIC_DOMAIN=api.retailex.app"
echo "  bash '${RETAILEX_REPO}/database/scripts/berqenas-caddy-merge-merkez-api.sh'"
echo ""
docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep -E 'berzin|sho_aksesuar|kupeli|NAME' || true
