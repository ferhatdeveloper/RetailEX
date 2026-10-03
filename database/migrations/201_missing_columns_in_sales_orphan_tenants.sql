-- ============================================================================
-- Migration 201: Aqua ve berzin_com eksik kolonları
-- ----------------------------------------------------------------------------
-- Migration 200 (back_dated_at / insertion_at / is_back_dated /
-- back_dated_by_user_id) uygulanmamış tenantlar:
--
--   * aqua.rex_001_01_sales, aqua.rex_002_01_sales
--     → back_dated_at / insertion_at / is_back_dated / back_dated_by_user_id yok
--   * berzin_com.rex_003_01_sales
--     → cashier kolonu yok (bu tablo master şemadan farklı oluşturulmuş)
--
-- Bu migration idempotent: ADD COLUMN IF NOT EXISTS ile sadece eksik kolonları ekler.
-- ============================================================================

DO $$
DECLARE
  -- Aqua tenantlari — back_dated/insertion_at/is_back_dated/back_dated_by_user_id
  aqua_tables TEXT[] := ARRAY[
    'rex_001_01_sales',
    'rex_002_01_sales'
  ];
  -- Berzin_com eksik cashier
  berzin_cashier_tables TEXT[] := ARRAY[
    'rex_003_01_sales'
  ];
  tname TEXT;
  cnt INT;
BEGIN
  ---------------------------------------------------------------------------
  -- Aqua: back_dated_at / insertion_at / is_back_dated / back_dated_by_user_id
  ---------------------------------------------------------------------------
  FOREACH tname IN ARRAY aqua_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_name = tname
    ) THEN
      CONTINUE;
    END IF;

    -- back_dated_at
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'back_dated_at';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN back_dated_at TIMESTAMPTZ', tname);
      RAISE NOTICE '%: back_dated_at eklendi', tname;
    END IF;

    -- back_dated_by_user_id
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'back_dated_by_user_id';
    IF cnt = 0 THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN back_dated_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL',
        tname
      );
      RAISE NOTICE '%: back_dated_by_user_id eklendi', tname;
    END IF;

    -- insertion_at
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'insertion_at';
    IF cnt = 0 THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN insertion_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP',
        tname
      );
      RAISE NOTICE '%: insertion_at eklendi', tname;
    END IF;

    -- is_back_dated
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'is_back_dated';
    IF cnt = 0 THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN is_back_dated BOOLEAN NOT NULL DEFAULT false',
        tname
      );
      RAISE NOTICE '%: is_back_dated eklendi', tname;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- Berzin_com rex_003_01_sales: cashier + master şema eksik kolonları
  -- (Bu tablo eski versiyonda farklı kolonlarla oluşturulmuş; master şemadaki
  --  tüm kolonlar ekleniyor.)
  ---------------------------------------------------------------------------
  FOREACH tname IN ARRAY berzin_cashier_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_name = tname
    ) THEN
      CONTINUE;
    END IF;

    -- cashier
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'cashier';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN cashier VARCHAR(100)', tname);
      RAISE NOTICE '%: cashier eklendi', tname;
    END IF;

    -- payment_method
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'payment_method';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN payment_method VARCHAR(50) DEFAULT ''Nakit''', tname);
      RAISE NOTICE '%: payment_method eklendi', tname;
    END IF;

    -- status
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'status';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN status VARCHAR(50) DEFAULT ''completed''', tname);
      RAISE NOTICE '%: status eklendi', tname;
    END IF;

    -- currency
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'currency';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN currency VARCHAR(10) DEFAULT ''IQD''', tname);
      RAISE NOTICE '%: currency eklendi', tname;
    END IF;

    -- currency_rate
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'currency_rate';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN currency_rate NUMERIC DEFAULT 1', tname);
      RAISE NOTICE '%: currency_rate eklendi', tname;
    END IF;

    -- document_no
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'document_no';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN document_no VARCHAR(100)', tname);
      RAISE NOTICE '%: document_no eklendi', tname;
    END IF;

    -- store_id
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'store_id';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN store_id UUID', tname);
      RAISE NOTICE '%: store_id eklendi', tname;
    END IF;

    -- total_cost
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'total_cost';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN total_cost NUMERIC DEFAULT 0', tname);
      RAISE NOTICE '%: total_cost eklendi', tname;
    END IF;

    -- total_discount
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'total_discount';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN total_discount NUMERIC DEFAULT 0', tname);
      RAISE NOTICE '%: total_discount eklendi', tname;
    END IF;

    -- gross_profit
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'gross_profit';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN gross_profit NUMERIC DEFAULT 0', tname);
      RAISE NOTICE '%: gross_profit eklendi', tname;
    END IF;

    -- profit_margin
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'profit_margin';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN profit_margin NUMERIC DEFAULT 0', tname);
      RAISE NOTICE '%: profit_margin eklendi', tname;
    END IF;

    -- credit_amount
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'credit_amount';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN credit_amount NUMERIC DEFAULT 0', tname);
      RAISE NOTICE '%: credit_amount eklendi', tname;
    END IF;

    -- notes
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'notes';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN notes TEXT', tname);
      RAISE NOTICE '%: notes eklendi', tname;
    END IF;

    -- created_by_user_id
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'created_by_user_id';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL', tname);
      RAISE NOTICE '%: created_by_user_id eklendi', tname;
    END IF;

    -- logo_sync_status
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'logo_sync_status';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN logo_sync_status VARCHAR(50) DEFAULT ''pending''', tname);
      RAISE NOTICE '%: logo_sync_status eklendi', tname;
    END IF;

    -- logo_sync_error
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'logo_sync_error';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN logo_sync_error TEXT', tname);
      RAISE NOTICE '%: logo_sync_error eklendi', tname;
    END IF;

    -- logo_sync_date
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'logo_sync_date';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN logo_sync_date TIMESTAMPTZ', tname);
      RAISE NOTICE '%: logo_sync_date eklendi', tname;
    END IF;

    -- header_fields
    SELECT COUNT(*) INTO cnt FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tname
        AND c.column_name = 'header_fields';
    IF cnt = 0 THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN header_fields JSONB DEFAULT ''{}''::jsonb', tname);
      RAISE NOTICE '%: header_fields eklendi', tname;
    END IF;
  END LOOP;
END $$;

-- PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';