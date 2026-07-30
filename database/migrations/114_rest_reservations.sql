-- 114: Restoran rezervasyon tabloları (dönem bazlı)
-- rest.rex_{firm}_{period}_rest_reservations

CREATE SCHEMA IF NOT EXISTS rest;

CREATE OR REPLACE FUNCTION public.INIT_RESTAURANT_RESERVATIONS_TABLE(
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

  v_table := 'rex_' || v_firm || '_' || v_period || '_rest_reservations';

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS rest.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id UUID,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      reservation_date DATE NOT NULL,
      reservation_time TIME NOT NULL,
      guest_count INTEGER NOT NULL DEFAULT 2,
      table_id UUID,
      table_number TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  $sql$, v_table);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON rest.%I (reservation_date, reservation_time)',
    'idx_' || v_table || '_date_time',
    v_table
  );
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  fp RECORD;
  r RECORD;
BEGIN
  -- firms + periods (periods.firm_id → firms.id)
  IF to_regclass('public.firms') IS NOT NULL AND to_regclass('public.periods') IS NOT NULL THEN
    FOR fp IN
      SELECT f.firm_nr::varchar AS firm_nr, p.nr::varchar AS period_nr
      FROM public.firms f
      JOIN public.periods p ON p.firm_id = f.id
    LOOP
      PERFORM public.INIT_RESTAURANT_RESERVATIONS_TABLE(fp.firm_nr, fp.period_nr);
    END LOOP;
  END IF;

  -- Mevcut rest_orders dönem prefix'lerinden de türet
  FOR r IN
    SELECT DISTINCT
      (regexp_match(tablename, '^rex_([0-9a-z]+)_([0-9a-z]+)_rest_orders$'))[1] AS firm_nr,
      (regexp_match(tablename, '^rex_([0-9a-z]+)_([0-9a-z]+)_rest_orders$'))[2] AS period_nr
    FROM pg_tables
    WHERE schemaname = 'rest'
      AND tablename ~ '^rex_[0-9a-z]+_[0-9a-z]+_rest_orders$'
  LOOP
    IF r.firm_nr IS NOT NULL AND r.period_nr IS NOT NULL THEN
      PERFORM public.INIT_RESTAURANT_RESERVATIONS_TABLE(r.firm_nr, r.period_nr);
    END IF;
  END LOOP;

  -- Varsayılan demo firma/dönem
  PERFORM public.INIT_RESTAURANT_RESERVATIONS_TABLE('001', '01');
END $$;
