-- ============================================================================
-- 090: Logo MSSQL senkron — dönem tablolarına ref_id + cari hareket (CLFLINE)
-- ============================================================================

-- Mevcut dönem sales tablolarına Logo kolonları
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_[0-9]+_sales$'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS ref_id INTEGER', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS logo_client_ref INTEGER', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS logo_salesman_ref INTEGER', r.tablename);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (ref_id) WHERE ref_id IS NOT NULL',
      r.tablename || '_logo_ref_id_uidx',
      r.tablename
    );
  END LOOP;
END $$;

-- Mevcut dönem sale_items
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_[0-9]+_sale_items$'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS ref_id INTEGER', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS logo_product_ref INTEGER', r.tablename);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (ref_id) WHERE ref_id IS NOT NULL',
      r.tablename || '_logo_ref_id_uidx',
      r.tablename
    );
  END LOOP;
END $$;

-- Mevcut dönem cash_lines
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_[0-9]+_cash_lines$'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS ref_id INTEGER', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS logo_cash_ref INTEGER', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS logo_client_ref INTEGER', r.tablename);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (ref_id) WHERE ref_id IS NOT NULL',
      r.tablename || '_logo_ref_id_uidx',
      r.tablename
    );
  END LOOP;
END $$;

-- Mevcut dönemler için account_movements (Logo CLFLINE)
DO $$
DECLARE r RECORD;
  v_firm TEXT;
  v_period TEXT;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_[0-9]+_sales$'
  LOOP
    v_firm := (regexp_match(r.tablename, '^rex_([0-9]+)_'))[1];
    v_period := (regexp_match(r.tablename, '^rex_[0-9]+_([0-9]+)_sales$'))[1];
    EXECUTE format($sql$
      CREATE TABLE IF NOT EXISTS public.rex_%s_%s_account_movements (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_nr      VARCHAR(10) NOT NULL,
        period_nr    VARCHAR(10) NOT NULL,
        ref_id       INTEGER,
        client_ref   INTEGER,
        customer_id  UUID,
        supplier_id  UUID,
        fiche_no     VARCHAR(100),
        date         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        amount       DECIMAL(15,2) DEFAULT 0,
        sign         INTEGER DEFAULT 0,
        trcode       INTEGER,
        module_nr    INTEGER,
        definition   TEXT,
        created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $sql$, v_firm, v_period);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (ref_id) WHERE ref_id IS NOT NULL',
      'rex_' || v_firm || '_' || v_period || '_account_movements_ref_uidx',
      'rex_' || v_firm || '_' || v_period || '_account_movements'
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (customer_id, date)',
      'rex_' || v_firm || '_' || v_period || '_account_movements_cust_date_idx',
      'rex_' || v_firm || '_' || v_period || '_account_movements'
    );
  END LOOP;
END $$;

