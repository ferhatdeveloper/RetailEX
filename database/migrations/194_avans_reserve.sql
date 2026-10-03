-- ============================================================================
-- Migration 194: AVANS → FATURA (Basit Model) — mevcut kurulumlar için
-- ----------------------------------------------------------------------------
-- Plan referansı: AVANS → FATURA (Basit Model) karar dosyası
--
-- Kararlar:
--   1. Avans referans no: UUID (örn. `AVANS-<uuid-kısa>`)
--   2. Stok: RESERVE — avans anında `reserved_quantity` artır,
--      finalize'da gerçek stoğa düş + reserve serbest bırak
--   3. Çoklu avans: HAYIR — tek avans tek satışla eşleşir
--   4. Avans iade: YOK — iptal olursa avans cari bakiyesinde kalır
--   5. Para birimi: Ana birime çevrim (nadir durum, exchange rate kullan)
--
-- Neden gerekli:
--   * POS'ta peşinatlı ödeme alındığında fatura oluşturmadan yalnızca
--     avans + cari hareketi + stok rezervasyonu yapılır.
--   * Ödeme tamamen alındığında fatura otomatik oluşur, avans uygulanır,
--     stok finalize olur (reserved → düş + serbest bırak).
--   * Cari ekstrede avans ayrı tip, günlük raporda ayrı rozet gösterilir.
--
-- Yeni tablolar (firmNr_period_düzeyinde, sales pattern'i — tüm firmalar):
--   - cari_avans
--   - inventory_reservations
--
-- Sıfır kurulumlar: 000_master_schema.sql → CREATE_PERIOD_TABLES içinde
-- aynı CREATE TABLE'lar idempotent eklenmiştir. Bu dosya yalnızca mevcut
-- (eski) kurulumlarda tabloları ekler / kolonları geriye dönük tamamlar.
--
-- Tauri uyumu: DO $$ YOK, ayrı ALTER + CREATE INDEX ifadeleri.
-- İdempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- ============================================================================

-- 1) cari_avans — tüm firmalar için idempotent
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname ~ '^rex_[0-9]+_[0-9]+_cari_avans$'
  LOOP
    -- Tablo yoksa oluştur (çok nadir — sıfır kurulumda master şema zaten
    -- oluşturmuş olmalı). Yine de güvenlik amaçlı CREATE IF NOT EXISTS.
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I (
         id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         firm_nr             VARCHAR(10) NOT NULL,
         period_nr           VARCHAR(10) NOT NULL,
         customer_id         UUID NOT NULL,
         amount              NUMERIC(18,4) NOT NULL,
         original_amount     NUMERIC(18,4),
         original_currency   VARCHAR(10),
         payment_method      VARCHAR(20) NOT NULL,
         status              VARCHAR(20) NOT NULL DEFAULT ''open'',
         applied_sale_id     UUID,
         reference_no        VARCHAR(60) GENERATED ALWAYS AS (''AVANS-'' || LEFT(id::text, 8)) STORED,
         cash_register_id    UUID,
         cash_register_code  VARCHAR(40),
         cash_line_id        UUID,
         cari_movement_id    UUID,
         created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         created_by          VARCHAR(100),
         notes               TEXT
       );',
      r.tbl
    );
    -- Mevcut kurulumlarda eksik kolonları idempotent ekle
    EXECUTE format(
      'ALTER TABLE public.%I
         ADD COLUMN IF NOT EXISTS original_amount   NUMERIC(18,4),
         ADD COLUMN IF NOT EXISTS original_currency VARCHAR(10),
         ADD COLUMN IF NOT EXISTS applied_sale_id   UUID,
         ADD COLUMN IF NOT EXISTS reference_no      VARCHAR(60),
         ADD COLUMN IF NOT EXISTS cash_register_id  UUID,
         ADD COLUMN IF NOT EXISTS cash_register_code VARCHAR(40),
         ADD COLUMN IF NOT EXISTS cash_line_id      UUID,
         ADD COLUMN IF NOT EXISTS cari_movement_id  UUID,
         ADD COLUMN IF NOT EXISTS notes             TEXT',
      r.tbl
    );
    -- İndeksler
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (customer_id, status)',
      r.tbl || '_customer_status_idx', r.tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (applied_sale_id)',
      r.tbl || '_applied_sale_idx', r.tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, period_nr)',
      r.tbl || '_firm_period_idx', r.tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (created_at DESC)',
      r.tbl || '_created_at_idx', r.tbl);
  END LOOP;
END $$;

-- 2) inventory_reservations — tüm firmalar için idempotent
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname ~ '^rex_[0-9]+_[0-9]+_inventory_reservations$'
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I (
         id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         firm_nr             VARCHAR(10) NOT NULL,
         period_nr           VARCHAR(10) NOT NULL,
         customer_id         UUID NOT NULL,
         product_id          VARCHAR(100) NOT NULL,
         quantity            NUMERIC(18,4) NOT NULL,
         status              VARCHAR(20) NOT NULL DEFAULT ''reserved'',
         avans_id            UUID,
         sale_id             UUID,
         created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         released_at         TIMESTAMPTZ,
         notes               TEXT
       );',
      r.tbl
    );
    EXECUTE format(
      'ALTER TABLE public.%I
         ADD COLUMN IF NOT EXISTS released_at  TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS notes        TEXT',
      r.tbl
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (customer_id, status)',
      r.tbl || '_customer_status_idx', r.tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (product_id, status)',
      r.tbl || '_product_status_idx', r.tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (avans_id)',
      r.tbl || '_avans_idx', r.tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (sale_id)',
      r.tbl || '_sale_idx', r.tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, period_nr)',
      r.tbl || '_firm_period_idx', r.tbl);
  END LOOP;
END $$;

NOTIFY pgrest, 'reload schema';
