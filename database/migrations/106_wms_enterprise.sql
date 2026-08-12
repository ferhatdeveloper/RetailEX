-- 106: RetailEX WMS Kurumsal Katman (OpenWMS/GoodsMart/OpenBoxes referanslı)
-- Bin bazlı envanter, lot/seri + SKT (FEFO/FIFO), putaway, packing, fire yönetimi,
-- WMS belgelerinde Logo senkron kolonları ve FEFO tahsis fonksiyonu.
--
-- VERİ GÜVENLİĞİ: Tümü idempotent (CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- CREATE OR REPLACE). Yalnızca yeni şema/tablo/kolon ekler; mevcut kiracı verisini
-- OKUMAZ, SİLMEZ, DEĞİŞTİRMEZ. wms şeması yoksa guard ile atlanır.

CREATE SCHEMA IF NOT EXISTS wms;
CREATE SCHEMA IF NOT EXISTS logic;

-- ============================================================================
-- 1) Lokasyon / Bin hiyerarşisi genişletme
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('wms.bins') IS NOT NULL THEN
    ALTER TABLE wms.bins ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10);
    ALTER TABLE wms.bins ADD COLUMN IF NOT EXISTS rack VARCHAR(50);
    ALTER TABLE wms.bins ADD COLUMN IF NOT EXISTS bin_type VARCHAR(30) DEFAULT 'storage';
    ALTER TABLE wms.bins ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
    ALTER TABLE wms.bins ADD COLUMN IF NOT EXISTS pick_sequence INTEGER;
    ALTER TABLE wms.bins ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
    ALTER TABLE wms.bins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
    CREATE INDEX IF NOT EXISTS idx_wms_bins_store ON wms.bins(store_id);
    CREATE INDEX IF NOT EXISTS idx_wms_bins_firm ON wms.bins(firm_nr);
    CREATE INDEX IF NOT EXISTS idx_wms_bins_barcode ON wms.bins(barcode) WHERE barcode IS NOT NULL;
  ELSE
    CREATE TABLE wms.bins (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id     UUID,
      firm_nr      VARCHAR(10),
      code         VARCHAR(50) NOT NULL,
      zone         VARCHAR(50),
      aisle        VARCHAR(50),
      rack         VARCHAR(50),
      shelf        VARCHAR(50),
      bin          VARCHAR(50),
      bin_type     VARCHAR(30) DEFAULT 'storage',
      barcode      VARCHAR(100),
      pick_sequence INTEGER,
      capacity_m3  DECIMAL(14,3),
      max_weight   DECIMAL(14,3),
      is_active    BOOLEAN DEFAULT true,
      created_at   TIMESTAMPTZ DEFAULT now(),
      updated_at   TIMESTAMPTZ DEFAULT now(),
      UNIQUE (store_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_wms_bins_store ON wms.bins(store_id);
    CREATE INDEX IF NOT EXISTS idx_wms_bins_firm ON wms.bins(firm_nr);
  END IF;
END $$;

-- ============================================================================
-- 2) Bin bazlı envanter (lot/seri + SKT) — FEFO/FIFO çekirdeği
-- ============================================================================
CREATE TABLE IF NOT EXISTS wms.bin_inventory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr       VARCHAR(10) NOT NULL,
  store_id      UUID,
  bin_id        UUID REFERENCES wms.bins(id) ON DELETE SET NULL,
  bin_code      VARCHAR(50),
  product_id    UUID,
  product_code  VARCHAR(100),
  product_name  VARCHAR(255),
  lot_no        VARCHAR(120),
  serial_no     VARCHAR(120),
  expiry_date   DATE,
  qty           NUMERIC(18,4) NOT NULL DEFAULT 0,
  reserved_qty  NUMERIC(18,4) NOT NULL DEFAULT 0,
  uom           VARCHAR(30) DEFAULT 'Adet',
  received_at   TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wms_bin_inventory
  ON wms.bin_inventory (
    firm_nr, COALESCE(store_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(bin_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(lot_no, ''), COALESCE(serial_no, ''), COALESCE(expiry_date, '1900-01-01'::date)
  );
CREATE INDEX IF NOT EXISTS idx_wms_bininv_fefo ON wms.bin_inventory(firm_nr, product_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_wms_bininv_store_prod ON wms.bin_inventory(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_wms_bininv_bin ON wms.bin_inventory(bin_id);

-- ============================================================================
-- 3) Putaway (yerleştirme) görevleri — mal kabul → raf
-- ============================================================================
CREATE TABLE IF NOT EXISTS wms.putaway_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr           VARCHAR(10) NOT NULL,
  store_id          UUID,
  receiving_slip_id UUID,
  receiving_line_id UUID,
  product_id        UUID,
  product_code      VARCHAR(100),
  product_name      VARCHAR(255),
  lot_no            VARCHAR(120),
  expiry_date       DATE,
  qty               NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_done          NUMERIC(18,4) NOT NULL DEFAULT 0,
  from_bin_id       UUID,
  suggested_bin_id  UUID,
  to_bin_id         UUID,
  status            VARCHAR(30) NOT NULL DEFAULT 'open',
  assigned_user     VARCHAR(100),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wms_putaway_firm_status ON wms.putaway_tasks(firm_nr, status);
CREATE INDEX IF NOT EXISTS idx_wms_putaway_receiving ON wms.putaway_tasks(receiving_slip_id);

-- ============================================================================
-- 4) Packing (paketleme) — istasyon + koli (SSCC / kargo takip)
-- ============================================================================
CREATE TABLE IF NOT EXISTS wms.packing_slips (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr          VARCHAR(10) NOT NULL,
  store_id         UUID,
  pack_no          VARCHAR(50) NOT NULL,
  dispatch_slip_id UUID,
  delivery_id      UUID,
  sales_id         UUID,
  status           VARCHAR(30) NOT NULL DEFAULT 'open',
  packed_by        VARCHAR(100),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (firm_nr, pack_no)
);
CREATE INDEX IF NOT EXISTS idx_wms_packing_firm_status ON wms.packing_slips(firm_nr, status);

CREATE TABLE IF NOT EXISTS wms.packing_cartons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packing_slip_id UUID NOT NULL REFERENCES wms.packing_slips(id) ON DELETE CASCADE,
  carton_no       VARCHAR(50),
  sscc            VARCHAR(30),
  tracking_no     VARCHAR(80),
  weight_kg       NUMERIC(14,3),
  length_cm       NUMERIC(10,2),
  width_cm        NUMERIC(10,2),
  height_cm       NUMERIC(10,2),
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wms_cartons_slip ON wms.packing_cartons(packing_slip_id);

CREATE TABLE IF NOT EXISTS wms.packing_carton_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carton_id    UUID NOT NULL REFERENCES wms.packing_cartons(id) ON DELETE CASCADE,
  product_id   UUID,
  product_code VARCHAR(100),
  lot_no       VARCHAR(120),
  expiry_date  DATE,
  qty          NUMERIC(18,4) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_wms_carton_lines_carton ON wms.packing_carton_lines(carton_id);

-- ============================================================================
-- 5) Fire / hurda / stok düzeltme (shrinkage) — nedene bağlı
-- ============================================================================
CREATE TABLE IF NOT EXISTS wms.stock_adjustments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr      VARCHAR(10) NOT NULL,
  store_id     UUID,
  adj_no       VARCHAR(50) NOT NULL,
  adj_type     VARCHAR(30) NOT NULL DEFAULT 'fire',
  reason_code  VARCHAR(50),
  reason_text  TEXT,
  status       VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by   VARCHAR(100),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (firm_nr, adj_no)
);
CREATE INDEX IF NOT EXISTS idx_wms_adj_firm_status ON wms.stock_adjustments(firm_nr, status);

CREATE TABLE IF NOT EXISTS wms.stock_adjustment_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id  UUID NOT NULL REFERENCES wms.stock_adjustments(id) ON DELETE CASCADE,
  product_id     UUID,
  product_code   VARCHAR(100),
  product_name   VARCHAR(255),
  bin_id         UUID,
  lot_no         VARCHAR(120),
  expiry_date    DATE,
  qty_delta      NUMERIC(18,4) NOT NULL DEFAULT 0,
  reason_code    VARCHAR(50)
);
CREATE INDEX IF NOT EXISTS idx_wms_adj_lines_adj ON wms.stock_adjustment_lines(adjustment_id);

