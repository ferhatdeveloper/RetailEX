#!/usr/bin/env bash
#
# Sıfır VPS — önerilen “tam yığın” giriş noktası (berqenas-saas-from-zero + varsayılanlar).
#   — PostgREST 3002–3009, RetailEX web + Caddy, api.<RETAILEX_PUBLIC_DOMAIN> birleştirme,
#     merkez_db anon/tenant_registry, isteğe bağlı EXFIN PDKS web
#
# Repo ile (TTY veya ortam şifreleri):
#   sudo bash database/scripts/berqenas-vps-fresh-install-all.sh
#
# Tek satır (GitHub raw, TTY açık SSH):
#   curl -fsSL https://raw.githubusercontent.com/ferhatdeveloper/RetailEX/main/database/scripts/berqenas-one-liner-bootstrap.sh | bash
#   (bootstrap bu betiği çağırır.)
#
# EXFIN’i kapatmak için:
#   export DEPLOY_EXFINPDKS=0
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export DEPLOY_EXFINPDKS="${DEPLOY_EXFINPDKS:-1}"

bash "${ROOT}/berqenas-saas-from-zero.sh"
