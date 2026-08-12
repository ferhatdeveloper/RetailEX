-- ============================================================================
-- 119: Beauty takip hatırlatması — arama durumu (call_status) kolonu
-- ============================================================================
-- `beauty.rex_{firmNr}_follow_up_reminder_actions` tablolarına
--   `call_status VARCHAR(20) NOT NULL DEFAULT 'pending'`
-- kolonu eklenir. Mevcut satırlar otomatik 'pending' değerini alır.
-- Değer sözlüğü: pending | called | no_answer | callback_requested | cancelled
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- Tauri'de DO $$ kullanılmaz; bu yüzden firmalara göre dolaşan ayrı
-- EXECUTE format(...) satırları kullanılır.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_table TEXT;
  v_seen TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- 1) Mevcut follow_up_reminder_actions tablolarına kolon ekle
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty'
      AND tablename ~ '^rex_[0-9]+_follow_up_reminder_actions$'
  LOOP
    v_table := r.tablename;
    v_seen := array_append(v_seen, v_table);
    EXECUTE format(
      'ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS call_status VARCHAR(20) NOT NULL DEFAULT ''pending''',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (call_status)',
      v_table || '_call_status_idx',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (customer_id, call_status)',
      v_table || '_customer_call_status_idx',
      v_table
    );
  END LOOP;

  -- 2) public.firms tablosundaki firmalar (ileride oluşacaklar için garanti)
  FOR r IN
    SELECT DISTINCT TRIM(firm_nr::text) AS firm_nr
    FROM public.firms
    WHERE firm_nr IS NOT NULL AND TRIM(firm_nr::text) <> ''
  LOOP
    v_table := lower('rex_' || r.firm_nr || '_follow_up_reminder_actions');
    IF v_table = ANY (v_seen) THEN
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_table);
    EXECUTE format(
      'ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS call_status VARCHAR(20) NOT NULL DEFAULT ''pending''',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (call_status)',
      v_table || '_call_status_idx',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (customer_id, call_status)',
      v_table || '_customer_call_status_idx',
      v_table
    );
  END LOOP;

  -- 3) Varsayılan firma 001 için son kez garanti
  v_table := 'rex_001_follow_up_reminder_actions';
  IF NOT (v_table = ANY (v_seen))
     AND to_regclass('beauty.' || quote_ident(v_table)) IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS call_status VARCHAR(20) NOT NULL DEFAULT ''pending''',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (call_status)',
      v_table || '_call_status_idx',
      v_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (customer_id, call_status)',
      v_table || '_customer_call_status_idx',
      v_table
    );
  END IF;
END $$;

-- ============================================================================
-- 119b: 000_master_schema.sql CREATE TABLE bloğuyla aynı yapıyı doğrula
-- (init_boutique / init_period sırasında yeni kurulumlar için call_status
-- varsayılan olarak eklenir — 000_master_schema.sql güncellendi).
-- ============================================================================

NOTIFY pgrst, 'reload schema';
