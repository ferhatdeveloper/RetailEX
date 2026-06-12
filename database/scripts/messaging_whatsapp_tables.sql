-- ============================================================================
-- WhatsApp / SMS mesajlaşma tabloları (PostgreSQL)
-- Her kiracı DB'de bir kez çalıştırın: sho_aksesuar, berzin_com, kupeli, ...
--
-- psql:
--   psql -U postgres -d sho_aksesuar -f database/scripts/messaging_whatsapp_tables.sql
--
-- Docker (Dokploy):
--   docker exec -i saas_postgres psql -U postgres -d sho_aksesuar -f - < database/scripts/messaging_whatsapp_tables.sql
-- ============================================================================

-- 1) Tüm aktif firmalar için ayar tablosu + tüm aktif dönemler için kuyruk tablosu
DO $$
DECLARE
  f RECORD;
  p RECORD;
  v_prefix TEXT;
  v_period_prefix TEXT;
  v_period_nr TEXT;
BEGIN
  FOR f IN SELECT firm_nr FROM public.firms WHERE COALESCE(is_active, true) LOOP
    v_prefix := lower('rex_' || f.firm_nr);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS public.%I (
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

    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS meta_invoice_template_name VARCHAR(120)',
      v_prefix || '_messaging_settings'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS meta_invoice_template_language VARCHAR(10)',
      v_prefix || '_messaging_settings'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS meta_appointment_template_name VARCHAR(120)',
      v_prefix || '_messaging_settings'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS meta_appointment_template_language VARCHAR(10)',
      v_prefix || '_messaging_settings'
    );

    RAISE NOTICE 'OK: %_messaging_settings', v_prefix;
  END LOOP;

  FOR f IN SELECT firm_nr FROM public.firms WHERE COALESCE(is_active, true) LOOP
    FOR p IN
      SELECT pr.nr
      FROM public.periods pr
      JOIN public.firms fm ON fm.id = pr.firm_id
      WHERE fm.firm_nr = f.firm_nr AND COALESCE(pr.is_active, true)
    LOOP
      v_period_nr := lpad(p.nr::text, 2, '0');
      v_period_prefix := lower('rex_' || f.firm_nr || '_' || v_period_nr);

      EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS public.%I (
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
      $f$, v_period_prefix || '_notification_queue');

      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (status, created_at DESC)',
        v_period_prefix || '_notification_queue_status_idx',
        v_period_prefix || '_notification_queue'
      );

      RAISE NOTICE 'OK: %_notification_queue', v_period_prefix;
    END LOOP;
  END LOOP;
END $$;

-- 2) PostgREST anon rolü (yoksa önce 007_postgrest_anon_role.sql)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- 3) Varsayılan ayar satırı (firma 001 — yoksa ekle)
INSERT INTO public.rex_001_messaging_settings (
  id,
  whatsapp_provider,
  whatsapp_base_url,
  notify_invoice_whatsapp,
  meta_invoice_template_name,
  meta_invoice_template_language,
  meta_appointment_template_name,
  meta_appointment_template_language
)
SELECT
  gen_random_uuid(),
  'EMBEDDED',
  '/__wa_bridge',
  false,
  'retailex_invoice_tr',
  'tr',
  'retailex_appointment_tr',
  'tr'
WHERE NOT EXISTS (SELECT 1 FROM public.rex_001_messaging_settings LIMIT 1);

-- 4) Migration kaydı (schema_migrations varsa)
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.schema_migrations (filename) VALUES
  ('042_messaging_whatsapp_queue.sql'),
  ('043_messaging_meta_templates.sql'),
  ('044_messaging_postgrest_sync.sql')
ON CONFLICT (filename) DO NOTHING;

-- 5) PostgREST şema önbelleğini yenile
NOTIFY pgrst, 'reload schema';
