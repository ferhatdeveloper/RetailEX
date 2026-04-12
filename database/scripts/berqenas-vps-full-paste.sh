#!/usr/bin/env bash
#
# Berqenas Cloud — Ubuntu VPS tek kurulum (Docker, Postgres, pgAdmin, isteğe bağlı WireGuard, DB'ler, merkez tablo)
#
# Sunucuda (repo ile):
#   sudo bash database/scripts/berqenas-vps-full-paste.sh
#
# VPN kapalı:
#   ENABLE_VPN=0 sudo -E bash database/scripts/berqenas-vps-full-paste.sh
#
# Eski tek satır stiline yakın kullanım:
#   sudo bash <<'BERQENAS'
#   bash /path/to/berqenas-vps-full-paste.sh
#   BERQENAS
#
# Ortam (soru sorulmadan):
#   ENABLE_VPN=0|1  RETAILEX_GIT_URL=https://github.com/kullanici/RetailEX.git
#
set -euo pipefail

SCRIPT_DIR=""
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

SERVERURL="${SERVERURL:-berqenas.cloud}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-root_password_2026}"
PGADMIN_DEFAULT_EMAIL="${PGADMIN_DEFAULT_EMAIL:-ferhatdeveloper@gmail.com}"
PGADMIN_DEFAULT_PASSWORD="${PGADMIN_DEFAULT_PASSWORD:-Yq7xwQpt6c*}"
AUTH_PASS="${AUTHENTICATOR_PASSWORD:-pgrst_pass_2026}"
RETAILEX_GIT_BRANCH="${RETAILEX_GIT_BRANCH:-main}"
RETAILEX_WEB_PORT="${RETAILEX_WEB_PORT:-8080}"
INSTALL_DIR="${INSTALL_DIR:-/opt/berqenas-cloud}"

if ! [[ -v ENABLE_VPN ]]; then
  if [[ -t 0 ]]; then
    read -r -p "WireGuard (VPN) kurulsun mu? [E/h]: " _vpn_ans
    case "${_vpn_ans,,}" in h|hayir|n|no) ENABLE_VPN=0 ;; *) ENABLE_VPN=1 ;; esac
  else
    ENABLE_VPN=1
  fi
fi

if [[ -z "${RETAILEX_GIT_URL:-}" ]] && [[ -t 0 ]]; then
  read -r -p "RetailEX Web — GitHub HTTPS URL (ornek: https://github.com/kullanici/RetailEX.git) [bos=atla]: " RETAILEX_GIT_URL
fi
RETAILEX_GIT_URL="${RETAILEX_GIT_URL:-}"

apt-get update -y
apt-get upgrade -y
apt-get install -y docker.io docker-compose-v2 curl ufw git

mkdir -p "${INSTALL_DIR}"/{postgres_data,pgadmin_data,wireguard_config,backups}
cd "${INSTALL_DIR}"

if [[ "$ENABLE_VPN" == "1" ]]; then
  cat <<EOF > docker-compose.yml
services:
  postgres:
    image: postgres:17
    container_name: saas_postgres
    restart: always
    environment:
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
    volumes:
      - ./postgres_data:/var/lib/postgresql/data
    networks:
      berqenas_net:
        ipv4_address: 172.20.0.10

  pgadmin:
    image: dpage/pgadmin4
    container_name: saas_pgadmin
    restart: always
    environment:
      PGADMIN_DEFAULT_EMAIL: "${PGADMIN_DEFAULT_EMAIL}"
      PGADMIN_DEFAULT_PASSWORD: "${PGADMIN_DEFAULT_PASSWORD}"
    networks:
      berqenas_net:
        ipv4_address: 172.20.0.20
    depends_on:
      - postgres

  wireguard:
    image: linuxserver/wireguard:latest
    container_name: saas_vpn
    cap_add: [NET_ADMIN, SYS_MODULE]
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Europe/Istanbul
      - SERVERURL=${SERVERURL}
      - SERVERPORT=51820
      - PEERS=admin,pdks_user,retail_user,beauty_user,rest_user
      - PEERDNS=auto
      - INTERNAL_SUBNET=10.13.0.0
    volumes:
      - ./wireguard_config:/config
      - /lib/modules:/lib/modules
    ports:
      - "51820:51820/udp"
    sysctls:
      - net.ipv4.conf.all.src_valid_mark=1
    networks:
      berqenas_net:
        ipv4_address: 172.20.0.30
    restart: always

networks:
  berqenas_net:
    ipam:
      config:
        - subnet: 172.20.0.0/24
EOF
else
  cat <<EOF > docker-compose.yml
services:
  postgres:
    image: postgres:17
    container_name: saas_postgres
    restart: always
    environment:
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
    volumes:
      - ./postgres_data:/var/lib/postgresql/data
    networks:
      berqenas_net:
        ipv4_address: 172.20.0.10

  pgadmin:
    image: dpage/pgadmin4
    container_name: saas_pgadmin
    restart: always
    environment:
      PGADMIN_DEFAULT_EMAIL: "${PGADMIN_DEFAULT_EMAIL}"
      PGADMIN_DEFAULT_PASSWORD: "${PGADMIN_DEFAULT_PASSWORD}"
    networks:
      berqenas_net:
        ipv4_address: 172.20.0.20
    depends_on:
      - postgres

