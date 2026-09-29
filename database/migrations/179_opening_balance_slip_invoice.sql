-- ============================================================================
-- 179 — Açılış faturası slip_kind (alış faturası benzeri açılış devri)
-- Tarih       : 2026-09-29
-- Tetikleyen  : Stok devir fişinin "alış faturası gibi" (KDV hariç, miktar +
--               birim fiyat + KDV %, toplam) oluşturulması talebi.
--
-- Kök neden:
--   `stock_movements` zaten birçok slip_kind (trcode) taşıyor; ama miktar
--   bazlı açılış (trcode=14) dışında fatura bazlı (alış faturasına benzer)
--   açılış yok. Stok devir için "alış faturası görünümlü" (slip_kind=
--   'invoice') seçenek istendi; bu yüzden:
--     1) `stock_movements.slip_kind` kolonu eklenir ('quantity' | 'invoice'),
--        mevcut kayıtlar 'quantity' varsayılanı alır (geriye dönük uyumlu).
--     2) `stock_movement_items` üzerine `unit_cost_excl_vat`,
--        `vat_rate`, `line_total` kolonları eklenir — slip_kind='invoice'
--        satırları için KDV hariç birim maliyet ve KDV % tutulur.
--     3) Tüm `rex_{firm}_{period}_*` firm/period tabloları için idempotent
--        ALTER uygulanır (Tauri uyumlu: DO $$ YOK, doğrudan dinamik SQL ile
--        bilgi şemasından tablo listesi çekilip ayrı ayrı ALTER çalıştırılır).
--
-- Tedarikçi / cari / kasa etkisi: YOK. Yalnızca stok devir; muhasebe simetrisi
-- korunur (ledger / cari bakiyesi dokunulmaz).
-- ============================================================================

-- schema_migrations idempotent (178 ile aynı desen)
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id          SERIAL PRIMARY KEY,
  filename    TEXT NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SET search_path TO public;

-- ----------------------------------------------------------------------------
-- 1) public.stock_movements.slip_kind (yoksa ekle + CHECK)
-- ----------------------------------------------------------------------------
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS slip_kind VARCHAR(20) NOT NULL DEFAULT 'quantity';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'stock_movements_slip_kind_check'
       AND conrelid = 'public.stock_movements'::regclass
  ) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_slip_kind_check
      CHECK (slip_kind IN ('quantity','invoice'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2) public.stock_movement_items — KDV hariç birim maliyet, KDV %, satır
--    toplam (line_total = qty * unit_cost_excl_vat * (1 + vat_rate/100)).
--    Eski fişlerde varsayılan 0; slip_kind='invoice' olunca UI/service dolar.
-- ----------------------------------------------------------------------------
ALTER TABLE public.stock_movement_items
  ADD COLUMN IF NOT EXISTS unit_cost_excl_vat NUMERIC(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate          NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total        NUMERIC(15,2) NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 3) Tüm `rex_{firm}_{period}_stock_movements` / `_stock_movement_items`
--    tabloları için idempotent ALTER (Tauri uyumlu — DO $$ ile bilgi
--    şemasından firma/dönem listesini çek, ayrı ALTER'lar çalıştır).
--    Mevcut firm/period tablosu yoksa sessizce atlanır; yeni firma/dönem
--    açılınca CREATE_PERIOD_TABLES artık bu kolonları da kurar (180+
--    sürümlerde master şema üzerinden).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r_mov   RECORD;
  r_item  RECORD;
  v_added_mov   INT := 0;
  v_added_item  INT := 0;
  v_skipped_mov  INT := 0;
  v_skipped_item INT := 0;
BEGIN
  -- stock_movements: slip_kind
  FOR r_mov IN
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename ~ '^rex_[0-9]+_[0-9]+_stock_movements$'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = r_mov.tablename
         AND column_name = 'slip_kind'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS slip_kind VARCHAR(20) NOT NULL DEFAULT %L',
        r_mov.tablename,
        'quantity'
      );
      EXECUTE format(
        'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
        r_mov.tablename,
        r_mov.tablename || '_slip_kind_check'
      );
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (slip_kind IN (%L, %L))',
        r_mov.tablename,
        r_mov.tablename || '_slip_kind_check',
        'quantity',
        'invoice'
      );
      v_added_mov := v_added_mov + 1;
    ELSE
      v_skipped_mov := v_skipped_mov + 1;
    END IF;
  END LOOP;

  -- stock_movement_items: KDV alanları
  FOR r_item IN
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename ~ '^rex_[0-9]+_[0-9]+_stock_movement_items$'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = r_item.tablename
         AND column_name = 'unit_cost_excl_vat'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I
           ADD COLUMN IF NOT EXISTS unit_cost_excl_vat NUMERIC(15,4) NOT NULL DEFAULT 0,
           ADD COLUMN IF NOT EXISTS vat_rate          NUMERIC(5,2)  NOT NULL DEFAULT 0,
           ADD COLUMN IF NOT EXISTS line_total        NUMERIC(15,2) NOT NULL DEFAULT 0',
        r_item.tablename
      );
      v_added_item := v_added_item + 1;
    ELSE
      v_skipped_item := v_skipped_item + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '[179] stock_movements.slip_kind: % eklendi, % zaten vardı', v_added_mov, v_skipped_mov;
  RAISE NOTICE '[179] stock_movement_items KDV alanları: % eklendi, % zaten vardı', v_added_item, v_skipped_item;
END $$;

-- ----------------------------------------------------------------------------
-- schema_migrations kaydı (idempotent)
-- ----------------------------------------------------------------------------
INSERT INTO public.schema_migrations (filename, applied_at)
VALUES ('179_opening_balance_slip_invoice.sql', NOW())
ON CONFLICT (filename) DO NOTHING;
