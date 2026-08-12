-- 100: Kasap Üretim ve Maliyet Yönetimi
-- Reçete + üretim fişi + çıktı maliyet dağıtımı + firma maliyet ayarı
-- Ürün/depo/stok hareketleri mevcut products / stores / stock_movements ile bağlanır.

CREATE OR REPLACE FUNCTION public.INIT_BUTCHER_PRODUCTION_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      default_cost_method VARCHAR(30) NOT NULL DEFAULT ''by_weight'',
      default_warehouse_id UUID,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_butcher_settings'
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      code VARCHAR(50),
      name VARCHAR(255) NOT NULL,
      animal_type VARCHAR(30) NOT NULL DEFAULT ''sheep'',
      input_product_id UUID,
      waste_product_id UUID,
      cost_method VARCHAR(30),
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_butcher_recipes'
  );
  EXECUTE format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS code VARCHAR(50)',
    v_prefix || '_butcher_recipes'
  );
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, lower(code)) WHERE code IS NOT NULL AND btrim(code) <> ''''',
    v_prefix || '_butcher_recipes_code_uidx',
    v_prefix || '_butcher_recipes'
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      recipe_id UUID NOT NULL,
      product_id UUID NOT NULL,
      sort_order INTEGER DEFAULT 0,
      standard_ratio_percent DECIMAL(8,3),
      coefficient DECIMAL(12,4) NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_butcher_recipe_outputs'
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      order_no VARCHAR(50) UNIQUE,
      recipe_id UUID,
      animal_type VARCHAR(30) NOT NULL DEFAULT ''sheep'',
      input_product_id UUID NOT NULL,
      input_qty_kg DECIMAL(15,3) NOT NULL,
      input_unit_cost DECIMAL(15,4) NOT NULL DEFAULT 0,
      input_total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
      warehouse_id UUID,
      waste_product_id UUID,
      lot_no VARCHAR(80),
      cost_method VARCHAR(30) NOT NULL DEFAULT ''by_weight'',
      output_qty_kg DECIMAL(15,3) NOT NULL DEFAULT 0,
      waste_qty_kg DECIMAL(15,3) NOT NULL DEFAULT 0,
      waste_percent DECIMAL(8,3) NOT NULL DEFAULT 0,
      waste_cost_allocated DECIMAL(15,2) NOT NULL DEFAULT 0,
      cost_per_kg_salable DECIMAL(15,4) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT ''draft'',
      note TEXT,
      purchase_invoice_id UUID,
      purchase_invoice_no VARCHAR(80),
      supplier_id UUID,
      supplier_name VARCHAR(255),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_butcher_orders'
  );

  EXECUTE format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS purchase_invoice_id UUID',
    v_prefix || '_butcher_orders'
  );
  EXECUTE format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS purchase_invoice_no VARCHAR(80)',
    v_prefix || '_butcher_orders'
  );
  EXECUTE format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS supplier_id UUID',
    v_prefix || '_butcher_orders'
  );
  EXECUTE format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255)',
    v_prefix || '_butcher_orders'
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL,
      product_id UUID NOT NULL,
      output_kg DECIMAL(15,3) NOT NULL DEFAULT 0,
      coefficient DECIMAL(12,4) NOT NULL DEFAULT 1,
      sale_price DECIMAL(15,4) NOT NULL DEFAULT 0,
      unit_cost DECIMAL(15,4) NOT NULL DEFAULT 0,
      total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
      cost_share_percent DECIMAL(8,3) NOT NULL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_butcher_order_outputs'
  );

  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_butcher_settings');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_butcher_recipes');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_butcher_recipe_outputs');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_butcher_orders');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_butcher_order_outputs');
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
    PERFORM public.INIT_BUTCHER_PRODUCTION_TABLES(r.firm_nr);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
