-- Ödeme planları (web paymentPlansAPI + mobil FinanceDefinitions) + firma gider/masraf tabloları güvence
-- logic.pay_plans / pay_plan_lines şemada yoktu → PostgREST 404 (42P01)
-- rex_{f}_cost_centers / expenses: 078 fonksiyonunu mevcut firmalara yeniden uygula

CREATE SCHEMA IF NOT EXISTS logic;

CREATE TABLE IF NOT EXISTS logic.pay_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr VARCHAR(10) NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (firm_nr, code)
);

CREATE TABLE IF NOT EXISTS logic.pay_plan_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES logic.pay_plans(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL DEFAULT 1,
  day_offset INTEGER NOT NULL DEFAULT 0,
  percent NUMERIC(8, 4) NOT NULL DEFAULT 0,
  amount NUMERIC(18, 2),
  payment_type VARCHAR(50) DEFAULT 'cash'
);

CREATE INDEX IF NOT EXISTS idx_logic_pay_plans_firm ON logic.pay_plans (firm_nr);
CREATE INDEX IF NOT EXISTS idx_logic_pay_plan_lines_plan ON logic.pay_plan_lines (plan_id);

DO $$
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON logic.pay_plans TO anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON logic.pay_plan_lines TO anon;
EXCEPTION
  WHEN undefined_object THEN
    NULL; -- anon rolü yoksa (bazı yerel PG) atla
END;
$$;

-- Masraf merkezi / gider tabloları
DO $$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
  v_firm TEXT;
  v_prefix TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'ensure_firm_expense_tables'
  ) THEN
    FOR r IN SELECT DISTINCT firm_nr FROM public.firms WHERE firm_nr IS NOT NULL
    LOOP
      BEGIN
        PERFORM public.ensure_firm_expense_tables(r.firm_nr);
        v_count := v_count + 1;
      EXCEPTION
        WHEN undefined_object THEN
          -- GRANT anon başarısız olabilir; tabloları aşağıda güvenceye al
          NULL;
        WHEN OTHERS THEN
          NULL;
      END;
    END LOOP;
    IF v_count = 0 THEN
      BEGIN
        PERFORM public.ensure_firm_expense_tables('001');
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
    END IF;
  END IF;

  -- Güvence: en az 001 cost_centers / expenses (078 GRANT yüzünden rollback olmuş olabilir)
  FOR v_firm IN
    SELECT DISTINCT lpad(ltrim(regexp_replace(COALESCE(firm_nr::text, '001'), '[^0-9]', '', 'g'), '0'), 3, '0')
    FROM public.firms
    WHERE firm_nr IS NOT NULL
    UNION
    SELECT '001'
  LOOP
    IF v_firm IS NULL OR v_firm = '' OR v_firm = '000' THEN
      v_firm := '001';
    END IF;
    v_prefix := 'rex_' || v_firm;

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I (
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
      'CREATE TABLE IF NOT EXISTS public.%I (
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
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )',
      v_prefix || '_expenses'
    );
    BEGIN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', v_prefix || '_cost_centers');
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', v_prefix || '_expenses');
    EXCEPTION
      WHEN undefined_object THEN
        NULL;
    END;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- 078 ensure fonksiyonunu anon-yok ortamda da güvenli hale getir (yeniden tanım)
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
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )',
    v_prefix || '_expenses'
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
