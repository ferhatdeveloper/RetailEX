-- ============================================================================
-- 167: WhatsApp mesaj şablonları, özel günler, gönderim logu, kampanya ayarları
-- ============================================================================

DO $$
DECLARE
  f RECORD;
  v_prefix TEXT;
BEGIN
  FOR f IN SELECT firm_nr FROM firms WHERE COALESCE(is_active, true) LOOP
    v_prefix := lower('rex_' || f.firm_nr);

    -- messaging_settings: ülke kodu + doğum günü / otomasyon
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS default_country_code VARCHAR(8) DEFAULT ''90''',
      v_prefix || '_messaging_settings'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS birthday_enabled BOOLEAN DEFAULT false',
      v_prefix || '_messaging_settings'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS birthday_mode VARCHAR(20) DEFAULT ''today''',
      v_prefix || '_messaging_settings'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS birthday_upcoming_days INTEGER DEFAULT 7',
      v_prefix || '_messaging_settings'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS birthday_send_time VARCHAR(8) DEFAULT ''10:00''',
      v_prefix || '_messaging_settings'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS birthday_template_id UUID',
      v_prefix || '_messaging_settings'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS auto_campaign_enabled BOOLEAN DEFAULT false',
      v_prefix || '_messaging_settings'
    );

    -- Kullanıcı mesaj şablonları (firma kart)
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS public.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_nr VARCHAR(10) NOT NULL,
        name VARCHAR(200) NOT NULL,
        body_text TEXT NOT NULL,
        category VARCHAR(40) NOT NULL DEFAULT 'general',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_prefix || '_message_templates');
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, category, is_active)',
      v_prefix || '_message_templates_cat_idx',
      v_prefix || '_message_templates'
    );

    -- Özel günler (firma kart)
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS public.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_nr VARCHAR(10) NOT NULL,
        name VARCHAR(200) NOT NULL,
        month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
        day SMALLINT NOT NULL CHECK (day BETWEEN 1 AND 31),
        fixed_date DATE,
        days_before INTEGER NOT NULL DEFAULT 0,
        send_time VARCHAR(8) NOT NULL DEFAULT '10:00',
        template_id UUID,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_prefix || '_special_days');
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, is_active, month, day)',
      v_prefix || '_special_days_active_idx',
      v_prefix || '_special_days'
    );

    -- Gönderildi kaydı — çift gönderimi engelle (firma kart)
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS public.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_nr VARCHAR(10) NOT NULL,
        campaign_key VARCHAR(120) NOT NULL,
        customer_id UUID,
        phone VARCHAR(30) NOT NULL,
        queue_id UUID,
        status VARCHAR(20) NOT NULL DEFAULT 'sent',
        message_text TEXT,
        sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (campaign_key, phone)
      )
    $f$, v_prefix || '_notification_send_log');
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (campaign_key, status)',
      v_prefix || '_notification_send_log_key_idx',
      v_prefix || '_notification_send_log'
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

NOTIFY pgrst, 'reload schema';
