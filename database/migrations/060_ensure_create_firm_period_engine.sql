-- 060_ensure_create_firm_period_engine.sql
-- Firma/dönem kurulum sihirbazı: CREATE_FIRM_TABLES / CREATE_PERIOD_TABLES yoksa oluşturur.
-- Kaynak: 000_master_schema.sql (bölüm 11-15). Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION CREATE_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
  v_prefix    TEXT := lower('rex_' || p_firm_nr);
  v_unitset_id UUID;
BEGIN
  -- 1. Products (tam şema — tüm kolonlar dahil)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr           VARCHAR(10) NOT NULL,
      ref_id            INTEGER UNIQUE,
      code              VARCHAR(100) UNIQUE,
      barcode           VARCHAR(100),
      name              VARCHAR(255) NOT NULL,
      name2             VARCHAR(255),
      image_url         TEXT,
      image_url_cdn     TEXT,
      description       TEXT,
      description_tr    TEXT,
      description_en    TEXT,
      description_ar    TEXT,
      description_ku    TEXT,
      category_id       UUID,
      category_code     VARCHAR(50),
      categorycode      VARCHAR(50),
      "categoryCode"    VARCHAR(50),
      group_code        VARCHAR(50),
      groupcode         VARCHAR(50),
      "groupCode"       VARCHAR(50),
      sub_group_code    VARCHAR(50),
      subgroupcode      VARCHAR(50),
      "subGroupCode"    VARCHAR(50),
      brand             VARCHAR(100),
      model             VARCHAR(100),
      manufacturer      VARCHAR(100),
      supplier          VARCHAR(100),
      origin            VARCHAR(50),
      material_type     VARCHAR(50),
      materialtype      VARCHAR(50),
      "materialType"    VARCHAR(50),
      unit              VARCHAR(50) DEFAULT ''Adet'',
      unit2             VARCHAR(20),
      unit3             VARCHAR(20),
      unit_id           UUID,
      unitset_id        UUID,
      unitsetid         UUID,
      "unitsetId"       UUID,
      vat_rate          DECIMAL(5,2) DEFAULT 20,
      vatrate           DECIMAL(5,2) DEFAULT 20,
      "vatRate"         DECIMAL(5,2) DEFAULT 20,
      tax_type          VARCHAR(20),
      withholding_rate  DECIMAL(5,2),
      currency          VARCHAR(10) DEFAULT ''IQD'',
      price             DECIMAL(15,2) DEFAULT 0,
      cost              DECIMAL(15,2) DEFAULT 0,
      stock             DECIMAL(15,2) DEFAULT 0,
      min_stock         DECIMAL(15,2) DEFAULT 0,
      max_stock         DECIMAL(15,2) DEFAULT 0,
      critical_stock    DECIMAL(15,2) DEFAULT 0,
      tracking_type     VARCHAR(20) DEFAULT ''none'',
      shelf_location    VARCHAR(50),
      warehouse_code    VARCHAR(50),
      special_code_1    VARCHAR(50),
      special_code_2    VARCHAR(50),
      special_code_3    VARCHAR(50),
      special_code_4    VARCHAR(50),
      special_code_5    VARCHAR(50),
      special_code_6    VARCHAR(50),
      specialcode1      VARCHAR(50),
      specialcode2      VARCHAR(50),
      specialcode3      VARCHAR(50),
      specialcode4      VARCHAR(50),
      specialcode5      VARCHAR(50),
      specialcode6      VARCHAR(50),
      price_list_1      DECIMAL(15,2) DEFAULT 0,
      price_list_2      DECIMAL(15,2) DEFAULT 0,
      price_list_3      DECIMAL(15,2) DEFAULT 0,
      price_list_4      DECIMAL(15,2) DEFAULT 0,
      price_list_5      DECIMAL(15,2) DEFAULT 0,
      price_list_6      DECIMAL(15,2) DEFAULT 0,
      pricelist1        DECIMAL(15,2),
      pricelist2        DECIMAL(15,2),
      pricelist3        DECIMAL(15,2),
      pricelist4        DECIMAL(15,2),
      pricelist5        DECIMAL(15,2),
      pricelist6        DECIMAL(15,2),
      purchase_price    DECIMAL(15,4) DEFAULT 0,
      purchase_price_usd DECIMAL(15,2) DEFAULT 0,
      purchase_price_eur DECIMAL(15,2) DEFAULT 0,
      sale_price_usd    DECIMAL(15,2) DEFAULT 0,
      sale_price_eur    DECIMAL(15,2) DEFAULT 0,
      custom_exchange_rate NUMERIC DEFAULT 0,
      auto_calculate_usd BOOLEAN DEFAULT false,
      preparation_time  INTEGER DEFAULT 5,
      follow_up_reminder_days INTEGER,
      is_scale_product  BOOLEAN NOT NULL DEFAULT false,
      expiry_date         DATE,
      expiry_tracking     BOOLEAN NOT NULL DEFAULT false,
      shelf_life_days     INTEGER,
      has_variants      BOOLEAN DEFAULT false,
      hasvariants       BOOLEAN DEFAULT false,
      "hasVariants"     BOOLEAN DEFAULT false,
      is_active         BOOLEAN DEFAULT true,
      created_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_products');

  -- 2. Customers
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr      VARCHAR(10) NOT NULL,
      ref_id       INTEGER UNIQUE,
      code         VARCHAR(50) UNIQUE,
      name         VARCHAR(255) NOT NULL,
      phone        VARCHAR(50),
      phone2       VARCHAR(50),
      age          INTEGER,
      file_id      VARCHAR(120),
      occupation   VARCHAR(150),
      gender       VARCHAR(20),
      customer_tier VARCHAR(20) DEFAULT ''normal'',
      heard_from   VARCHAR(150),
      email        VARCHAR(255),
      tax_nr       VARCHAR(50),
      taxi_nr      VARCHAR(50),
      tax_office   VARCHAR(100),
      address      TEXT,
      city         VARCHAR(100),
      neighborhood VARCHAR(100),
      district     VARCHAR(100),
      balance      DECIMAL(15,2) DEFAULT 0,
      points       DECIMAL(15,2) DEFAULT 0,
      total_spent  DECIMAL(15,2) DEFAULT 0,
      notes        TEXT,
      call_plan_enabled BOOLEAN DEFAULT false,
      call_plan_weekdays SMALLINT[] DEFAULT ''{}''::smallint[],
      call_plan_note TEXT,
      call_last_status VARCHAR(30) DEFAULT ''planned'',
      call_last_note TEXT,
      call_last_at TIMESTAMPTZ,
      is_active    BOOLEAN DEFAULT true,
      created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_customers');

  -- 3. Suppliers
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr              VARCHAR(10) NOT NULL,
      ref_id               INTEGER UNIQUE,
      code                 VARCHAR(50) UNIQUE,
      name                 VARCHAR(255) NOT NULL,
      phone                VARCHAR(50),
      email                VARCHAR(255),
      tax_nr               VARCHAR(50),
      tax_office           VARCHAR(100),
      address              TEXT,
      city                 VARCHAR(100),
      neighborhood         VARCHAR(100),
      district             VARCHAR(100),
      contact_person       VARCHAR(150),
      contact_person_phone VARCHAR(50),
      payment_terms        VARCHAR(100),
      credit_limit         DECIMAL(15,2) DEFAULT 0,
      notes                TEXT,
      balance              DECIMAL(15,2) DEFAULT 0,
      is_active            BOOLEAN DEFAULT true,
      created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_suppliers');

  -- 3b. Services (hizmet kartları — fatura / Excel / kasa)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    );
  ', v_prefix || '_services', v_prefix || '_services_firm_code_uq');

  -- 4. Definitions (Categories, Brands, Units)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code          VARCHAR(50) UNIQUE,
      name          VARCHAR(255) NOT NULL,
      description   TEXT,
      parent_id     UUID,
      is_restaurant BOOLEAN DEFAULT false,
      icon          VARCHAR(100),
      is_active     BOOLEAN DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_categories');

  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_brands');
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(20) UNIQUE, name VARCHAR(100) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_units');

  -- Tax Rates
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate        DECIMAL(5,2) NOT NULL,
    description VARCHAR(255),
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );', v_prefix || '_tax_rates');

  -- Special Codes
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(50),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    module_type VARCHAR(50),
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );', v_prefix || '_special_codes');

  -- Seed standard tax rates
  EXECUTE format('INSERT INTO %I (rate, description) VALUES
    (0,    ''Vergisiz''),
    (1,    ''%%1 KDV''),
    (8,    ''%%8 KDV''),
    (10,   ''%%10 KDV''),
    (18,   ''%%18 KDV''),
    (20,   ''%%20 KDV'')
    ON CONFLICT DO NOTHING;', v_prefix || '_tax_rates');

  -- Seed standard units (Comprehensive list matching default unit sets)
  EXECUTE format('INSERT INTO %I (code, name) VALUES 
    (''ADET'', ''Adet''), (''KG'', ''Kilogram''), (''GRAM'', ''Gram''), (''TON'', ''Ton''),
    (''METRE'', ''Metre''), (''TOP'', ''Top''), (''LITRE'', ''Litre''), (''ML'', ''Mililitre''),
    (''PAKET'', ''Paket''), (''KOLI'', ''Koli''), (''PALET'', ''Palet''), (''DUZINE'', ''Düzine''),
    (''M2'', ''Metrekare''), (''SAAT'', ''Saat''), (''DAK'', ''Dakika''), (''KUTU'', ''Kutu''),
    (''SET'', ''Set''), (''PARCA'', ''Parca''), (''SISE'', ''Sise''), (''KASA'', ''Kasa'')
    ON CONFLICT (code) DO NOTHING;', v_prefix || '_units');

  -- 5. Unit Sets & Lines (tam şema — code, name, main_unit, conv_fact1, conv_fact2)
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT true);', v_prefix || '_unitsets');
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      unitset_id  UUID,
      item_code   VARCHAR(20) NOT NULL,
      code        VARCHAR(50),
      name        VARCHAR(100),
      main_unit   BOOLEAN DEFAULT false,
      multiplier1 DECIMAL(15,2) DEFAULT 1,
      multiplier2 DECIMAL(15,2) DEFAULT 1,
      conv_fact1  DECIMAL(15,6) DEFAULT 1,
      conv_fact2  DECIMAL(15,6) DEFAULT 1,
      CONSTRAINT %I UNIQUE(unitset_id, item_code)
    );
  ', v_prefix || '_unitsetl', v_prefix || '_unitsetl_unique');

  -- 6. Product Variants
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID, sku VARCHAR(100) UNIQUE, attributes JSONB);', v_prefix || '_product_variants');

  -- 6b. Product Barcodes (multiple barcodes per product, each with its own unit)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id   UUID NOT NULL,
      barcode_code VARCHAR(100) NOT NULL,
      unit         VARCHAR(50),
      sale_price   DECIMAL(15,2) DEFAULT 0,
      is_primary   BOOLEAN DEFAULT false,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_prefix || '_product_barcodes');

  -- 6c. Product Unit Conversions (e.g. 1 Koli = 12 Adet)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL,
      from_unit  VARCHAR(50) NOT NULL,
      to_unit    VARCHAR(50) NOT NULL,
      factor     DECIMAL(15,6) NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_prefix || '_product_unit_conversions');

  -- 7. Campaigns
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr               VARCHAR(10) NOT NULL,
      name                  VARCHAR(255) NOT NULL,
      description           TEXT,
      type                  VARCHAR(50) NOT NULL,
      discount_type         VARCHAR(50) NOT NULL,
      discount_value        DECIMAL(15,2) DEFAULT 0,
      start_date            TIMESTAMPTZ,
      end_date              TIMESTAMPTZ,
      is_active             BOOLEAN DEFAULT true,
      min_purchase_amount   DECIMAL(15,2) DEFAULT 0,
      max_discount_amount   DECIMAL(15,2),
      applicable_categories VARCHAR(255),
      applicable_products   JSONB DEFAULT ''[]'',
      priority              INTEGER DEFAULT 0,
      created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_campaigns');

  -- 8. Finance Registers
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, currency_code VARCHAR(10) DEFAULT ''IQD'', balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_cash_registers');
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, bank_name VARCHAR(255), iban VARCHAR(50), currency_code VARCHAR(10) DEFAULT ''IQD'', balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_bank_registers');
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_expense_cards');
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255), is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_sales_reps');

  -- Sync Triggers
  PERFORM public.try_apply_sync_triggers(v_prefix || '_products');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_customers');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_suppliers');
  PERFORM public.INIT_PRODUCTION_TABLES(p_firm_nr);
  PERFORM public.try_apply_sync_triggers(v_prefix || '_services');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_cash_registers');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_bank_registers');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_expense_cards');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_sales_reps');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_categories');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_brands');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_units');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_tax_rates');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_special_codes');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_campaigns');

  -- ═══════════════════════════════════════════════════════════════════
  -- STANDART BİRİM SETLERİ — tüm perakende/toptan senaryoları
  -- Ana birim = faturada varsayılan olarak kullanılan birim
  -- conv_fact1 = "1 ana birimde kaç alt birim var" (stok çarpanı)
  -- ═══════════════════════════════════════════════════════════════════

  -- 01 · Tekil (sadece Adet)
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''01-ADET'', ''Tekil (Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true, 1, 1 FROM %I WHERE code = ''01-ADET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 02 · Kilogram / Gram
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''02-KG'', ''Kilogram / Gram'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KG'',   ''KG'',   ''Kilogram'', true,  1,    1 FROM %I WHERE code = ''02-KG'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''GRAM'', ''GRAM'', ''Gram'',     false, 1000, 1 FROM %I WHERE code = ''02-KG'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 03 · Litre / Mililitre
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''03-LT'', ''Litre / Mililitre'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''LT'', ''LT'', ''Litre'',     true,  1,    1 FROM %I WHERE code = ''03-LT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ML'', ''ML'', ''Mililitre'', false, 1000, 1 FROM %I WHERE code = ''03-LT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 04 · Koli (6 Adet) — büyük ürünler / elektrikli ev aletleri
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''04-KOLI6'', ''Koli (6 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1, 1 FROM %I WHERE code = ''04-KOLI6'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'', ''KOLI'', ''Koli'', false, 6, 1 FROM %I WHERE code = ''04-KOLI6'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 05 · Koli (12 Adet) — içecek / deterjan
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''05-KOLI12'', ''Koli (12 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1,  1 FROM %I WHERE code = ''05-KOLI12'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'', ''KOLI'', ''Koli'', false, 12, 1 FROM %I WHERE code = ''05-KOLI12'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 06 · Koli (24 Adet) — su / küçük gıda ürünleri
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''06-KOLI24'', ''Koli (24 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1,  1 FROM %I WHERE code = ''06-KOLI24'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'', ''KOLI'', ''Koli'', false, 24, 1 FROM %I WHERE code = ''06-KOLI24'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 07 · Koli (48 Adet) — küçük paket ürünler / atıştırmalık
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''07-KOLI48'', ''Koli (48 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1,  1 FROM %I WHERE code = ''07-KOLI48'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'', ''KOLI'', ''Koli'', false, 48, 1 FROM %I WHERE code = ''07-KOLI48'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 08 · Adet / Koli (12) / Palet (144) — 3 kademeli hiyerarşi
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''08-PALET'', ''Adet / Koli(12) / Palet(144)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'',  ''ADET'',  ''Adet'',  true,  1,   1 FROM %I WHERE code = ''08-PALET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'',  ''KOLI'',  ''Koli'',  false, 12,  1 FROM %I WHERE code = ''08-PALET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''PALET'', ''PALET'', ''Palet'', false, 144, 1 FROM %I WHERE code = ''08-PALET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 09 · Düzine (12 Adet) — küçük aksesuar / tuhafiye
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''09-DUZINE'', ''Düzine (12 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'',   ''ADET'',   ''Adet'',   true,  1,  1 FROM %I WHERE code = ''09-DUZINE'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''DUZINE'', ''DUZINE'', ''Düzine'', false, 12, 1 FROM %I WHERE code = ''09-DUZINE'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 10 · Paket (10 Adet) — kırtasiye / ilaç / ambalaj
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''10-PKT10'', ''Paket (10 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'',  ''ADET'',  ''Adet'',  true,  1,  1 FROM %I WHERE code = ''10-PKT10'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''PAKET'', ''PAKET'', ''Paket'', false, 10, 1 FROM %I WHERE code = ''10-PKT10'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 11 · Paket (5 Adet) — güzellik / sağlık ürünleri
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''11-PKT5'', ''Paket (5 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'',  ''ADET'',  ''Adet'',  true,  1, 1 FROM %I WHERE code = ''11-PKT5'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''PAKET'', ''PAKET'', ''Paket'', false, 5, 1 FROM %I WHERE code = ''11-PKT5'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 12 · Metre / Top (50m) — tekstil / kumaş
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''12-METRE-TOP50'', ''Metre / Top (50m)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''METRE'', ''METRE'', ''Metre'', true,  1,  1 FROM %I WHERE code = ''12-METRE-TOP50'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''TOP'',   ''TOP'',   ''Top'',   false, 50, 1 FROM %I WHERE code = ''12-METRE-TOP50'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 13 · Metre / Top (100m) — halı / ip / büyük rulolar
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''13-METRE-TOP100'', ''Metre / Top (100m)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''METRE'', ''METRE'', ''Metre'', true,  1,   1 FROM %I WHERE code = ''13-METRE-TOP100'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''TOP'',   ''TOP'',   ''Top'',   false, 100, 1 FROM %I WHERE code = ''13-METRE-TOP100'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 14 · KG / Ton — demir-çelik / inşaat malzemesi
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''14-KG-TON'', ''Kilogram / Ton'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KG'',  ''KG'',  ''Kilogram'', true,  1,    1 FROM %I WHERE code = ''14-KG-TON'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''TON'', ''TON'', ''Ton'',      false, 1000, 1 FROM %I WHERE code = ''14-KG-TON'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 15 · Metrekare (M²) — zemin / fayans / cam
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''15-M2'', ''Metrekare (M²)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''M2'', ''M2'', ''Metrekare'', true, 1, 1 FROM %I WHERE code = ''15-M2'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 16 · Saat / Dakika — hizmet / iş gücü
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''16-SAAT'', ''Saat / Dakika'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''SAAT'', ''SAAT'', ''Saat'',    true,  1,  1 FROM %I WHERE code = ''16-SAAT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''DAK'',  ''DAK'',  ''Dakika'',  false, 60, 1 FROM %I WHERE code = ''16-SAAT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 17 · Kutu / Adet — ilaç / kimyasal / ampul
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''17-KUTU'', ''Kutu / Adet'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1,  1 FROM %I WHERE code = ''17-KUTU'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KUTU'', ''KUTU'', ''Kutu'', false, 10, 1 FROM %I WHERE code = ''17-KUTU'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 18 · Set (Takım) — mobilya / spor ekipmanı
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''18-SET'', ''Set / Parca'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''SET'',   ''SET'',   ''Set'',   true,  1, 1 FROM %I WHERE code = ''18-SET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''PARCA'', ''PARCA'', ''Parca'', false, 1, 1 FROM %I WHERE code = ''18-SET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- Mesajlaşma ayarları (WhatsApp / SMS — firma düzeyi)
  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS %I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sms_user VARCHAR(255),
      sms_password VARCHAR(255),
      sms_sender VARCHAR(80),
      sms_template TEXT,
      whatsapp_template TEXT,
      whatsapp_provider VARCHAR(30) DEFAULT 'NONE',
      whatsapp_base_url TEXT,
      whatsapp_token TEXT,
      whatsapp_instance_id VARCHAR(255),
      whatsapp_phone_id VARCHAR(80),
      default_reminder_channel VARCHAR(20) DEFAULT 'whatsapp',
      notify_invoice_whatsapp BOOLEAN DEFAULT false,
      invoice_whatsapp_template TEXT,
      notify_sale_categories TEXT DEFAULT 'Satis,Hizmet',
      meta_invoice_template_name VARCHAR(120),
      meta_invoice_template_language VARCHAR(10),
      meta_appointment_template_name VARCHAR(120),
      meta_appointment_template_language VARCHAR(10),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  $f$, v_prefix || '_messaging_settings');

  -- Varsayılan Kasa
  EXECUTE format('INSERT INTO %I (id, firm_nr, code, name, is_active) VALUES (''00000000-0000-0000-0000-000000000001'', %L, ''KASA.001'', ''MERKEZ KASA'', true) ON CONFLICT DO NOTHING;', v_prefix || '_cash_registers', p_firm_nr);

  -- Varsayılan cari kartları (POS / fatura — yerel kurulumda boş liste olmasın)
  EXECUTE format('INSERT INTO %I (firm_nr, code, name, is_active) VALUES (%L, ''PESIN'', ''Peşin Müşteri'', true) ON CONFLICT (code) DO NOTHING;', v_prefix || '_customers', p_firm_nr);
  EXECUTE format('INSERT INTO %I (firm_nr, code, name, is_active) VALUES (%L, ''GENEL'', ''Genel Tedarikçi'', true) ON CONFLICT (code) DO NOTHING;', v_prefix || '_suppliers', p_firm_nr);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 12. DYNAMIC ENGINE: CREATE_PERIOD_TABLES (v6.0 — Definitive)
-- ============================================================================

CREATE OR REPLACE FUNCTION CREATE_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE
  v_prefix       TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
  v_tbl_sales    TEXT := v_prefix || '_sales';
  v_tbl_items    TEXT := v_prefix || '_sale_items';
BEGIN
  -- 1. Sales Header
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr        VARCHAR(10) NOT NULL,
      period_nr      VARCHAR(10) NOT NULL,
      fiche_no       VARCHAR(100) UNIQUE,
      document_no    VARCHAR(100),
      trcode         INTEGER,
      fiche_type     VARCHAR(50),
      date           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      customer_id    UUID,
      customer_name  VARCHAR(255),
      store_id       UUID REFERENCES stores(id),
      total_net      DECIMAL(15,2) DEFAULT 0,
      total_vat      DECIMAL(15,2) DEFAULT 0,
      total_gross    DECIMAL(15,2) DEFAULT 0,
      total_discount DECIMAL(15,2) DEFAULT 0,
      net_amount     DECIMAL(15,2) DEFAULT 0,
      total_cost     DECIMAL(15,2) DEFAULT 0,
      gross_profit   DECIMAL(15,2) DEFAULT 0,
      profit_margin  DECIMAL(15,2) DEFAULT 0,
      currency       VARCHAR(10) DEFAULT ''IQD'',
      currency_rate  DECIMAL(15,6) DEFAULT 1,
      status         VARCHAR(20) DEFAULT ''completed'',
      logo_sync_status VARCHAR(20) DEFAULT ''pending'',
      logo_sync_error TEXT,
      logo_sync_date TIMESTAMPTZ,
      payment_method VARCHAR(50),
      cashier        VARCHAR(100),
      created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      is_cancelled   BOOLEAN DEFAULT false,
      credit_amount  DECIMAL(15,2) DEFAULT 0,
      notes          TEXT,
      header_fields  JSONB NOT NULL DEFAULT ''{}''::jsonb,
      created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_tbl_sales);

  -- 2. Sale Items (kur desteği + birim çarpan dahil)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id      UUID REFERENCES %I(id) ON DELETE CASCADE,
      firm_nr         VARCHAR(10),
      period_nr       VARCHAR(10),
      item_code       VARCHAR(100),
      item_name       VARCHAR(255),
      product_id      UUID,
      quantity        DECIMAL(15,3) NOT NULL,
      unit_price      DECIMAL(15,2) NOT NULL,
      vat_rate        DECIMAL(5,2) DEFAULT 0,
      discount_rate   DECIMAL(15,4) DEFAULT 0,
      discount_amount DECIMAL(15,2) DEFAULT 0,
      total_amount    DECIMAL(15,2) DEFAULT 0,
      net_amount      DECIMAL(15,2) NOT NULL,
      unit_cost       DECIMAL(15,2) DEFAULT 0,
      total_cost      DECIMAL(15,2) DEFAULT 0,
      gross_profit    DECIMAL(15,2) DEFAULT 0,
      unit            VARCHAR(20) DEFAULT ''Adet'',
      unit_multiplier DECIMAL(15,6) DEFAULT 1,
      base_quantity   DECIMAL(15,3),
      unit_price_fc   DECIMAL(15,4) DEFAULT 0,
      currency        VARCHAR(10) DEFAULT ''IQD'',
      expiry_date     DATE,
      batch_no        VARCHAR(120),
      item_type       VARCHAR(20) DEFAULT ''Malzeme''
    );
  ', v_tbl_items, v_tbl_sales);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (expiry_date) WHERE expiry_date IS NOT NULL', v_tbl_items || '_expiry_date_idx', v_tbl_items);

  -- 3. Cash Transactions
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr              VARCHAR(10) NOT NULL,
      period_nr            VARCHAR(10),
      register_id          UUID,
      fiche_no             VARCHAR(100) UNIQUE,
      date                 TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      amount               DECIMAL(15,2) DEFAULT 0,
      sign                 INTEGER DEFAULT 1,
      trcode               INTEGER,
      definition           TEXT,
      transaction_type     VARCHAR(50),
      customer_id          UUID,
      bank_id              UUID,
      bank_account_id      UUID,
      target_register_id   UUID,
      expense_card_id      UUID,
      currency_code        VARCHAR(10) DEFAULT ''IQD'',
      exchange_rate        DECIMAL(15,6) DEFAULT 1,
      f_amount             DECIMAL(15,2) DEFAULT 0,
      transfer_status      INTEGER DEFAULT 0,
      special_code         VARCHAR(50),
      tax_rate             DECIMAL(5,2) DEFAULT 0,
      withholding_tax_rate DECIMAL(5,2) DEFAULT 0,
      store_id             UUID,
      created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_cash_lines');

  -- 4. Bank Transactions
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr          VARCHAR(10) NOT NULL,
      period_nr        VARCHAR(10),
      register_id      UUID,
      fiche_no         VARCHAR(100) UNIQUE,
      date             TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      amount           DECIMAL(15,2) DEFAULT 0,
      sign             INTEGER DEFAULT 1,
      trcode           INTEGER,
      definition       TEXT,
      transaction_type VARCHAR(50),
      customer_id      UUID,
      cash_register_id UUID,
      currency_code    VARCHAR(10) DEFAULT ''IQD'',
      exchange_rate    DECIMAL(15,6) DEFAULT 1,
      f_amount         DECIMAL(15,2) DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_bank_lines');

  -- 5. Virman (Warehouse Transfer Notes)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr          VARCHAR(10) NOT NULL,
      period_nr        VARCHAR(10),
      virman_no        VARCHAR(100) NOT NULL,
      from_warehouse_id UUID,
      to_warehouse_id  UUID,
      operation_date   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      status           VARCHAR(50) DEFAULT ''draft'',
      notes            TEXT,
      created_by       VARCHAR(100),
      created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_virman_operations');

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      virman_id   UUID REFERENCES %I(id) ON DELETE CASCADE,
      product_id  UUID,
      quantity    DECIMAL(15,4) DEFAULT 0,
      notes       TEXT,
      created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_virman_items', v_prefix || '_virman_operations');

  -- 6. Stock Movements (Header)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr          VARCHAR(10) NOT NULL,
      period_nr        VARCHAR(10) NOT NULL,
      document_no      VARCHAR(50) UNIQUE,
      trcode           INTEGER,
      movement_type    VARCHAR(20), -- ''in'' | ''out'' | ''transfer'' | ''adjustment''
      warehouse_id     UUID REFERENCES stores(id),
      target_warehouse_id UUID REFERENCES stores(id),
      movement_date    TIMESTAMPTZ DEFAULT NOW(),
      exchange_rate    NUMERIC DEFAULT 1,
      description      TEXT,
      status           VARCHAR(20) DEFAULT ''completed'',
      created_by       UUID,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_prefix || '_stock_movements');

  -- 7. Stock Movement Items (Lines)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      movement_id      UUID REFERENCES %I(id) ON DELETE CASCADE,
      product_id       UUID,
      quantity         DECIMAL(15,4) DEFAULT 0,
      unit_price       DECIMAL(15,2) DEFAULT 0,
      cost_price       DECIMAL(15,2) DEFAULT 0,
      exchange_rate    NUMERIC DEFAULT 1,
      unit_name        VARCHAR(100),
      convert_factor   NUMERIC DEFAULT 1,
      notes            TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_prefix || '_stock_movement_items', v_prefix || '_stock_movements');

  -- Bildirim kuyruğu (WhatsApp / SMS — fatura, randevu vb.)
  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS %I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      period_nr VARCHAR(10) NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
      recipient_phone VARCHAR(30),
      recipient_name VARCHAR(255),
      message_text TEXT,
      reference_type VARCHAR(50),
      reference_id UUID,
      payload_json JSONB DEFAULT '{}'::jsonb,
      status VARCHAR(20) DEFAULT 'pending',
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      error_text TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  $f$, v_prefix || '_notification_queue');
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I (status, created_at DESC)',
    v_prefix || '_notification_queue_status_idx',
    v_prefix || '_notification_queue'
  );

  PERFORM public.try_apply_sync_triggers(v_tbl_sales);
  PERFORM public.try_apply_sync_triggers(v_prefix || '_cash_lines');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_bank_lines');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_stock_movements');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_stock_movement_items');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 13. PRODUCTION SYSTEM
