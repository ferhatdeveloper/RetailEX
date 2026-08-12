#!/usr/bin/env bash
# Dokploy — GitHub main redeploy veya Dokploy terminalinden WhatsApp köprüsü
#
# Dokploy arayüzü (önerilen):
#   1) Proje → Git: ferhatdeveloper/RetailEX, branch main
#   2) Compose: docker-compose.dokploy.yml
#   3) Environment: POSTGRES_PASSWORD (+ docker/dokploy.env.example)
#   4) Deploy / Redeploy
#
# Dokploy terminali (manuel):
#   cd <proje-dizini>   # Dokploy'un clone ettiği repo kökü
#   git pull origin main
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-whatsapp.sh
#
# İlk kurulum (DB tabloları + PostgREST):
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-messaging-setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.dokploy.yml}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli (Dokploy secret ile aynı)}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "HATA: ${COMPOSE_FILE} bulunamadı." >&2
  exit 1
fi

cd "${REPO_ROOT}"
export POSTGRES_PASSWORD

echo "=== Dokploy compose: retailex_whatsapp_bridge + retailex_frontend (yeniden BUILD) ==="
docker compose -f "${COMPOSE_FILE}" build --no-cache retailex_whatsapp_bridge retailex_frontend
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate retailex_whatsapp_bridge retailex_frontend

sleep 3
echo ""
echo "=== Köprü durumu ==="
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E 'whatsapp|frontend' || true
echo ""
docker logs retailex_whatsapp_bridge --tail 20 2>&1 || true
echo ""
echo "=== İç ağ testi (frontend → köprü) ==="
docker exec retailex_frontend wget -qO- http://retailex_whatsapp_bridge:3000/status 2>&1 | head -c 300 || \
  echo "UYARI: retailex_frontend köprüye erişemedi — tam stack redeploy deneyin"
echo ""
echo "=== Dış URL (Dokploy domain / retailex.app) ==="
echo "  curl -sS https://retailex.app/__wa_bridge/status"
echo ""
echo "Backoffice: Sağlayıcı=EMBEDDED, Köprü URL=/__wa_bridge, Kaydet, QR okut"
