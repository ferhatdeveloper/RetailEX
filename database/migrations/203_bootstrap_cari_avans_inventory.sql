-- ============================================================================
-- Migration 203: cari_avans + inventory_reservations firm-period bootstrap
-- ----------------------------------------------------------------------------
-- Sorun:
--   * 194 (`avans_reserve.sql`) `cari_avans` ve `inventory_reservations`
--     tablolarını sadece **zaten var olan** `rex_<f>_<p>_*` tablolarını
--     düzenleyerek (ALTER + CREATE INDEX) oluşturuyor. Sıfırdan firm-period
--     tablo oluşturmuyor.
--   * 9 aktif firmada (001, 002, 005, 010, 020, 030, 031, 032, 110) bu
--     tablolar hiç var olmadığından 194 hiçbir şey yapmadı.
--   * Uygulama açılışında `wms/customers` (gerçek: cari avans) türevi
--     obje arayışları başarısız oluyor.
--
-- Bu migration:
--   * `public.rex_<f>_<p>_cari_avans` — 9 firma × 1 period (01) için
--     bare CREATE TABLE IF NOT EXISTS (194 ile aynı kalıp).
--   * `public.rex_<f>_<p>_inventory_reservations` — aynı.
--   * İndeksler (194 ile aynı).
--
-- Tauri uyumu: DO $$ YOK, düz CREATE TABLE IF NOT EXISTS.
-- Idempotent: firma/period zaten varsa atlanır.
-- ============================================================================

