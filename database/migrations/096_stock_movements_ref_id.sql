-- ============================================================================
-- 096: Logo stok hareketleri — ref_id (LOGICALREF) ile tekrarsız içe aktarım
-- ============================================================================

-- Mevcut dönem stock_movements tabloları
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_[0-9]+_stock_movements$'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS ref_id INTEGER', r.tablename);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (ref_id) WHERE ref_id IS NOT NULL',
      r.tablename || '_logo_ref_id_uidx',
      r.tablename
    );
  END LOOP;
END $$;

-- Mevcut dönem stock_movement_items tabloları
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_[0-9]+_stock_movement_items$'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS ref_id INTEGER', r.tablename);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (ref_id) WHERE ref_id IS NOT NULL',
      r.tablename || '_logo_ref_id_uidx',
      r.tablename
    );
  END LOOP;
END $$;

-- CREATE_PERIOD_TABLES: yeni dönemlerde ref_id kolonları
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
      customer_id    UUID,
      customer_name  VARCHAR(255),
      trcode         INTEGER,
      fiche_type     VARCHAR(50),
      total_net      DECIMAL(15,2) DEFAULT 0,
      total_vat      DECIMAL(15,2) DEFAULT 0,
      total_gross    DECIMAL(15,2) DEFAULT 0,
      net_amount     DECIMAL(15,2) DEFAULT 0,
      date           TIMESTAMPTZ DEFAULT NOW(),
      is_cancelled   BOOLEAN DEFAULT false,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_tbl_sales);
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ref_id) WHERE ref_id IS NOT NULL',
    v_tbl_sales || '_logo_ref_id_uidx',
    v_tbl_sales
  );

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ref_id           INTEGER,
      logo_product_ref INTEGER,
      invoice_id       UUID,
      firm_nr          VARCHAR(10) NOT NULL,
      period_nr        VARCHAR(10) NOT NULL,
      item_code        VARCHAR(100),
      product_id       UUID,
      quantity         DECIMAL(15,4) DEFAULT 0,
      unit_price       DECIMAL(15,2) DEFAULT 0,
      vat_rate         DECIMAL(5,2) DEFAULT 0,
      net_amount       DECIMAL(15,2) DEFAULT 0,
      total_amount     DECIMAL(15,2) DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_tbl_items);
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ref_id) WHERE ref_id IS NOT NULL',
    v_tbl_items || '_logo_ref_id_uidx',
    v_tbl_items
  );

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.%s (
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
  $sql$, v_tbl_am);
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
      period_nr        VARCHAR(10) NOT NULL,
      ref_id           INTEGER,
      logo_cash_ref    INTEGER,
      logo_client_ref  INTEGER,
      register_id      UUID,
      fiche_no         VARCHAR(100),
      trcode           INTEGER,
      date             TIMESTAMPTZ DEFAULT NOW(),
      amount           DECIMAL(15,2) DEFAULT 0,
      sign             INTEGER DEFAULT 0,
      customer_id      UUID,
      definition       TEXT,
      transaction_type VARCHAR(50),
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_prefix || '_cash_lines');
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ref_id) WHERE ref_id IS NOT NULL',
    v_prefix || '_cash_lines_logo_ref_id_uidx',
    v_prefix || '_cash_lines'
  );

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr          VARCHAR(10) NOT NULL,
      period_nr        VARCHAR(10) NOT NULL,
      ref_id           INTEGER,
      bank_account_id  UUID,
      fiche_no         VARCHAR(100),
      trcode           INTEGER,
      date             TIMESTAMPTZ DEFAULT NOW(),
      amount           DECIMAL(15,2) DEFAULT 0,
      sign             INTEGER DEFAULT 0,
      definition       TEXT,
      currency_code    VARCHAR(10) DEFAULT ''IQD'',
      exchange_rate    DECIMAL(15,6) DEFAULT 1,
      f_amount         DECIMAL(15,2) DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_bank_lines');
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ref_id) WHERE ref_id IS NOT NULL',
    v_prefix || '_bank_lines_logo_ref_id_uidx',
    v_prefix || '_bank_lines'
  );

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
      ref_id           INTEGER,
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
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ref_id) WHERE ref_id IS NOT NULL',
    v_prefix || '_stock_movements_logo_ref_id_uidx',
    v_prefix || '_stock_movements'
  );

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ref_id           INTEGER,
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
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ref_id) WHERE ref_id IS NOT NULL',
    v_prefix || '_stock_movement_items_logo_ref_id_uidx',
    v_prefix || '_stock_movement_items'
  );

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
  PERFORM public.try_apply_sync_triggers(v_tbl_items);
  PERFORM public.try_apply_sync_triggers(v_prefix || '_cash_lines');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_bank_lines');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_stock_movements');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_stock_movement_items');
  PERFORM public.try_apply_sync_triggers(v_tbl_am);
END;
$$ LANGUAGE plpgsql;
