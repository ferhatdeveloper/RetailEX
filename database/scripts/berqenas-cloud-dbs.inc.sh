#!/usr/bin/env bash
# Berqenas Cloud — kiracı PostgreSQL veritabanı listesi ve ortak seçim/yedek yardımcıları.
# Kaynak: bash ile: source "$(dirname "$0")/berqenas-cloud-dbs.inc.sh"
#
# Şema farkı: merkez_db (tenant_registry) ile retail/pdks DB'leri aynı migration dosyalarını
# her zaman kaldırmaz; numaralı migration'ları tümüne basmadan önce dosyanın hedefini kontrol edin.

berqenas_default_dbs_array() {
  BERQENAS_DEFAULT_DBS=(
    merkez_db
    dismarco_pdks
    aqua_beauty
    m10_pdks
    bestcom_db
    siti_pdks
    pdks_demo
    retailex_demo
  )
}

# TENANT_DBS doluysa dokunmaz; boş + tty menü; boş + !tty hepsi
berqenas_pick_tenant_dbs() {
  berqenas_default_dbs_array
  if [[ -n "${TENANT_DBS:-}" ]]; then
    echo "=== Hedef DB'ler (TENANT_DBS): ${TENANT_DBS} ==="
    return 0
  fi
  if [[ -t 0 ]]; then
    echo ""
    echo "=== Hangi veritabanlarına işlem uygulansın? ==="
    echo "  a) Tümü (${#BERQENAS_DEFAULT_DBS[@]} adet — Berqenas varsayılan listesi)"
    local i=1
    local d
    for d in "${BERQENAS_DEFAULT_DBS[@]}"; do
      printf "  %2d) %s\n" "$i" "$d"
      ((i++)) || true
    done
    echo "  m) Manuel — boşlukla veritabanı adları yaz"
    echo ""
    read -r -p "Seçim [a]: " _pick
    _pick="${_pick:-a}"
    case "${_pick,,}" in
      a|all|tum|"")
        TENANT_DBS="${BERQENAS_DEFAULT_DBS[*]}"
        echo "→ Seçilen: tümü"
        ;;
      m|manuel)
        read -r -p "Veritabanı adları (boşlukla): " TENANT_DBS
        if [[ -z "${TENANT_DBS// }" ]]; then
          echo "Hata: Manuel liste boş." >&2
          return 1
        fi
        echo "→ Seçilen: ${TENANT_DBS}"
        ;;
      *)
        local _sel="${_pick//,/ }"
        while [[ "$_sel" == *"  "* ]]; do _sel="${_sel//  / }"; done
        local _chosen=()
        local _parts _tok _idx
        read -ra _parts <<< "$_sel"
        for _tok in "${_parts[@]}"; do
          if [[ "$_tok" =~ ^[0-9]+$ ]]; then
            _idx=$((10#_tok - 1))
            if ((_idx >= 0 && _idx < ${#BERQENAS_DEFAULT_DBS[@]})); then
              _chosen+=("${BERQENAS_DEFAULT_DBS[_idx]}")
            else
              echo "Hata: Geçersiz numara '${_tok}' (1-${#BERQENAS_DEFAULT_DBS[@]})." >&2
              return 1
            fi
          else
            echo "Hata: Tanınmayan seçim '${_pick}'. a, m veya 1,3,8 gibi numaralar kullanın." >&2
            return 1
          fi
        done
        if [[ ${#_chosen[@]} -eq 0 ]]; then
          echo "Hata: Hiç veritabanı seçilmedi." >&2
          return 1
        fi
        TENANT_DBS="${_chosen[*]}"
        echo "→ Seçilen: ${TENANT_DBS}"
        ;;
    esac
    return 0
  fi
  TENANT_DBS="${BERQENAS_DEFAULT_DBS[*]}"
  echo "=== TTY yok — TENANT_DBS tüm varsayılanlar: ${TENANT_DBS} ==="
}

# Her hedef DB için pg_dump -Fc (host dizinine yazar)
# Çıktı: BERQENAS_LAST_BACKUP_DIR ortam değişkeni
berqenas_backup_databases() {
  local container="$1"
  local pgpass="$2"
  local backup_root="${3:-/opt/berqenas-cloud/backups}"
  local stamp dir db
  stamp=$(date +%Y%m%d_%H%M%S)
  dir="${backup_root}/${stamp}"
  mkdir -p "$dir"
  for db in ${TENANT_DBS}; do
    echo "=== Yedek (pg_dump -Fc): ${db} ==="
    docker exec -e PGPASSWORD="$pgpass" "$container" pg_dump -U postgres -Fc --dbname="$db" >"${dir}/${db}.dump"
  done
  export BERQENAS_LAST_BACKUP_DIR="$dir"
  echo "=== Yedek dizini: $dir ==="
}
