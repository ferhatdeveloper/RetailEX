#!/usr/bin/env bash
# Caddyfile'a api.<ana_domain> bloğu ekler/günceller:
# kök JSON sağlık + /merkez, /aqua PostgREST path'leri.
# Idempotent: aynı domain için eski blokları temizleyip tek blok yazar.
#
# Ortam:
#   INSTALL_DIR              — varsayılan /opt/berqenas-cloud
#   MERKEZ_API_PUBLIC_DOMAIN — örn. api.retailex.app (boşsa hiçbir şey yapmaz)
#   POSTGREST_UPSTREAM_MERKEZ — varsayılan saas_postgrest_merkez:3000
#   POSTGREST_UPSTREAM_AQUA   — varsayılan saas_postgrest_aqua_beauty:3000
#   MERKEZ_API_ALLOWED_ORIGINS — CORS izinli origin listesi (virgülle)
#                                varsayılan: https://retailex.app,https://ilsa.berqenas.cloud
#
# Caddy ayakta ise reload dener.
#
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/berqenas-cloud}"
MERKEZ_API_PUBLIC_DOMAIN="${MERKEZ_API_PUBLIC_DOMAIN:-}"
POSTGREST_UPSTREAM_MERKEZ="${POSTGREST_UPSTREAM_MERKEZ:-saas_postgrest_merkez:3000}"
POSTGREST_UPSTREAM_AQUA="${POSTGREST_UPSTREAM_AQUA:-saas_postgrest_aqua_beauty:3000}"
MERKEZ_API_ALLOWED_ORIGINS="${MERKEZ_API_ALLOWED_ORIGINS:-https://retailex.app,https://ilsa.berqenas.cloud}"

if [[ -z "${MERKEZ_API_PUBLIC_DOMAIN}" ]]; then
  echo "berqenas-caddy-merge-merkez-api: MERKEZ_API_PUBLIC_DOMAIN bos — atlandi."
  exit 0
fi

mkdir -p "${INSTALL_DIR}/caddy"
CADDYFILE="${INSTALL_DIR}/caddy/Caddyfile"
touch "$CADDYFILE"

# Eski hatali satirlari temizle (yanlis respond subdirective kalintilari)
sed -i '/content_type application\/json/d' "$CADDYFILE" || true

_tmp="${CADDYFILE}.tmp.$$"
# Ayni domain icin eski bloklarin tumunu temizle.
awk -v dom="${MERKEZ_API_PUBLIC_DOMAIN}" '
BEGIN { in_block=0; depth=0 }
{
  line=$0
  if (!in_block) {
    if (line ~ "^[[:space:]]*" dom "[[:space:]]*\\{[[:space:]]*$") {
      in_block=1
      depth=1
      next
    }
    print line
    next
  }

  opens=gsub(/\{/, "{", line)
  closes=gsub(/\}/, "}", line)
  depth += opens - closes
  if (depth <= 0) {
    in_block=0
  }
  next
}
' "$CADDYFILE" >"$_tmp"
mv "$_tmp" "$CADDYFILE"

IFS=',' read -r -a _allowed_origins <<<"${MERKEZ_API_ALLOWED_ORIGINS}"
_allow_methods="GET,POST,PUT,PATCH,DELETE,OPTIONS"
_allow_headers="Authorization,Content-Type,apikey,Prefer,Accept,Origin,Content-Profile,Accept-Profile"

{
  echo ""
  echo "${MERKEZ_API_PUBLIC_DOMAIN} {"
  echo "    encode gzip"
  echo "    @preflight method OPTIONS"
  for _origin in "${_allowed_origins[@]}"; do
    _origin="$(echo "${_origin}" | xargs)"
    [[ -z "${_origin}" ]] && continue
    _safe_id="$(echo "${_origin}" | tr -cd '[:alnum:]' | tr '[:upper:]' '[:lower:]')"
    echo "    @origin_${_safe_id} header Origin \"${_origin}\""
    echo "    header @origin_${_safe_id} Access-Control-Allow-Origin \"${_origin}\""
    echo "    @preflight_${_safe_id} {"
    echo "        method OPTIONS"
    echo "        header Origin \"${_origin}\""
    echo "    }"
    echo "    header @preflight_${_safe_id} Access-Control-Allow-Origin \"${_origin}\""
  done
  echo "    header @preflight Access-Control-Allow-Methods \"${_allow_methods}\""
  echo "    header @preflight Access-Control-Allow-Headers \"${_allow_headers}\""
  echo "    header @preflight Access-Control-Max-Age \"86400\""
  echo "    header Vary \"Origin\""
  echo "    handle @preflight {"
  echo "        respond 204"
  echo "    }"
  echo "    @health path / /health /status"
  echo "    handle @health {"
  echo "        header Content-Type \"application/json; charset=utf-8\""
  echo "        header Access-Control-Allow-Methods \"${_allow_methods}\""
  echo "        header Access-Control-Allow-Headers \"${_allow_headers}\""
  echo '        respond "{\"ok\":true,\"service\":\"retailex-api\"}" 200'
  echo "    }"
  echo "    handle_path /merkez/* {"
  echo "        header Access-Control-Allow-Methods \"${_allow_methods}\""
  echo "        header Access-Control-Allow-Headers \"${_allow_headers}\""
  echo "        reverse_proxy ${POSTGREST_UPSTREAM_MERKEZ}"
  echo "    }"
  echo "    handle_path /aqua/* {"
  echo "        header Access-Control-Allow-Methods \"${_allow_methods}\""
  echo "        header Access-Control-Allow-Headers \"${_allow_headers}\""
  echo "        reverse_proxy ${POSTGREST_UPSTREAM_AQUA}"
  echo "    }"
  echo "    handle {"
  echo "        header Content-Type \"application/json; charset=utf-8\""
  echo "        header Access-Control-Allow-Methods \"${_allow_methods}\""
  echo "        header Access-Control-Allow-Headers \"${_allow_headers}\""
  echo '        respond "{\"ok\":false,\"error\":\"not_found\"}" 404'
  echo "    }"
  echo "}"
} >>"$CADDYFILE"
echo "Caddyfile'da '${MERKEZ_API_PUBLIC_DOMAIN}' blogu guncellendi (tekil)."

if docker ps -q -f name=retailex_caddy | grep -q .; then
  if docker exec retailex_caddy caddy validate --config /etc/caddy/Caddyfile 2>/dev/null; then
    docker exec retailex_caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || docker restart retailex_caddy
    echo "Caddy yenilendi (reload veya restart)."
  else
    echo "Uyari: caddy validate basarisiz; mevcut calisan Caddy korunuyor (restart yok)."
  fi
else
  echo "Not: retailex_caddy calismiyor — DNS sonrasi berqenas-deploy-web veya manuel caddy baslatin."
fi