networks:
  berqenas_net:
    ipam:
      config:
        - subnet: 172.20.0.0/24
EOF
fi

docker compose up -d --remove-orphans

echo "PostgreSQL bekleniyor (40 sn)..."
sleep 40

DATABASES=(
  pdks_db retailex_db beauty_db rest_db
  merkez_db aqua_beauty_db qubocoffe_db dismarco_db bestcom_db
)

for db in "${DATABASES[@]}"; do
  docker exec -t saas_postgres psql -U postgres -c "CREATE DATABASE ${db};" 2>/dev/null || true
done

docker exec -t saas_postgres psql -U postgres -d postgres -c "CREATE ROLE authenticator WITH LOGIN NOINHERIT PASSWORD '${AUTH_PASS}';" 2>/dev/null || true

for db in "${DATABASES[@]}"; do
  docker exec -t saas_postgres psql -U postgres -d "${db}" -c "GRANT CONNECT ON DATABASE ${db} TO authenticator;"
  docker exec -t saas_postgres psql -U postgres -d "${db}" -c "GRANT USAGE ON SCHEMA public TO authenticator;"
  docker exec -t saas_postgres psql -U postgres -d "${db}" -c "GRANT CREATE ON SCHEMA public TO authenticator;"
  docker exec -t saas_postgres psql -U postgres -d "${db}" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticator;"
  docker exec -t saas_postgres psql -U postgres -d "${db}" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticator;"
done

docker exec -i saas_postgres psql -U postgres -d merkez_db -v ON_ERROR_STOP=1 <<'EOSQL'
CREATE TABLE IF NOT EXISTS tenant_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  module          TEXT NOT NULL CHECK (module IN (
                    'tenant_registry',
                    'clinic',
                    'restaurant',
                    'hrm',
                    'retail',
                    'pdks'
                  )),
  database_name   TEXT NOT NULL,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_registry_active ON tenant_registry (is_active) WHERE is_active = true;
INSERT INTO tenant_registry (code, display_name, module, database_name, notes)
VALUES
  ('merkez',     'Merkez kayıt',           'tenant_registry', 'merkez_db',     'Kiracı meta verisi'),
  ('aqua_beauty','Aqua Beauty',            'clinic',          'aqua_beauty_db', 'Klinik / güzellik'),
  ('qubocoffe',  'Qubo Coffee',            'restaurant',      'qubocoffe_db',  'Restoran'),
  ('dismarco',   'DISMARCO',               'hrm',             'dismarco_db',   'İK / HRM'),
  ('bestcom',    'BESTCOM',                'hrm',             'bestcom_db',    'İK / HRM')
ON CONFLICT (code) DO UPDATE SET
  display_name  = EXCLUDED.display_name,
  module        = EXCLUDED.module,
  database_name = EXCLUDED.database_name,
  notes         = EXCLUDED.notes,
  updated_at    = now();
EOSQL

ufw default deny incoming
ufw allow 22/tcp
if [[ "$ENABLE_VPN" == "1" ]]; then
  ufw allow 51820/udp
fi
ufw --force enable

if [[ -n "${RETAILEX_GIT_URL}" ]]; then
  export RETAILEX_GIT_URL RETAILEX_GIT_BRANCH INSTALL_DIR RETAILEX_WEB_PORT
  _deploy="${SCRIPT_DIR}/berqenas-deploy-web.sh"
  if [[ -f "$_deploy" ]]; then
    bash "$_deploy" || echo "Uyari: RetailEX Web deploy basarisiz (log yukarida)."
  else
    echo "Uyari: berqenas-deploy-web.sh bulunamadi: $_deploy — web atlandi."
  fi
fi

echo "-------------------------------------------------------"
echo " BERQENAS CLOUD KURULUMU TAMAMLANDI"
echo "-------------------------------------------------------"
echo "Postgres (Docker agi): 172.20.0.10:5432"
echo "pgAdmin: http://172.20.0.20 (host: postgres veya 172.20.0.10)"
if [[ "$ENABLE_VPN" == "1" ]]; then
  echo "WireGuard endpoint: ${SERVERURL}:51820"
  echo "Admin VPN: docker exec -it saas_vpn cat /config/peer_admin/peer_admin.conf"
else
  echo "WireGuard: kapali (ENABLE_VPN=0)"
fi
echo "DB: pdks_db retailex_db beauty_db rest_db merkez_db aqua_beauty_db qubocoffe_db dismarco_db bestcom_db"
if [[ -n "${RETAILEX_GIT_URL:-}" ]]; then
  echo "RetailEX Web: http://berqenas.cloud:${RETAILEX_WEB_PORT:-8080} (DNS ve UFW ${RETAILEX_WEB_PORT:-8080}/tcp)"
fi
echo "-------------------------------------------------------"
