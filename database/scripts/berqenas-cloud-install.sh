#!/usr/bin/env bash
#
# Berqenas Cloud — sıfırdan kurulum (Ubuntu 24.04)
# Docker, PostgreSQL 17, pgAdmin, isteğe bağlı WireGuard, UFW, kiracı veritabanları.
#
# VPN kapalı:
#   ENABLE_VPN=0 sudo -E bash berqenas-cloud-install.sh
#
# Varsayılan (WireGuard açık):
#   sudo bash berqenas-cloud-install.sh
#
# Ortam (isteğe bağlı):
#   INSTALL_DIR=/opt/berqenas-cloud
#   ENABLE_VPN=1|0
#   SERVERURL=berqenas.cloud         # ENABLE_VPN=1 iken WireGuard endpoint (DNS A kaydı VPS IP’ye işaret etmeli)
#   POSTGRES_PASSWORD=...
#   PGADMIN_DEFAULT_EMAIL=...
#   PGADMIN_DEFAULT_PASSWORD=...
#   ENABLE_POSTGREST=0|1           # 1: database/docker/docker-compose.postgrest-per-db.yml ile compose up
#   EXPOSE_PUBLIC=0|1              # 1: pgAdmin (+ isteğe bagli Postgres) internete host portu ile acilir; UFW kurali eklenir
#   PGADMIN_HOST_PORT=5050         # EXPOSE_PUBLIC=1 iken host portu (pgAdmin web)
#   EXPOSE_POSTGRES_PUBLIC=0|1     # EXPOSE_PUBLIC=1 iken 5432 yayini (varsayilan 1). Sadece pgAdmin: 0 verin.
#   RETAILEX_GIT_URL=...           # RetailEX Web otomatik: GitHub HTTPS (bos = atla)
#   RETAILEX_GIT_BRANCH=main
#   RETAILEX_PUBLIC_DOMAIN=       # bos + export: sadece :8080. Ayarlanmamis + tek basina deploy: retailex.app
#
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/berqenas-cloud}"
ENABLE_POSTGREST="${ENABLE_POSTGREST:-0}"
EXPOSE_PUBLIC="${EXPOSE_PUBLIC:-0}"
PGADMIN_HOST_PORT="${PGADMIN_HOST_PORT:-5050}"
EXPOSE_POSTGRES_PUBLIC="${EXPOSE_POSTGRES_PUBLIC:-1}"
SERVERURL="${SERVERURL:-berqenas.cloud}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-root_password_2026}"
PGADMIN_DEFAULT_EMAIL="${PGADMIN_DEFAULT_EMAIL:-ferhatdeveloper@gmail.com}"
PGADMIN_DEFAULT_PASSWORD="${PGADMIN_DEFAULT_PASSWORD:-Yq7xwQpt6c*}"
RETAILEX_GIT_BRANCH="${RETAILEX_GIT_BRANCH:-main}"
RETAILEX_WEB_PORT="${RETAILEX_WEB_PORT:-8080}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! [[ -v ENABLE_VPN ]]; then
  if [[ -t 0 ]]; then
    read -r -p "WireGuard (VPN) kurulsun mu? [E/h]: " _vpn_ans
    case "${_vpn_ans,,}" in h|hayir|n|no) ENABLE_VPN=0 ;; *) ENABLE_VPN=1 ;; esac
  else
    ENABLE_VPN=1
  fi
fi

if [[ -z "${RETAILEX_GIT_URL:-}" ]] && [[ -t 0 ]]; then
  read -r -p "RetailEX Web — GitHub HTTPS URL [bos=atla]: " RETAILEX_GIT_URL
fi
RETAILEX_GIT_URL="${RETAILEX_GIT_URL:-}"
POSTGREST_COMPOSE="${POSTGREST_COMPOSE:-${SCRIPT_DIR}/../docker/docker-compose.postgrest-per-db.yml}"

echo "=== Berqenas Cloud kurulumu ==="
echo "Dizin: $INSTALL_DIR | ENABLE_VPN=$ENABLE_VPN | ENABLE_POSTGREST=$ENABLE_POSTGREST | EXPOSE_PUBLIC=$EXPOSE_PUBLIC"
[[ "$ENABLE_VPN" == "1" ]] && echo "WireGuard SERVERURL (istemci endpoint): $SERVERURL"
[[ "$EXPOSE_PUBLIC" == "1" ]] && echo "UYARI: EXPOSE_PUBLIC=1 — pgAdmin (ve varsayilan olarak Postgres) tum arayuzlerde dinlenir; guclu parola ve guncelleme sart."