-- ============================================================================

CREATE OR REPLACE FUNCTION public.INIT_PRODUCTION_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), firm_nr VARCHAR(10) NOT NULL, product_id UUID NOT NULL, name VARCHAR(255) NOT NULL, description TEXT, total_cost DECIMAL(15,2) DEFAULT 0, wastage_percent DECIMAL(5,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_production_recipes');
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), recipe_id UUID NOT NULL, material_id UUID NOT NULL, quantity DECIMAL(15,3) NOT NULL, unit VARCHAR(20), cost DECIMAL(15,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_production_recipe_ingredients');
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), firm_nr VARCHAR(10) NOT NULL, order_no VARCHAR(50) UNIQUE, recipe_id UUID NOT NULL, product_id UUID NOT NULL, planned_qty DECIMAL(15,3) NOT NULL, produced_qty DECIMAL(15,3) DEFAULT 0, status VARCHAR(20) DEFAULT ''draft'', start_date DATE, end_date DATE, completed_at TIMESTAMPTZ, note TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_production_orders');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_recipes');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_recipe_ingredients');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_orders');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 14. RESTAURANT INITIALIZERS
-- ============================================================================

CREATE OR REPLACE FUNCTION INIT_RESTAURANT_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      floor_id             UUID REFERENCES rest.floors(id),
      number               VARCHAR(50) NOT NULL,
      seats                INTEGER DEFAULT 4,
      status               VARCHAR(20) DEFAULT ''empty'',
      total                DECIMAL(15,2) DEFAULT 0,
      pos_x                INTEGER DEFAULT 0,
      pos_y                INTEGER DEFAULT 0,
      is_large             BOOLEAN DEFAULT false,
      waiter               VARCHAR(255),
      staff_id             UUID,
      start_time           TIMESTAMPTZ,
      locked_by_staff_id   UUID,
      locked_by_staff_name VARCHAR(255),
      locked_at            TIMESTAMPTZ,
      linked_order_ids     text[] DEFAULT ''{}'',
      color                VARCHAR(20) DEFAULT NULL,
      updated_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_rest_tables');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), menu_item_id UUID, product_id UUID, total_cost DECIMAL(15,2) DEFAULT 0, wastage_percent DECIMAL(5,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_rest_recipes');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), recipe_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE, material_id UUID, quantity DECIMAL(15,3), unit VARCHAR(20), cost DECIMAL(15,2) DEFAULT 0);', v_prefix || '_rest_recipe_ingredients', v_prefix || '_rest_recipes');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(100) NOT NULL, role VARCHAR(50) DEFAULT ''Waiter'', pin VARCHAR(10) NOT NULL UNIQUE, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_rest_staff');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION INIT_RESTAURANT_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_no        VARCHAR(50) UNIQUE,
      table_id        UUID,
      floor_id        UUID REFERENCES rest.floors(id),
      waiter          VARCHAR(255),
      staff_id        UUID,
      customer_id     UUID,
      status          VARCHAR(20) DEFAULT ''open'',
      total_amount    DECIMAL(15,2) DEFAULT 0,
      discount_amount DECIMAL(15,2) DEFAULT 0,
      order_discount_pct DECIMAL(5,2) DEFAULT 0,
      tax_amount      DECIMAL(15,2) DEFAULT 0,
      note            TEXT,
      parent_order_id UUID,
      kitchen_note    TEXT,
      estimated_ready_at TIMESTAMPTZ,
      opened_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      billed_at       TIMESTAMPTZ,
      closed_at       TIMESTAMPTZ,
      payment_method  VARCHAR(50),
      created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_rest_orders');
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id         UUID REFERENCES rest.%I(id) ON DELETE CASCADE,
      product_id       UUID,
      product_name     VARCHAR(255) NOT NULL,
      quantity         DECIMAL(15,3) NOT NULL DEFAULT 1,
      unit_price       DECIMAL(15,2) NOT NULL,
      discount_pct     DECIMAL(5,2) DEFAULT 0,
      subtotal         DECIMAL(15,2) NOT NULL,
      status           VARCHAR(20) DEFAULT ''pending'',
      course           VARCHAR(50),
      note             TEXT,
      options          JSONB,
      is_void          BOOLEAN DEFAULT false,
      void_reason      TEXT,
      is_complimentary BOOLEAN DEFAULT false,
      preparation_time INTEGER,
      sent_to_kitchen_at TIMESTAMPTZ,
      served_at        TIMESTAMPTZ,
      created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_rest_order_items', v_prefix || '_rest_orders');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE, table_number VARCHAR(50), floor_name VARCHAR(100), waiter VARCHAR(255), staff_id UUID, status VARCHAR(20) DEFAULT ''new'', note TEXT, estimated_ready_at TIMESTAMPTZ, sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_rest_kitchen_orders', v_prefix || '_rest_orders');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), kitchen_order_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE, order_item_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE, product_name VARCHAR(255) NOT NULL, quantity DECIMAL(15,3) NOT NULL, course VARCHAR(50), note TEXT, status VARCHAR(20) DEFAULT ''new'', preparation_time INTEGER, start_at TIMESTAMPTZ, estimated_ready_at TIMESTAMPTZ, served_at TIMESTAMPTZ);', v_prefix || '_rest_kitchen_items', v_prefix || '_rest_kitchen_orders', v_prefix || '_rest_order_items');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 15. BEAUTY INITIALIZERS