-- ============================================================================
-- 6) Cross-dock işaretleme
-- ============================================================================
CREATE TABLE IF NOT EXISTS wms.cross_dock_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr           VARCHAR(10) NOT NULL,
  receiving_slip_id UUID,
  receiving_line_id UUID,
  dispatch_slip_id  UUID,
  delivery_id       UUID,
  product_id        UUID,
  qty               NUMERIC(18,4) NOT NULL DEFAULT 0,
  status            VARCHAR(30) NOT NULL DEFAULT 'planned',
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wms_crossdock_firm ON wms.cross_dock_links(firm_nr, status);

-- ============================================================================
-- 7) Logo senkron kuyruğu (WMS belgeleri → Logo)
-- ============================================================================
CREATE TABLE IF NOT EXISTS wms.logo_sync_outbox (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr      VARCHAR(10) NOT NULL,
  doc_type     VARCHAR(40) NOT NULL,
  doc_id       UUID,
  doc_no       VARCHAR(80),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       VARCHAR(30) NOT NULL DEFAULT 'pending',
  logo_ref     INTEGER,
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wms_logo_outbox_pending ON wms.logo_sync_outbox(status, created_at) WHERE status = 'pending';

-- ============================================================================
-- 8) Mevcut WMS belgelerini genişlet (lot/SKT/bin + Logo + kargo)
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('wms.receiving_slips') IS NOT NULL THEN
    ALTER TABLE wms.receiving_slips ADD COLUMN IF NOT EXISTS asn_no VARCHAR(80);
    ALTER TABLE wms.receiving_slips ADD COLUMN IF NOT EXISTS po_ref VARCHAR(80);
    ALTER TABLE wms.receiving_slips ADD COLUMN IF NOT EXISTS eta DATE;
    ALTER TABLE wms.receiving_slips ADD COLUMN IF NOT EXISTS dock_door_id UUID;
    ALTER TABLE wms.receiving_slips ADD COLUMN IF NOT EXISTS logo_ref INTEGER;
    ALTER TABLE wms.receiving_slips ADD COLUMN IF NOT EXISTS logo_sync_status VARCHAR(20) DEFAULT 'pending';
  END IF;
  IF to_regclass('wms.receiving_lines') IS NOT NULL THEN
    ALTER TABLE wms.receiving_lines ADD COLUMN IF NOT EXISTS lot_no VARCHAR(120);
    ALTER TABLE wms.receiving_lines ADD COLUMN IF NOT EXISTS expiry_date DATE;
    ALTER TABLE wms.receiving_lines ADD COLUMN IF NOT EXISTS bin_id UUID;
    ALTER TABLE wms.receiving_lines ADD COLUMN IF NOT EXISTS putaway_status VARCHAR(30) DEFAULT 'pending';
  END IF;

  IF to_regclass('wms.dispatch_slips') IS NOT NULL THEN
    ALTER TABLE wms.dispatch_slips ADD COLUMN IF NOT EXISTS carrier_name VARCHAR(120);
    ALTER TABLE wms.dispatch_slips ADD COLUMN IF NOT EXISTS tracking_no VARCHAR(80);
    ALTER TABLE wms.dispatch_slips ADD COLUMN IF NOT EXISTS freight_cost NUMERIC(14,2);
    ALTER TABLE wms.dispatch_slips ADD COLUMN IF NOT EXISTS delivery_id UUID;
    ALTER TABLE wms.dispatch_slips ADD COLUMN IF NOT EXISTS logo_ref INTEGER;
    ALTER TABLE wms.dispatch_slips ADD COLUMN IF NOT EXISTS logo_sync_status VARCHAR(20) DEFAULT 'pending';
  END IF;
  IF to_regclass('wms.dispatch_lines') IS NOT NULL THEN
    ALTER TABLE wms.dispatch_lines ADD COLUMN IF NOT EXISTS packed_qty NUMERIC(18,4) DEFAULT 0;
    ALTER TABLE wms.dispatch_lines ADD COLUMN IF NOT EXISTS shipped_qty NUMERIC(18,4) DEFAULT 0;
    ALTER TABLE wms.dispatch_lines ADD COLUMN IF NOT EXISTS bin_id UUID;
    ALTER TABLE wms.dispatch_lines ADD COLUMN IF NOT EXISTS lot_no VARCHAR(120);
    ALTER TABLE wms.dispatch_lines ADD COLUMN IF NOT EXISTS expiry_date DATE;
  END IF;

  IF to_regclass('wms.pick_tasks') IS NOT NULL THEN
    ALTER TABLE wms.pick_tasks ADD COLUMN IF NOT EXISTS bin_id UUID;
    ALTER TABLE wms.pick_tasks ADD COLUMN IF NOT EXISTS lot_no VARCHAR(120);
    ALTER TABLE wms.pick_tasks ADD COLUMN IF NOT EXISTS expiry_date DATE;
    ALTER TABLE wms.pick_tasks ADD COLUMN IF NOT EXISTS uom VARCHAR(30) DEFAULT 'Adet';
  END IF;

  IF to_regclass('wms.transfers') IS NOT NULL THEN
    ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
    ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
    ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS logo_ref INTEGER;
    ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS logo_sync_status VARCHAR(20) DEFAULT 'pending';
  END IF;
  IF to_regclass('wms.transfer_items') IS NOT NULL THEN
    ALTER TABLE wms.transfer_items ADD COLUMN IF NOT EXISTS source_bin_id UUID;
    ALTER TABLE wms.transfer_items ADD COLUMN IF NOT EXISTS target_bin_id UUID;
    ALTER TABLE wms.transfer_items ADD COLUMN IF NOT EXISTS lot_no VARCHAR(120);
    ALTER TABLE wms.transfer_items ADD COLUMN IF NOT EXISTS expiry_date DATE;
    ALTER TABLE wms.transfer_items ADD COLUMN IF NOT EXISTS received_qty NUMERIC(18,4) DEFAULT 0;
  END IF;

  IF to_regclass('wms.counting_slips') IS NOT NULL THEN
    ALTER TABLE wms.counting_slips ADD COLUMN IF NOT EXISTS logo_ref INTEGER;
    ALTER TABLE wms.counting_slips ADD COLUMN IF NOT EXISTS logo_sync_status VARCHAR(20) DEFAULT 'pending';
  END IF;
  IF to_regclass('wms.counting_lines') IS NOT NULL THEN
    ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS lot_no VARCHAR(120);
    ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS expiry_date DATE;
  END IF;
