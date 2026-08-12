#!/usr/bin/env bash
# Caddyfile'a api.<ana_domain> bloğu ekler/günceller:
# kök JSON sağlık + kiracı başına /{code}/* → ilgili PostgREST (merkez, aqua, retail, pdks, …).
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
POSTGREST_UPSTREAM_SITI="${POSTGREST_UPSTREAM_SITI:-saas_postgrest_siti_pdks:3000}"
POSTGREST_UPSTREAM_PDKS_DEMO="${POSTGREST_UPSTREAM_PDKS_DEMO:-saas_postgrest_pdks_demo:3000}"
POSTGREST_UPSTREAM_RETAILEX_DEMO="${POSTGREST_UPSTREAM_RETAILEX_DEMO:-saas_postgrest_retailex_demo:3000}"
POSTGREST_UPSTREAM_BERZIN_COM="${POSTGREST_UPSTREAM_BERZIN_COM:-saas_postgrest_berzin_com:3000}"
POSTGREST_UPSTREAM_KASAP="${POSTGREST_UPSTREAM_KASAP:-saas_postgrest_kasap:3000}"
POSTGREST_UPSTREAM_TESTERE="${POSTGREST_UPSTREAM_TESTERE:-saas_postgrest_testere:3000}"
POSTGREST_UPSTREAM_METTU="${POSTGREST_UPSTREAM_METTU:-saas_postgrest_mettu:3000}"
POSTGREST_UPSTREAM_CANON="${POSTGREST_UPSTREAM_CANON:-saas_postgrest_canon:3000}"
POSTGREST_UPSTREAM_LOVAN="${POSTGREST_UPSTREAM_LOVAN:-saas_postgrest_lovan:3000}"
POSTGREST_UPSTREAM_ZETEM="${POSTGREST_UPSTREAM_ZETEM:-saas_postgrest_zetem:3000}"
POSTGREST_UPSTREAM_FERHAT="${POSTGREST_UPSTREAM_FERHAT:-saas_postgrest_ferhat:3000}"
POSTGREST_UPSTREAM_OZBEK="${POSTGREST_UPSTREAM_OZBEK:-saas_postgrest_ozbek:3000}"
SAAS_SYNC_UPSTREAM="${SAAS_SYNC_UPSTREAM:-saas_sync_hub:8080}"
SAAS_SYNC_UPSTREAM_ZETEM="${SAAS_SYNC_UPSTREAM_ZETEM:-saas_sync_zetem:8080}"
SAAS_SYNC_UPSTREAM_FERHAT="${SAAS_SYNC_UPSTREAM_FERHAT:-saas_sync_ferhat:8080}"
SAAS_SYNC_UPSTREAM_OZBEK="${SAAS_SYNC_UPSTREAM_OZBEK:-saas_sync_ozbek:8080}"
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

# handle_path /x/* bazen /x ve /x/ kok isteklerini kacirir; PostgREST /firms vb. icin /x* + strip_prefix kullan.
emit_postgrest_handle_path() {
  local _path="$1"
  local _up="$2"
  echo "    handle /${_path}* {"
  echo "        uri strip_prefix /${_path}"
  echo "        header Access-Control-Allow-Methods \"${_allow_methods}\""
  echo "        header Access-Control-Allow-Headers \"${_allow_headers}\""
  echo "        reverse_proxy ${_up}"
  echo "    }"
}

# Kiracı WebSocket + REST senkron (RetailEX-Sync-Service) — PostgREST'ten önce (daha özel yol)
emit_sync_handle_path() {
  local _path="$1"
  local _sync_up="${2:-saas_sync_hub:8080}"
  echo "    handle /${_path}/ws* {"
  echo "        uri strip_prefix /${_path}"
  echo "        reverse_proxy ${_sync_up}"
  echo "    }"
  echo "    handle /${_path}/sync/* {"
  echo "        uri strip_prefix /${_path}/sync"
  echo "        reverse_proxy ${_sync_up}"
  echo "    }"
}

{
  echo ""
  echo "${MERKEZ_API_PUBLIC_DOMAIN} {"
  echo "    encode gzip"
  echo "    route {"
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
  emit_postgrest_handle_path "merkez" "${POSTGREST_UPSTREAM_MERKEZ}"
  emit_sync_handle_path "aqua" "${SAAS_SYNC_UPSTREAM}"
  emit_postgrest_handle_path "aqua" "${POSTGREST_UPSTREAM_AQUA}"
  emit_sync_handle_path "siti_pdks" "${SAAS_SYNC_UPSTREAM}"
  emit_postgrest_handle_path "siti_pdks" "${POSTGREST_UPSTREAM_SITI}"
  emit_sync_handle_path "pdks_demo" "${SAAS_SYNC_UPSTREAM}"
  emit_postgrest_handle_path "pdks_demo" "${POSTGREST_UPSTREAM_PDKS_DEMO}"
  emit_sync_handle_path "retailex_demo" "${SAAS_SYNC_UPSTREAM}"
  emit_postgrest_handle_path "retailex_demo" "${POSTGREST_UPSTREAM_RETAILEX_DEMO}"
  emit_sync_handle_path "berzin_com" "${SAAS_SYNC_UPSTREAM}"
  emit_postgrest_handle_path "berzin_com" "${POSTGREST_UPSTREAM_BERZIN_COM}"
  emit_sync_handle_path "kasap" "${SAAS_SYNC_UPSTREAM}"
  emit_postgrest_handle_path "kasap" "${POSTGREST_UPSTREAM_KASAP}"
  emit_sync_handle_path "testere" "${SAAS_SYNC_UPSTREAM}"
  emit_postgrest_handle_path "testere" "${POSTGREST_UPSTREAM_TESTERE}"
  emit_sync_handle_path "mettu" "${SAAS_SYNC_UPSTREAM}"
  emit_postgrest_handle_path "mettu" "${POSTGREST_UPSTREAM_METTU}"
  emit_sync_handle_path "canon" "${SAAS_SYNC_UPSTREAM}"
  emit_postgrest_handle_path "canon" "${POSTGREST_UPSTREAM_CANON}"
  emit_sync_handle_path "lovan" "${SAAS_SYNC_UPSTREAM}"
  emit_postgrest_handle_path "lovan" "${POSTGREST_UPSTREAM_LOVAN}"
  emit_sync_handle_path "zetem" "${SAAS_SYNC_UPSTREAM_ZETEM}"
  emit_postgrest_handle_path "zetem" "${POSTGREST_UPSTREAM_ZETEM}"
  emit_sync_handle_path "ferhat" "${SAAS_SYNC_UPSTREAM_FERHAT}"
  emit_postgrest_handle_path "ferhat" "${POSTGREST_UPSTREAM_FERHAT}"
  emit_sync_handle_path "ozbek" "${SAAS_SYNC_UPSTREAM_OZBEK}"
  emit_postgrest_handle_path "ozbek" "${POSTGREST_UPSTREAM_OZBEK}"
  echo "    handle {"
  echo "        header Content-Type \"application/json; charset=utf-8\""
  echo "        header Access-Control-Allow-Methods \"${_allow_methods}\""
  echo "        header Access-Control-Allow-Headers \"${_allow_headers}\""
  echo '        respond "{\"ok\":false,\"error\":\"not_found\"}" 404'
  echo "    }"
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
