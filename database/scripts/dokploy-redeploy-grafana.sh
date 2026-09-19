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
echo "Grafana: http://127.0.0.1:${GRAFANA_PORT:-3000}  veya  https://<alan>/__grafana/"
echo "React gömme: Sistem Yönetimi → Sistem Sağlığı (nginx /__grafana proxy; frontend rebuild gerekir)"
