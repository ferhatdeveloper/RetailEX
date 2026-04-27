#!/usr/bin/env bash
# RetailEX — firma adı + birincil firma/dönem (PostgreSQL)
# Kullanım:
#   source database/scripts/firm-set.sh
#   firm "Berzin Company" 001 01
#   firm "Berzin Company" 001 01 2026   # dönel yıl (varsayılan: FIRM_YEAR veya date +%Y)
#
# Ortam: PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE (PGDATABASE zorunlu)

set -euo pipefail

_firm_sql_escape() {
  printf '%s' "$1" | sed "s/'/''/g"
}

firm() {
  if [[ $# -lt 3 ]]; then
    echo "Kullanım: firm \"FIRMA_ADI\" FIRMA_NO DONEM_NO [YIL]" >&2
    echo "Örnek:  firm \"Berzin Company\" 001 01 2026" >&2
    return 1
  fi
  local name="$1" firm_nr="$2" period_raw="$3"
  local year="${4:-${FIRM_YEAR:-$(date +%Y)}}"
  local name_esc
  name_esc="$(_firm_sql_escape "$name")"
  local pnr=$((10#${period_raw}))
  local period_tag
  period_tag=$(printf '%02d' "$pnr")

  : "${PGDATABASE:?PGDATABASE tanımlı olmalı (örn. export PGDATABASE=retailex_local)}"
  : "${PGPASSWORD:=}"
  export PGHOST="${PGHOST:-127.0.0.1}"
  export PGPORT="${PGPORT:-5432}"
  export PGUSER="${PGUSER:-postgres}"

  psql -v ON_ERROR_STOP=1 <<SQL
SET client_encoding TO 'UTF8';
UPDATE public.firms
  SET name = '${name_esc}', title = '${name_esc}'
  WHERE firm_nr = '${firm_nr}';
INSERT INTO public.periods (firm_id, nr, beg_date, end_date, "default", is_active)
SELECT id, ${pnr}, DATE '${year}-01-01', DATE '${year}-12-31', true, true
  FROM public.firms WHERE firm_nr = '${firm_nr}'
ON CONFLICT (firm_id, nr) DO UPDATE SET
  beg_date = EXCLUDED.beg_date,
  end_date = EXCLUDED.end_date,
  "default" = true,
  is_active = true;
UPDATE public.system_settings
  SET primary_firm_nr = '${firm_nr}', primary_period_nr = '${period_tag}', updated_at = NOW()
  WHERE id = 1;
SQL
}

# Doğrudan çalıştırılırsa: ./firm-set.sh "ADI" NO DONEM [YIL]
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  firm "$@"
fi
