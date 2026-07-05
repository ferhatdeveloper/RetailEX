#!/usr/bin/env bash
# Dokploy — zetem + ferhat PostgREST/sync + api_gateway (tek seferde)
#
#   POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-zetem-ferhat.sh
#
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli}"
export POSTGRES_PASSWORD
bash "${SCRIPT_DIR}/dokploy-redeploy-zetem-only.sh"
bash "${SCRIPT_DIR}/dokploy-redeploy-ferhat-only.sh"