apt-get update -y
apt-get upgrade -y
apt-get install -y docker.io docker-compose-v2 curl ufw git

mkdir -p "${INSTALL_DIR}"/{postgres_data,pgadmin_data,wireguard_config,backups}
cd "${INSTALL_DIR}"

COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"
{
  echo "services:"
  echo "  postgres:"
  echo "    image: postgres:17"
  echo "    container_name: saas_postgres"
  echo "    restart: always"
  echo "    environment:"
  echo "      POSTGRES_PASSWORD: \"${POSTGRES_PASSWORD}\""
  echo "    volumes:"
  echo "      - ./postgres_data:/var/lib/postgresql/data"
  echo "    networks:"
  echo "      berqenas_net:"
  echo "        ipv4_address: 172.20.0.10"
  if [[ "$EXPOSE_PUBLIC" == "1" ]] && [[ "$EXPOSE_POSTGRES_PUBLIC" != "0" ]]; then
    echo "    ports:"
    echo "      - \"0.0.0.0:5432:5432\""
  fi
  echo ""
  echo "  pgadmin:"
  echo "    image: dpage/pgadmin4"
  echo "    container_name: saas_pgadmin"
  echo "    restart: always"
  echo "    environment:"
  echo "      PGADMIN_DEFAULT_EMAIL: \"${PGADMIN_DEFAULT_EMAIL}\""
  echo "      PGADMIN_DEFAULT_PASSWORD: \"${PGADMIN_DEFAULT_PASSWORD}\""
  echo "    networks:"
  echo "      berqenas_net:"
  echo "        ipv4_address: 172.20.0.20"
  echo "    depends_on:"
  echo "      - postgres"
  if [[ "$EXPOSE_PUBLIC" == "1" ]]; then
    echo "    ports:"
    echo "      - \"0.0.0.0:${PGADMIN_HOST_PORT}:80\""
  fi
  echo ""

  if [[ "$ENABLE_VPN" == "1" ]]; then
    echo "  wireguard:"
    echo "    image: linuxserver/wireguard:latest"
    echo "    container_name: saas_vpn"
    echo "    cap_add: [NET_ADMIN, SYS_MODULE]"
    echo "    environment:"
    echo "      - PUID=1000"
    echo "      - PGID=1000"
    echo "      - TZ=Europe/Istanbul"
    echo "      - SERVERURL=${SERVERURL}"
    echo "      - SERVERPORT=51820"
    echo "      - PEERS=admin,pdks_user,retail_user,beauty_user,rest_user"
    echo "      - PEERDNS=auto"
    echo "      - INTERNAL_SUBNET=10.13.0.0"
    echo "    volumes:"
    echo "      - ./wireguard_config:/config"
    echo "      - /lib/modules:/lib/modules"
    echo "    ports:"
    echo "      - \"51820:51820/udp\""
    echo "    sysctls:"
    echo "      - net.ipv4.conf.all.src_valid_mark=1"
    echo "    networks:"
    echo "      berqenas_net:"
    echo "        ipv4_address: 172.20.0.30"
    echo "    restart: always"
    echo ""
  fi

  echo "networks:"
  echo "  berqenas_net:"
  echo "    ipam:"
  echo "      config:"
  echo "        - subnet: 172.20.0.0/24"
} > "$COMPOSE_FILE"

echo "--- docker-compose.yml yazildi (ENABLE_VPN=$ENABLE_VPN) ---"

if [[ "$ENABLE_POSTGREST" == "1" ]]; then
  if [[ -f "$POSTGREST_COMPOSE" ]]; then
    cp -a "$POSTGREST_COMPOSE" "${INSTALL_DIR}/docker-compose.postgrest-per-db.yml"
    docker compose -f "$COMPOSE_FILE" -f "${INSTALL_DIR}/docker-compose.postgrest-per-db.yml" up -d --remove-orphans
  else
    echo "Uyari: PostgREST compose bulunamadi: $POSTGREST_COMPOSE — sadece ana stack kaldiriliyor."
    docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
  fi
