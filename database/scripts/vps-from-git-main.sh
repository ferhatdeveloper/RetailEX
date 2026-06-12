#!/usr/bin/env bash
# VPS / Dokploy terminali — GitHub main'den çek, WhatsApp köprüsü + web deploy
#
# İlk kurulum veya güncelleme (tek komut):
#   curl -fsSL https://raw.githubusercontent.com/ferhatdeveloper/RetailEX/main/database/scripts/vps-from-git-main.sh | sudo bash
#
# Repoda zaten varsa:
#   cd /opt/berqenas-cloud/projects/retailex
#   git pull origin main
#   bash database/scripts/vps-from-git-main.sh
#
# Sadece WhatsApp köprüsü (frontend rebuild yok):
#   SKIP_FULL_DEPLOY=1 bash database/scripts/vps-from-git-main.sh

set -euo pipefail

RETAILEX_GIT_URL="${RETAILEX_GIT_URL:-https://github.com/ferhatdeveloper/RetailEX.git}"
RETAILEX_GIT_BRANCH="${RETAILEX_GIT_BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/berqenas-cloud}"
TARGET="${INSTALL_DIR}/projects/retailex"

command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y git; }
command -v docker >/dev/null 2>&1 || {
  echo "HATA: docker yok. Once Docker kurun." >&2
  exit 1
}

mkdir -p "${INSTALL_DIR}/projects"

if [[ -d "${TARGET}/.git" ]]; then
  echo "=== Git pull: ${TARGET} (${RETAILEX_GIT_BRANCH}) ==="
  git -C "${TARGET}" fetch origin "${RETAILEX_GIT_BRANCH}"
  git -C "${TARGET}" reset --hard "origin/${RETAILEX_GIT_BRANCH}"
else
  echo "=== Git clone: ${RETAILEX_GIT_URL} -> ${TARGET} ==="
  git clone --depth 1 -b "${RETAILEX_GIT_BRANCH}" "${RETAILEX_GIT_URL}" "${TARGET}"
fi

cd "${TARGET}"
echo "=== Commit: $(git rev-parse --short HEAD) — $(git log -1 --format=%s) ==="

if [[ "${SKIP_FULL_DEPLOY:-0}" == "1" ]]; then
  bash "${TARGET}/database/scripts/vps-whatsapp-bridge-only.sh"
else
  export RETAILEX_PUBLIC_DOMAIN="${RETAILEX_PUBLIC_DOMAIN:-retailex.app}"
  bash "${TARGET}/database/scripts/vps-whatsapp-deploy-now.sh"
fi

echo ""
echo "=== Dis test ==="
sleep 2
curl -fsS "https://${RETAILEX_PUBLIC_DOMAIN:-retailex.app}/__wa_bridge/status" 2>/dev/null | head -c 300 || true
echo ""
echo "Backoffice: Sağlayıcı=EMBEDDED, Köprü URL=/__wa_bridge, Kaydet, QR okut"
