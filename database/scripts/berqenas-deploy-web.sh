#!/usr/bin/env bash
# RetailEX web arayüzünü GitHub'dan klonlayıp Dockerfile.frontend ile yayınlar.
# Ön koşul: saas_postgres çalışıyor olmalı (Docker ağı adı alınır).
#
# Ortam:
#   RETAILEX_GIT_URL   — zorunlu (https://github.com/kullanici/RetailEX.git)
#   RETAILEX_GIT_BRANCH — varsayılan: main
#   INSTALL_DIR        — varsayılan: /opt/berqenas-cloud
#   RETAILEX_WEB_PORT  — varsayılan: 8080
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
docker run -d \
  --name retailex_frontend \
  --restart always \
  -p "0.0.0.0:${RETAILEX_WEB_PORT}:80" \
  --network "${WEB_NET}" \
  retailex-web:latest

ufw allow "${RETAILEX_WEB_PORT}/tcp" 2>/dev/null || true

echo "RetailEX Web: http://$(hostname -f 2>/dev/null || echo SUNUCU):${RETAILEX_WEB_PORT} (alan adi DNS ile eslesmeli)"