-- 1) cari_avans
CREATE TABLE IF NOT EXISTS public.rex_001_01_cari_avans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr             VARCHAR(10) NOT NULL,
  period_nr           VARCHAR(10) NOT NULL,
  customer_id         UUID NOT NULL,
  amount              NUMERIC(18,4) NOT NULL,
  original_amount     NUMERIC(18,4),
  original_currency   VARCHAR(10),
  payment_method      VARCHAR(20) NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'open',
  applied_sale_id     UUID,
  reference_no        VARCHAR(60) GENERATED ALWAYS AS ('AVANS-' || LEFT(id::text, 8)) STORED,
  cash_register_id    UUID,
  cash_register_code  VARCHAR(40),
  cash_line_id        UUID,
  cari_movement_id    UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          VARCHAR(100),
  notes               TEXT
);
CREATE INDEX IF NOT EXISTS rex_001_01_cari_avans_customer_status_idx ON public.rex_001_01_cari_avans (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_001_01_cari_avans_applied_sale_idx   ON public.rex_001_01_cari_avans (applied_sale_id);
CREATE INDEX IF NOT EXISTS rex_001_01_cari_avans_firm_period_idx   ON public.rex_001_01_cari_avans (firm_nr, period_nr);
CREATE INDEX IF NOT EXISTS rex_001_01_cari_avans_created_at_idx    ON public.rex_001_01_cari_avans (created_at DESC);

CREATE TABLE IF NOT EXISTS public.rex_002_01_cari_avans (LIKE public.rex_001_01_cari_avans INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_002_01_cari_avans_customer_status_idx ON public.rex_002_01_cari_avans (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_002_01_cari_avans_applied_sale_idx   ON public.rex_002_01_cari_avans (applied_sale_id);
CREATE INDEX IF NOT EXISTS rex_002_01_cari_avans_firm_period_idx   ON public.rex_002_01_cari_avans (firm_nr, period_nr);
CREATE INDEX IF NOT EXISTS rex_002_01_cari_avans_created_at_idx    ON public.rex_002_01_cari_avans (created_at DESC);

CREATE TABLE IF NOT EXISTS public.rex_005_01_cari_avans (LIKE public.rex_001_01_cari_avans INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_005_01_cari_avans_customer_status_idx ON public.rex_005_01_cari_avans (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_005_01_cari_avans_applied_sale_idx   ON public.rex_005_01_cari_avans (applied_sale_id);
CREATE INDEX IF NOT EXISTS rex_005_01_cari_avans_firm_period_idx   ON public.rex_005_01_cari_avans (firm_nr, period_nr);
CREATE INDEX IF NOT EXISTS rex_005_01_cari_avans_created_at_idx    ON public.rex_005_01_cari_avans (created_at DESC);

CREATE TABLE IF NOT EXISTS public.rex_010_01_cari_avans (LIKE public.rex_001_01_cari_avans INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_010_01_cari_avans_customer_status_idx ON public.rex_010_01_cari_avans (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_010_01_cari_avans_applied_sale_idx   ON public.rex_010_01_cari_avans (applied_sale_id);
CREATE INDEX IF NOT EXISTS rex_010_01_cari_avans_firm_period_idx   ON public.rex_010_01_cari_avans (firm_nr, period_nr);
CREATE INDEX IF NOT EXISTS rex_010_01_cari_avans_created_at_idx    ON public.rex_010_01_cari_avans (created_at DESC);

CREATE TABLE IF NOT EXISTS public.rex_020_01_cari_avans (LIKE public.rex_001_01_cari_avans INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_020_01_cari_avans_customer_status_idx ON public.rex_020_01_cari_avans (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_020_01_cari_avans_applied_sale_idx   ON public.rex_020_01_cari_avans (applied_sale_id);
CREATE INDEX IF NOT EXISTS rex_020_01_cari_avans_firm_period_idx   ON public.rex_020_01_cari_avans (firm_nr, period_nr);
CREATE INDEX IF NOT EXISTS rex_020_01_cari_avans_created_at_idx    ON public.rex_020_01_cari_avans (created_at DESC);

CREATE TABLE IF NOT EXISTS public.rex_030_01_cari_avans (LIKE public.rex_001_01_cari_avans INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_030_01_cari_avans_customer_status_idx ON public.rex_030_01_cari_avans (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_030_01_cari_avans_applied_sale_idx   ON public.rex_030_01_cari_avans (applied_sale_id);
CREATE INDEX IF NOT EXISTS rex_030_01_cari_avans_firm_period_idx   ON public.rex_030_01_cari_avans (firm_nr, period_nr);
CREATE INDEX IF NOT EXISTS rex_030_01_cari_avans_created_at_idx    ON public.rex_030_01_cari_avans (created_at DESC);

CREATE TABLE IF NOT EXISTS public.rex_031_01_cari_avans (LIKE public.rex_001_01_cari_avans INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_031_01_cari_avans_customer_status_idx ON public.rex_031_01_cari_avans (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_031_01_cari_avans_applied_sale_idx   ON public.rex_031_01_cari_avans (applied_sale_id);
CREATE INDEX IF NOT EXISTS rex_031_01_cari_avans_firm_period_idx   ON public.rex_031_01_cari_avans (firm_nr, period_nr);
CREATE INDEX IF NOT EXISTS rex_031_01_cari_avans_created_at_idx    ON public.rex_031_01_cari_avans (created_at DESC);

CREATE TABLE IF NOT EXISTS public.rex_032_01_cari_avans (LIKE public.rex_001_01_cari_avans INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_032_01_cari_avans_customer_status_idx ON public.rex_032_01_cari_avans (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_032_01_cari_avans_applied_sale_idx   ON public.rex_032_01_cari_avans (applied_sale_id);
CREATE INDEX IF NOT EXISTS rex_032_01_cari_avans_firm_period_idx   ON public.rex_032_01_cari_avans (firm_nr, period_nr);
CREATE INDEX IF NOT EXISTS rex_032_01_cari_avans_created_at_idx    ON public.rex_032_01_cari_avans (created_at DESC);

CREATE TABLE IF NOT EXISTS public.rex_110_01_cari_avans (LIKE public.rex_001_01_cari_avans INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_110_01_cari_avans_customer_status_idx ON public.rex_110_01_cari_avans (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_110_01_cari_avans_applied_sale_idx   ON public.rex_110_01_cari_avans (applied_sale_id);
CREATE INDEX IF NOT EXISTS rex_110_01_cari_avans_firm_period_idx   ON public.rex_110_01_cari_avans (firm_nr, period_nr);
CREATE INDEX IF NOT EXISTS rex_110_01_cari_avans_created_at_idx    ON public.rex_110_01_cari_avans (created_at DESC);

-- 2) inventory_reservations
CREATE TABLE IF NOT EXISTS public.rex_001_01_inventory_reservations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr             VARCHAR(10) NOT NULL,
  period_nr           VARCHAR(10) NOT NULL,
  customer_id         UUID NOT NULL,
  product_id          VARCHAR(100) NOT NULL,
  quantity            NUMERIC(18,4) NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'reserved',
  avans_id            UUID,
  sale_id             UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at         TIMESTAMPTZ,
  finalized_at        TIMESTAMPTZ,
  notes               TEXT
);
CREATE INDEX IF NOT EXISTS rex_001_01_inventory_reservations_customer_status_idx ON public.rex_001_01_inventory_reservations (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_001_01_inventory_reservations_product_status_idx ON public.rex_001_01_inventory_reservations (product_id, status);
CREATE INDEX IF NOT EXISTS rex_001_01_inventory_reservations_avans_idx          ON public.rex_001_01_inventory_reservations (avans_id);
CREATE INDEX IF NOT EXISTS rex_001_01_inventory_reservations_firm_period_idx    ON public.rex_001_01_inventory_reservations (firm_nr, period_nr);

CREATE TABLE IF NOT EXISTS public.rex_002_01_inventory_reservations (LIKE public.rex_001_01_inventory_reservations INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_002_01_inventory_reservations_customer_status_idx ON public.rex_002_01_inventory_reservations (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_002_01_inventory_reservations_product_status_idx ON public.rex_002_01_inventory_reservations (product_id, status);
CREATE INDEX IF NOT EXISTS rex_002_01_inventory_reservations_avans_idx          ON public.rex_002_01_inventory_reservations (avans_id);
CREATE INDEX IF NOT EXISTS rex_002_01_inventory_reservations_firm_period_idx    ON public.rex_002_01_inventory_reservations (firm_nr, period_nr);

CREATE TABLE IF NOT EXISTS public.rex_005_01_inventory_reservations (LIKE public.rex_001_01_inventory_reservations INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_005_01_inventory_reservations_customer_status_idx ON public.rex_005_01_inventory_reservations (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_005_01_inventory_reservations_product_status_idx ON public.rex_005_01_inventory_reservations (product_id, status);
CREATE INDEX IF NOT EXISTS rex_005_01_inventory_reservations_avans_idx          ON public.rex_005_01_inventory_reservations (avans_id);
CREATE INDEX IF NOT EXISTS rex_005_01_inventory_reservations_firm_period_idx    ON public.rex_005_01_inventory_reservations (firm_nr, period_nr);

CREATE TABLE IF NOT EXISTS public.rex_010_01_inventory_reservations (LIKE public.rex_001_01_inventory_reservations INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_010_01_inventory_reservations_customer_status_idx ON public.rex_010_01_inventory_reservations (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_010_01_inventory_reservations_product_status_idx ON public.rex_010_01_inventory_reservations (product_id, status);
CREATE INDEX IF NOT EXISTS rex_010_01_inventory_reservations_avans_idx          ON public.rex_010_01_inventory_reservations (avans_id);
CREATE INDEX IF NOT EXISTS rex_010_01_inventory_reservations_firm_period_idx    ON public.rex_010_01_inventory_reservations (firm_nr, period_nr);

CREATE TABLE IF NOT EXISTS public.rex_020_01_inventory_reservations (LIKE public.rex_001_01_inventory_reservations INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_020_01_inventory_reservations_customer_status_idx ON public.rex_020_01_inventory_reservations (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_020_01_inventory_reservations_product_status_idx ON public.rex_020_01_inventory_reservations (product_id, status);
CREATE INDEX IF NOT EXISTS rex_020_01_inventory_reservations_avans_idx          ON public.rex_020_01_inventory_reservations (avans_id);
CREATE INDEX IF NOT EXISTS rex_020_01_inventory_reservations_firm_period_idx    ON public.rex_020_01_inventory_reservations (firm_nr, period_nr);

CREATE TABLE IF NOT EXISTS public.rex_030_01_inventory_reservations (LIKE public.rex_001_01_inventory_reservations INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_030_01_inventory_reservations_customer_status_idx ON public.rex_030_01_inventory_reservations (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_030_01_inventory_reservations_product_status_idx ON public.rex_030_01_inventory_reservations (product_id, status);
CREATE INDEX IF NOT EXISTS rex_030_01_inventory_reservations_avans_idx          ON public.rex_030_01_inventory_reservations (avans_id);
CREATE INDEX IF NOT EXISTS rex_030_01_inventory_reservations_firm_period_idx    ON public.rex_030_01_inventory_reservations (firm_nr, period_nr);

CREATE TABLE IF NOT EXISTS public.rex_031_01_inventory_reservations (LIKE public.rex_001_01_inventory_reservations INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_031_01_inventory_reservations_customer_status_idx ON public.rex_031_01_inventory_reservations (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_031_01_inventory_reservations_product_status_idx ON public.rex_031_01_inventory_reservations (product_id, status);
CREATE INDEX IF NOT EXISTS rex_031_01_inventory_reservations_avans_idx          ON public.rex_031_01_inventory_reservations (avans_id);
CREATE INDEX IF NOT EXISTS rex_031_01_inventory_reservations_firm_period_idx    ON public.rex_031_01_inventory_reservations (firm_nr, period_nr);

CREATE TABLE IF NOT EXISTS public.rex_032_01_inventory_reservations (LIKE public.rex_001_01_inventory_reservations INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_032_01_inventory_reservations_customer_status_idx ON public.rex_032_01_inventory_reservations (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_032_01_inventory_reservations_product_status_idx ON public.rex_032_01_inventory_reservations (product_id, status);
CREATE INDEX IF NOT EXISTS rex_032_01_inventory_reservations_avans_idx          ON public.rex_032_01_inventory_reservations (avans_id);
CREATE INDEX IF NOT EXISTS rex_032_01_inventory_reservations_firm_period_idx    ON public.rex_032_01_inventory_reservations (firm_nr, period_nr);

CREATE TABLE IF NOT EXISTS public.rex_110_01_inventory_reservations (LIKE public.rex_001_01_inventory_reservations INCLUDING ALL);
CREATE INDEX IF NOT EXISTS rex_110_01_inventory_reservations_customer_status_idx ON public.rex_110_01_inventory_reservations (customer_id, status);
CREATE INDEX IF NOT EXISTS rex_110_01_inventory_reservations_product_status_idx ON public.rex_110_01_inventory_reservations (product_id, status);
CREATE INDEX IF NOT EXISTS rex_110_01_inventory_reservations_avans_idx          ON public.rex_110_01_inventory_reservations (avans_id);
CREATE INDEX IF NOT EXISTS rex_110_01_inventory_reservations_firm_period_idx    ON public.rex_110_01_inventory_reservations (firm_nr, period_nr);

-- PostgREST şema cache yenile
NOTIFY pgrest, 'reload schema';
