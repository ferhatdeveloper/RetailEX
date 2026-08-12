-- Merkez fiyat değişimi logu + cihaz teslim onayı (A aldı / B almadı)

CREATE TABLE IF NOT EXISTS public.price_change_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr       VARCHAR(10) NOT NULL,
  table_name    VARCHAR(100) NOT NULL,
  record_id     UUID NOT NULL,
  product_code  VARCHAR(100),
  product_name  VARCHAR(255),
  old_prices    JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_prices    JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_diff    JSONB NOT NULL DEFAULT '[]'::jsonb,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source        VARCHAR(32) NOT NULL DEFAULT 'db_trigger'
);

CREATE INDEX IF NOT EXISTS idx_price_change_log_record_changed
  ON public.price_change_log (record_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_change_log_firm_changed
  ON public.price_change_log (firm_nr, changed_at DESC);

CREATE TABLE IF NOT EXISTS public.device_price_ack (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_change_log_id UUID REFERENCES public.price_change_log(id) ON DELETE SET NULL,
  device_id           TEXT NOT NULL,
  store_id            UUID,
  terminal_name       VARCHAR(100),
  firm_nr             VARCHAR(10) NOT NULL,
  table_name          VARCHAR(100) NOT NULL,
  record_id           UUID NOT NULL,
  product_code        VARCHAR(100),
  old_prices          JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_prices          JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_diff          JSONB NOT NULL DEFAULT '[]'::jsonb,
  ack_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_price_ack_log_device
  ON public.device_price_ack (device_id, price_change_log_id)
  WHERE price_change_log_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_price_ack_device_ack
  ON public.device_price_ack (device_id, ack_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_price_ack_log
  ON public.device_price_ack (price_change_log_id);

COMMENT ON TABLE public.price_change_log IS 'Ürün fiyat alanı değişimleri (merkez/yerel PG trigger)';
COMMENT ON TABLE public.device_price_ack IS 'Cihazın fiyat değişimini aldığına dair merkez kaydı';

CREATE OR REPLACE FUNCTION public.extract_product_price_fields(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_keys TEXT[] := ARRAY[
    'price','cost','purchase_price',
    'price_list_1','price_list_2','price_list_3','price_list_4','price_list_5','price_list_6',
    'pricelist1','pricelist2','pricelist3','pricelist4','pricelist5','pricelist6',
    'sale_price_usd','sale_price_eur','purchase_price_usd','purchase_price_eur','custom_exchange_rate'
  ];
  v_out JSONB := '{}'::jsonb;
  k TEXT;
BEGIN
  IF p_row IS NULL THEN RETURN v_out; END IF;
  FOREACH k IN ARRAY v_keys LOOP
    IF p_row ? k AND p_row->k IS NOT NULL AND p_row->k <> 'null'::jsonb THEN
      v_out := v_out || jsonb_build_object(k, p_row->k);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.build_price_diff_json(p_old JSONB, p_new JSONB)
RETURNS JSONB AS $$
DECLARE
  v_diff JSONB := '[]'::jsonb;
  k TEXT;
  v_old TEXT;
  v_new TEXT;
BEGIN
  FOR k IN SELECT jsonb_object_keys(p_new) LOOP
    v_old := COALESCE(p_old->>k, '');
    v_new := COALESCE(p_new->>k, '');
    IF v_old IS DISTINCT FROM v_new THEN
      v_diff := v_diff || jsonb_build_array(jsonb_build_object('field', k, 'old', p_old->k, 'new', p_new->k));
    END IF;
  END LOOP;
  RETURN v_diff;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.log_rex_product_price_change()
RETURNS TRIGGER AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_diff JSONB;
  v_firm TEXT;
BEGIN
  v_old := public.extract_product_price_fields(to_jsonb(OLD));
  v_new := public.extract_product_price_fields(to_jsonb(NEW));
  v_diff := public.build_price_diff_json(v_old, v_new);
  IF jsonb_array_length(v_diff) = 0 THEN
    RETURN NEW;
  END IF;
  v_firm := COALESCE(NULLIF(trim(NEW.firm_nr), ''), '001');
  INSERT INTO public.price_change_log (
    firm_nr, table_name, record_id, product_code, product_name,
    old_prices, new_prices, price_diff, source
  ) VALUES (
    v_firm,
    TG_TABLE_NAME,
    NEW.id,
    NEW.code,
    NEW.name,
    v_old,
    v_new,
    v_diff,
    'db_trigger'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_products$'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_price_change ON public.%I', r.tablename, r.tablename);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_price_change AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_rex_product_price_change()',
      r.tablename,
      r.tablename
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT ON public.price_change_log TO anon;
    GRANT SELECT, INSERT ON public.device_price_ack TO anon;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
