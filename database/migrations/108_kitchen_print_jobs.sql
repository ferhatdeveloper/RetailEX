-- 108: Mutfak yazıcı servis kuyruğu
-- rest.rex_{firm}_{period}_kitchen_print_jobs

CREATE SCHEMA IF NOT EXISTS rest;

CREATE OR REPLACE FUNCTION public.INIT_RESTAURANT_KITCHEN_PRINT_JOBS_TABLE(
  p_firm_nr VARCHAR,
  p_period_nr VARCHAR
)
RETURNS void AS $$
DECLARE
  v_firm TEXT := lower(trim(p_firm_nr));
  v_period TEXT := lower(trim(p_period_nr));
  v_table TEXT;
BEGIN
  IF length(v_firm) <= 3 THEN
    v_firm := lpad(v_firm, 3, '0');
  END IF;
  IF length(v_period) <= 2 THEN
    v_period := lpad(v_period, 2, '0');
  END IF;

  v_table := 'rex_' || v_firm || '_' || v_period || '_kitchen_print_jobs';

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS rest.%I (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      kitchen_order_id   UUID,
      order_id           UUID,
      printer_profile_id TEXT,
      printer_name       TEXT,
      connection         TEXT,
      address            TEXT,
      port               INT,
      locale             TEXT DEFAULT 'tr',
      payload            JSONB NOT NULL,
      status             VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempts           INT NOT NULL DEFAULT 0,
      last_error         TEXT,
      claimed_by         TEXT,
      claimed_at         TIMESTAMPTZ,
      printed_at         TIMESTAMPTZ,
      source_system      TEXT,
      source_db          TEXT,
      created_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  $sql$, v_table);

  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS kitchen_order_id UUID', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS order_id UUID', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS printer_profile_id TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS printer_name TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS connection TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS address TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS port INT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT ''tr''', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT ''{}''::jsonb', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT ''pending''', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS last_error TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS claimed_by TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS source_system TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS source_db TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', v_table);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON rest.%I (status, created_at) WHERE status IN (''pending'', ''failed'')',
    'idx_' || v_table || '_status_created_at',
    v_table
  );
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  f RECORD;
  p RECORD;
  r RECORD;
  m TEXT[];
BEGIN
  IF to_regclass('public.firms') IS NOT NULL AND to_regclass('public.periods') IS NOT NULL THEN
    FOR f IN SELECT firm_nr FROM firms WHERE COALESCE(is_active, true) LOOP
      FOR p IN SELECT nr FROM periods WHERE firm_id = (SELECT id FROM firms WHERE firm_nr = f.firm_nr LIMIT 1) LOOP
        PERFORM public.INIT_RESTAURANT_KITCHEN_PRINT_JOBS_TABLE(f.firm_nr, p.nr::varchar);
      END LOOP;
    END LOOP;
  END IF;

  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'rest'
      AND tablename ~ '^rex_[[:alnum:]]+_[[:alnum:]]+_rest_kitchen_items$'
  LOOP
    m := regexp_match(r.tablename, '^rex_([[:alnum:]]+)_([[:alnum:]]+)_rest_kitchen_items$');
    IF m IS NOT NULL THEN
      PERFORM public.INIT_RESTAURANT_KITCHEN_PRINT_JOBS_TABLE(m[1], m[2]);
    END IF;
  END LOOP;
END $$;
