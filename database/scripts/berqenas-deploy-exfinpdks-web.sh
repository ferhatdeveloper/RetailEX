#!/usr/bin/env bash
# EXFIN PDKS (Flutter web) — GitHub klon + Docker imaj + Caddy (exfinpdks.com) + doğrudan port.
# Dockerfile RetailEX reposunda: database/docker/Dockerfile.exfinpdks-web (context = EXFINPDKS klonu).
#
# Ön koşul: saas_postgres (Berqenas Docker ağı) ayakta.
#
# Ortam:
#   EXFINPDKS_GIT_URL       — varsayılan: https://github.com/ferhatdeveloper/EXFINPDKS.git
#   EXFINPDKS_GIT_BRANCH    — main
#   EXFINPDKS_PUBLIC_DOMAIN — varsayılan: exfinpdks.com (bos: sadece EXFINPDKS_WEB_PORT, Caddy yok)
#   EXFINPDKS_WEB_PORT      — varsayılan: 8091 (RetailEX 8080 ile çakışmasın)
#   INSTALL_DIR             — /opt/berqenas-cloud
#   EXFINPDKS_DOCKERFILE    — varsayılan: RetailEX klonundaki database/docker/Dockerfile.exfinpdks-web
#
# Örnek:
#   cd /opt/RetailEX/database/scripts && sudo bash berqenas-deploy-exfinpdks-web.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-/opt/berqenas-cloud}"
EXFINPDKS_GIT_URL="${EXFINPDKS_GIT_URL:-https://github.com/ferhatdeveloper/EXFINPDKS.git}"
EXFINPDKS_GIT_BRANCH="${EXFINPDKS_GIT_BRANCH:-main}"
EXFINPDKS_WEB_PORT="${EXFINPDKS_WEB_PORT:-8091}"
TARGET="${INSTALL_DIR}/projects/exfinpdks"

if ! [[ -v EXFINPDKS_PUBLIC_DOMAIN ]]; then
  EXFINPDKS_PUBLIC_DOMAIN=exfinpdks.com
fi

RETAIL_ROOT_CAND=(
  "/opt/RetailEX"
  "${SCRIPT_DIR}/../.."
)
EXFINPDKS_DOCKERFILE="${EXFINPDKS_DOCKERFILE:-}"
if [[ -z "${EXFINPDKS_DOCKERFILE}" ]]; then
  for base in "${RETAIL_ROOT_CAND[@]}"; do
    f="${base}/database/docker/Dockerfile.exfinpdks-web"
    if [[ -f "$f" ]]; then
      EXFINPDKS_DOCKERFILE="$f"
      break
    fi
  done
fi
if [[ -z "${EXFINPDKS_DOCKERFILE}" ]] || [[ ! -f "${EXFINPDKS_DOCKERFILE}" ]]; then
  echo "Hata: Dockerfile.exfinpdks-web bulunamadi. EXFINPDKS_DOCKERFILE=/tam/yol ile verin." >&2
  exit 1
fi

command -v git >/dev/null 2>&1 || apt-get install -y git

mkdir -p "${INSTALL_DIR}/projects"

if [[ -d "${TARGET}/.git" ]]; then
  echo "Guncelleniyor: ${TARGET}"
  git -C "${TARGET}" fetch origin "${EXFINPDKS_GIT_BRANCH}"
  git -C "${TARGET}" reset --hard "origin/${EXFINPDKS_GIT_BRANCH}"
else
  echo "Klonlaniyor: ${EXFINPDKS_GIT_URL} -> ${TARGET}"
  git clone --depth 1 -b "${EXFINPDKS_GIT_BRANCH}" "${EXFINPDKS_GIT_URL}" "${TARGET}"
fi

docker build -f "${EXFINPDKS_DOCKERFILE}" -t exfinpdks-web:latest "${TARGET}"

WEB_NET=$(docker inspect saas_postgres --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | awk '{print $1}')
if [[ -z "${WEB_NET:-}" ]]; then
  echo "Hata: saas_postgres bulunamadi veya ag adi okunamadi." >&2
  exit 1
fi

docker rm -f exfinpdks_frontend 2>/dev/null || true

if [[ -n "${EXFINPDKS_PUBLIC_DOMAIN}" ]]; then
  echo "=== EXFIN PDKS Web (Caddy https://${EXFINPDKS_PUBLIC_DOMAIN} + http://GENEL_IP:${EXFINPDKS_WEB_PORT}) ==="
  docker run -d \
    --name exfinpdks_frontend \
    --restart always \
    -p "0.0.0.0:${EXFINPDKS_WEB_PORT}:80" \
    --network "${WEB_NET}" \
    exfinpdks-web:latest

  mkdir -p "${INSTALL_DIR}/caddy"
  CADDYFILE="${INSTALL_DIR}/caddy/Caddyfile"
  [[ -f "$CADDYFILE" ]] || touch "$CADDYFILE"
  if ! grep -qF "${EXFINPDKS_PUBLIC_DOMAIN} {" "$CADDYFILE" 2>/dev/null; then
    {
      echo ""
      echo "${EXFINPDKS_PUBLIC_DOMAIN} {"
      echo "  encode gzip zstd"
      echo "  reverse_proxy exfinpdks_frontend:80"
      echo "}"
    } >>"$CADDYFILE"
  fi

  if docker ps -q -f name=retailex_caddy | grep -q .; then
    docker restart retailex_caddy
  else
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
  fi

  ufw allow 80/tcp 2>/dev/null || true
  ufw allow 443/tcp 2>/dev/null || true
  ufw allow 443/udp 2>/dev/null || true
  ufw allow "${EXFINPDKS_WEB_PORT}/tcp" 2>/dev/null || true

  echo "EXFIN PDKS Web: https://${EXFINPDKS_PUBLIC_DOMAIN}"
  echo "Ayrica: http://SUNUCU_IPV4:${EXFINPDKS_WEB_PORT}"
  echo "DNS: A kaydi ${EXFINPDKS_PUBLIC_DOMAIN} -> bu sunucunun genel IPv4."
else
  echo "=== EXFIN PDKS Web (yalnizca host :${EXFINPDKS_WEB_PORT}) ==="
  docker run -d \
    --name exfinpdks_frontend \
    --restart always \
    -p "0.0.0.0:${EXFINPDKS_WEB_PORT}:80" \
    --network "${WEB_NET}" \
    exfinpdks-web:latest
  ufw allow "${EXFINPDKS_WEB_PORT}/tcp" 2>/dev/null || true
  echo "EXFIN PDKS Web: http://SUNUCU_IPV4:${EXFINPDKS_WEB_PORT}"
fi
