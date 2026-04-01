-- ============================================================================
-- 016: Firma bazlı hizmet kartları (rex_{firma}_services)
-- Excel / Hizmet Yönetimi — PostgreSQL modunda Supabase yerine bu tablo kullanılır.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_tbl TEXT;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_products$'
  LOOP
    v_tbl := regexp_replace(r.tablename, '_products$', '') || '_services';
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        firm_nr VARCHAR(10) NOT NULL,
        code VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        description_tr TEXT,
        description_en TEXT,
        description_ar TEXT,
        description_ku TEXT,
        category VARCHAR(255),
        category_id UUID,
        category_code VARCHAR(50),
        brand VARCHAR(100),
        model VARCHAR(100),
        manufacturer VARCHAR(100),
        supplier VARCHAR(100),
        origin VARCHAR(50),
        group_code VARCHAR(50),
        sub_group_code VARCHAR(50),
        special_code_1 VARCHAR(50),
        special_code_2 VARCHAR(50),
        special_code_3 VARCHAR(50),
        special_code_4 VARCHAR(50),
        special_code_5 VARCHAR(50),
        special_code_6 VARCHAR(50),
        unit VARCHAR(50) DEFAULT ''Adet'',
        unit_price DECIMAL(15,2) DEFAULT 0,
        unit_price_usd DECIMAL(15,2) DEFAULT 0,
        unit_price_eur DECIMAL(15,2) DEFAULT 0,
        purchase_price DECIMAL(15,2) DEFAULT 0,
        purchase_price_usd DECIMAL(15,2) DEFAULT 0,
        purchase_price_eur DECIMAL(15,2) DEFAULT 0,
        tax_rate DECIMAL(5,2) DEFAULT 18,
        tax_type VARCHAR(20),
        withholding_rate DECIMAL(5,2) DEFAULT 0,
        discount1 DECIMAL(15,2) DEFAULT 0,
        discount2 DECIMAL(15,2) DEFAULT 0,
        discount3 DECIMAL(15,2) DEFAULT 0,
        image_url TEXT,
        price_list_1 DECIMAL(15,2) DEFAULT 0,
        price_list_2 DECIMAL(15,2) DEFAULT 0,
        price_list_3 DECIMAL(15,2) DEFAULT 0,
        price_list_4 DECIMAL(15,2) DEFAULT 0,
        price_list_5 DECIMAL(15,2) DEFAULT 0,
        price_list_6 DECIMAL(15,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT %I UNIQUE (firm_nr, code)
      )', v_tbl, v_tbl || '_firm_code_uq');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_tbl);
  END LOOP;
END $$;