else
  docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
fi

echo "PostgreSQL hazir olana kadar bekleniyor (40 sn)..."
sleep 40

if [[ -f "${SCRIPT_DIR}/create_berqenas_tenant_databases.sh" ]]; then
  bash "${SCRIPT_DIR}/create_berqenas_tenant_databases.sh"
else
  echo "Uyari: create_berqenas_tenant_databases.sh yok; DB olusturma atlandi."
fi

echo "=== UFW ==="
ufw default deny incoming
ufw allow 22/tcp
if [[ "$ENABLE_VPN" == "1" ]]; then
  ufw allow 51820/udp
fi
if [[ "$ENABLE_POSTGREST" == "1" ]]; then
  ufw allow 3002:3009/tcp
fi
if [[ "$EXPOSE_PUBLIC" == "1" ]]; then
  ufw allow "${PGADMIN_HOST_PORT}/tcp"
  if [[ "$EXPOSE_POSTGRES_PUBLIC" != "0" ]]; then
    ufw allow 5432/tcp
  fi
fi
ufw --force enable

if [[ -n "${RETAILEX_GIT_URL}" ]]; then
  export RETAILEX_GIT_URL RETAILEX_GIT_BRANCH INSTALL_DIR RETAILEX_WEB_PORT RETAILEX_PUBLIC_DOMAIN
  if [[ -f "${SCRIPT_DIR}/berqenas-deploy-web.sh" ]]; then
    bash "${SCRIPT_DIR}/berqenas-deploy-web.sh" || echo "Uyari: RetailEX Web deploy basarisiz."
  else
    echo "Uyari: berqenas-deploy-web.sh bulunamadi."
  fi
fi

echo ""
echo "=== TAMAMLANDI ==="
echo "Postgres (Docker agi): 172.20.0.10:5432  kullanici: postgres"
if [[ "$EXPOSE_PUBLIC" == "1" ]]; then
  echo "pgAdmin (internet): http://SUNUCU_IP:${PGADMIN_HOST_PORT} — konteyner icinden ayrica http://172.20.0.20"
  if [[ "$EXPOSE_POSTGRES_PUBLIC" != "0" ]]; then
    echo "Postgres (internet): SUNUCU_IP:5432 — guclu parola ve gereksizse EXPOSE_POSTGRES_PUBLIC=0 ile kapat"
  fi
else
  echo "pgAdmin (yalnizca Docker agi icinden): http://172.20.0.20 — host postgres veya 172.20.0.10"
fi
if [[ "$ENABLE_VPN" == "1" ]]; then
  echo "WireGuard endpoint (istemci baglantisi): ${SERVERURL}:51820 — peer conf icinde Endpoint bu alan adina ayarlanir."
  echo "VPN conf: docker exec -it saas_vpn cat /config/peer_admin/peer_admin.conf"
  echo "      (veya: docker exec -it saas_vpn /app/show-peer admin)"
else
  echo "VPN: kapali (ENABLE_VPN=0)."
  [[ "$EXPOSE_PUBLIC" != "1" ]] && echo "pgAdmin dis erisim icin: EXPOSE_PUBLIC=1 veya SSH tuneli / manuel ports."
fi
if [[ "$ENABLE_POSTGREST" == "1" ]]; then
  echo "PostgREST: 3002-3009 TCP — merkez + kiracı DB (detay: database/BERQENAS_CLOUD_DEPLOY.md)"
fi
if [[ -n "${RETAILEX_GIT_URL:-}" ]]; then
  if [[ ! -v RETAILEX_PUBLIC_DOMAIN ]]; then
    echo "RetailEX Web: https://retailex.app + http://SUNUCU_IP:${RETAILEX_WEB_PORT} — veya RETAILEX_PUBLIC_DOMAIN= ile yalniz port"
  elif [[ -z "${RETAILEX_PUBLIC_DOMAIN}" ]]; then
    echo "RetailEX Web: :${RETAILEX_WEB_PORT}/tcp (RETAILEX_PUBLIC_DOMAIN bos)"
  else
    echo "RetailEX Web: https://${RETAILEX_PUBLIC_DOMAIN} + http://SUNUCU_IP:${RETAILEX_WEB_PORT}"
  fi
fi
