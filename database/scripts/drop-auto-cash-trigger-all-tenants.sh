#!/usr/bin/env bash
# database/scripts/drop-auto-cash-trigger-all-tenants.sh
#
# 143_drop_auto_cash_line_trigger.sql — tüm RetailEX tenant DB'lerinde
# trg_auto_cash_line_sales trigger'ını ve fn_auto_cash_line_on_sale
# fonksiyonunu kaldırır.
#
# Kullanım:
#   PGPASSWORD='...' PGHOST=72.60.182.107 PGUSER=postgres \
#     bash database/scripts/drop-auto-cash-trigger-all-tenants.sh
#
# Hariç DB'ler (NON_RETAILEX): ilsasupport, pagetin_kurye, siti_pdks,
# aram, aram_pre_rebuild, aram_pre_rebuild_20260827, aram_shift_test,
# naw, bestnaw.

set -euo pipefail

PGHOST="${PGHOST:-72.60.182.107}"
PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-}"

MIG_FILE="$(cd "$(dirname "$0")/.." && pwd)/migrations/143_drop_auto_cash_line_trigger.sql"
if [[ ! -f "$MIG_FILE" ]]; then
  echo "[ERR] migration dosyası yok: $MIG_FILE" >&2
  exit 1
fi

# RetailEX tenant DB listesi (NON_RETAILEX hariç — bkz. database-non-retailex-exclude.mdc)
DBS=(
  aqua_beauty
  arzen
  berzin_com
  canon
  ferhat
  kasap
  lovan
  merkez_db
  mettu
  ozbek
  pdks_demo
  retailex_demo
  sitigroup
  testere
  zetem
)

applied=0
skipped=0
failed=0

for db in "${DBS[@]}"; do
  # Bu DB'de rex_001_01_sales var mı? RetailEX şeması uygulanmamış DB'lerde patlar.
  if ! PGPASSWORD="$PGPASSWORD" psql -h "$PGHOST" -U "$PGUSER" -d "$db" -tAc \
       "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='rex_001_01_sales';" 2>/dev/null \
       | grep -q 1; then
    echo "[skip] $db — rex_001_01_sales yok (RetailEX şeması uygulanmamış)"
    skipped=$((skipped+1))
    continue
  fi

  # Zaten schema_migrations'da 143 kaydı var mı?
  if PGPASSWORD="$PGPASSWORD" psql -h "$PGHOST" -U "$PGUSER" -d "$db" -tAc \
       "SELECT 1 FROM public.schema_migrations WHERE filename='143_drop_auto_cash_line_trigger.sql';" 2>/dev/null \
       | grep -q 1; then
    echo "[skip] $db — 143 zaten uygulanmış"
    skipped=$((skipped+1))
    continue
  fi

  echo "[apply] $db"
  if PGPASSWORD="$PGPASSWORD" psql -h "$PGHOST" -U "$PGUSER" -d "$db" -v ON_ERROR_STOP=1 \
       -f "$MIG_FILE" >/tmp/mig_143_${db}.log 2>&1; then
    PGPASSWORD="$PGPASSWORD" psql -h "$PGHOST" -U "$PGUSER" -d "$db" -v ON_ERROR_STOP=1 \
      -c "INSERT INTO public.schema_migrations (filename) VALUES ('143_drop_auto_cash_line_trigger.sql') ON CONFLICT DO NOTHING;" \
      >>/tmp/mig_143_${db}.log 2>&1
    applied=$((applied+1))
    echo "  -> OK"
  else
    failed=$((failed+1))
    echo "  -> FAIL — bkz. /tmp/mig_143_${db}.log"
  fi
done

echo
echo "Özet: applied=$applied skipped=$skipped failed=$failed"
[[ $failed -eq 0 ]] || exit 1
