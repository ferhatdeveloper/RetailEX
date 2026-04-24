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
#   EXPOSE_PUBLIC=1  — pgAdmin (+ varsayilan Postgres 5432) tum arayuzlerde; UFW acar
#   PGADMIN_HOST_PORT=5050  EXPOSE_POSTGRES_PUBLIC=0  — sadece pgAdmin, Postgres disari kapali
#   ENABLE_POSTGREST=1  POSTGREST_COMPOSE=...  — database/docker/docker-compose.postgrest-per-db.yml (3002-3009)
#
# Sifirdan SaaS (web+PostgREST+pgAdmin+Postgres herkese acik, VPN kapali): database/scripts/berqenas-saas-from-zero.sh
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

EXPOSE_PUBLIC="${EXPOSE_PUBLIC:-0}"
PGADMIN_HOST_PORT="${PGADMIN_HOST_PORT:-5050}"
EXPOSE_POSTGRES_PUBLIC="${EXPOSE_POSTGRES_PUBLIC:-1}"

POSTGRES_PORTS_YAML=""
if [[ "$EXPOSE_PUBLIC" == "1" ]] && [[ "$EXPOSE_POSTGRES_PUBLIC" != "0" ]]; then
  POSTGRES_PORTS_YAML=$'    ports:\n      - "0.0.0.0:5432:5432"\n'
fi
PGADMIN_PORTS_YAML=""
if [[ "$EXPOSE_PUBLIC" == "1" ]]; then
  PGADMIN_PORTS_YAML=$'    ports:\n      - "0.0.0.0:'"${PGADMIN_HOST_PORT}"$':80"\n'
fi

ENABLE_POSTGREST="${ENABLE_POSTGREST:-0}"
POSTGREST_COMPOSE="${POSTGREST_COMPOSE:-${SCRIPT_DIR}/../docker/docker-compose.postgrest-per-db.yml}"
POSTGREST_TARGET="${INSTALL_DIR}/docker-compose.postgrest-per-db.yml"

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
${POSTGRES_PORTS_YAML}
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
${PGADMIN_PORTS_YAML}
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
${POSTGRES_PORTS_YAML}
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
${PGADMIN_PORTS_YAML}
networks:
  berqenas_net:
    ipam:
      config:
        - subnet: 172.20.0.0/24
EOF
fi

if [[ "$ENABLE_POSTGREST" == "1" ]] && [[ -f "$POSTGREST_COMPOSE" ]]; then
  cp -a "$POSTGREST_COMPOSE" "$POSTGREST_TARGET"
  docker compose -f docker-compose.yml -f "$POSTGREST_TARGET" up -d --remove-orphans
elif [[ "$ENABLE_POSTGREST" == "1" ]]; then
  echo "Uyari: PostgREST compose bulunamadi: $POSTGREST_COMPOSE — yalniz ana stack baslatiliyor."
  docker compose -f docker-compose.yml up -d --remove-orphans
else
  docker compose -f docker-compose.yml up -d --remove-orphans
fi

echo "PostgreSQL bekleniyor (40 sn)..."
sleep 40

