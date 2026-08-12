-- ============================================================================
-- 118: Beauty kontrol aramaları (post-treatment follow-up) takip tablosu
-- ============================================================================
-- Hizmet kartında `requires_followup_call = true` ve `control_period_days > 0`
-- olan hizmetler için, tamamlanan randevudan N gün sonra kontrol araması
-- planlanır. Bu tablo bekleyen/tamamlanan aramaları saklar.
-- ----------------------------------------------------------------------------
-- Tablo firma başına: beauty.rex_{firmNr}_control_followup_calls
-- Idempotent: CREATE TABLE / CREATE INDEX için IF NOT EXISTS kullanılır.
-- Tauri'de DO $$ bloklarından kaçınmak için ayrı ALTER satırları tercih
-- edilir; burada firma başına yalnız bir tablo üretildiğinden
-- ayrı EXECUTE format(...) yeterlidir (Tauri zaten bunu çalıştırabilir).
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_table TEXT;
  v_seen TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- 1) Mevcut beauty_services tablolarından firm_nr türet
  FOR r IN
    SELECT DISTINCT regexp_replace(tablename, '^rex_(.+?)_beauty_services$', '\1') AS firm
    FROM pg_tables
    WHERE schemaname = 'beauty'
      AND tablename ~ '^rex_[0-9]+_beauty_services$'
  LOOP
    v_table := lower('rex_' || r.firm || '_control_followup_calls');
    v_seen := array_append(v_seen, v_table);

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_nr VARCHAR(10) NOT NULL,
        customer_id UUID NOT NULL,
        service_id UUID NOT NULL,
        appointment_id UUID,
        due_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT ''pending'',
        call_status VARCHAR(20) NOT NULL DEFAULT ''pending'',
        customer_name VARCHAR(255),
        customer_phone VARCHAR(50),
        service_name VARCHAR(255),
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (customer_id)',
      v_table || '_customer_idx',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (service_id)',
      v_table || '_service_idx',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (due_date)',
      v_table || '_due_date_idx',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (status)',
      v_table || '_status_idx',
      v_table
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON beauty.%I (
        customer_id, service_id, COALESCE(appointment_id, ''00000000-0000-0000-0000-000000000000''::uuid)
      )',
      v_table || '_uniq',
      v_table
    );
  END LOOP;

  -- 2) public.firms tablosundaki firmalar (ileride oluşacaklar için şimdiden garanti)
  FOR r IN
    SELECT DISTINCT TRIM(firm_nr::text) AS firm_nr
    FROM public.firms
    WHERE firm_nr IS NOT NULL AND TRIM(firm_nr::text) <> ''
  LOOP
    v_table := lower('rex_' || r.firm_nr || '_control_followup_calls');
    IF v_table = ANY (v_seen) THEN
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_table);

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_nr VARCHAR(10) NOT NULL,
        customer_id UUID NOT NULL,
        service_id UUID NOT NULL,
        appointment_id UUID,
        due_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT ''pending'',
        call_status VARCHAR(20) NOT NULL DEFAULT ''pending'',
        customer_name VARCHAR(255),
        customer_phone VARCHAR(50),
        service_name VARCHAR(255),
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (customer_id)',
      v_table || '_customer_idx',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (service_id)',
      v_table || '_service_idx',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (due_date)',
      v_table || '_due_date_idx',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (status)',
      v_table || '_status_idx',
      v_table
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON beauty.%I (
        customer_id, service_id, COALESCE(appointment_id, ''00000000-0000-0000-0000-000000000000''::uuid)
      )',
      v_table || '_uniq',
      v_table
    );
  END LOOP;

  -- 3) Varsayılan firma 001 için son kez garanti
  v_table := 'rex_001_control_followup_calls';
  IF NOT (v_table = ANY (v_seen))
     AND to_regclass('beauty.' || quote_ident(v_table)) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_nr VARCHAR(10) NOT NULL,
        customer_id UUID NOT NULL,
        service_id UUID NOT NULL,
        appointment_id UUID,
        due_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT ''pending'',
        call_status VARCHAR(20) NOT NULL DEFAULT ''pending'',
        customer_name VARCHAR(255),
        customer_phone VARCHAR(50),
        service_name VARCHAR(255),
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (customer_id)',
      v_table || '_customer_idx',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (service_id)',
      v_table || '_service_idx',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (due_date)',
      v_table || '_due_date_idx',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (status)',
      v_table || '_status_idx',
      v_table
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON beauty.%I (
        customer_id, service_id, COALESCE(appointment_id, ''00000000-0000-0000-0000-000000000000''::uuid)
      )',
      v_table || '_uniq',
      v_table
    );
  END IF;
END $$;

-- ============================================================================
-- 118b: beauty.rex_{firmNr}_beauty_services — yeni alanlar
-- requires_followup_call + control_period_days (follow-up arama emri ayarları)
-- Idempotent ALTER ... ADD COLUMN IF NOT EXISTS (PostgreSQL 9.6+).
-- ============================================================================

ALTER TABLE beauty.rex_001_beauty_services
  ADD COLUMN IF NOT EXISTS requires_followup_call BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE beauty.rex_001_beauty_services
  ADD COLUMN IF NOT EXISTS control_period_days INTEGER;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_beauty_services$'
  LOOP
    EXECUTE format(
      'ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS requires_followup_call BOOLEAN NOT NULL DEFAULT false',
      r.tablename
    );
    EXECUTE format(
      'ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS control_period_days INTEGER',
      r.tablename
    );
  END LOOP;
END $$;
