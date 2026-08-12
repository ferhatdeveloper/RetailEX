-- 087: Karkas parçalama (kasap) — 1 girdi → N çıktı + fire maliyet dağıtımı

CREATE OR REPLACE FUNCTION public.INIT_DISASSEMBLY_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      name VARCHAR(255) NOT NULL,
      animal_type VARCHAR(20) NOT NULL DEFAULT ''cattle'',
      input_product_id UUID,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_disassembly_templates'
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID NOT NULL,
      product_id UUID NOT NULL,
      sort_order INTEGER DEFAULT 0,
      standard_ratio_percent DECIMAL(8,3),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_disassembly_template_outputs'
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      order_no VARCHAR(50) UNIQUE,
      template_id UUID,
      animal_type VARCHAR(20) NOT NULL DEFAULT ''cattle'',
      input_product_id UUID NOT NULL,
      input_qty_kg DECIMAL(15,3) NOT NULL,
      input_unit_cost DECIMAL(15,4) NOT NULL DEFAULT 0,
      input_total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
      output_qty_kg DECIMAL(15,3) NOT NULL DEFAULT 0,
      waste_qty_kg DECIMAL(15,3) NOT NULL DEFAULT 0,
      waste_cost_allocated DECIMAL(15,2) NOT NULL DEFAULT 0,
      cost_per_kg_salable DECIMAL(15,4) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT ''draft'',
      note TEXT,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_disassembly_orders'
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL,
      product_id UUID NOT NULL,
      output_kg DECIMAL(15,3) NOT NULL,
      unit_cost DECIMAL(15,4) NOT NULL DEFAULT 0,
      total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
      cost_share_percent DECIMAL(8,3) NOT NULL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_disassembly_order_outputs'
  );
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_disassembly_templates');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_disassembly_template_outputs');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_disassembly_orders');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_disassembly_order_outputs');
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT regexp_replace(tablename, '^rex_([0-9]+)_products$', '\1') AS firm_nr
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_products$'
  LOOP
    PERFORM public.INIT_DISASSEMBLY_TABLES(r.firm_nr);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
