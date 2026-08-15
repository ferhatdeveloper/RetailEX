-- ============================================================================
-- 123 — WMS şema: eksik kolonlar
--   Tarih: 2026-08-15
--   Amaç: wms.pick_waves, wms.bins, wms.receiving_slips, wms.receiving_lines,
--          wms.dispatch_slips, wms.dispatch_lines, wms.pick_tasks,
--          wms.transfers, wms.transfer_items, wms.counting_slips,
--          wms.counting_lines tablolarında kodun beklediği ancak master şemada
--          bulunmayan kolonları idempotent biçimde ekle.
--   Not: Tüm ifadeler `ADD COLUMN IF NOT EXISTS` ile korumalı; tekrar çalıştırma
--        güvenli. Var olan tablolarda eski veriye dokunulmaz; DEFAULT'lar
--        yalnızca yeni eklenen satırlara uygulanır.
-- ============================================================================

-- pick_waves — sevkiyat ve satış bağlantıları
ALTER TABLE "wms"."pick_waves"
  ADD COLUMN IF NOT EXISTS "delivery_id" UUID,
  ADD COLUMN IF NOT EXISTS "sales_ids"   UUID[];

-- bins — raf/bölme tanımları
ALTER TABLE "wms"."bins"
  ADD COLUMN IF NOT EXISTS "firm_nr"       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "rack"          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "bin_type"      VARCHAR(30) DEFAULT 'storage',
  ADD COLUMN IF NOT EXISTS "barcode"       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "pick_sequence" INTEGER,
  ADD COLUMN IF NOT EXISTS "created_at"    TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updated_at"    TIMESTAMPTZ DEFAULT now();

-- receiving_slips — mal kabul başlık
ALTER TABLE "wms"."receiving_slips"
  ADD COLUMN IF NOT EXISTS "asn_no"           VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "po_ref"           VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "eta"              DATE,
  ADD COLUMN IF NOT EXISTS "dock_door_id"     UUID,
  ADD COLUMN IF NOT EXISTS "logo_ref"         INTEGER,
  ADD COLUMN IF NOT EXISTS "logo_sync_status" VARCHAR(20) DEFAULT 'pending';

-- receiving_lines — mal kabul satır
ALTER TABLE "wms"."receiving_lines"
  ADD COLUMN IF NOT EXISTS "lot_no"        VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "expiry_date"   DATE,
  ADD COLUMN IF NOT EXISTS "bin_id"        UUID,
  ADD COLUMN IF NOT EXISTS "putaway_status" VARCHAR(30) DEFAULT 'pending';

-- dispatch_slips — sevkiyat başlık
ALTER TABLE "wms"."dispatch_slips"
  ADD COLUMN IF NOT EXISTS "carrier_name"     VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "tracking_no"      VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "freight_cost"     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS "delivery_id"      UUID,
  ADD COLUMN IF NOT EXISTS "logo_ref"         INTEGER,
  ADD COLUMN IF NOT EXISTS "logo_sync_status" VARCHAR(20) DEFAULT 'pending';

-- dispatch_lines — sevkiyat satır
ALTER TABLE "wms"."dispatch_lines"
  ADD COLUMN IF NOT EXISTS "packed_qty"   NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "shipped_qty"  NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bin_id"       UUID,
  ADD COLUMN IF NOT EXISTS "lot_no"       VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "expiry_date"  DATE;

-- pick_tasks — toplama görevi
ALTER TABLE "wms"."pick_tasks"
  ADD COLUMN IF NOT EXISTS "bin_id"       UUID,
  ADD COLUMN IF NOT EXISTS "lot_no"       VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "expiry_date"  DATE,
  ADD COLUMN IF NOT EXISTS "uom"          VARCHAR(30) DEFAULT 'Adet';

-- transfers — transfer başlık
ALTER TABLE "wms"."transfers"
  ADD COLUMN IF NOT EXISTS "shipped_at"        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "received_at"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "logo_ref"          INTEGER,
  ADD COLUMN IF NOT EXISTS "logo_sync_status"  VARCHAR(20) DEFAULT 'pending';

-- transfer_items — transfer satır
ALTER TABLE "wms"."transfer_items"
  ADD COLUMN IF NOT EXISTS "source_bin_id" UUID,
  ADD COLUMN IF NOT EXISTS "target_bin_id" UUID,
  ADD COLUMN IF NOT EXISTS "lot_no"        VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "expiry_date"   DATE,
  ADD COLUMN IF NOT EXISTS "received_qty"  NUMERIC(18,4) DEFAULT 0;

-- counting_slips — sayım başlık
ALTER TABLE "wms"."counting_slips"
  ADD COLUMN IF NOT EXISTS "logo_ref"         INTEGER,
  ADD COLUMN IF NOT EXISTS "logo_sync_status" VARCHAR(20) DEFAULT 'pending';

-- counting_lines — sayım satır
ALTER TABLE "wms"."counting_lines"
  ADD COLUMN IF NOT EXISTS "lot_no"       VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "expiry_date"  DATE;
