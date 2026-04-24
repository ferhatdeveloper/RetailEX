#!/usr/bin/env bash
# Caddyfile'a api.<ana_domain> bloğu ekler: kök JSON sağlık + /merkez, /aqua PostgREST path'leri.
# Idempotent: aynı site adı zaten varsa atlar.
#
# Ortam:
#   INSTALL_DIR              — varsayılan /opt/berqenas-cloud
#   MERKEZ_API_PUBLIC_DOMAIN — örn. api.retailex.app (boşsa hiçbir şey yapmaz)
#   POSTGREST_UPSTREAM_MERKEZ — varsayılan saas_postgrest_merkez:3000
#   POSTGREST_UPSTREAM_AQUA   — varsayılan saas_postgrest_aqua_beauty:3000
#
# Caddy ayakta ise reload dener.
#
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/berqenas-cloud}"
MERKEZ_API_PUBLIC_DOMAIN="${MERKEZ_API_PUBLIC_DOMAIN:-}"
POSTGREST_UPSTREAM_MERKEZ="${POSTGREST_UPSTREAM_MERKEZ:-saas_postgrest_merkez:3000}"
POSTGREST_UPSTREAM_AQUA="${POSTGREST_UPSTREAM_AQUA:-saas_postgrest_aqua_beauty:3000}"

if [[ -z "${MERKEZ_API_PUBLIC_DOMAIN}" ]]; then
  echo "berqenas-caddy-merge-merkez-api: MERKEZ_API_PUBLIC_DOMAIN bos — atlandi."
  exit 0
fi

mkdir -p "${INSTALL_DIR}/caddy"
CADDYFILE="${INSTALL_DIR}/caddy/Caddyfile"
touch "$CADDYFILE"

if grep -qF "${MERKEZ_API_PUBLIC_DOMAIN} {" "$CADDYFILE" 2>/dev/null; then
  echo "Caddyfile zaten '${MERKEZ_API_PUBLIC_DOMAIN}' iceriyor."
else
  {
    echo ""
    echo "${MERKEZ_API_PUBLIC_DOMAIN} {"
    echo "    encode gzip"
    echo "    @health path / /health /status"
    echo "    handle @health {"
    echo "        header Content-Type \"application/json; charset=utf-8\""
    echo '        respond `{"ok":true,"service":"retailex-api"}` 200'
    echo "    }"
    echo "    handle_path /merkez/* {"
    echo "        reverse_proxy ${POSTGREST_UPSTREAM_MERKEZ}"
    echo "    }"
    echo "    handle_path /aqua/* {"
    echo "        reverse_proxy ${POSTGREST_UPSTREAM_AQUA}"
    echo "    }"
    echo "    handle {"
    echo "        header Content-Type \"application/json; charset=utf-8\""
    echo '        respond `{"ok":false,"error":"not_found"}` 404'
    echo "    }"
    echo "}"
  } >>"$CADDYFILE"
  echo "Caddyfile'a '${MERKEZ_API_PUBLIC_DOMAIN}' blogu eklendi."
fi

if docker ps -q -f name=retailex_caddy | grep -q .; then
  if docker exec retailex_caddy caddy validate --config /etc/caddy/Caddyfile 2>/dev/null; then
    docker exec retailex_caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || docker restart retailex_caddy
    echo "Caddy yenilendi (reload veya restart)."
  else
    echo "Uyari: caddy validate basarisiz; retailex_caddy yeniden baslatiliyor."
    docker restart retailex_caddy || true
  fi
else
  echo "Not: retailex_caddy calismiyor — DNS sonrasi berqenas-deploy-web veya manuel caddy baslatin."
fi