-- CREATE_PERIOD_TABLES: yeni firmalarda Logo kolonları + account_movements
CREATE OR REPLACE FUNCTION CREATE_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE
  v_prefix       TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
  v_tbl_sales    TEXT := v_prefix || '_sales';
  v_tbl_items    TEXT := v_prefix || '_sale_items';
  v_tbl_am       TEXT := v_prefix || '_account_movements';
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr        VARCHAR(10) NOT NULL,
      period_nr      VARCHAR(10) NOT NULL,
      ref_id         INTEGER,
      logo_client_ref INTEGER,
      logo_salesman_ref INTEGER,
      fiche_no       VARCHAR(100) UNIQUE,
      document_no    VARCHAR(100),
      trcode         INTEGER,
      fiche_type     VARCHAR(50),
      date           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      customer_id    UUID,
      customer_name  VARCHAR(255),
      store_id       UUID REFERENCES stores(id),
      total_net      DECIMAL(15,2) DEFAULT 0,
      total_vat      DECIMAL(15,2) DEFAULT 0,
      total_gross    DECIMAL(15,2) DEFAULT 0,
      total_discount DECIMAL(15,2) DEFAULT 0,
      net_amount     DECIMAL(15,2) DEFAULT 0,
      total_cost     DECIMAL(15,2) DEFAULT 0,
      gross_profit   DECIMAL(15,2) DEFAULT 0,
      profit_margin  DECIMAL(15,2) DEFAULT 0,
      currency       VARCHAR(10) DEFAULT ''IQD'',
      currency_rate  DECIMAL(15,6) DEFAULT 1,
      status         VARCHAR(20) DEFAULT ''completed'',
      logo_sync_status VARCHAR(20) DEFAULT ''pending'',
      logo_sync_error TEXT,
      logo_sync_date TIMESTAMPTZ,
      payment_method VARCHAR(50),
      cashier        VARCHAR(100),
      created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      is_cancelled   BOOLEAN DEFAULT false,
      credit_amount  DECIMAL(15,2) DEFAULT 0,
      notes          TEXT,
      header_fields  JSONB NOT NULL DEFAULT ''{}''::jsonb,
      created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_tbl_sales);
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ref_id) WHERE ref_id IS NOT NULL',
    v_tbl_sales || '_logo_ref_id_uidx',
    v_tbl_sales
  );

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ref_id          INTEGER,
      logo_product_ref INTEGER,
      invoice_id      UUID REFERENCES %I(id) ON DELETE CASCADE,
      firm_nr         VARCHAR(10),
      period_nr       VARCHAR(10),
      item_code       VARCHAR(100),
      item_name       VARCHAR(255),
      product_id      UUID,
      quantity        DECIMAL(15,3) NOT NULL DEFAULT 0,
      unit_price      DECIMAL(15,2) NOT NULL DEFAULT 0,
      vat_rate        DECIMAL(5,2) DEFAULT 0,
      discount_rate   DECIMAL(15,4) DEFAULT 0,
      discount_amount DECIMAL(15,2) DEFAULT 0,
      total_amount    DECIMAL(15,2) DEFAULT 0,
      net_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
      unit_cost       DECIMAL(15,2) DEFAULT 0,
      total_cost      DECIMAL(15,2) DEFAULT 0,
      gross_profit    DECIMAL(15,2) DEFAULT 0,
      unit            VARCHAR(20) DEFAULT ''Adet'',
      unit_multiplier DECIMAL(15,6) DEFAULT 1,
      base_quantity   DECIMAL(15,3),
      unit_price_fc   DECIMAL(15,4) DEFAULT 0,
      currency        VARCHAR(10) DEFAULT ''IQD'',
      expiry_date     DATE,
      batch_no        VARCHAR(120)
    );
  ', v_tbl_items, v_tbl_sales);
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ref_id) WHERE ref_id IS NOT NULL',
    v_tbl_items || '_logo_ref_id_uidx',
    v_tbl_items
  );
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (expiry_date) WHERE expiry_date IS NOT NULL', v_tbl_items || '_expiry_date_idx', v_tbl_items);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr              VARCHAR(10) NOT NULL,
      period_nr            VARCHAR(10),
      ref_id               INTEGER,
      logo_cash_ref        INTEGER,
      logo_client_ref      INTEGER,
      register_id          UUID,
      fiche_no             VARCHAR(100) UNIQUE,
      date                 TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      amount               DECIMAL(15,2) DEFAULT 0,
      sign                 INTEGER DEFAULT 1,
      trcode               INTEGER,
      definition           TEXT,
      transaction_type     VARCHAR(50),
      customer_id          UUID,
      bank_id              UUID,
      bank_account_id      UUID,
      target_register_id   UUID,
      expense_card_id      UUID,
      currency_code        VARCHAR(10) DEFAULT ''IQD'',
      exchange_rate        DECIMAL(15,6) DEFAULT 1,
      f_amount             DECIMAL(15,2) DEFAULT 0,
      transfer_status      INTEGER DEFAULT 0,
      special_code         VARCHAR(50),
      tax_rate             DECIMAL(5,2) DEFAULT 0,
      withholding_tax_rate DECIMAL(5,2) DEFAULT 0,
      created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_cash_lines');
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ref_id) WHERE ref_id IS NOT NULL',
    v_prefix || '_cash_lines_logo_ref_id_uidx',
    v_prefix || '_cash_lines'
  );

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr      VARCHAR(10) NOT NULL,
      period_nr    VARCHAR(10) NOT NULL,
      ref_id       INTEGER,
      client_ref   INTEGER,
      customer_id  UUID,
      supplier_id  UUID,
      fiche_no     VARCHAR(100),
      date         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      amount       DECIMAL(15,2) DEFAULT 0,
      sign         INTEGER DEFAULT 0,
      trcode       INTEGER,
      module_nr    INTEGER,
      definition   TEXT,
      created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_tbl_am);
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ref_id) WHERE ref_id IS NOT NULL',
    v_tbl_am || '_ref_uidx',
    v_tbl_am
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I (customer_id, date)',
    v_tbl_am || '_cust_date_idx',
    v_tbl_am
  );

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr          VARCHAR(10) NOT NULL,
      period_nr        VARCHAR(10),
      register_id      UUID,
      fiche_no         VARCHAR(100) UNIQUE,
      date             TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      amount           DECIMAL(15,2) DEFAULT 0,
      sign             INTEGER DEFAULT 1,
      trcode           INTEGER,
      definition       TEXT,
      transaction_type VARCHAR(50),
      customer_id      UUID,
      cash_register_id UUID,
      currency_code    VARCHAR(10) DEFAULT ''IQD'',
      exchange_rate    DECIMAL(15,6) DEFAULT 1,
      f_amount         DECIMAL(15,2) DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_bank_lines');

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr          VARCHAR(10) NOT NULL,
      period_nr        VARCHAR(10),
      virman_no        VARCHAR(100) NOT NULL,
      from_warehouse_id UUID,
      to_warehouse_id  UUID,
      operation_date   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      status           VARCHAR(50) DEFAULT ''draft'',
      notes            TEXT,
      created_by       VARCHAR(100),
      created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_virman_operations');

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      virman_id   UUID REFERENCES %I(id) ON DELETE CASCADE,
      product_id  UUID,
      quantity    DECIMAL(15,4) DEFAULT 0,
      notes       TEXT,
      created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_virman_items', v_prefix || '_virman_operations');

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr          VARCHAR(10) NOT NULL,
      period_nr        VARCHAR(10) NOT NULL,
      document_no      VARCHAR(50) UNIQUE,
      trcode           INTEGER,
      movement_type    VARCHAR(20),
      warehouse_id     UUID REFERENCES stores(id),
      target_warehouse_id UUID REFERENCES stores(id),
      movement_date    TIMESTAMPTZ DEFAULT NOW(),
      exchange_rate    NUMERIC DEFAULT 1,
      description      TEXT,
      status           VARCHAR(20) DEFAULT ''completed'',
      created_by       UUID,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_prefix || '_stock_movements');

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      movement_id      UUID REFERENCES %I(id) ON DELETE CASCADE,
      product_id       UUID,
      quantity         DECIMAL(15,4) DEFAULT 0,
      unit_price       DECIMAL(15,2) DEFAULT 0,
      cost_price       DECIMAL(15,2) DEFAULT 0,
      exchange_rate    NUMERIC DEFAULT 1,
      unit_name        VARCHAR(100),
      convert_factor   NUMERIC DEFAULT 1,
      notes            TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_prefix || '_stock_movement_items', v_prefix || '_stock_movements');

  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS %I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      period_nr VARCHAR(10) NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
      recipient_phone VARCHAR(30),
      recipient_name VARCHAR(255),
      message_text TEXT,
      reference_type VARCHAR(50),
      reference_id UUID,
      payload_json JSONB DEFAULT '{}'::jsonb,
      status VARCHAR(20) DEFAULT 'pending',
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      error_text TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  $f$, v_prefix || '_notification_queue');
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I (status, created_at DESC)',
    v_prefix || '_notification_queue_status_idx',
    v_prefix || '_notification_queue'
  );

  PERFORM public.try_apply_sync_triggers(v_tbl_sales);
  PERFORM public.try_apply_sync_triggers(v_prefix || '_cash_lines');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_bank_lines');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_stock_movements');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_stock_movement_items');
  PERFORM public.try_apply_sync_triggers(v_tbl_am);
END;
$$ LANGUAGE plpgsql;
