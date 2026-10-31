-- Gider pusulası fiş numarası.
-- Belge no ayrı kalır. Tutar, işaret ve kur değişmez.
-- Eski satırlar yeniden numaralanmaz; sonraki numara max+1, hiç yoksa 000001.

CREATE OR REPLACE FUNCTION public.add_expense_fiche_no_columns()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname ~ '^rex_[0-9]+_expenses$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS fiche_no VARCHAR(20)',
      r.tbl
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, fiche_no) WHERE fiche_no IS NOT NULL AND btrim(fiche_no) <> %L',
      r.tbl || '_fiche_no_uidx',
      r.tbl,
      ''
    );
  END LOOP;
END;
$$;

SELECT public.add_expense_fiche_no_columns();

CREATE OR REPLACE FUNCTION public.ensure_firm_expense_tables(p_firm_nr VARCHAR)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_firm TEXT;
  v_prefix TEXT;
BEGIN
  v_firm := lpad(
    ltrim(regexp_replace(COALESCE(p_firm_nr, ''), '[^0-9]', '', 'g'), '0'),
    3,
    '0'
  );
  IF v_firm = '' OR v_firm = '000' THEN
    v_firm := '001';
  END IF;
  v_prefix := 'rex_' || v_firm;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      firm_nr VARCHAR(10) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(code, firm_nr)
    )',
    v_prefix || '_cost_centers'
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category VARCHAR(100),
      description TEXT,
      amount DECIMAL(18, 2) NOT NULL DEFAULT 0,
      expense_date DATE,
      payment_method VARCHAR(50),
      cost_center_id UUID,
      firm_nr VARCHAR(10) NOT NULL,
      cash_line_id UUID,
      cash_register_id UUID,
      fiche_no VARCHAR(20),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )',
    v_prefix || '_expenses'
  );

  EXECUTE format(
    'ALTER TABLE %I ADD COLUMN IF NOT EXISTS fiche_no VARCHAR(20)',
    v_prefix || '_expenses'
  );
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (firm_nr, fiche_no) WHERE fiche_no IS NOT NULL AND btrim(fiche_no) <> %L',
    v_prefix || '_expenses_fiche_no_uidx',
    v_prefix || '_expenses',
    ''
  );

  BEGIN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon', v_prefix || '_cost_centers');
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon', v_prefix || '_expenses');
  EXCEPTION
    WHEN undefined_object THEN
      NULL;
  END;

  BEGIN
    PERFORM public.try_apply_sync_triggers(v_prefix || '_cost_centers');
    PERFORM public.try_apply_sync_triggers(v_prefix || '_expenses');
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
    WHEN OTHERS THEN
      NULL;
  END;
END;
$$;

NOTIFY pgrst, 'reload schema';
