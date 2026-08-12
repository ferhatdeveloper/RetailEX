-- ============================================================================
-- 030: 0.1.65 → 0.1.69 uygulama güncellemesi sonrası şema hizalama (idempotent)
--
-- Amaç: Veritabanında 020–029 arası migrasyonlar uygulanmadıysa veya eksik
-- kaldıysa; özellikle `beauty_appointments.clinical_data` eksikliği randevu
-- listesi sorgularını kırar. Bu dosya aynı ALTER'ları IF NOT EXISTS ile tekrar
-- güvenli şekilde uygular.
--
-- Çalıştırma:
--   npm run db:migrate
--   veya: psql -f database/migrations/030_post_0_1_65_to_0_1_69_schema_align.sql …
-- ============================================================================

-- ----- 020: beauty_appointments.session_series_id -----
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_[0-9]+_beauty_appointments$'
  LOOP
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS session_series_id UUID', r.tablename);
  END LOOP;
END $$;

-- ----- 021: beauty_services.default_sessions -----
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_beauty_services$'
  LOOP
    EXECUTE format(
      'ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS default_sessions INTEGER NOT NULL DEFAULT 1',
      r.tablename
    );
    EXECUTE format(
      'UPDATE beauty.%I SET default_sessions = 1 WHERE default_sessions IS NULL',
      r.tablename
    );
  END LOOP;
END $$;

-- ----- 022: beauty_appointments — arama / ön ziyaret -----
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_[0-9]+_beauty_appointments$'
  LOOP
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS confirmation_call_at TIMESTAMPTZ', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS pre_visit_activity_at TIMESTAMPTZ', r.tablename);
  END LOOP;
END $$;

-- ----- 023–025 + 029: public.rex_*_customers -----
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_customers$'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS total_spent DECIMAL(15,2) DEFAULT 0', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS notes TEXT', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS phone2 VARCHAR(50)', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS age INTEGER', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS occupation VARCHAR(150)', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS file_id VARCHAR(120)', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS gender VARCHAR(20)', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS customer_tier VARCHAR(20) DEFAULT ''normal''', r.tablename);
  END LOOP;
END $$;

-- ----- 026: beauty_appointments — tedavi derece / atış -----
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_[0-9]+_beauty_appointments$'
  LOOP
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS treatment_degree VARCHAR(80)', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS treatment_shots VARCHAR(80)', r.tablename);
  END LOOP;
END $$;

-- ----- 027: beauty_appointments.clinical_data (randevu listesi için kritik) -----
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_[0-9]+_beauty_appointments$'
  LOOP
    EXECUTE format(
      'ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS clinical_data JSONB DEFAULT ''{}''::jsonb',
      r.tablename
    );
  END LOOP;
END $$;

-- ----- 028: beauty_portal_settings.allow_staff_slot_overlap -----
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_beauty_portal_settings$'
  LOOP
    EXECUTE format(
      'ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS allow_staff_slot_overlap BOOLEAN DEFAULT false',
      r.tablename
    );
  END LOOP;
END $$;
