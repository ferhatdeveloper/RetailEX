#!/usr/bin/env bash
# VPS / Dokploy — api.retailex.app/guzel PostgREST route'unu açar.
# Compose güncel olmasa da docker run ile ayağa kaldırır + Caddy'ye /guzel ekler.
set -euo pipefail

echo "== Guzel PostgREST bring-up =="

REF_CONTAINER="${REF_CONTAINER:-saas_postgrest_ozbek}"
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

if docker exec saas_postgres psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='guzel'" | grep -q 1; then
  echo "  OK: database guzel"
else
  echo "FATAL: PostgreSQL'de guzel DB yok — önce: node scripts/provision-tenant.mjs --code guzel --display Güzel --module clinic" >&2
  exit 1
fi

echo "== postgrest_guzel =="
docker rm -f saas_postgrest_guzel 2>/dev/null || true
docker run -d \
  --name saas_postgrest_guzel \
  --restart always \
  --network "$NET" \
  -e PGRST_DB_URI="postgres://postgres:${PASS}@${PGHOST_IN_DOCKER}:5432/guzel" \
  -e PGRST_DB_ANON_ROLE=anon \
  -e 'PGRST_DB_SCHEMAS=public,logic,wms,rest,beauty,pos,logistics' \
  -e PGRST_SERVER_HOST=0.0.0.0 \
  -e PGRST_SERVER_PORT=3000 \
  -e PGRST_DB_POOL=4 \
  -e PGRST_DB_POOL_ACQUISITION_TIMEOUT=15 \
  -e PGRST_SERVER_CORS_ALLOWED_ORIGINS='*' \
  -p "${POSTGREST_PORT_GUZEL:-3023}:3000" \
  postgrest/postgrest:v12.2.0

sleep 2
echo "  local probe:"
docker exec saas_postgrest_guzel wget -qO- "http://127.0.0.1:3000/firms?select=firm_nr,name&limit=1" 2>/dev/null | head -c 200 || \
  curl -sS "http://127.0.0.1:3023/firms?select=firm_nr,name&limit=1" | head -c 200
echo

echo "== Caddy /guzel route =="
CANDIDATES=(
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
  echo "UYARI: Caddyfile bulunamadı — gateway restart ile volume'daki dosyayı kullanın."
else
  if ! grep -q 'handle_path /guzel/\*' "$CADDY"; then
    echo "  /guzel route ekleniyor → $CADDY"
    python3 - <<PY
from pathlib import Path
p = Path("$CADDY")
text = p.read_text()
block = '''
    handle /guzel/ws* {
        uri strip_prefix /guzel
        header Access-Control-Allow-Origin "https://retailex.app"
        reverse_proxy sync_guzel:8080
    }
    handle /guzel/sync/* {
        uri strip_prefix /guzel/sync
        header Access-Control-Allow-Origin "https://retailex.app"
        reverse_proxy sync_guzel:8080
    }
    handle_path /guzel/* {
        header Access-Control-Allow-Origin "https://retailex.app"
        reverse_proxy postgrest_guzel:3000 {
            header_down -Access-Control-Allow-Origin
            header_down Access-Control-Allow-Origin "https://retailex.app"
        }
    }
'''
    # Docker DNS: container_name saas_postgrest_guzel — compose adı postgrest_guzel
    if 'handle_path /guzel/*' in text:
        print('already present')
    else:
        needle = '    handle {'
        if needle not in text:
            raise SystemExit('Caddyfile catch-all handle bulunamadı')
        # Prefer docker network alias used by compose service name
        block = block.replace('postgrest_guzel:3000', 'saas_postgrest_guzel:3000')
        text = text.replace(needle, block + '\n' + needle, 1)
        p.write_text(text)
        print('inserted')
PY
  else
    echo "  Caddyfile zaten /guzel içeriyor: $CADDY"
  fi
fi

echo "== gateway restart =="
docker restart retailex_api_gateway >/dev/null
sleep 3
curl -sS -o /dev/null -w "https://api.retailex.app/guzel/ → %{http_code}\n" "https://api.retailex.app/guzel/" || true
curl -sS "https://api.retailex.app/guzel/firms?select=firm_nr,name,enabled_modules&limit=2" -H "Accept: application/json" | head -c 400 || true
echo
echo "Tamam. Giriş: server kodu guzel / mudur / admin"
