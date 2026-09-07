-- RetailEX QR Menü: masa token, ayarlar, çağrılar, feedback, sipariş source
-- Idempotent — mevcut firmalar + INIT fonksiyonları

-- 1) rest_tables.qr_token
DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'rest'
      AND c.relkind = 'r'
      AND c.relname LIKE '%\_rest\_tables' ESCAPE '\'
  LOOP
    EXECUTE format(
      'ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS qr_token UUID DEFAULT gen_random_uuid()',
      r.tbl
    );
    EXECUTE format(
      'UPDATE rest.%I SET qr_token = gen_random_uuid() WHERE qr_token IS NULL',
      r.tbl
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON rest.%I (qr_token)',
      'uq_' || r.tbl || '_qr_token',
      r.tbl
    );
  END LOOP;
END
$mig$;

-- 2) rest_orders.source
DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'rest'
      AND c.relkind = 'r'
      AND c.relname LIKE '%\_rest\_orders' ESCAPE '\'
      AND c.relname NOT LIKE '%\_kitchen\_orders' ESCAPE '\'
  LOOP
    EXECUTE format(
      'ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS source VARCHAR(40) DEFAULT ''pos''',
      r.tbl
    );
  END LOOP;
END
$mig$;

-- 3) Firma kart tabloları: qr_settings + feedback_questions
DO $mig$
DECLARE
  r RECORD;
  v_firm TEXT;
  v_settings TEXT;
  v_questions TEXT;
BEGIN
  FOR r IN
    SELECT DISTINCT regexp_replace(c.relname, '_rest_tables$', '') AS firm_prefix
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'rest'
      AND c.relkind = 'r'
      AND c.relname LIKE 'rex_%_rest_tables'
      AND c.relname NOT LIKE 'rex_%_%_rest_tables'
  LOOP
    v_firm := r.firm_prefix;
    -- rex_001_rest_tables → firm prefix rex_001; skip period tables (rex_001_01_...)
    IF v_firm ~ '^rex_[0-9a-z]+_[0-9]{2}$' THEN
      CONTINUE;
    END IF;

    v_settings := v_firm || '_qr_settings';
    v_questions := v_firm || '_qr_feedback_questions';

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS rest.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurant_name VARCHAR(255),
        logo_url TEXT,
        cover_image_url TEXT,
        primary_color VARCHAR(7) DEFAULT ''#f59e0b'',
        wifi_ssid VARCHAR(255),
        wifi_password VARCHAR(255),
        public_base_url TEXT,
        default_language VARCHAR(5) DEFAULT ''tr'',
        supported_languages TEXT[] DEFAULT ARRAY[''tr'',''en'',''ar'',''ku''],
        ordering_enabled BOOLEAN DEFAULT true,
        call_waiter_enabled BOOLEAN DEFAULT true,
        request_bill_enabled BOOLEAN DEFAULT true,
        valet_enabled BOOLEAN DEFAULT false,
        feedback_enabled BOOLEAN DEFAULT true,
        wifi_enabled BOOLEAN DEFAULT true,
        auto_send_kitchen BOOLEAN DEFAULT false,
        order_approval_mode VARCHAR(20) DEFAULT ''manual'',
        is_active BOOLEAN DEFAULT true,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )', v_settings);

    EXECUTE format('
      INSERT INTO rest.%I (restaurant_name)
      SELECT NULL
      WHERE NOT EXISTS (SELECT 1 FROM rest.%I LIMIT 1)
    ', v_settings, v_settings);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS rest.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) NOT NULL,
        name_tr VARCHAR(255) NOT NULL,
        name_en VARCHAR(255),
        name_ar VARCHAR(255),
        name_ku VARCHAR(255),
        icon_key VARCHAR(50) DEFAULT ''star'',
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(code)
      )', v_questions);

    EXECUTE format('
      INSERT INTO rest.%I (code, name_tr, name_en, name_ar, name_ku, icon_key, sort_order)
      VALUES
        (''food'', ''Yemek kalitesi'', ''Food quality'', ''جودة الطعام'', ''کوالیتی خواردن'', ''utensils'', 1),
        (''staff'', ''Personel hizmeti'', ''Staff service'', ''خدمة الموظفين'', ''خزمەتگوزاری ستاف'', ''users'', 2),
        (''speed'', ''Servis hızı'', ''Service speed'', ''سرعة الخدمة'', ''خێرایی خزمەت'', ''clock'', 3),
        (''cleanliness'', ''Temizlik'', ''Cleanliness'', ''النظافة'', ''پاکوخاوێنی'', ''sparkles'', 4),
        (''ambiance'', ''Ambiyans'', ''Ambiance'', ''الأجواء'', ''ژینگە'', ''music'', 5),
        (''value'', ''Fiyat / performans'', ''Price / value'', ''السعر / القيمة'', ''نرخ / بەها'', ''coffee'', 6)
      ON CONFLICT (code) DO NOTHING
    ', v_questions);
  END LOOP;
END
$mig$;

-- 4) Dönem hareket: service_requests + feedback
DO $mig$
DECLARE
  r RECORD;
  v_prefix TEXT;
  v_req TEXT;
  v_fb TEXT;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'rest'
      AND c.relkind = 'r'
      AND c.relname LIKE '%\_rest\_orders' ESCAPE '\'
      AND c.relname NOT LIKE '%\_kitchen\_orders' ESCAPE '\'
  LOOP
    -- rex_001_01_rest_orders → rex_001_01
    v_prefix := regexp_replace(r.tbl, '_rest_orders$', '');
    v_req := v_prefix || '_rest_service_requests';
    v_fb := v_prefix || '_rest_feedback';

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS rest.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_type VARCHAR(40) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT ''pending'',
        table_id UUID,
        table_number VARCHAR(50),
        order_id UUID,
        payload JSONB DEFAULT ''{}''::jsonb,
        customer_note TEXT,
        staff_note TEXT,
        acknowledged_by VARCHAR(255),
        acknowledged_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )', v_req);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON rest.%I (status, created_at DESC)',
      'idx_' || v_req || '_status_created',
      v_req
    );

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS rest.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        question_code VARCHAR(50),
        question_id UUID,
        rating INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
        table_id UUID,
        table_number VARCHAR(50),
        staff_id UUID,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        phone VARCHAR(50),
        comment TEXT,
        status VARCHAR(20) DEFAULT ''new'',
        response_text TEXT,
        responded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )', v_fb);
  END LOOP;
