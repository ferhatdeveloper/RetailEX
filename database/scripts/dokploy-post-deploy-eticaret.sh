#!/usr/bin/env bash
# Dokploy / VPS: e-ticaret vitrin için merkez + kiracı DB adımları (deploy sonrası bir kez).
#
# Kullanım (VPS, merkez_db erişimi olan makinede):
#   cd /etc/dokploy/compose/app-retailex-hfdrtt/code   # veya repo kökü
#   MERKEZ_PGHOST=127.0.0.1 MERKEZ_PGPASSWORD='...' bash database/scripts/dokploy-post-deploy-eticaret.sh
#
# Ortam:
#   MERKEZ_PGHOST, MERKEZ_PGPORT (5432), MERKEZ_PGUSER (postgres), MERKEZ_PGPASSWORD, MERKEZ_PGDATABASE (merkez_db)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

MERKEZ_PGHOST="${MERKEZ_PGHOST:-127.0.0.1}"
MERKEZ_PGPORT="${MERKEZ_PGPORT:-5432}"
MERKEZ_PGUSER="${MERKEZ_PGUSER:-postgres}"
MERKEZ_PGDATABASE="${MERKEZ_PGDATABASE:-merkez_db}"

echo "=== 1) Merkez tenant_registry.eticaret_settings ==="
if [[ -z "${MERKEZ_PGPASSWORD:-}" ]]; then
  echo "Uyarı: MERKEZ_PGPASSWORD boş — merkez script atlanıyor."
else
  PGPASSWORD="${MERKEZ_PGPASSWORD}" psql \
    -h "${MERKEZ_PGHOST}" -p "${MERKEZ_PGPORT}" -U "${MERKEZ_PGUSER}" -d "${MERKEZ_PGDATABASE}" \
    -f database/scripts/merkez_tenant_registry_add_eticaret_settings.sql
fi

echo ""
echo "=== 2) Kiracı DB migration 093 (system_settings.eticaret_settings) ==="
if command -v npm >/dev/null 2>&1 && [[ -f package.json ]]; then
  npm run db:migrate:tenants:dry 2>/dev/null || true
  echo "Uygulamak için: npm run db:migrate:tenants"
else
  echo "npm yok — kiracı migration'ı elle veya GitHub Actions migrate-tenants-db.yml ile çalıştırın."
fi

echo ""
echo "=== 3) Vitrin doğrulama ==="
DOMAIN="${RETAILEX_PUBLIC_DOMAIN:-retailex.app}"
echo "  Statik tema:  curl -sI https://${DOMAIN}/eticaret-static/ella/index.html | head -1"
echo "  Mağaza SPA:   https://${DOMAIN}/magaza/lovan"
echo "  ERP ayarları: Sistem Yönetimi → Online Satış / Tema"
echo ""
echo "Tamam."
