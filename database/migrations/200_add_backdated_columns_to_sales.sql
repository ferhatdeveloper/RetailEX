-- ============================================================================
-- Migration 200: back_dated/insertion_at kolonlarını tüm rex_*_*_sales tablolarına ekle
-- ----------------------------------------------------------------------------
-- Sorun:
--   * createInvoiceViaPostgrest (invoices.ts) legacyPayload'a şu alanları
--     ekliyor: `is_back_dated`, `insertion_at`, `back_dated_at`,
--     `back_dated_by_user_id`. Bu kolonlar 000_master_schema.sql'de tanımlı
--     ama yalnızca YENİ KURULUMDA `ADD COLUMN IF NOT EXISTS` ile ekleniyor.
--   * Mevcut (upgrade) DB'lerde (lovan, kasap, testere vb.) bu kolonlar
--     daha önceki migration'da eklenmediği için yok.
--   * PostgREST schema cache'de bu kolonları bulamadığı için INSERT'i 400 ile
--     reddediyor → "Could not find the 'back_dated_at' column of
--     'rex_002_01_sales' in the schema cache".
--
-- Kök neden: master_schema'da tanımlı olması yetmiyor, ayrı migration ile mevcut
-- DB'lere de uygulanmalı.
--
-- Bu migration tüm `rex_<firm>_<period>_sales` tablolarına eksikse kolonları
-- ekler (idempotent: ADD COLUMN IF NOT EXISTS).
-- ============================================================================

DO $$
DECLARE
  firm_arr TEXT[] := ARRAY['001','002','003'];
  period_arr TEXT[] := ARRAY['01','02','03','04','05','06','07','08','09','10','11','12'];
  f TEXT;
  p TEXT;
  tname TEXT;
  cnt INT;
BEGIN
  FOREACH f IN ARRAY firm_arr LOOP
    FOREACH p IN ARRAY period_arr LOOP
      tname := 'rex_' || f || '_' || p || '_sales';

      -- Tablo mevcut mu?
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_schema = 'public' AND t.table_name = tname
      ) THEN
        CONTINUE;
      END IF;

      -- back_dated_at: eklenecek mi?
      SELECT COUNT(*) INTO cnt FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = tname
          AND c.column_name = 'back_dated_at';
      IF cnt = 0 THEN
        EXECUTE format(
          'ALTER TABLE %I ADD COLUMN back_dated_at TIMESTAMPTZ',
          tname
        );
      END IF;

      -- back_dated_by_user_id: eklenecek mi?
      SELECT COUNT(*) INTO cnt FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = tname
          AND c.column_name = 'back_dated_by_user_id';
      IF cnt = 0 THEN
        EXECUTE format(
          'ALTER TABLE %I ADD COLUMN back_dated_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL',
          tname
        );
      END IF;

      -- insertion_at: eklenecek mi?
      SELECT COUNT(*) INTO cnt FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = tname
          AND c.column_name = 'insertion_at';
      IF cnt = 0 THEN
        EXECUTE format(
          'ALTER TABLE %I ADD COLUMN insertion_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP',
          tname
        );
      END IF;

      -- is_back_dated: eklenecek mi?
      SELECT COUNT(*) INTO cnt FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = tname
          AND c.column_name = 'is_back_dated';
      IF cnt = 0 THEN
        EXECUTE format(
          'ALTER TABLE %I ADD COLUMN is_back_dated BOOLEAN NOT NULL DEFAULT false',
          tname
        );
      END IF;

      RAISE NOTICE '%: back_dated cols ensured', tname;
    END LOOP;
  END LOOP;
END $$;

-- Doğrulama: Tüm tablolar kontrol
DO $$
DECLARE
  firm_arr TEXT[] := ARRAY['001','002','003'];
  period_arr TEXT[] := ARRAY['01','02','03','04','05','06','07','08','09','10','11','12'];
  f TEXT; p TEXT; tname TEXT;
  total_tables INT := 0;
  missing INT;
BEGIN
  FOREACH f IN ARRAY firm_arr LOOP
    FOREACH p IN ARRAY period_arr LOOP
      tname := 'rex_' || f || '_' || p || '_sales';
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_schema = 'public' AND t.table_name = tname
      ) THEN CONTINUE; END IF;

      total_tables := total_tables + 1;

      SELECT COUNT(*) INTO missing FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = tname
          AND c.column_name IN ('back_dated_at','back_dated_by_user_id','insertion_at','is_back_dated');

      IF missing > 0 THEN
        RAISE WARNING '%: % kolon hala eksik', tname, missing;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Toplam tablo: %', total_tables;
END $$;