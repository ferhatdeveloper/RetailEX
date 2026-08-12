#!/usr/bin/env bash
# Sadece WhatsApp köprüsü — frontend yeniden build etmez (hızlı düzeltme)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

WEB_NET=$(docker inspect saas_postgres --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | awk '{print $1}')
if [[ -z "${WEB_NET:-}" ]]; then
  echo "HATA: saas_postgres konteyneri/ag bulunamadi." >&2
  docker ps -a --format "table {{.Names}}\t{{.Status}}" | head -20
  exit 1
fi

echo "=== Ag: ${WEB_NET} ==="
docker build -f Dockerfile.whatsapp-bridge -t retailex-whatsapp-bridge:latest "${REPO_ROOT}"

docker volume create retailex_wa_bridge_data >/dev/null 2>&1 || true
docker rm -f retailex_whatsapp_bridge 2>/dev/null || true
docker run -d \
  --name retailex_whatsapp_bridge \
  --restart always \
  --network "${WEB_NET}" \
  -e WA_BRIDGE_PORT=3000 \
  -e WA_BRIDGE_BIND=0.0.0.0 \
  -e WA_BRIDGE_AUTH_DIR=/data/.wa-auth \
  -v retailex_wa_bridge_data:/data \
  retailex-whatsapp-bridge:latest

sleep 2
echo ""
echo "=== Köprü log (son 15 satir) ==="
docker logs retailex_whatsapp_bridge --tail 15 2>&1 || true
echo ""
echo "=== Test (frontend icinden) ==="
docker exec retailex_frontend wget -qO- http://retailex_whatsapp_bridge:3000/status 2>&1 || \
  echo "UYARI: retailex_frontend yok veya agda degil — tam deploy gerekebilir"
echo ""
echo "Dis test: curl -sS https://retailex.app/__wa_bridge/status"