-- ============================================================================

CREATE OR REPLACE FUNCTION INIT_BEAUTY_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255), specialty VARCHAR(100), color VARCHAR(20) DEFAULT ''#9333ea'', commission_rate DECIMAL(5,2) DEFAULT 0, product_unit_commission DECIMAL(15,2) NOT NULL DEFAULT 0, avatar_url TEXT, working_hours JSONB, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_specialists');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, category VARCHAR(50) DEFAULT ''beauty'', parent_category VARCHAR(100), duration_min INTEGER DEFAULT 30, price DECIMAL(15,2) DEFAULT 0, cost_price DECIMAL(15,2) DEFAULT 0, color VARCHAR(20) DEFAULT ''#9333ea'', commission_rate DECIMAL(5,2) DEFAULT 0, description TEXT, requires_device BOOLEAN DEFAULT false, expected_shots INTEGER DEFAULT 0, default_sessions INTEGER NOT NULL DEFAULT 1, follow_up_reminder_days INTEGER, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_services');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, description TEXT, service_id UUID, total_sessions INTEGER DEFAULT 1, price DECIMAL(15,2) DEFAULT 0, cost_price DECIMAL(15,2) DEFAULT 0, discount_pct DECIMAL(5,2) DEFAULT 0, validity_days INTEGER DEFAULT 365, color VARCHAR(20) DEFAULT ''#6366f1'', is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_packages');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, device_type VARCHAR(50) DEFAULT ''laser'', serial_number VARCHAR(100), manufacturer VARCHAR(100), model VARCHAR(100), total_shots BIGINT DEFAULT 0, max_shots BIGINT DEFAULT 500000, maintenance_due DATE, last_maintenance DATE, purchase_date DATE, warranty_expiry DATE, status VARCHAR(20) DEFAULT ''active'', notes TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_devices');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255), source VARCHAR(30) DEFAULT ''other'', status VARCHAR(30) DEFAULT ''new'', interested_services JSONB DEFAULT ''[]'', notes TEXT, assigned_to UUID, first_contact_date DATE DEFAULT CURRENT_DATE, last_contact_date DATE, converted_customer_id UUID, lost_reason TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_leads');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT false, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_satisfaction_surveys');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), survey_id UUID NOT NULL REFERENCES beauty.%I(id) ON DELETE CASCADE, sort_order INTEGER DEFAULT 0, question_type VARCHAR(30) DEFAULT ''rating'', scale_max SMALLINT DEFAULT 5, is_required BOOLEAN DEFAULT true, labels_json JSONB NOT NULL DEFAULT ''{}''::jsonb, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_satisfaction_questions', v_prefix || '_beauty_satisfaction_surveys');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, address TEXT, phone VARCHAR(50), is_active BOOLEAN DEFAULT true, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_branches');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), branch_id UUID, name VARCHAR(255) NOT NULL, capacity INTEGER DEFAULT 1, is_active BOOLEAN DEFAULT true, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_rooms');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), online_booking_enabled BOOLEAN DEFAULT false, allow_staff_slot_overlap BOOLEAN DEFAULT false, public_slug VARCHAR(120), public_token VARCHAR(128) NOT NULL DEFAULT encode(gen_random_bytes(24), ''hex''), reminder_hours_before SMALLINT DEFAULT 24, sms_template TEXT, whatsapp_template TEXT, sms_user VARCHAR(255), sms_password VARCHAR(255), sms_sender VARCHAR(80), whatsapp_provider VARCHAR(30) DEFAULT ''NONE'', whatsapp_base_url TEXT, whatsapp_token TEXT, whatsapp_instance_id VARCHAR(255), whatsapp_phone_id VARCHAR(80), default_reminder_channel VARCHAR(20) DEFAULT ''sms'', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_portal_settings');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, tax_nr VARCHAR(50), discount_pct DECIMAL(5,2) DEFAULT 0, notes TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_corporate_accounts');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title VARCHAR(255) NOT NULL, body_html TEXT, is_active BOOLEAN DEFAULT true, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_consent_templates');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, monthly_price DECIMAL(15,2) DEFAULT 0, session_credit INTEGER DEFAULT 0, benefits_json JSONB DEFAULT ''{}''::jsonb, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_memberships');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), service_id UUID NOT NULL, product_id UUID NOT NULL, qty_per_service DECIMAL(15,4) NOT NULL DEFAULT 1, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_service_consumables');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (customer_id UUID PRIMARY KEY, allergies TEXT, medications TEXT, pregnancy BOOLEAN DEFAULT false, chronic_notes TEXT, warnings_banner TEXT, kvkk_consent_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_customer_health');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID NOT NULL, lot_code VARCHAR(80), expiry_date DATE, qty DECIMAL(15,3) DEFAULT 0, barcode VARCHAR(80), created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_product_batches');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, channel VARCHAR(30) DEFAULT ''sms'', segment_filter_json JSONB DEFAULT ''{}''::jsonb, message_template TEXT, scheduled_at TIMESTAMPTZ, status VARCHAR(20) DEFAULT ''draft'', sent_count INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_marketing_campaigns');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1), google_calendar_id TEXT, external_calendar_json JSONB DEFAULT ''{}''::jsonb, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_integration_settings');
  EXECUTE format('INSERT INTO beauty.%I (id) VALUES (1) ON CONFLICT (id) DO NOTHING', v_prefix || '_beauty_integration_settings');
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS beauty.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      customer_id UUID NOT NULL,
      service_id UUID NOT NULL,
      product_id UUID,
      reminder_kind VARCHAR(20) NOT NULL DEFAULT ''service'',
      last_completed_date DATE NOT NULL,
      natural_due_date DATE NOT NULL,
      reminder_days INTEGER,
      customer_name VARCHAR(255),
      customer_phone VARCHAR(50),
      service_name VARCHAR(255),
      product_name VARCHAR(255),
      status VARCHAR(30) NOT NULL DEFAULT ''due'',
      postponed_due_date DATE,
      show_natural_when_postponed BOOLEAN NOT NULL DEFAULT false,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )',
    v_prefix || '_follow_up_reminder_actions'
  );
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON beauty.%I (
      customer_id, service_id, COALESCE(product_id, ''00000000-0000-0000-0000-000000000000''::uuid),
      last_completed_date, natural_due_date, reminder_kind
    )',
    v_prefix || '_follow_up_reminder_actions_uniq',
    v_prefix || '_follow_up_reminder_actions'
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (postponed_due_date)',
    v_prefix || '_follow_up_reminder_actions_postponed_idx',
    v_prefix || '_follow_up_reminder_actions'
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION INIT_BEAUTY_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID, service_id UUID, specialist_id UUID, device_id UUID, body_region_id UUID, appointment_date DATE, appointment_time TIME, duration INTEGER DEFAULT 30, status VARCHAR(20) DEFAULT ''scheduled'', type VARCHAR(20) DEFAULT ''regular'', notes TEXT, total_price DECIMAL(15,2) DEFAULT 0, commission_amount DECIMAL(15,2) DEFAULT 0, is_package_session BOOLEAN DEFAULT false, package_purchase_id UUID, reminder_sent BOOLEAN DEFAULT false, branch_id UUID, room_id UUID, tele_meeting_url TEXT, booking_channel VARCHAR(40) DEFAULT ''staff'', corporate_account_id UUID, reminder_sent_at TIMESTAMPTZ, last_notification_channel VARCHAR(30), session_series_id UUID, confirmation_call_at TIMESTAMPTZ, pre_visit_activity_at TIMESTAMPTZ, treatment_degree VARCHAR(80), treatment_shots VARCHAR(80), clinical_data JSONB DEFAULT ''{}''::jsonb, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_appointments');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID, specialist_id UUID, service_id UUID, appointment_id UUID, session_date DATE DEFAULT CURRENT_DATE, shots_used INTEGER DEFAULT 0, skin_type VARCHAR(20), before_photo TEXT, after_photo TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_sessions');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), package_purchase_id UUID, appointment_id UUID, session_number INTEGER, recorded_at TIMESTAMPTZ DEFAULT NOW())', v_prefix || '_beauty_session_logs');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID, package_id UUID, total_sessions INTEGER DEFAULT 1, used_sessions INTEGER DEFAULT 0, remaining_sessions INTEGER DEFAULT 1, sale_price DECIMAL(15,2) DEFAULT 0, purchase_date DATE DEFAULT CURRENT_DATE, expiry_date DATE, status VARCHAR(20) DEFAULT ''active'', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_package_purchases');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID, package_id UUID, total_sessions INTEGER, sale_price DECIMAL(15,2), sale_date DATE, expiry_date DATE, status VARCHAR(20))', v_prefix || '_beauty_package_sales');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), device_id UUID, appointment_id UUID, customer_id UUID, specialist_id UUID, body_region_id UUID, shots_used INTEGER DEFAULT 0, expected_shots INTEGER DEFAULT 0, is_excessive BOOLEAN DEFAULT false, usage_date DATE DEFAULT CURRENT_DATE, notes TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_device_usage');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), device_id UUID, usage_id UUID, alert_type VARCHAR(50), message TEXT, severity VARCHAR(20) DEFAULT ''warning'', acknowledged BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_device_alerts');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id UUID, customer_id UUID, service_rating SMALLINT DEFAULT 5, staff_rating SMALLINT DEFAULT 5, cleanliness_rating SMALLINT DEFAULT 5, overall_rating SMALLINT DEFAULT 5, comment TEXT, would_recommend BOOLEAN DEFAULT true, survey_id UUID, survey_answers JSONB, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_customer_feedback');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number VARCHAR(30), customer_id UUID, subtotal DECIMAL(15,2) DEFAULT 0, discount DECIMAL(15,2) DEFAULT 0, tax DECIMAL(15,2) DEFAULT 0, total DECIMAL(15,2) DEFAULT 0, payment_method VARCHAR(30) DEFAULT ''cash'', payment_status VARCHAR(20) DEFAULT ''paid'', paid_amount DECIMAL(15,2) DEFAULT 0, remaining_amount DECIMAL(15,2) DEFAULT 0, notes TEXT, created_by UUID, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_sales');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sale_id UUID, item_type VARCHAR(20) DEFAULT ''service'', item_id UUID, name VARCHAR(255), quantity INTEGER DEFAULT 1, unit_price DECIMAL(15,2) DEFAULT 0, discount DECIMAL(15,2) DEFAULT 0, total DECIMAL(15,2) DEFAULT 0, staff_id UUID, commission_amount DECIMAL(15,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_sale_items');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID, service_id UUID, specialist_id UUID, preferred_date_from DATE, preferred_date_to DATE, notes TEXT, status VARCHAR(20) DEFAULT ''active'', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_waitlist');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, phone VARCHAR(50) NOT NULL, email VARCHAR(255), service_id UUID, requested_date DATE, requested_time TIME, notes TEXT, status VARCHAR(20) DEFAULT ''pending'', public_token_used VARCHAR(128), processed_appointment_id UUID, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_booking_requests');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id UUID, channel VARCHAR(30) NOT NULL, payload_json JSONB DEFAULT ''{}''::jsonb, status VARCHAR(20) DEFAULT ''pending'', scheduled_at TIMESTAMPTZ, sent_at TIMESTAMPTZ, error_text TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_notification_queue');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID, appointment_id UUID, template_id UUID, signed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, signature_data TEXT, meta_json JSONB DEFAULT ''{}''::jsonb, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_consent_submissions');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id UUID, customer_id UUID, subjective TEXT, objective TEXT, assessment TEXT, plan TEXT, extra_json JSONB DEFAULT ''{}''::jsonb, created_by UUID, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_clinical_notes');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID NOT NULL, appointment_id UUID, kind VARCHAR(20) DEFAULT ''before'', storage_url TEXT NOT NULL, caption TEXT, taken_at DATE, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_patient_photos');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID NOT NULL, membership_id UUID NOT NULL, start_date DATE, end_date DATE, status VARCHAR(20) DEFAULT ''active'', auto_renew BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_membership_subscriptions');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), table_name VARCHAR(80) NOT NULL, record_id UUID, action VARCHAR(40) NOT NULL, user_id UUID, payload_json JSONB DEFAULT ''{}''::jsonb, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_audit_log');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id UUID, product_id UUID NOT NULL, qty DECIMAL(15,4) NOT NULL, batch_id UUID, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_consumable_usage_log');
END;
$$ LANGUAGE plpgsql;