DATABASES=(
  dismarco_pdks aqua_beauty m10_pdks bestcom_db siti_pdks pdks_demo retailex_demo merkez_db
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
  connection_provider TEXT NOT NULL DEFAULT 'rest_api' CHECK (connection_provider IN ('db', 'rest_api')),
  rest_base_url   TEXT,
  db_host         TEXT,
  db_port         INTEGER,
  db_user         TEXT,
  db_pass         TEXT,
  db_sslmode      TEXT,
  database_name   TEXT NOT NULL,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_registry_active ON tenant_registry (is_active) WHERE is_active = true;
INSERT INTO tenant_registry (code, display_name, module, database_name, notes)
VALUES
  ('merkez',        'Merkez kayıt',    'tenant_registry', 'merkez_db',       'Kiracı meta verisi'),
  ('aqua_beauty',   'Aqua Beauty',     'clinic',            'aqua_beauty',     'Güzellik'),
  ('dismarco_pdks', 'DISMARCO PDKS',  'pdks',              'dismarco_pdks',   'PDKS'),
  ('m10_pdks',      'M10 PDKS',       'pdks',              'm10_pdks',        'PDKS'),
  ('bestcom',       'BESTCOM',        'hrm',               'bestcom_db',      'İK / HRM'),
  ('siti_pdks',     'Siti PDKS',      'pdks',              'siti_pdks',       'PDKS'),
  ('pdks_demo',     'PDKS Demo',      'pdks',              'pdks_demo',       'Demo'),
  ('retailex_demo', 'RetailEX Demo', 'retail',            'retailex_demo',   'Demo')
ON CONFLICT (code) DO UPDATE SET
  display_name  = EXCLUDED.display_name,
  module        = EXCLUDED.module,
  connection_provider = COALESCE(NULLIF(EXCLUDED.connection_provider, ''), tenant_registry.connection_provider),
  rest_base_url = COALESCE(NULLIF(EXCLUDED.rest_base_url, ''), tenant_registry.rest_base_url),
  db_host       = COALESCE(NULLIF(EXCLUDED.db_host, ''), tenant_registry.db_host),
  db_port       = COALESCE(EXCLUDED.db_port, tenant_registry.db_port),
  db_user       = COALESCE(NULLIF(EXCLUDED.db_user, ''), tenant_registry.db_user),
  db_pass       = COALESCE(NULLIF(EXCLUDED.db_pass, ''), tenant_registry.db_pass),
  db_sslmode    = COALESCE(NULLIF(EXCLUDED.db_sslmode, ''), tenant_registry.db_sslmode),
  database_name = EXCLUDED.database_name,
  notes         = EXCLUDED.notes,
  updated_at    = now();
EOSQL

_ANON_SQL="${SCRIPT_DIR}/merkez_db_anon_minimal.sql"
if [[ -f "${_ANON_SQL}" ]]; then
  echo "=== merkez_db: anon + tenant_registry SELECT (PostgREST) ==="
  docker exec -i saas_postgres psql -U postgres -d merkez_db -v ON_ERROR_STOP=1 <"${_ANON_SQL}" || {
    echo "Uyari: merkez_db_anon_minimal.sql calistirilamadi." >&2
  }
fi

ufw default deny incoming
ufw allow 22/tcp
if [[ "$ENABLE_VPN" == "1" ]]; then
  ufw allow 51820/udp
fi
if [[ "$EXPOSE_PUBLIC" == "1" ]]; then
  ufw allow "${PGADMIN_HOST_PORT}/tcp"
  if [[ "$EXPOSE_POSTGRES_PUBLIC" != "0" ]]; then
    ufw allow 5432/tcp
  fi
fi
if [[ "$ENABLE_POSTGREST" == "1" ]]; then
  ufw allow 3002:3009/tcp
fi
ufw --force enable

if [[ -n "${RETAILEX_GIT_URL}" ]]; then
  export RETAILEX_GIT_URL RETAILEX_GIT_BRANCH INSTALL_DIR RETAILEX_WEB_PORT RETAILEX_PUBLIC_DOMAIN
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
if [[ "$EXPOSE_PUBLIC" == "1" ]]; then
  echo "pgAdmin (internet): http://SUNUCU_IP:${PGADMIN_HOST_PORT} — ayrica Docker icinden http://172.20.0.20"
  if [[ "$EXPOSE_POSTGRES_PUBLIC" != "0" ]]; then
    echo "Postgres (internet): SUNUCU_IP:5432 — bruteforce riski; EXPOSE_POSTGRES_PUBLIC=0 ile sadece pgAdmin acik kalabilir"
  fi
else
  echo "pgAdmin: http://172.20.0.20 (yalnizca Docker agi / VPN / tunel)"
fi
if [[ "$ENABLE_VPN" == "1" ]]; then
  echo "WireGuard endpoint: ${SERVERURL}:51820"
  echo "Admin VPN: docker exec -it saas_vpn cat /config/peer_admin/peer_admin.conf"
else
  echo "WireGuard: kapali (ENABLE_VPN=0)"
fi
echo "DB: dismarco_pdks aqua_beauty m10_pdks bestcom_db siti_pdks pdks_demo retailex_demo merkez_db"
if [[ "$ENABLE_POSTGREST" == "1" ]]; then
  echo "PostgREST (HTTP): 3002 merkez_db | 3003 dismarco_pdks | 3004 aqua_beauty | 3005 m10_pdks | 3006 bestcom_db | 3007 siti_pdks | 3008 pdks_demo | 3009 retailex_demo"
fi
if [[ -n "${RETAILEX_GIT_URL:-}" ]]; then
  if [[ ! -v RETAILEX_PUBLIC_DOMAIN ]]; then
    echo "RetailEX Web: https://retailex.app + http://SUNUCU_IP:${RETAILEX_WEB_PORT:-8080} (Caddy + dogrudan port)"
  elif [[ -z "${RETAILEX_PUBLIC_DOMAIN}" ]]; then
    echo "RetailEX Web: http://SUNUCU_IP:${RETAILEX_WEB_PORT:-8080} (RETAILEX_PUBLIC_DOMAIN bos)"
  else
    echo "RetailEX Web: https://${RETAILEX_PUBLIC_DOMAIN} + http://SUNUCU_IP:${RETAILEX_WEB_PORT:-8080}"
  fi
fi
echo "-------------------------------------------------------"
