#!/usr/bin/env bash
# RetailEX web arayüzünü GitHub'dan klonlayıp Dockerfile.frontend ile yayınlar.
# Ön koşul: saas_postgres çalışıyor olmalı (Docker ağı adı alınır).
#
# Ortam:
#   RETAILEX_GIT_URL   — varsayılan: https://github.com/ferhatdeveloper/RetailEX.git
#   RETAILEX_GIT_BRANCH — varsayılan: main
#   INSTALL_DIR        — varsayılan: /opt/berqenas-cloud
#   RETAILEX_WEB_PORT  — varsayılan 8080. Alan adı (Caddy) açıkken de aynı port hostta acilir: http://GENEL_IP:8080
#   RETAILEX_PUBLIC_DOMAIN — bos: sadece :RETAILEX_WEB_PORT. Dolu: Caddy 80/443 + HTTPS (varsayılan
#                            betik tek basina calistirilirken: retailex.app). Tamamen kapatmak icin
#                            once export RETAILEX_PUBLIC_DOMAIN=
#   SKIP_MERKEZ_API=1      — api.<domain> Caddy blogu ve VITE_MERKEZ_REST_URL build arg atlanir
#   MERKEZ_API_PUBLIC_DOMAIN — varsayılan: api.${RETAILEX_PUBLIC_DOMAIN} (ör. api.retailex.app)
#   VITE_MERKEZ_REST_URL   — doluysa MERKEZ_API_PUBLIC_DOMAIN yerine dogrudan build arg olarak kullanilir
#   SKIP_BRIDGE=1          — retailex_bridge konteyneri baslatilmaz (nginx /api 502 verir; sadece test)
#
#   sudo RETAILEX_GIT_URL=https://github.com/org/RetailEX.git bash berqenas-deploy-web.sh

set -euo pipefail

# BuildKit ancak docker-buildx-plugin kuruluysa (aksi halde: "buildx component is missing")
if docker buildx version >/dev/null 2>&1; then
  export DOCKER_BUILDKIT=1
else
  export DOCKER_BUILDKIT=0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RETAILEX_GIT_URL="${RETAILEX_GIT_URL:-https://github.com/ferhatdeveloper/RetailEX.git}"

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

VITE_BUILD_ARG=(--build-arg "VITE_BRIDGE_URL=")
if [[ -n "${RETAILEX_PUBLIC_DOMAIN}" ]] && [[ "${SKIP_MERKEZ_API:-0}" != "1" ]]; then
  _api_dom="${MERKEZ_API_PUBLIC_DOMAIN:-api.${RETAILEX_PUBLIC_DOMAIN}}"
  _vite="${VITE_MERKEZ_REST_URL:-https://${_api_dom}/merkez}"
  VITE_BUILD_ARG+=(--build-arg "VITE_MERKEZ_REST_URL=${_vite}")
  echo "Docker build: VITE_MERKEZ_REST_URL=${_vite}"
fi

docker build -f Dockerfile.frontend "${VITE_BUILD_ARG[@]}" -t retailex-web:latest .

if [[ -f "${TARGET}/Dockerfile.bridge" ]] && [[ "${SKIP_BRIDGE:-0}" != "1" ]]; then
  echo "=== pg_bridge imaji (retailex-bridge) ==="
  docker build -f Dockerfile.bridge -t retailex-bridge:latest "${TARGET}"
fi

WEB_NET=$(docker inspect saas_postgres --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | awk '{print $1}')
if [[ -z "${WEB_NET:-}" ]]; then
  echo "Hata: saas_postgres bulunamadi veya ag adi okunamadi." >&2
  exit 1
fi

docker rm -f retailex_frontend retailex_bridge 2>/dev/null || true

if [[ -f "${TARGET}/Dockerfile.bridge" ]] && [[ "${SKIP_BRIDGE:-0}" != "1" ]]; then
  echo "=== pg_bridge konteyneri: retailex_bridge ==="
  docker run -d \
    --name retailex_bridge \
    --restart always \
    --network "${WEB_NET}" \
    retailex-bridge:latest
  sleep 2
fi

if [[ -n "${RETAILEX_PUBLIC_DOMAIN}" ]]; then
  echo "=== RetailEX Web (Caddy https://${RETAILEX_PUBLIC_DOMAIN} + http://GENEL_IP:${RETAILEX_WEB_PORT}) ==="
  docker run -d \
    --name retailex_frontend \
    --restart always \
    -p "0.0.0.0:${RETAILEX_WEB_PORT}:80" \
    --network "${WEB_NET}" \
    retailex-web:latest

  mkdir -p "${INSTALL_DIR}/caddy"
  CADDYFILE="${INSTALL_DIR}/caddy/Caddyfile"
  [[ -f "$CADDYFILE" ]] || touch "$CADDYFILE"
  # Uzerine yazma: exfinpdks.com vb. diger site bloklari korunur
  if ! grep -qF "${RETAILEX_PUBLIC_DOMAIN} {" "$CADDYFILE" 2>/dev/null; then
    {
      echo ""
      echo "${RETAILEX_PUBLIC_DOMAIN} {"
      echo "  encode gzip zstd"
      echo "  reverse_proxy retailex_frontend:80"
      echo "}"
    } >>"$CADDYFILE"
  fi

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

  if [[ "${SKIP_MERKEZ_API:-0}" != "1" ]]; then
    export INSTALL_DIR MERKEZ_API_PUBLIC_DOMAIN="${MERKEZ_API_PUBLIC_DOMAIN:-api.${RETAILEX_PUBLIC_DOMAIN}}"
    if [[ -f "${SCRIPT_DIR}/berqenas-caddy-merge-merkez-api.sh" ]]; then
      bash "${SCRIPT_DIR}/berqenas-caddy-merge-merkez-api.sh" || echo "Uyari: api subdomain Caddy birlestirme basarisiz."
    fi
    _api="${MERKEZ_API_PUBLIC_DOMAIN}"
    if docker ps -q -f name=saas_postgres | grep -q .; then
      docker exec -i saas_postgres psql -U postgres -d merkez_db -c \
        "UPDATE tenant_registry SET connection_provider='rest_api', rest_base_url='https://${_api}/aqua', updated_at=now() WHERE code='aqua_beauty';" \
        2>/dev/null || true
    fi
    echo "Merkez API (Caddy): https://${_api}/ — ornek PostgREST: https://${_api}/merkez/tenant_registry?select=code"
    echo "DNS: A kaydi ${_api} -> bu sunucunun genel IPv4 (Let's Encrypt icin)."
  fi

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