END $$;

-- ============================================================================
-- 9) FEFO/FIFO tahsis fonksiyonu — bin_inventory üzerinden
-- ============================================================================
CREATE OR REPLACE FUNCTION wms.allocate_fefo(
  p_firm_nr VARCHAR,
  p_product_id UUID,
  p_qty NUMERIC,
  p_store_id UUID DEFAULT NULL,
  p_strategy VARCHAR DEFAULT 'fefo'
)
RETURNS TABLE (
  bin_id UUID,
  bin_code VARCHAR,
  lot_no VARCHAR,
  expiry_date DATE,
  alloc_qty NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining NUMERIC := COALESCE(p_qty, 0);
  r RECORD;
  v_avail NUMERIC;
  v_take NUMERIC;
BEGIN
  IF v_remaining <= 0 THEN RETURN; END IF;
  FOR r IN
    SELECT bi.bin_id, bi.bin_code, bi.lot_no, bi.expiry_date,
           (bi.qty - bi.reserved_qty) AS available
    FROM wms.bin_inventory bi
    WHERE bi.firm_nr = trim(p_firm_nr)
      AND bi.product_id = p_product_id
      AND (p_store_id IS NULL OR bi.store_id = p_store_id)
      AND (bi.qty - bi.reserved_qty) > 0
    ORDER BY
      CASE WHEN p_strategy = 'fifo' THEN bi.received_at END ASC NULLS LAST,
      bi.expiry_date ASC NULLS LAST,
      bi.received_at ASC NULLS LAST
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_avail := r.available;
    v_take := LEAST(v_avail, v_remaining);
    IF v_take > 0 THEN
      bin_id := r.bin_id; bin_code := r.bin_code; lot_no := r.lot_no;
      expiry_date := r.expiry_date; alloc_qty := v_take;
      RETURN NEXT;
      v_remaining := v_remaining - v_take;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- 10) Bin envanteri upsert (delta ile artır/azalt)
