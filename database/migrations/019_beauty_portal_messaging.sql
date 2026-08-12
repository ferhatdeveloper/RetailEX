-- ============================================================================
-- 019: Beauty portal — Atak SMS + WhatsApp (Evolution / Meta) alanları
-- whatshapp (App/whatshapp) yapılandırması ile uyumlu
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_beauty_portal_settings$'
  LOOP
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS sms_user VARCHAR(255)', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS sms_password VARCHAR(255)', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS sms_sender VARCHAR(80)', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS whatsapp_provider VARCHAR(30) DEFAULT ''NONE''', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS whatsapp_base_url TEXT', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS whatsapp_token TEXT', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS whatsapp_instance_id VARCHAR(255)', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS whatsapp_phone_id VARCHAR(80)', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS default_reminder_channel VARCHAR(20) DEFAULT ''sms''', r.tablename);
  END LOOP;
END $$;
