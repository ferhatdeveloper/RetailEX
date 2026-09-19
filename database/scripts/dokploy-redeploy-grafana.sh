#!/usr/bin/env bash
# Yalnız Grafana izleme yığını (grafana + prometheus + cadvisor) — Vite/sync rebuild yok.
#
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-grafana.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE="${REPO_ROOT}/docker-compose.dokploy.yml"

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli (Dokploy secret)}"
export POSTGRES_PASSWORD

if [[ -z "${COMPOSE_PROJECT_NAME:-}" ]] && [[ "$REPO_ROOT" =~ /compose/([^/]+)/code ]]; then
  COMPOSE_PROJECT_NAME="${BASH_REMATCH[1]}"
fi
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-app-retailex-hfdrtt}"
export COMPOSE_PROJECT_NAME

cd "${REPO_ROOT}"

echo "=== Dokploy: grafana + prometheus + cadvisor ==="
docker compose -p "${COMPOSE_PROJECT_NAME}" -f "${COMPOSE}" up -d --no-build \
  prometheus cadvisor grafana

echo ""
echo "Grafana: yalnızca Docker ağı (grafana:3000) → https://<alan>/__grafana/"
echo "ZORUNLU: nginx ^~ /__grafana için frontend rebuild:"
echo "  POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-frontend.sh"
echo "Not: host :3000 yayınlanmaz (port çakışması önlemi)"
