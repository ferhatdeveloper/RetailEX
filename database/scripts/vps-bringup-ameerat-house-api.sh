#!/usr/bin/env bash
# VPS / Dokploy — api.retailex.app/ameerat_house PostgREST yolunu açar.
# guzel ile aynı kalıp: docker run + Caddy handle_path. guzel konteynerine dokunmaz.
set -euo pipefail

echo "== Ameerat House PostgREST bring-up =="

REF_CONTAINER="${REF_CONTAINER:-saas_postgrest_guzel}"
if ! docker inspect "$REF_CONTAINER" >/dev/null 2>&1; then
  REF_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'saas_postgrest_' | head -1 || true)
fi
if [[ -z "${REF_CONTAINER}" ]]; then
  echo "FATAL: referans postgrest container yok." >&2
  exit 1
fi

NET=$(docker inspect "$REF_CONTAINER" --format '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' | head -1)
URI=$(docker inspect "$REF_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^PGRST_DB_URI=//p' | head -1)
PASS=$(printf '%s' "$URI" | sed -n 's|^postgres://[^:]*:\([^@]*\)@.*|\1|p')
PGHOST_IN_DOCKER=$(printf '%s' "$URI" | sed -n 's|^postgres://[^@]*@\([^:/]*\).*|\1|p')
PGHOST_IN_DOCKER="${PGHOST_IN_DOCKER:-postgres}"

if [[ -z "${PASS}" ]]; then
  echo "FATAL: PGRST_DB_URI içinden parola okunamadı ($REF_CONTAINER)." >&2
  exit 1
fi

echo "  ref=$REF_CONTAINER net=$NET pghost=$PGHOST_IN_DOCKER"

if docker exec saas_postgres psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='ameerat_house'" | grep -q 1; then
  echo "  OK: database ameerat_house"
else
  echo "FATAL: PostgreSQL'de ameerat_house DB yok." >&2
  exit 1
fi

echo "== postgrest_ameerat_house =="
docker rm -f saas_postgrest_ameerat_house 2>/dev/null || true
docker run -d \
  --name saas_postgrest_ameerat_house \
  --restart always \
  --network "$NET" \
  --network-alias postgrest_ameerat_house \
  -e PGRST_DB_URI="postgres://postgres:${PASS}@${PGHOST_IN_DOCKER}:5432/ameerat_house" \
  -e PGRST_DB_ANON_ROLE=anon \
  -e 'PGRST_DB_SCHEMAS=public,logic,wms,rest,beauty,pos,logistics' \
  -e PGRST_SERVER_HOST=0.0.0.0 \
  -e PGRST_SERVER_PORT=3000 \
  -e PGRST_DB_POOL=4 \
  -e PGRST_DB_POOL_ACQUISITION_TIMEOUT=15 \
  -e PGRST_SERVER_CORS_ALLOWED_ORIGINS='*' \
  -p "${POSTGREST_PORT_AMEERAT_HOUSE:-3024}:3000" \
  postgrest/postgrest:v12.2.0

sleep 2
echo "  local probe:"
docker exec saas_postgrest_ameerat_house wget -qO- "http://127.0.0.1:3000/system_settings?select=id&id=eq.1&limit=1" 2>/dev/null | head -c 200 || \
  curl -sS "http://127.0.0.1:${POSTGREST_PORT_AMEERAT_HOUSE:-3024}/system_settings?select=id&id=eq.1&limit=1" | head -c 200
echo

echo "== Caddy /ameerat_house route =="
CANDIDATES=(
  "/etc/dokploy/compose/app-retailex-hfdrtt/code/database/docker/Caddyfile.api-gateway"
  "/opt/berqenas-cloud/projects/retailex/database/docker/Caddyfile.api-gateway"
  "/etc/caddy/Caddyfile"
)
CADDY=""
for f in "${CANDIDATES[@]}"; do
  if [[ -f "$f" ]]; then CADDY="$f"; break; fi
done
if [[ -z "$CADDY" ]]; then
  MOUNT=$(docker inspect retailex_api_gateway --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)
  if [[ -n "$MOUNT" && -f "$MOUNT" ]]; then CADDY="$MOUNT"; fi
fi

if [[ -z "$CADDY" ]]; then
  echo "UYARI: Caddyfile bulunamadı." >&2
  exit 1
fi

if ! grep -q 'handle_path /ameerat_house/\*' "$CADDY"; then
  echo "  /ameerat_house route ekleniyor → $CADDY"
  python3 - <<PY
from pathlib import Path
p = Path("$CADDY")
text = p.read_text()
block = '''
    handle /ameerat_house/ws* {
        uri strip_prefix /ameerat_house
        header Access-Control-Allow-Origin "https://retailex.app"
        reverse_proxy sync_ameerat_house:8080
    }
    handle /ameerat_house/sync/* {
        uri strip_prefix /ameerat_house/sync
        header Access-Control-Allow-Origin "https://retailex.app"
        reverse_proxy sync_ameerat_house:8080
    }
    handle_path /ameerat_house/* {
        header Access-Control-Allow-Origin "https://retailex.app"
        reverse_proxy saas_postgrest_ameerat_house:3000 {
            header_down -Access-Control-Allow-Origin
            header_down Access-Control-Allow-Origin "https://retailex.app"
        }
    }
'''
needle = '    handle {'
if 'handle_path /ameerat_house/*' in text:
    print('already present')
elif needle not in text:
    raise SystemExit('Caddyfile catch-all handle bulunamadı')
else:
    text = text.replace(needle, block + "\n" + needle, 1)
    p.write_text(text)
    print('inserted')
PY
else
  echo "  Caddyfile zaten /ameerat_house içeriyor: $CADDY"
fi

echo "== gateway reload =="
if docker exec retailex_api_gateway caddy reload --config /etc/caddy/Caddyfile; then
  echo "  caddy reload OK"
else
  echo "  reload olmadı, gateway yeniden başlatılıyor"
  docker restart retailex_api_gateway >/dev/null
fi
sleep 2
curl -sS -o /dev/null -w "https://api.retailex.app/ameerat_house/ → %{http_code}\n" "https://api.retailex.app/ameerat_house/" || true
curl -sS "https://api.retailex.app/ameerat_house/system_settings?select=id&id=eq.1&limit=1" -H "Accept: application/json" | head -c 200 || true
echo
echo "Tamam. Menü tercihi: POST/PATCH /ameerat_house/system_settings"
