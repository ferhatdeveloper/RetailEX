#!/usr/bin/env bash
# VPS / Dokploy terminalinde TEK KOMUT — WhatsApp QR köprüsü + frontend nginx /__wa_bridge
#
# GitHub main'den (repo yoksa clone + deploy):
#   curl -fsSL https://raw.githubusercontent.com/ferhatdeveloper/RetailEX/main/database/scripts/vps-from-git-main.sh | sudo bash
#
# Repoda zaten varsa:
#   cd /opt/berqenas-cloud/projects/retailex
#   git pull origin main
#   bash database/scripts/vps-whatsapp-deploy-now.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"
git pull origin main 2>/dev/null || true

if [[ -f "${REPO_ROOT}/docker-compose.dokploy.yml" ]] && \
   docker ps --format '{{.Names}}' 2>/dev/null | grep -qx saas_postgres; then
  export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli (Dokploy)}"
  bash "${REPO_ROOT}/database/scripts/dokploy-redeploy-whatsapp.sh"
elif [[ -f "${REPO_ROOT}/database/scripts/berqenas-deploy-web.sh" ]]; then
  export RETAILEX_PUBLIC_DOMAIN="${RETAILEX_PUBLIC_DOMAIN:-retailex.app}"
  export INSTALL_DIR="${INSTALL_DIR:-/opt/berqenas-cloud}"
  bash "${REPO_ROOT}/database/scripts/berqenas-deploy-web.sh"
else
  docker compose -f docker-compose.dokploy.yml up -d --build retailex_whatsapp_bridge retailex_frontend
fi

echo ""
echo "=== Test ==="
sleep 3
docker exec retailex_frontend wget -qO- http://retailex_whatsapp_bridge:3000/status 2>/dev/null | head -c 200 || \
  docker logs retailex_whatsapp_bridge --tail 15 2>/dev/null || true
echo ""
echo "Backoffice: Sağlayıcı=EMBEDDED, Köprü URL=/__wa_bridge, Kaydet, QR okut"