END
$mig$;

-- 5) INIT fonksiyonlarını güncelle (yeni kurulumlar)
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
      qr_token             UUID DEFAULT gen_random_uuid(),
      updated_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_rest_tables');
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS qr_token UUID DEFAULT gen_random_uuid()', v_prefix || '_rest_tables');
  EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON rest.%I (qr_token)', 'uq_' || v_prefix || '_rest_tables_qr_token', v_prefix || '_rest_tables');

  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), menu_item_id UUID, product_id UUID, total_cost DECIMAL(15,2) DEFAULT 0, wastage_percent DECIMAL(5,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_rest_recipes');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), recipe_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE, material_id UUID, quantity DECIMAL(15,3), unit VARCHAR(20), cost DECIMAL(15,2) DEFAULT 0);', v_prefix || '_rest_recipe_ingredients', v_prefix || '_rest_recipes');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(100) NOT NULL, role VARCHAR(50) DEFAULT ''Waiter'', pin VARCHAR(10) NOT NULL UNIQUE, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_rest_staff');

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_name VARCHAR(255),
      logo_url TEXT,
      cover_image_url TEXT,
      primary_color VARCHAR(7) DEFAULT ''#f59e0b'',
      wifi_ssid VARCHAR(255),
      wifi_password VARCHAR(255),
      public_base_url TEXT,
      default_language VARCHAR(5) DEFAULT ''tr'',
      supported_languages TEXT[] DEFAULT ARRAY[''tr'',''en'',''ar'',''ku''],
      ordering_enabled BOOLEAN DEFAULT true,
      call_waiter_enabled BOOLEAN DEFAULT true,
      request_bill_enabled BOOLEAN DEFAULT true,
      valet_enabled BOOLEAN DEFAULT false,
      feedback_enabled BOOLEAN DEFAULT true,
      wifi_enabled BOOLEAN DEFAULT true,
      auto_send_kitchen BOOLEAN DEFAULT false,
      order_approval_mode VARCHAR(20) DEFAULT ''manual'',
      is_active BOOLEAN DEFAULT true,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_qr_settings');

  EXECUTE format('
    INSERT INTO rest.%I (restaurant_name)
    SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM rest.%I LIMIT 1)
  ', v_prefix || '_qr_settings', v_prefix || '_qr_settings');

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(50) NOT NULL,
      name_tr VARCHAR(255) NOT NULL,
      name_en VARCHAR(255),
      name_ar VARCHAR(255),
      name_ku VARCHAR(255),
      icon_key VARCHAR(50) DEFAULT ''star'',
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(code)
    )', v_prefix || '_qr_feedback_questions');

  EXECUTE format('
    INSERT INTO rest.%I (code, name_tr, name_en, name_ar, name_ku, icon_key, sort_order)
    VALUES
      (''food'', ''Yemek kalitesi'', ''Food quality'', ''جودة الطعام'', ''کوالیتی خواردن'', ''utensils'', 1),
      (''staff'', ''Personel hizmeti'', ''Staff service'', ''خدمة الموظفين'', ''خزمەتگوزاری ستاف'', ''users'', 2),
      (''speed'', ''Servis hızı'', ''Service speed'', ''سرعة الخدمة'', ''خێرایی خزمەت'', ''clock'', 3),
      (''cleanliness'', ''Temizlik'', ''Cleanliness'', ''النظافة'', ''پاکوخاوێنی'', ''sparkles'', 4),
      (''ambiance'', ''Ambiyans'', ''Ambiance'', ''الأجواء'', ''ژینگە'', ''music'', 5),
      (''value'', ''Fiyat / performans'', ''Price / value'', ''السعر / القيمة'', ''نرخ / بەها'', ''coffee'', 6)
    ON CONFLICT (code) DO NOTHING
  ', v_prefix || '_qr_feedback_questions');
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
      source          VARCHAR(40) DEFAULT ''pos'',
      created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_rest_orders');
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS source VARCHAR(40) DEFAULT ''pos''', v_prefix || '_rest_orders');

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
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id UUID,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '''',
      reservation_date DATE NOT NULL,
      reservation_time TIME NOT NULL,
      guest_count INTEGER NOT NULL DEFAULT 2,
      table_id UUID,
      table_number TEXT,
      status TEXT NOT NULL DEFAULT ''pending'',
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_prefix || '_rest_reservations');

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_type VARCHAR(40) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT ''pending'',
      table_id UUID,
      table_number VARCHAR(50),
      order_id UUID,
      payload JSONB DEFAULT ''{}''::jsonb,
      customer_note TEXT,
      staff_note TEXT,
      acknowledged_by VARCHAR(255),
      acknowledged_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_rest_service_requests');

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON rest.%I (status, created_at DESC)',
    'idx_' || v_prefix || '_rest_service_requests_status',
    v_prefix || '_rest_service_requests'
  );

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question_code VARCHAR(50),
      question_id UUID,
      rating INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
      table_id UUID,
      table_number VARCHAR(50),
      staff_id UUID,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      phone VARCHAR(50),
      comment TEXT,
      status VARCHAR(20) DEFAULT ''new'',
      response_text TEXT,
      responded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_rest_feedback');

  PERFORM INIT_RESTAURANT_KITCHEN_PRINT_JOBS_TABLE(p_firm_nr, p_period_nr);
  PERFORM INIT_RESTAURANT_PRINT_JOBS_TABLE(p_firm_nr, p_period_nr);
END;
$$ LANGUAGE plpgsql;
