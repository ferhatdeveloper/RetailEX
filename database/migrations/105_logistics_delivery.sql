-- 105: RetailEX Teslimat Yönetim Modülü (logistics şeması)
-- Sipariş (rex_*_sales) → teslimat → WMS pick → irsaliye zinciri
--
-- Veri güvenliği: Tümü idempotent (CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- / CREATE OR REPLACE). Yalnızca yeni şema/tablo/kolon ekler; mevcut kiracı verisini
-- OKUMAZ, SİLMEZ, DEĞİŞTİRMEZ. Eski kiracılarda wms/logic şeması eksikse guard ile atlanır.

CREATE SCHEMA IF NOT EXISTS logistics;
CREATE SCHEMA IF NOT EXISTS logic;
CREATE SCHEMA IF NOT EXISTS wms;

-- Araç kartı
CREATE TABLE IF NOT EXISTS logistics.vehicles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr         VARCHAR(10) NOT NULL,
  plate           VARCHAR(32) NOT NULL,
  brand           VARCHAR(100),
  model           VARCHAR(100),
  capacity_kg     NUMERIC(14,3),
  capacity_m3     NUMERIC(14,3),
  cold_chain      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  maintenance_due DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (firm_nr, plate)
);
CREATE INDEX IF NOT EXISTS idx_logistics_vehicles_firm ON logistics.vehicles(firm_nr) WHERE is_active;

-- Kurye / şoför
CREATE TABLE IF NOT EXISTS logistics.couriers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr            VARCHAR(10) NOT NULL,
  user_id            UUID,
  full_name          VARCHAR(255) NOT NULL,
  phone              VARCHAR(50),
  default_vehicle_id UUID REFERENCES logistics.vehicles(id) ON DELETE SET NULL,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  last_lat           NUMERIC(10,7),
  last_lng           NUMERIC(10,7),
  last_location_at   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logistics_couriers_firm ON logistics.couriers(firm_nr) WHERE is_active;

-- Günlük / rota planı
CREATE TABLE IF NOT EXISTS logistics.delivery_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr         VARCHAR(10) NOT NULL,
  period_nr       VARCHAR(10) NOT NULL,
  branch_id       VARCHAR(50),
  warehouse_id    VARCHAR(50),
  plan_date       DATE NOT NULL,
  vehicle_id      UUID REFERENCES logistics.vehicles(id) ON DELETE SET NULL,
  courier_id      UUID REFERENCES logistics.couriers(id) ON DELETE SET NULL,
  status          VARCHAR(30) NOT NULL DEFAULT 'draft',
  route_polyline  TEXT,
  notes           TEXT,
  created_by      VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logistics_plans_firm_date ON logistics.delivery_plans(firm_nr, plan_date);

-- Teslimat fişi
CREATE TABLE IF NOT EXISTS logistics.deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr          VARCHAR(10) NOT NULL,
  period_nr        VARCHAR(10) NOT NULL,
  delivery_no      VARCHAR(50) NOT NULL,
  delivery_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_time    TIME,
  branch_id        VARCHAR(50),
  warehouse_id     VARCHAR(50),
  plan_id          UUID REFERENCES logistics.delivery_plans(id) ON DELETE SET NULL,
  sales_id         UUID NOT NULL,
  sales_fiche_no   VARCHAR(50),
  customer_id      UUID,
  customer_name    VARCHAR(255),
  address_text     TEXT,
  phone            VARCHAR(50),
  lat              NUMERIC(10,7),
  lng              NUMERIC(10,7),
  vehicle_id       UUID REFERENCES logistics.vehicles(id) ON DELETE SET NULL,
  courier_id       UUID REFERENCES logistics.couriers(id) ON DELETE SET NULL,
  driver_name      VARCHAR(255),
  dispatch_slip_id UUID,
  waybill_sales_id UUID,
  invoice_sales_id UUID,
  status           VARCHAR(40) NOT NULL DEFAULT 'draft',
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes            TEXT,
  created_by       VARCHAR(100),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (firm_nr, period_nr, delivery_no)
);
CREATE INDEX IF NOT EXISTS idx_logistics_del_firm_status ON logistics.deliveries(firm_nr, status);
CREATE INDEX IF NOT EXISTS idx_logistics_del_sales ON logistics.deliveries(sales_id);
CREATE INDEX IF NOT EXISTS idx_logistics_del_courier_date ON logistics.deliveries(courier_id, delivery_date);
CREATE INDEX IF NOT EXISTS idx_logistics_del_date ON logistics.deliveries(firm_nr, delivery_date DESC);

