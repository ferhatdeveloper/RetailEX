-- Online mağaza: eticaret_settings.catalogFirmNr ile vitrin firma seçimi

CREATE OR REPLACE FUNCTION public.eticaret_submit_web_order(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_demo          BOOLEAN := COALESCE((payload->>'demo_mode')::boolean, false);
  v_tenant        TEXT := COALESCE(NULLIF(TRIM(payload->>'tenant_code'), ''), 'default');
  v_firm          TEXT;
  v_period        TEXT;
  v_eticaret      JSONB;
  v_currency      TEXT := COALESCE(NULLIF(TRIM(payload->>'currency'), ''), 'TRY');
  v_order_no      TEXT;
  v_order_id      UUID := gen_random_uuid();
  v_sales_id      UUID;
  v_tbl_sales     TEXT;
  v_tbl_items     TEXT;
  v_subtotal      DECIMAL(15,2) := COALESCE((payload->>'subtotal')::decimal, 0);
  v_total         DECIMAL(15,2) := COALESCE((payload->>'total')::decimal, 0);
  v_items         JSONB := COALESCE(payload->'items', '[]'::jsonb);
  v_item          JSONB;
  v_pay_provider  TEXT := NULLIF(TRIM(payload->>'payment_provider'), '');
  v_pay_status    TEXT := COALESCE(NULLIF(TRIM(payload->>'payment_status'), ''), 'pending');
  v_customer_name TEXT := NULLIF(TRIM(payload->>'customer_name'), '');
  v_customer_email TEXT := NULLIF(TRIM(payload->>'customer_email'), '');
  v_customer_phone TEXT := NULLIF(TRIM(payload->>'customer_phone'), '');
  v_address       TEXT := NULLIF(TRIM(payload->>'shipping_address'), '');
  v_year          TEXT := to_char(now(), 'YYYY');
  v_seq           INT;
BEGIN
  SELECT primary_firm_nr, primary_period_nr, eticaret_settings
  INTO v_firm, v_period, v_eticaret
  FROM public.system_settings
  WHERE id = 1;

  IF NULLIF(TRIM(payload->>'firm_nr'), '') IS NOT NULL THEN
    v_firm := NULLIF(TRIM(payload->>'firm_nr'), '');
  ELSIF v_eticaret IS NOT NULL
    AND NULLIF(TRIM(v_eticaret->>'catalogFirmNr'), '') IS NOT NULL THEN
    v_firm := NULLIF(TRIM(v_eticaret->>'catalogFirmNr'), '');
  END IF;

  v_firm := COALESCE(NULLIF(TRIM(v_firm), ''), '001');
  v_period := COALESCE(NULLIF(TRIM(v_period), ''), '01');
  v_firm := lpad(v_firm, 3, '0');
  v_period := lpad(v_period, 2, '0');

  SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(order_no, '^WEB-' || v_year || '-', ''), '') AS INT)), 0) + 1
  INTO v_seq
  FROM public.eticaret_web_orders
  WHERE order_no LIKE 'WEB-' || v_year || '-%';

  v_order_no := 'WEB-' || v_year || '-' || lpad(v_seq::text, 5, '0');

  INSERT INTO public.eticaret_web_orders (
    id, tenant_code, order_no, status, demo_mode,
    customer_name, customer_email, customer_phone, shipping_address,
    payment_provider, payment_status, payment_ref,
    currency, subtotal, total, items, firm_nr, period_nr, notes
  ) VALUES (
    v_order_id, v_tenant, v_order_no,
    CASE WHEN v_demo THEN 'demo' ELSE 'pending' END,
    v_demo,
    v_customer_name, v_customer_email, v_customer_phone, v_address,
    v_pay_provider, v_pay_status, NULLIF(TRIM(payload->>'payment_ref'), ''),
    v_currency, v_subtotal, v_total, v_items, v_firm, v_period,
    COALESCE(NULLIF(TRIM(payload->>'notes'), ''), 'Online mağaza siparişi')
  );

  IF v_demo THEN
    RETURN jsonb_build_object(
      'ok', true,
      'demo', true,
      'order_id', v_order_id,
      'order_no', v_order_no,
      'message', 'Demo modu — sipariş fişi oluşturulmadı'
    );
  END IF;

  v_tbl_sales := 'rex_' || v_firm || '_' || v_period || '_sales';
  v_tbl_items := 'rex_' || v_firm || '_' || v_period || '_sale_items';
  v_sales_id := gen_random_uuid();

  EXECUTE format(
    'INSERT INTO %I (
      id, firm_nr, period_nr, fiche_no, document_no, trcode, fiche_type, date,
      customer_name, total_net, total_vat, total_discount, net_amount,
      currency, currency_rate, status, payment_method, notes, header_fields
    ) VALUES (
      $1, $2, $3, $4, $4, 20, ''order'', now(),
      $5, $6, 0, 0, $6,
      $7, 1, ''approved'', $8, $9, $10::jsonb
    )',
    v_tbl_sales
  ) USING
    v_sales_id, v_firm, v_period, v_order_no,
    COALESCE(v_customer_name, 'Online Müşteri'),
    v_total, v_currency,
    COALESCE(v_pay_provider, 'online'),
    'Web sipariş: ' || v_order_no || COALESCE(' · ' || v_address, ''),
    jsonb_build_object(
      'source', 'eticaret_web',
      'web_order_id', v_order_id::text,
      'tenant_code', v_tenant,
      'customer_email', v_customer_email,
      'customer_phone', v_customer_phone
    );

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    EXECUTE format(
      'INSERT INTO %I (
        id, invoice_id, firm_nr, period_nr, item_code, item_name, product_id,
        quantity, unit_price, vat_rate, total_amount, net_amount, unit
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, NULLIF($6, '''')::uuid,
        $7, $8, COALESCE(($9)::decimal, 0), $10, $10, COALESCE(NULLIF($11, ''''), ''Adet'')
      )',
      v_tbl_items
    ) USING
      v_sales_id, v_firm, v_period,
      COALESCE(v_item->>'code', v_item->>'product_code', ''),
      COALESCE(v_item->>'name', v_item->>'product_name', 'Ürün'),
      COALESCE(v_item->>'product_id', ''),
      COALESCE((v_item->>'quantity')::decimal, 1),
      COALESCE((v_item->>'price')::decimal, 0),
      v_item->>'vat_rate',
      COALESCE((v_item->>'line_total')::decimal,
        COALESCE((v_item->>'quantity')::decimal, 1) * COALESCE((v_item->>'price')::decimal, 0)),
      v_item->>'unit';
  END LOOP;

  UPDATE public.eticaret_web_orders
  SET status = 'converted',
      sales_fiche_id = v_sales_id,
      sales_fiche_no = v_order_no,
      updated_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'demo', false,
    'order_id', v_order_id,
    'order_no', v_order_no,
    'sales_fiche_id', v_sales_id,
    'sales_fiche_no', v_order_no,
    'fiche_type', 'order',
    'trcode', 20,
    'firm_nr', v_firm
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.eticaret_submit_web_order(JSONB) IS
  'Online mağaza checkout — catalogFirmNr veya payload.firm_nr ile firma; rex_*_sales sipariş fişi (trcode 20)';
