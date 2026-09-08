-- 146: QR kart tablolarını geri doldur (144 LIKE '_' joker yüzünden atlanmış olabilirdi)
-- Idempotent: rest.rex_*_qr_settings + qr_feedback_questions

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
      AND c.relname LIKE 'rex\_%\_rest\_tables' ESCAPE '\'
      AND c.relname NOT LIKE 'rex\_%\_%\_rest\_tables' ESCAPE '\'
  LOOP
    v_firm := r.firm_prefix;
    -- dönem masaları (rex_001_01_...) atla
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

    EXECUTE format(
      'ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS order_approval_mode VARCHAR(20) DEFAULT ''manual''',
      v_settings
    );

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
