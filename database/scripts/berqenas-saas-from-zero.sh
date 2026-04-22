#!/usr/bin/env bash
#
# Sıfırdan SaaS yığını (önerilen varsayılanlar):
#   — Kiracı / modül veritabanları (berqenas-vps-full-paste.sh ile)
#   — PostgREST (her DB ayrı port, 3002–3009)
#   — pgAdmin + PostgreSQL internete açık (EXPOSE_PUBLIC=1, 5432 dışarı)
#   — WireGuard kapalı (ENABLE_VPN=0)
#   — RetailEX Web: RETAILEX_GIT_URL verilirse berqenas-deploy-web.sh → https://retailex.app (Caddy) + http://VPS_IP:8080
#     DNS A: retailex.app -> VPS IPv4. Sadece port: export RETAILEX_PUBLIC_DOMAIN=
#
# Sunucuda (repo klonlu):
#   chmod +x database/scripts/berqenas-saas-from-zero.sh
#   sudo RETAILEX_GIT_URL=https://github.com/org/RetailEX.git bash database/scripts/berqenas-saas-from-zero.sh
#
# Parolaları ortamdan verin (örnek):
#   sudo -E bash database/scripts/berqenas-saas-from-zero.sh
#   (öncesinde: export POSTGRES_PASSWORD=... PGADMIN_DEFAULT_PASSWORD=... AUTHENTICATOR_PASSWORD=...)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export ENABLE_VPN="${ENABLE_VPN:-0}"
export EXPOSE_PUBLIC="${EXPOSE_PUBLIC:-1}"
export ENABLE_POSTGREST="${ENABLE_POSTGREST:-1}"
export EXPOSE_POSTGRES_PUBLIC="${EXPOSE_POSTGRES_PUBLIC:-1}"

if ! [[ -v RETAILEX_PUBLIC_DOMAIN ]]; then
  export RETAILEX_PUBLIC_DOMAIN=retailex.app
fi

exec bash "${ROOT}/berqenas-vps-full-paste.sh"
