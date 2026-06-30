-- Gider yönetimi (Güzellik / ERP): rex_{firm}_expenses + rex_{firm}_cost_centers
-- PostgREST (rest_api) modunda tablo yoksa gider eklenemez.

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
      category VARCHAR(50) NOT NULL,
      description TEXT NOT NULL,
      amount DECIMAL(18,2) NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      document_number VARCHAR(100),
      document_url TEXT,
      store_id UUID,
      cost_center_id UUID,
      expense_date DATE NOT NULL,
      notes TEXT,
      created_by UUID,
      firm_nr VARCHAR(10) NOT NULL,
      cash_line_id UUID,
      cash_register_id UUID,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )',
    v_prefix || '_expenses'
  );

  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon', v_prefix || '_cost_centers');
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon', v_prefix || '_expenses');

  PERFORM public.try_apply_sync_triggers(v_prefix || '_cost_centers');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_expenses');
END;
$$;

DO $$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN SELECT DISTINCT firm_nr FROM public.firms WHERE firm_nr IS NOT NULL
  LOOP
    PERFORM public.ensure_firm_expense_tables(r.firm_nr);
    v_count := v_count + 1;
  END LOOP;
  IF v_count = 0 THEN
    PERFORM public.ensure_firm_expense_tables('001');
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

GRANT EXECUTE ON FUNCTION public.ensure_firm_expense_tables(VARCHAR) TO anon;
