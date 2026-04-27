#!/usr/bin/env bash
# Berqenas Cloud VPS: firma / modül bazlı PostgreSQL veritabanlarını oluşturur.
# Ön koşul: saas_postgres çalışıyor olmalı (/opt/berqenas-cloud docker compose).
# Kullanım (sunucuda):
#   chmod +x create_berqenas_tenant_databases.sh
#   ./create_berqenas_tenant_databases.sh
#
# İsteğe bağlı:
#   POSTGRES_CONTAINER=saas_postgres AUTHENTICATOR_PASSWORD='güçlü_parola' ./create_berqenas_tenant_databases.sh

set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-saas_postgres}"
AUTH_PASS="${AUTHENTICATOR_PASSWORD:-pgrst_pass_2026}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Hata: '$CONTAINER' konteyneri çalışmıyor veya yok." >&2
  exit 1
fi

psql_exec() {
  docker exec -t "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 "$@"
}

# (db_adı açıklama)
DATABASES=(
  "merkez_db|MERKEZ — kiracı / firma kayıt"
  "dismarco_pdks|DISMARCO PDKS"
  "aqua_beauty|Aqua Beauty — clinic"
  "m10_pdks|M10 PDKS"
  "bestcom_db|BESTCOM — HRM"
  "siti_pdks|Siti PDKS"
  "pdks_demo|PDKS Demo"
  "retailex_demo|RetailEX Demo"
)

echo "=== Veritabanları oluşturuluyor ($CONTAINER) ==="

for entry in "${DATABASES[@]}"; do
  db="${entry%%|*}"
  label="${entry#*|}"
  echo "--- $db ($label) ---"
  psql_exec -c "CREATE DATABASE ${db};" 2>/dev/null || echo "  (zaten var: $db)"
done

echo "=== authenticator rolü (küme geneli, bir kez) ==="
psql_exec -d postgres -c "CREATE ROLE authenticator WITH LOGIN NOINHERIT PASSWORD '${AUTH_PASS}';" 2>/dev/null || echo "  (authenticator zaten var)"

echo "=== Her veritabanında public yetkileri ==="

for entry in "${DATABASES[@]}"; do
  db="${entry%%|*}"
  psql_exec -d "$db" -c "GRANT CONNECT ON DATABASE ${db} TO authenticator;"
  psql_exec -d "$db" -c "GRANT USAGE ON SCHEMA public TO authenticator;"
  psql_exec -d "$db" -c "GRANT CREATE ON SCHEMA public TO authenticator;"
  psql_exec -d "$db" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticator;"
  psql_exec -d "$db" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticator;"
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY_SQL="${SCRIPT_DIR}/merkez_tenant_registry.sql"
if [[ -f "$REGISTRY_SQL" ]]; then
  echo "=== merkez_db kiracı tablosu ==="
  docker cp "$REGISTRY_SQL" "$CONTAINER:/tmp/merkez_tenant_registry.sql"
  psql_exec -d merkez_db -f /tmp/merkez_tenant_registry.sql
  docker exec "$CONTAINER" rm -f /tmp/merkez_tenant_registry.sql
else
  echo "Uyarı: $REGISTRY_SQL bulunamadı; merkez şema atlandı."
fi

echo "=== Tamam ==="
echo "pgAdmin / psql ile bağlantı: host 172.20.0.10 (Docker ağı; VPN açıksa tünel üzerinden), DB adlarını yukarıdaki listeye göre seçin."
echo "RetailEX master şema: her uygulama DB'sine ayrı ayrı 000_master_schema.sql uygulanmalı (ihtiyaca göre)."
echo "PostgREST (her DB ayrı port): database/docker/docker-compose.postgrest-per-db.yml — BERQENAS_CLOUD_DEPLOY.md §2"
echo "  Örnek: docker compose -f docker-compose.yml -f docker-compose.postgrest-per-db.yml up -d"
echo "  UFW: ufw allow 3002:3012/tcp"