-- ============================================================================
CREATE OR REPLACE FUNCTION wms.upsert_bin_inventory(
  p_firm_nr VARCHAR,
  p_store_id UUID,
  p_bin_id UUID,
  p_product_id UUID,
  p_qty_delta NUMERIC,
  p_lot_no VARCHAR DEFAULT NULL,
  p_expiry_date DATE DEFAULT NULL,
  p_product_code VARCHAR DEFAULT NULL,
  p_product_name VARCHAR DEFAULT NULL,
  p_uom VARCHAR DEFAULT 'Adet'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_bin_code VARCHAR;
BEGIN
  SELECT code INTO v_bin_code FROM wms.bins WHERE id = p_bin_id;

  INSERT INTO wms.bin_inventory (
    firm_nr, store_id, bin_id, bin_code, product_id, product_code, product_name,
    lot_no, expiry_date, qty, uom
  ) VALUES (
    trim(p_firm_nr), p_store_id, p_bin_id, v_bin_code, p_product_id, p_product_code, p_product_name,
    p_lot_no, p_expiry_date, GREATEST(p_qty_delta, 0), COALESCE(p_uom, 'Adet')
  )
  ON CONFLICT (
    firm_nr, COALESCE(store_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(bin_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(lot_no, ''), COALESCE(serial_no, ''), COALESCE(expiry_date, '1900-01-01'::date)
  )
  DO UPDATE SET
    qty = wms.bin_inventory.qty + p_qty_delta,
    product_code = COALESCE(EXCLUDED.product_code, wms.bin_inventory.product_code),
    product_name = COALESCE(EXCLUDED.product_name, wms.bin_inventory.product_name),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================================
-- 11) updated_at trigger'ları (yeni tablolar + pick_tasks)
-- ============================================================================
DO $$
BEGIN
  IF to_regprocedure('wms.update_timestamp()') IS NULL THEN
    CREATE FUNCTION wms.update_timestamp() RETURNS trigger LANGUAGE plpgsql AS
    $fn$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $fn$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_wms_bin_inventory_updated ON wms.bin_inventory;
CREATE TRIGGER trg_wms_bin_inventory_updated BEFORE UPDATE ON wms.bin_inventory
  FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();
DROP TRIGGER IF EXISTS trg_wms_putaway_updated ON wms.putaway_tasks;
CREATE TRIGGER trg_wms_putaway_updated BEFORE UPDATE ON wms.putaway_tasks
  FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();
DROP TRIGGER IF EXISTS trg_wms_packing_updated ON wms.packing_slips;
CREATE TRIGGER trg_wms_packing_updated BEFORE UPDATE ON wms.packing_slips
  FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();
DROP TRIGGER IF EXISTS trg_wms_adj_updated ON wms.stock_adjustments;
CREATE TRIGGER trg_wms_adj_updated BEFORE UPDATE ON wms.stock_adjustments
  FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();

DO $$
BEGIN
  IF to_regclass('wms.pick_tasks') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_wms_pick_tasks_updated ON wms.pick_tasks;
    CREATE TRIGGER trg_wms_pick_tasks_updated BEFORE UPDATE ON wms.pick_tasks
      FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();
  END IF;
  IF to_regclass('wms.bins') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_wms_bins_updated ON wms.bins;
    CREATE TRIGGER trg_wms_bins_updated BEFORE UPDATE ON wms.bins
      FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();
  END IF;
END $$;

-- ============================================================================
-- 12) PostgREST anon yetkileri (rol yoksa atlanır)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA wms TO anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA wms TO anon';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA wms TO anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA wms GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA wms GRANT USAGE, SELECT ON SEQUENCES TO anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION wms.allocate_fefo(VARCHAR, UUID, NUMERIC, UUID, VARCHAR) TO anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION wms.upsert_bin_inventory(VARCHAR, UUID, UUID, UUID, NUMERIC, VARCHAR, DATE, VARCHAR, VARCHAR, VARCHAR) TO anon';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
