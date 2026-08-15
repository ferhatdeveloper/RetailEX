-- 124: Mutfak/yazıcı kuyruğu + dizayn eşlemesi (idempotent catch-up)
-- 109/110 uygulanmış ama tablo oluşmamış (yeni dönem, hibrit yerel, rest_orders
-- sonradan açılmış) ortamlar için. CREATE TABLE IF NOT EXISTS / INIT güvenli.

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
      job_type           VARCHAR(40) NOT NULL DEFAULT 'kitchen_ticket',
      kitchen_order_id   UUID,
      order_id           UUID,
      printer_profile_id TEXT,
      printer_name       TEXT,
      connection         TEXT,
      address            TEXT,
      port               INT,
      locale             TEXT DEFAULT 'tr',
      payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
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

  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS job_type VARCHAR(40) NOT NULL DEFAULT ''kitchen_ticket''', v_table);
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON rest.%I (status, created_at) WHERE status IN (''pending'', ''failed'')',
    'idx_' || v_table || '_status_created_at',
    v_table
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.INIT_RESTAURANT_PRINT_JOBS_TABLE(
  p_firm_nr VARCHAR,
  p_period_nr VARCHAR
)
RETURNS void AS $$
DECLARE
  v_firm TEXT := lower(trim(p_firm_nr));
  v_period TEXT := lower(trim(p_period_nr));
  v_table TEXT;
  v_kitchen_table TEXT;
BEGIN
  IF length(v_firm) <= 3 THEN
    v_firm := lpad(v_firm, 3, '0');
  END IF;
  IF length(v_period) <= 2 THEN
    v_period := lpad(v_period, 2, '0');
  END IF;

  v_table := 'rex_' || v_firm || '_' || v_period || '_print_jobs';
  v_kitchen_table := 'rex_' || v_firm || '_' || v_period || '_kitchen_print_jobs';

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS rest.%I (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_type           VARCHAR(40) NOT NULL DEFAULT 'kitchen_ticket',
      status             VARCHAR(20) NOT NULL DEFAULT 'pending',
      priority           INT NOT NULL DEFAULT 100,
      connection         TEXT,
      address            TEXT,
      port               INT,
      printer_name       TEXT,
      printer_profile_id TEXT,
      locale             TEXT DEFAULT 'tr',
      copies             INT NOT NULL DEFAULT 1,
      payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
      ref_type           TEXT,
      ref_id             TEXT,
      attempts           INT DEFAULT 0,
      last_error         TEXT,
      claimed_by         TEXT,
      claimed_at         TIMESTAMPTZ,
      printed_at         TIMESTAMPTZ,
      source_system      TEXT,
      source_db          TEXT,
      created_at         TIMESTAMPTZ DEFAULT NOW()
    )
  $sql$, v_table);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON rest.%I (status, priority, created_at) WHERE status IN (''pending'', ''failed'')',
    'idx_' || v_table || '_status_priority_created_at',
    v_table
  );

  PERFORM public.INIT_RESTAURANT_KITCHEN_PRINT_JOBS_TABLE(v_firm, v_period);
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.print_design_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr VARCHAR(10) NOT NULL,
  scope VARCHAR(64) NOT NULL,
  design_kind VARCHAR(32) NOT NULL DEFAULT 'fastreport_frx',
  design_id UUID,
  design_ref TEXT,
  design_name TEXT,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(firm_nr, scope)
);

CREATE INDEX IF NOT EXISTS idx_print_design_bindings_firm_active
  ON public.print_design_bindings (firm_nr, is_active, scope);

DO $$
DECLARE
  fp RECORD;
  r RECORD;
BEGIN
  IF to_regclass('public.firms') IS NOT NULL AND to_regclass('public.periods') IS NOT NULL THEN
    FOR fp IN
      SELECT f.firm_nr::varchar AS firm_nr, p.nr::varchar AS period_nr
      FROM public.firms f
      JOIN public.periods p ON p.firm_id = f.id
    LOOP
      PERFORM public.INIT_RESTAURANT_PRINT_JOBS_TABLE(fp.firm_nr, fp.period_nr);
    END LOOP;
  END IF;

  FOR r IN
    SELECT DISTINCT
      (regexp_match(tablename, '^rex_([0-9a-z]+)_([0-9a-z]+)_rest_orders$'))[1] AS firm_nr,
      (regexp_match(tablename, '^rex_([0-9a-z]+)_([0-9a-z]+)_rest_orders$'))[2] AS period_nr
    FROM pg_tables
    WHERE schemaname = 'rest'
      AND tablename ~ '^rex_[0-9a-z]+_[0-9a-z]+_rest_orders$'
  LOOP
    IF r.firm_nr IS NOT NULL AND r.period_nr IS NOT NULL THEN
      PERFORM public.INIT_RESTAURANT_PRINT_JOBS_TABLE(r.firm_nr, r.period_nr);
    END IF;
  END LOOP;

  FOR r IN
    SELECT DISTINCT
      (regexp_match(tablename, '^rex_([0-9a-z]+)_([0-9a-z]+)_sales$'))[1] AS firm_nr,
      (regexp_match(tablename, '^rex_([0-9a-z]+)_([0-9a-z]+)_sales$'))[2] AS period_nr
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9a-z]+_[0-9a-z]+_sales$'
  LOOP
    IF r.firm_nr IS NOT NULL AND r.period_nr IS NOT NULL THEN
      PERFORM public.INIT_RESTAURANT_PRINT_JOBS_TABLE(r.firm_nr, r.period_nr);
    END IF;
  END LOOP;
END $$;
