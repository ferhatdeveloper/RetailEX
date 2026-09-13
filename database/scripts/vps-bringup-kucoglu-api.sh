#!/usr/bin/env bash
# VPS / Dokploy terminalinde çalıştırın — api.retailex.app/kucoglu PostgREST route'unu açar.
# Compose dosyası güncel olmasa da docker run ile ayağa kaldırır + Caddy'ye /kucoglu ekler.
#
# Kullanım (Dokploy → ilgili stack → Terminal / VPS SSH):
#   bash /path/to/vps-bringup-kucoglu-api.sh
# veya bu dosyanın içeriğini yapıştırın.
set -euo pipefail

echo "== Kuçoglu PostgREST bring-up =="

# Mevcut bir postgrest örneğinden network + DB parolasını al
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
# postgres://postgres:PASS@host:5432/db
PASS=$(printf '%s' "$URI" | sed -n 's|^postgres://[^:]*:\([^@]*\)@.*|\1|p')
PGHOST_IN_DOCKER=$(printf '%s' "$URI" | sed -n 's|^postgres://[^@]*@\([^:/]*\).*|\1|p')
PGHOST_IN_DOCKER="${PGHOST_IN_DOCKER:-postgres}"

if [[ -z "${PASS}" ]]; then
  echo "FATAL: PGRST_DB_URI içinden parola okunamadı ($REF_CONTAINER)." >&2
  exit 1
fi

echo "  ref=$REF_CONTAINER net=$NET pghost=$PGHOST_IN_DOCKER"

# DB var mı?
if docker exec saas_postgres psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='kucoglu'" | grep -q 1; then
  echo "  OK: database kucoglu"
else
  echo "FATAL: PostgreSQL'de kucoglu DB yok — önce provision-kucoglu-restaurant.sh" >&2
  exit 1
fi

echo "== postgrest_kucoglu =="
docker rm -f saas_postgrest_kucoglu 2>/dev/null || true
docker run -d \
  --name saas_postgrest_kucoglu \
  --restart always \
  --network "$NET" \
  -e PGRST_DB_URI="postgres://postgres:${PASS}@${PGHOST_IN_DOCKER}:5432/kucoglu" \
  -e PGRST_DB_ANON_ROLE=anon \
  -e 'PGRST_DB_SCHEMAS=public,logic,wms,rest,beauty,pos,logistics' \
  -e PGRST_SERVER_HOST=0.0.0.0 \
  -e PGRST_SERVER_PORT=3000 \
  -e PGRST_DB_POOL=4 \
  -e PGRST_DB_POOL_ACQUISITION_TIMEOUT=15 \
  -e PGRST_SERVER_CORS_ALLOWED_ORIGINS='*' \
  -p "${POSTGREST_PORT_KUCOGLU:-3022}:3000" \
  postgrest/postgrest:v12.2.0

sleep 2
echo "  local probe:"
docker exec saas_postgrest_kucoglu wget -qO- "http://127.0.0.1:3000/rex_001_products?select=code&limit=1" 2>/dev/null | head -c 200 || \
  curl -sS "http://127.0.0.1:3022/rex_001_products?select=code&limit=1" | head -c 200
echo

echo "== Caddy /kucoglu route =="
# Caddyfile konumlarını dene
CANDIDATES=(
  "/opt/berqenas-cloud/projects/retailex/database/docker/Caddyfile.api-gateway"
  "/etc/caddy/Caddyfile"
)
CADDY=""
for f in "${CANDIDATES[@]}"; do
  if [[ -f "$f" ]]; then CADDY="$f"; break; fi
done
# Container mount üzerinden bul
if [[ -z "$CADDY" ]]; then
  MOUNT=$(docker inspect retailex_api_gateway --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)
  if [[ -n "$MOUNT" && -f "$MOUNT" ]]; then CADDY="$MOUNT"; fi
fi

if [[ -z "$CADDY" ]]; then
  echo "UYARI: Caddyfile bulunamadı — sadece postgrest ayağa kalktı (host :3022)."
  echo "Manuel: api_gateway Caddyfile'a /kucoglu handle_path ekleyip recreate edin."
else
  if grep -q 'handle_path /kucoglu/\*' "$CADDY"; then
    echo "  Caddyfile zaten /kucoglu içeriyor: $CADDY"
  else
    # ozbek bloğundan sonra ekle (yoksa handle { 404 } öncesine)
    python3 - "$CADDY" <<'PY'
import sys
path = sys.argv[1]
text = open(path, encoding='utf-8').read()
block = '''
    handle /kucoglu/ws* {
        uri strip_prefix /kucoglu
        header Access-Control-Allow-Origin "https://retailex.app"
        reverse_proxy sync_kucoglu:8080
    }
    handle /kucoglu/sync/* {
        uri strip_prefix /kucoglu/sync
        header Access-Control-Allow-Origin "https://retailex.app"
        reverse_proxy sync_kucoglu:8080
    }
    handle_path /kucoglu/* {
        header Access-Control-Allow-Origin "https://retailex.app"
        reverse_proxy postgrest_kucoglu:3000 {
            header_down -Access-Control-Allow-Origin
            header_down Access-Control-Allow-Origin "https://retailex.app"
        }
    }
'''
    # sync olmayabilir — sadece postgrest yeterli; sync satırları 502 verebilir.
    # Sade blok:
    block = '''
    handle_path /kucoglu/* {
        header Access-Control-Allow-Origin "https://retailex.app"
        reverse_proxy saas_postgrest_kucoglu:3000 {
            header_down -Access-Control-Allow-Origin
            header_down Access-Control-Allow-Origin "https://retailex.app"
        }
    }
'''
    # Docker DNS: container_name saas_postgrest_kucoglu
    marker = '    handle {\n        header Content-Type "application/json; charset=utf-8"\n        respond "{\\"ok\\":false,\\"error\\":\\"not_found\\"}" 404\n    }'
    if 'handle_path /kucoglu/*' in text:
        print('already present')
    elif marker in text:
        text = text.replace(marker, block + '\n' + marker)
        open(path, 'w', encoding='utf-8').write(text)
        print('patched', path)
    else:
        # fallback: before last closing brace of site block
        idx = text.rfind('\n}')
        if idx == -1:
            raise SystemExit('cannot find insertion point')
        text = text[:idx] + '\n' + block + text[idx:]
        open(path, 'w', encoding='utf-8').write(text)
        print('patched-fallback', path)
PY
  fi
  # Caddy container adını bul ve reload
  GW=$(docker ps --format '{{.Names}}' | grep -E 'retailex_api_gateway|api_gateway|caddy' | head -1 || true)
  if [[ -n "$GW" ]]; then
    docker exec "$GW" caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || \
      docker restart "$GW" || true
    echo "  gateway reloaded/restarted: $GW"
  fi
fi

echo "== Dış test =="
sleep 2
curl -sS -o /dev/null -w "https://api.retailex.app/kucoglu/ → %{http_code}\n" "https://api.retailex.app/kucoglu/" || true
curl -sS "https://api.retailex.app/kucoglu/rex_001_products?select=code,name,image_url&limit=2" -H "Accept: application/json" | head -c 400 || true
echo
echo "Tamam. RetailEX login: kiracı kucoglu / mudur / admin"
