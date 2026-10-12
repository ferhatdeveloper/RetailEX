-- ============================================================================
-- Migration 209: zero-install cari_avans + inventory_reservations fallback
-- ----------------------------------------------------------------------------
-- Kök neden (kullanıcı şikayeti):
--   Yeni ortam `000_master_schema.sql` ile sıfırdan kurulduğunda
--   `relation "rex_001_01_cari_avans" does not exist` hatası alınıyordu.
--
-- Master şema (000) cari_avans + inventory_reservations tablolarını
-- `provision_firm_schema → CREATE_PERIOD_TABLES` zinciri içinde
-- 3-segmentli `rex_<firm>_<period>_01_<tablo>` kalıbıyla oluşturuyor
-- (örn. `rex_001_01_01_cari_avans`). Uygulama ise
-- `src/services/avansService.ts → getCariAvansTable()`
-- fonksiyonunda **2-segmentli** `rex_<firm>_<period>_<tablo>` kalıbını
-- (örn. `rex_001_01_cari_avans`) sorguluyor. Sonuç: tablo var,
-- uygulama erişemiyor, sorgu çöküyor.
--
-- Bu migration, sıfır kurulum sonrasında **uygulamanın beklediği
-- 2-segmentli kalıbı da garanti eder**. Idempotent: tablo zaten varsa
-- atlanır; sütun eklesektiryi için `ADD COLUMN IF NOT EXISTS` kullanılır.
--
-- 9 aktif firma (001, 002, 005, 010, 020, 030, 031, 032, 110) ×
-- varsayılan dönem (01) için uygulanır.
-- ============================================================================

-- 1) cari_avans (2-segmentli fallback — uygulamanın beklediği kalıp)
DO $$
DECLARE
  v_firms TEXT[] := ARRAY['001','002','005','010','020','030','031','032','110'];
  v_period TEXT := '01';
  v_firm   TEXT;
  v_tbl    TEXT;
  v_idx    TEXT;
BEGIN
  FOREACH v_firm IN ARRAY v_firms LOOP
    v_tbl := format('rex_%s_%s_cari_avans', v_firm, v_period);

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I (
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
      v_tbl
    );

    -- İdempotent: mevcut kurulumlarda eksik kolonları garanti et
    EXECUTE format(
      'ALTER TABLE %I
         ADD COLUMN IF NOT EXISTS firm_nr            VARCHAR(10) NOT NULL DEFAULT %L,
         ADD COLUMN IF NOT EXISTS period_nr          VARCHAR(10) NOT NULL DEFAULT %L,
         ADD COLUMN IF NOT EXISTS original_amount    NUMERIC(18,4),
         ADD COLUMN IF NOT EXISTS original_currency  VARCHAR(10),
         ADD COLUMN IF NOT EXISTS applied_sale_id    UUID,
         ADD COLUMN IF NOT EXISTS reference_no       VARCHAR(60),
         ADD COLUMN IF NOT EXISTS cash_register_id   UUID,
         ADD COLUMN IF NOT EXISTS cash_register_code VARCHAR(40),
         ADD COLUMN IF NOT EXISTS cash_line_id       UUID,
         ADD COLUMN IF NOT EXISTS cari_movement_id   UUID,
         ADD COLUMN IF NOT EXISTS notes              TEXT;',
      v_tbl, v_firm, v_period
    );

    -- İndeksler
    v_idx := format('rex_%s_%s_cari_avans_customer_status_idx', v_firm, v_period);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (customer_id, status);', v_idx, v_tbl);

    v_idx := format('rex_%s_%s_cari_avans_applied_sale_idx', v_firm, v_period);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (applied_sale_id);', v_idx, v_tbl);

    v_idx := format('rex_%s_%s_cari_avans_firm_period_idx', v_firm, v_period);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (firm_nr, period_nr);', v_idx, v_tbl);

    v_idx := format('rex_%s_%s_cari_avans_created_at_idx', v_firm, v_period);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (created_at DESC);', v_idx, v_tbl);
  END LOOP;
END $$;

-- 2) inventory_reservations (2-segmentli fallback — uygulamanın beklediği kalıp)
DO $$
DECLARE
  v_firms TEXT[] := ARRAY['001','002','005','010','020','030','031','032','110'];
  v_period TEXT := '01';
  v_firm   TEXT;
  v_tbl    TEXT;
  v_idx    TEXT;
BEGIN
  FOREACH v_firm IN ARRAY v_firms LOOP
    v_tbl := format('rex_%s_%s_inventory_reservations', v_firm, v_period);

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_nr         VARCHAR(10) NOT NULL,
        period_nr       VARCHAR(10) NOT NULL,
        customer_id     UUID NOT NULL,
        product_id      VARCHAR(100) NOT NULL,
        quantity        NUMERIC(18,4) NOT NULL,
        status          VARCHAR(20) NOT NULL DEFAULT ''reserved'',
        avans_id        UUID,
        sale_id         UUID,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        released_at     TIMESTAMPTZ,
        finalized_at    TIMESTAMPTZ,
        notes           TEXT
      );',
      v_tbl
    );

    EXECUTE format(
      'ALTER TABLE %I
         ADD COLUMN IF NOT EXISTS firm_nr      VARCHAR(10) NOT NULL DEFAULT %L,
         ADD COLUMN IF NOT EXISTS period_nr    VARCHAR(10) NOT NULL DEFAULT %L,
         ADD COLUMN IF NOT EXISTS released_at  TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS notes        TEXT;',
      v_tbl, v_firm, v_period
    );

    v_idx := format('rex_%s_%s_inventory_reservations_customer_status_idx', v_firm, v_period);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (customer_id, status);', v_idx, v_tbl);

    v_idx := format('rex_%s_%s_inventory_reservations_product_status_idx', v_firm, v_period);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (product_id, status);', v_idx, v_tbl);

    v_idx := format('rex_%s_%s_inventory_reservations_avans_idx', v_firm, v_period);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (avans_id);', v_idx, v_tbl);

    v_idx := format('rex_%s_%s_inventory_reservations_sale_idx', v_firm, v_period);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (sale_id);', v_idx, v_tbl);

    v_idx := format('rex_%s_%s_inventory_reservations_firm_period_idx', v_firm, v_period);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (firm_nr, period_nr);', v_idx, v_tbl);
  END LOOP;
END $$;

-- PostgREST şema cache yenile
NOTIFY pgrest, 'reload schema';