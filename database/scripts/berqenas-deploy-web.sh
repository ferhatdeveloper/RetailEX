#!/usr/bin/env bash
# RetailEX web arayüzünü GitHub'dan klonlayıp Dockerfile.frontend ile yayınlar.
# Ön koşul: saas_postgres çalışıyor olmalı (Docker ağı adı alınır).
#
# Ortam:
#   RETAILEX_GIT_URL   — zorunlu (https://github.com/kullanici/RetailEX.git)
#   RETAILEX_GIT_BRANCH — varsayılan: main
#   INSTALL_DIR        — varsayılan: /opt/berqenas-cloud
#   RETAILEX_WEB_PORT  — varsayılan 8080. Alan adı (Caddy) açıkken de aynı port hostta acilir: http://GENEL_IP:8080
#   RETAILEX_PUBLIC_DOMAIN — bos: sadece :RETAILEX_WEB_PORT. Dolu: Caddy 80/443 + HTTPS (varsayılan
#                            betik tek basina calistirilirken: retailex.app). Tamamen kapatmak icin
#                            once export RETAILEX_PUBLIC_DOMAIN=
#
#   sudo RETAILEX_GIT_URL=https://github.com/org/RetailEX.git bash berqenas-deploy-web.sh

set -euo pipefail

RETAILEX_GIT_URL="${RETAILEX_GIT_URL:-}"
if [[ -z "$RETAILEX_GIT_URL" ]]; then
  echo "Hata: RETAILEX_GIT_URL bos." >&2
  exit 1
fi

RETAILEX_GIT_BRANCH="${RETAILEX_GIT_BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/berqenas-cloud}"
RETAILEX_WEB_PORT="${RETAILEX_WEB_PORT:-8080}"
TARGET="${INSTALL_DIR}/projects/retailex"

# Bos = sadece RETAILEX_WEB_PORT; ayarlanmamis = retailex.app (Caddy + TLS)
if [[ -z "${RETAILEX_PUBLIC_DOMAIN+x}" ]]; then
  RETAILEX_PUBLIC_DOMAIN=retailex.app
fi

command -v git >/dev/null 2>&1 || apt-get install -y git

mkdir -p "${INSTALL_DIR}/projects"

if [[ -d "${TARGET}/.git" ]]; then
  echo "Guncelleniyor: ${TARGET}"
  git -C "${TARGET}" fetch origin "${RETAILEX_GIT_BRANCH}"
  git -C "${TARGET}" reset --hard "origin/${RETAILEX_GIT_BRANCH}"
else
  echo "Klonlaniyor: ${RETAILEX_GIT_URL} -> ${TARGET}"
  mkdir -p "${INSTALL_DIR}/projects"
  git clone --depth 1 -b "${RETAILEX_GIT_BRANCH}" "${RETAILEX_GIT_URL}" "${TARGET}"
fi

if [[ ! -f "${TARGET}/Dockerfile.frontend" ]]; then
  echo "Hata: ${TARGET}/Dockerfile.frontend yok. Repoda Dockerfile.frontend oldugundan emin olun." >&2
  exit 1
fi

cd "${TARGET}"
docker build -f Dockerfile.frontend -t retailex-web:latest .

WEB_NET=$(docker inspect saas_postgres --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | awk '{print $1}')
if [[ -z "${WEB_NET:-}" ]]; then
  echo "Hata: saas_postgres bulunamadi veya ag adi okunamadi." >&2
  exit 1
fi

docker rm -f retailex_frontend 2>/dev/null || true

if [[ -n "${RETAILEX_PUBLIC_DOMAIN}" ]]; then
  echo "=== RetailEX Web (Caddy https://${RETAILEX_PUBLIC_DOMAIN} + http://GENEL_IP:${RETAILEX_WEB_PORT}) ==="
  docker run -d \
    --name retailex_frontend \
    --restart always \
    -p "0.0.0.0:${RETAILEX_WEB_PORT}:80" \
    --network "${WEB_NET}" \
    retailex-web:latest

  mkdir -p "${INSTALL_DIR}/caddy"
  cat >"${INSTALL_DIR}/caddy/Caddyfile" <<EOF
${RETAILEX_PUBLIC_DOMAIN} {
  encode gzip zstd
  reverse_proxy retailex_frontend:80
}
EOF

  docker rm -f retailex_caddy 2>/dev/null || true
  docker volume create retailex_caddy_data >/dev/null 2>&1 || true
  docker run -d \
    --name retailex_caddy \
    --restart always \
    -p "0.0.0.0:80:80" \
    -p "0.0.0.0:443:443" \
    -p "0.0.0.0:443:443/udp" \
    --network "${WEB_NET}" \
    -v "${INSTALL_DIR}/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
    -v retailex_caddy_data:/data \
    caddy:2.8-alpine

  ufw allow 80/tcp 2>/dev/null || true
  ufw allow 443/tcp 2>/dev/null || true
  ufw allow 443/udp 2>/dev/null || true
  ufw allow "${RETAILEX_WEB_PORT}/tcp" 2>/dev/null || true

  echo "RetailEX Web: https://${RETAILEX_PUBLIC_DOMAIN}"
  echo "Ayrica dogrudan IP: http://SUNUCU_IPV4:${RETAILEX_WEB_PORT} (aynı konteyner)"
  echo "DNS: A kaydi ${RETAILEX_PUBLIC_DOMAIN} -> bu sunucunun genel IPv4 adresi (ACME icin sart)."
  echo "Not: VPS saglayici panelindeki guvenlik duvari aciksa 80/443 ve ${RETAILEX_WEB_PORT}/tcp kurallarini orada da ekleyin."
else
  echo "=== RetailEX Web (dogrudan host portu :${RETAILEX_WEB_PORT}) ==="
  docker rm -f retailex_caddy 2>/dev/null || true
  docker run -d \
    --name retailex_frontend \
    --restart always \
    -p "0.0.0.0:${RETAILEX_WEB_PORT}:80" \
    --network "${WEB_NET}" \
    retailex-web:latest

  ufw allow "${RETAILEX_WEB_PORT}/tcp" 2>/dev/null || true
  echo "RetailEX Web: http://$(hostname -f 2>/dev/null || echo SUNUCU):${RETAILEX_WEB_PORT}"
fi