-- Teslimat satırları
CREATE TABLE IF NOT EXISTS logistics.delivery_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id      UUID NOT NULL REFERENCES logistics.deliveries(id) ON DELETE CASCADE,
  sale_item_id     UUID,
  product_id       UUID,
  product_code     VARCHAR(100),
  product_name     VARCHAR(255),
  unit             VARCHAR(30),
  qty_ordered      NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_planned      NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_picked       NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_packed       NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_shipped      NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_delivered    NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_returned     NUMERIC(18,4) NOT NULL DEFAULT 0,
  line_status      VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logistics_del_lines_delivery ON logistics.delivery_lines(delivery_id);

-- Durum geçmişi
CREATE TABLE IF NOT EXISTS logistics.delivery_status_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id  UUID NOT NULL REFERENCES logistics.deliveries(id) ON DELETE CASCADE,
  from_status  VARCHAR(40),
  to_status    VARCHAR(40) NOT NULL,
  actor_id     VARCHAR(100),
  actor_role   VARCHAR(50),
  note         TEXT,
  lat          NUMERIC(10,7),
  lng          NUMERIC(10,7),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logistics_del_events ON logistics.delivery_status_events(delivery_id, created_at);

-- POD
CREATE TABLE IF NOT EXISTS logistics.delivery_proofs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id     UUID NOT NULL REFERENCES logistics.deliveries(id) ON DELETE CASCADE,
  recipient_name  VARCHAR(255),
  signature_url   TEXT,
  photo_urls      JSONB NOT NULL DEFAULT '[]'::jsonb,
  lat             NUMERIC(10,7),
  lng             NUMERIC(10,7),
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  note            TEXT
);
CREATE INDEX IF NOT EXISTS idx_logistics_proofs_delivery ON logistics.delivery_proofs(delivery_id);

-- Kurye GPS izi
CREATE TABLE IF NOT EXISTS logistics.courier_locations (
  id           BIGSERIAL PRIMARY KEY,
  firm_nr      VARCHAR(10) NOT NULL,
  courier_id   UUID NOT NULL REFERENCES logistics.couriers(id) ON DELETE CASCADE,
  delivery_id  UUID REFERENCES logistics.deliveries(id) ON DELETE SET NULL,
  lat          NUMERIC(10,7) NOT NULL,
  lng          NUMERIC(10,7) NOT NULL,
  speed_kmh    NUMERIC(8,2),
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logistics_courier_loc ON logistics.courier_locations(courier_id, recorded_at DESC);

-- İade
CREATE TABLE IF NOT EXISTS logistics.delivery_returns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr      VARCHAR(10) NOT NULL,
  period_nr    VARCHAR(10) NOT NULL,
  delivery_id  UUID NOT NULL REFERENCES logistics.deliveries(id) ON DELETE CASCADE,
  reason_code  VARCHAR(50),
  reason_text  TEXT,
  status       VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logistics.delivery_return_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id        UUID NOT NULL REFERENCES logistics.delivery_returns(id) ON DELETE CASCADE,
  delivery_line_id UUID REFERENCES logistics.delivery_lines(id) ON DELETE SET NULL,
  product_id       UUID,
  qty              NUMERIC(18,4) NOT NULL,
  condition        VARCHAR(30)
);

-- Bildirim kuyruğu
CREATE TABLE IF NOT EXISTS logistics.notification_outbox (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr      VARCHAR(10) NOT NULL,
  delivery_id  UUID REFERENCES logistics.deliveries(id) ON DELETE SET NULL,
  channel      VARCHAR(30) NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logistics_notify_pending ON logistics.notification_outbox(status, created_at)
  WHERE status = 'pending';

-- WMS pick_waves genişletme + pick_tasks (wms.pick_waves yoksa güvenli atla)
DO $$
BEGIN
  IF to_regclass('wms.pick_waves') IS NOT NULL THEN
    ALTER TABLE wms.pick_waves ADD COLUMN IF NOT EXISTS delivery_id UUID;
    ALTER TABLE wms.pick_waves ADD COLUMN IF NOT EXISTS sales_ids UUID[];

    CREATE TABLE IF NOT EXISTS wms.pick_tasks (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wave_id          UUID REFERENCES wms.pick_waves(id) ON DELETE CASCADE,
      delivery_id      UUID,
      delivery_line_id UUID,
      product_id       UUID,
      product_code     VARCHAR(100),
      product_name     VARCHAR(255),
      bin_code         VARCHAR(50),
      qty_to_pick      NUMERIC(18,4) NOT NULL DEFAULT 0,
      qty_picked       NUMERIC(18,4) NOT NULL DEFAULT 0,
      status           VARCHAR(30) NOT NULL DEFAULT 'open',
      assigned_user    VARCHAR(100),
      firm_nr          VARCHAR(10) NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_wms_pick_tasks_wave ON wms.pick_tasks(wave_id);
    CREATE INDEX IF NOT EXISTS idx_wms_pick_tasks_delivery ON wms.pick_tasks(delivery_id);
    CREATE INDEX IF NOT EXISTS idx_wms_pick_tasks_firm_status ON wms.pick_tasks(firm_nr, status);
  END IF;
END $$;

-- Sipariş satırlarında sevkiyat bakiyesi (mevcut dönem tabloları)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_[0-9]+_sale_items$'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS qty_shipped NUMERIC(18,4) DEFAULT 0',
      r.schemaname, r.tablename
    );
    EXECUTE format(
      'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS qty_delivered NUMERIC(18,4) DEFAULT 0',
      r.schemaname, r.tablename
    );
  END LOOP;
END $$;

-- Siparişten teslimat oluştur (PostgREST RPC / uygulama yedek yolu)
CREATE OR REPLACE FUNCTION logic.create_delivery_from_sales(
  p_firm_nr VARCHAR,
  p_period_nr VARCHAR,
  p_sales_id UUID,
  p_created_by VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sales RECORD;
  v_tbl_sales TEXT;
  v_tbl_items TEXT;
  v_delivery_id UUID := gen_random_uuid();
  v_delivery_no VARCHAR(50);
  v_seq INT;
  v_line RECORD;
  v_line_count INT := 0;
BEGIN
  v_tbl_sales := 'rex_' || lpad(trim(p_firm_nr), 3, '0') || '_' || lpad(trim(p_period_nr), 2, '0') || '_sales';
  v_tbl_items := 'rex_' || lpad(trim(p_firm_nr), 3, '0') || '_' || lpad(trim(p_period_nr), 2, '0') || '_sale_items';

  IF to_regclass('public.' || v_tbl_sales) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sales_table_missing');
  END IF;

  EXECUTE format(
    'SELECT id, fiche_no, customer_id, customer_name, notes, store_id::text AS store_id
     FROM %I WHERE id = $1',
    v_tbl_sales
  ) INTO v_sales USING p_sales_id;

  IF v_sales.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sales_not_found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM logistics.deliveries d
    WHERE d.firm_nr = trim(p_firm_nr)
      AND d.period_nr = trim(p_period_nr)
      AND d.sales_id = p_sales_id
      AND d.status <> 'cancelled'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'delivery_already_exists');
  END IF;

  SELECT COUNT(*)::int + 1
  INTO v_seq
  FROM logistics.deliveries
  WHERE firm_nr = trim(p_firm_nr)
    AND period_nr = trim(p_period_nr)
    AND delivery_no LIKE ('TSL-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-%');

  v_delivery_no := 'TSL-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO logistics.deliveries (
    id, firm_nr, period_nr, delivery_no, delivery_date,
    branch_id, sales_id, sales_fiche_no, customer_id, customer_name,
    address_text, status, created_by
  ) VALUES (
    v_delivery_id, trim(p_firm_nr), trim(p_period_nr), v_delivery_no, CURRENT_DATE,
    v_sales.store_id, p_sales_id, v_sales.fiche_no, v_sales.customer_id, v_sales.customer_name,
    v_sales.notes, 'draft', p_created_by
  );

  IF to_regclass('public.' || v_tbl_items) IS NOT NULL THEN
    FOR v_line IN EXECUTE format(
      'SELECT id, product_id, item_code, item_name, unit, quantity
       FROM %I WHERE invoice_id = $1',
      v_tbl_items
    ) USING p_sales_id
    LOOP
      INSERT INTO logistics.delivery_lines (
        delivery_id, sale_item_id, product_id, product_code, product_name,
        unit, qty_ordered, qty_planned
      ) VALUES (
        v_delivery_id, v_line.id, v_line.product_id, v_line.item_code, v_line.item_name,
        COALESCE(v_line.unit, 'Adet'), COALESCE(v_line.quantity, 0), COALESCE(v_line.quantity, 0)
      );
      v_line_count := v_line_count + 1;
    END LOOP;
  END IF;

  INSERT INTO logistics.delivery_status_events (delivery_id, from_status, to_status, actor_id, note)
  VALUES (v_delivery_id, NULL, 'draft', p_created_by, 'Siparişten oluşturuldu');

  RETURN jsonb_build_object(
    'ok', true,
    'delivery_id', v_delivery_id,
    'delivery_no', v_delivery_no,
    'line_count', v_line_count
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- PostgREST anon yetkileri (rol yoksa atlanır)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA logistics TO anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA logistics TO anon';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA logistics TO anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA logistics GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA logistics GRANT USAGE, SELECT ON SEQUENCES TO anon';
    IF to_regclass('wms.pick_tasks') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON wms.pick_tasks TO anon';
    END IF;
    EXECUTE 'GRANT EXECUTE ON FUNCTION logic.create_delivery_from_sales(VARCHAR, VARCHAR, UUID, VARCHAR) TO anon';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
