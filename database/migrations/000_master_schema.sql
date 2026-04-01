-- ============================================================================
-- RetailEX — MASTER SCHEMA (v6.0 — CLEAN CONSOLIDATED)
-- ============================================================================
-- Bu dosya TEMİZ bir PostgreSQL veritabanına tek seferde uygulanabilir.
-- Mevcut kurulumlar için 001–007 numaralı migration dosyalarını kullanın.
-- ============================================================================
-- Çalıştırma: psql -U postgres -d retailex_local -f 000_master_schema.sql
-- ============================================================================

-- Sunucu UTF-8; Windows psql ile WIN1254 karışıklığını önlemek için
SET client_encoding = 'UTF8';

-- ============================================================================
-- 0. EXTENSIONS & SCHEMAS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS auth;

-- Supabase kullanılmayan ortamlarda FK'ların çalışması için minimal auth.users
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
);
CREATE SCHEMA IF NOT EXISTS logic;
CREATE SCHEMA IF NOT EXISTS wms;
CREATE SCHEMA IF NOT EXISTS rest;
CREATE SCHEMA IF NOT EXISTS beauty;
CREATE SCHEMA IF NOT EXISTS pos;

-- ============================================================================
-- 1. ORGANIZATIONAL TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS firms (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr               VARCHAR(10) NOT NULL UNIQUE,
  name                  VARCHAR(255) NOT NULL,
  title                 VARCHAR(255),
  tax_nr                VARCHAR(50),
  tax_office            VARCHAR(100),
  address               TEXT,
  city                  VARCHAR(100),
  country               VARCHAR(100),
  email                 VARCHAR(100),
  phone                 VARCHAR(50),
  ana_para_birimi       VARCHAR(10) DEFAULT 'IQD',
  raporlama_para_birimi VARCHAR(10) DEFAULT 'IQD',
  regulatory_region     VARCHAR(2) NOT NULL DEFAULT 'IQ',
  gib_integration_mode   VARCHAR(20) NOT NULL DEFAULT 'mock',
  gib_ubl_profile       VARCHAR(40) DEFAULT 'TICARIFATURA',
  gib_sender_alias      VARCHAR(255),
  gib_integrator_base_url VARCHAR(512),
  gib_integrator_username VARCHAR(255),
  gib_integrator_password VARCHAR(255),
  gib_use_test_environment BOOLEAN DEFAULT true,
  "default"             BOOLEAN DEFAULT false,
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- İsteğe bağlı: Supabase senkronu (006 ile de eklenebilir; sıfır kurulumda tek script yeter)
ALTER TABLE firms ADD COLUMN IF NOT EXISTS supabase_firm_id VARCHAR(255);

ALTER TABLE firms ADD COLUMN IF NOT EXISTS regulatory_region VARCHAR(2) NOT NULL DEFAULT 'IQ';

-- Web / çok istemci: açılış varsayılanları (tek satır)
CREATE TABLE IF NOT EXISTS public.system_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  CONSTRAINT system_settings_singleton CHECK (id = 1),
  default_currency VARCHAR(10) NOT NULL DEFAULT 'IQD',
  primary_firm_nr VARCHAR(10),
  primary_period_nr VARCHAR(10),
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO public.system_settings (id, default_currency, primary_firm_nr, primary_period_nr)
VALUES (1, 'IQD', '001', '01')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.gib_edocument_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr VARCHAR(10) NOT NULL,
  period_nr VARCHAR(10) NOT NULL,
  source_type VARCHAR(32) NOT NULL DEFAULT 'sales_fiche',
  source_id UUID NOT NULL,
  document_no VARCHAR(100),
  doc_type VARCHAR(32) NOT NULL DEFAULT 'E-Fatura',
  customer_name TEXT,
  doc_date DATE,
  amount NUMERIC(18,4) DEFAULT 0,
  tax_amount NUMERIC(18,4) DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'Taslak',
  gib_uuid UUID,
  payload_json JSONB,
  xml_snapshot TEXT,
  gib_response_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gib_edocument_queue_unique_source UNIQUE (firm_nr, period_nr, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_gib_edoc_firm_period ON public.gib_edocument_queue (firm_nr, period_nr, created_at DESC);

CREATE TABLE IF NOT EXISTS periods (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id    UUID REFERENCES firms(id) ON DELETE CASCADE,
  nr         INTEGER NOT NULL,
  beg_date   DATE NOT NULL,
  end_date   DATE NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  "default"  BOOLEAN DEFAULT false,
  UNIQUE(firm_id, nr)
);

CREATE TABLE IF NOT EXISTS stores (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code             VARCHAR(50) NOT NULL UNIQUE,
  name             VARCHAR(255) NOT NULL,
  type             VARCHAR(50),
  city             VARCHAR(100),
  region           VARCHAR(100),
  address          TEXT,
  phone            VARCHAR(50),
  email            VARCHAR(100),
  tax_office       VARCHAR(100),
  tax_number       VARCHAR(50),
  firm_nr          VARCHAR(10) NOT NULL,
  manager_name     VARCHAR(100),
  is_main          BOOLEAN DEFAULT false,
  is_active        BOOLEAN DEFAULT true,
  "default"        BOOLEAN DEFAULT false,
  logo_warehouse_id INTEGER,
  logo_division_id  INTEGER,
  logo_firm_id      INTEGER,
  created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS currencies (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code             VARCHAR(10) NOT NULL UNIQUE,
  name             VARCHAR(100) NOT NULL,
  symbol           VARCHAR(10),
  is_base_currency BOOLEAN DEFAULT false,
  sort_order       INTEGER DEFAULT 0,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. RBAC SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL UNIQUE,
  description   TEXT,
  permissions   JSONB DEFAULT '[]',
  is_system_role BOOLEAN DEFAULT false,
  color         VARCHAR(20) DEFAULT '#3B82F6',
  landing_route VARCHAR(100) DEFAULT NULL,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON COLUMN public.roles.landing_route IS 'Giriş sonrası açılacak modül: restaurant, pos, management, wms, beauty veya boş (ana sayfa).';

CREATE TABLE IF NOT EXISTS public.users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr      VARCHAR(10) NOT NULL,
  username     VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT,
  full_name    VARCHAR(255) NOT NULL,
  email        VARCHAR(255),
  phone        VARCHAR(50),
  role         VARCHAR(50) DEFAULT 'cashier',
  role_id      UUID REFERENCES public.roles(id),
  store_id     UUID REFERENCES public.stores(id),
  is_active    BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  allowed_firm_nrs   JSONB DEFAULT '[]',
  allowed_periods    JSONB DEFAULT '[]',
  allowed_store_ids  JSONB DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. GLOBAL INFRASTRUCTURE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  currency_code  VARCHAR(10) NOT NULL,
  date           DATE NOT NULL,
  buy_rate       DECIMAL(18,8) NOT NULL,
  sell_rate      DECIMAL(18,8) NOT NULL,
  effective_buy  DECIMAL(18,8),
  effective_sell DECIMAL(18,8),
  source         VARCHAR(50) DEFAULT 'manual',
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(currency_code, date, source)
);

CREATE TABLE IF NOT EXISTS public.service_health (
  service_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_name TEXT NOT NULL UNIQUE,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       TEXT NOT NULL CHECK (status IN ('ONLINE', 'OFFLINE', 'ERROR', 'MAINTENANCE')),
  version      TEXT,
  metadata     JSONB DEFAULT '{}',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.report_templates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  category      VARCHAR(50) NOT NULL,
  template_type VARCHAR(50) DEFAULT 'json',
  content       JSONB NOT NULL,
  is_default    BOOLEAN DEFAULT false,
  firm_nr       VARCHAR(10),
  period_nr     VARCHAR(10),
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.service_transactions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr          VARCHAR(10) NOT NULL,
  store_id         UUID REFERENCES public.stores(id),
  transaction_type VARCHAR(20) NOT NULL,
  provider         VARCHAR(50) NOT NULL,
  target_number    VARCHAR(50) NOT NULL,
  package_name     VARCHAR(100),
  amount           DECIMAL(15,2) NOT NULL,
  cost             DECIMAL(15,2) DEFAULT 0,
  profit           DECIMAL(15,2) GENERATED ALWAYS AS (amount - cost) STORED,
  currency         VARCHAR(10) DEFAULT 'IQD',
  status           VARCHAR(20) DEFAULT 'completed',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. LOGIC SCHEMA (Firm-level global)
-- ============================================================================

CREATE TABLE IF NOT EXISTS logic.bank_accounts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr       VARCHAR(10) NOT NULL,
  code          VARCHAR(50) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  bank_name     VARCHAR(255),
  iban          VARCHAR(50),
  currency_code VARCHAR(10),
  balance       DECIMAL(15,2) DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(firm_nr, code)
);

CREATE TABLE IF NOT EXISTS logic.campaigns (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr        VARCHAR(10) NOT NULL,
  code           VARCHAR(50) NOT NULL,
  name           VARCHAR(255) NOT NULL,
  campaign_type  VARCHAR(50) NOT NULL,
  discount_value DECIMAL(15,2),
  start_date     TIMESTAMPTZ,
  end_date       TIMESTAMPTZ,
  is_active      BOOLEAN DEFAULT true,
  conditions     JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(firm_nr, code)
);

-- ============================================================================
-- 5. WMS SCHEMA (Warehouse Management)
-- ============================================================================

CREATE TABLE IF NOT EXISTS wms.bins (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id    UUID REFERENCES public.stores(id),
  code        VARCHAR(50) NOT NULL,
  zone        VARCHAR(50),
  aisle       VARCHAR(50),
  shelf       VARCHAR(50),
  bin         VARCHAR(50),
  capacity_m3 DECIMAL(15,3),
  max_weight  DECIMAL(15,2),
  is_active   BOOLEAN DEFAULT true,
  UNIQUE(store_id, code)
);

CREATE TABLE IF NOT EXISTS wms.personnel (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   UUID REFERENCES public.users(id),
  store_id  UUID REFERENCES public.stores(id),
  role      VARCHAR(50),
  is_active BOOLEAN DEFAULT true
);

-- Sayım Fişleri (Inventory Counting Slips)
CREATE TABLE IF NOT EXISTS wms.counting_slips (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr      VARCHAR(10) NOT NULL,
  store_id     UUID NOT NULL,
  fiche_no     VARCHAR(50) NOT NULL,
  date         TIMESTAMPTZ DEFAULT NOW(),
  status       VARCHAR(20) DEFAULT 'draft',
  count_type   VARCHAR(20) DEFAULT 'full',
  location_code VARCHAR(50),
  description  TEXT,
  created_by   UUID,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(firm_nr, fiche_no)
);

COMMENT ON COLUMN wms.counting_slips.status IS 'draft | active | counting | reconciliation | completed | cancelled';
COMMENT ON COLUMN wms.counting_slips.count_type IS 'full | cycle | location';

-- Sayım Satırları (Counting Lines)
CREATE TABLE IF NOT EXISTS wms.counting_lines (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slip_id      UUID REFERENCES wms.counting_slips(id) ON DELETE CASCADE,
  firm_nr      VARCHAR(10),
  product_id   UUID,
  product_ref  INTEGER,
  barcode      VARCHAR(100),
  product_name VARCHAR(500),
  bin_id       UUID REFERENCES wms.bins(id),
  location_code VARCHAR(50),
  expected_qty  DECIMAL(15,2),
  counted_qty   DECIMAL(15,2),
  variance      DECIMAL(15,2),
  counted_by    VARCHAR(255),
  counted_at    TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Transfer Emirleri (Warehouse Transfers)
CREATE TABLE IF NOT EXISTS wms.transfers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr         VARCHAR(10) NOT NULL,
  fiche_no        VARCHAR(50) NOT NULL,
  source_store_id UUID NOT NULL,
  target_store_id UUID NOT NULL,
  date            TIMESTAMPTZ DEFAULT NOW(),
  status          VARCHAR(20) DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(firm_nr, fiche_no)
);

CREATE TABLE IF NOT EXISTS wms.transfer_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id UUID REFERENCES wms.transfers(id) ON DELETE CASCADE,
  product_id  UUID,
  quantity    DECIMAL(15,2) DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Mal Kabul Fişleri (Receiving Slips)
CREATE TABLE IF NOT EXISTS wms.receiving_slips (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr       VARCHAR(10) NOT NULL,
  store_id      UUID REFERENCES public.stores(id),
  slip_no       VARCHAR(50) UNIQUE NOT NULL,
  supplier_name VARCHAR(255),
  notes         TEXT,
  status        VARCHAR(20) DEFAULT 'draft',
  created_by    VARCHAR(100),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wms.receiving_lines (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slip_id       UUID REFERENCES wms.receiving_slips(id) ON DELETE CASCADE,
  product_id    UUID,
  product_code  VARCHAR(100),
  product_name  VARCHAR(255),
  barcode       VARCHAR(100),
  ordered_qty   DECIMAL(15,3) DEFAULT 0,
  received_qty  DECIMAL(15,3) DEFAULT 0,
  unit          VARCHAR(20),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Sevkiyat Fişleri (Dispatch Slips)
CREATE TABLE IF NOT EXISTS wms.dispatch_slips (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr       VARCHAR(10) NOT NULL,
  store_id      UUID REFERENCES public.stores(id),
  slip_no       VARCHAR(50) UNIQUE NOT NULL,
  customer_name VARCHAR(255),
  priority      VARCHAR(20) DEFAULT 'normal',
  notes         TEXT,
  status        VARCHAR(20) DEFAULT 'draft',
  created_by    VARCHAR(100),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wms.dispatch_lines (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slip_id       UUID REFERENCES wms.dispatch_slips(id) ON DELETE CASCADE,
  product_id    UUID,
  product_code  VARCHAR(100),
  product_name  VARCHAR(255),
  barcode       VARCHAR(100),
  requested_qty DECIMAL(15,3) DEFAULT 0,
  picked_qty    DECIMAL(15,3) DEFAULT 0,
  unit          VARCHAR(20),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Toplama Dalgaları (Pick Waves)
CREATE TABLE IF NOT EXISTS wms.pick_waves (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wave_no      VARCHAR(50) UNIQUE NOT NULL,
  firm_nr      VARCHAR(10),
  warehouse_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  status       VARCHAR(20) DEFAULT 'draft',
  priority     INTEGER DEFAULT 5,
  wave_type    VARCHAR(30) DEFAULT 'standard',
  total_lines  INTEGER DEFAULT 0,
  picked_lines INTEGER DEFAULT 0,
  total_qty    NUMERIC(18,5) DEFAULT 0,
  picked_qty   NUMERIC(18,5) DEFAULT 0,
  assigned_to  VARCHAR(255),
  released_at  TIMESTAMPTZ,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  due_date     TIMESTAMPTZ,
  notes        TEXT,
  created_by   VARCHAR(255),
  created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Avlu / Park Alanı (Yard Locations)
CREATE TABLE IF NOT EXISTS wms.yard_locations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr       VARCHAR(10),
  code          VARCHAR(50) UNIQUE NOT NULL,
  type          VARCHAR(50) DEFAULT 'parking',
  status        VARCHAR(20) DEFAULT 'available',
  vehicle_plate VARCHAR(20),
  driver_name   VARCHAR(255),
  entry_time    TIMESTAMPTZ,
  exit_time     TIMESTAMPTZ,
  warehouse_id  UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- İşgücü Verimliliği (Labor Productivity)
CREATE TABLE IF NOT EXISTS wms.labor_productivity (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr         VARCHAR(10),
  user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  username        VARCHAR(255),
  task_type       VARCHAR(50),
  reference_id    UUID,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ,
  duration_min    NUMERIC(10,2)
    GENERATED ALWAYS AS (
      CASE WHEN end_time IS NOT NULL
           THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 60
           ELSE NULL END
    ) STORED,
  items_processed NUMERIC(18,5) DEFAULT 0,
  lines_processed INTEGER DEFAULT 0,
  efficiency_rate NUMERIC(5,2),
  warehouse_id    UUID,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Raf Yerleşim Önerileri (Slotting Recommendations)
CREATE TABLE IF NOT EXISTS wms.slotting_recommendations (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr              VARCHAR(10),
  product_id           UUID,
  product_code         VARCHAR(100),
  product_name         VARCHAR(255),
  current_location     VARCHAR(50),
  recommended_location VARCHAR(50),
  reason               VARCHAR(255),
  velocity_class       VARCHAR(1),
  daily_picks          NUMERIC(10,2) DEFAULT 0,
  distance_saved_m     NUMERIC(8,2),
  is_applied           BOOLEAN DEFAULT false,
  applied_at           TIMESTAMPTZ,
  applied_by           VARCHAR(255),
  created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Rampa Kapıları (Dock Doors)
CREATE TABLE IF NOT EXISTS wms.dock_doors (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr       VARCHAR(10),
  code          VARCHAR(20) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  type          VARCHAR(20) DEFAULT 'inbound',
  warehouse_id  UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  status        VARCHAR(20) DEFAULT 'available',
  vehicle_plate VARCHAR(20),
  carrier_name  VARCHAR(100),
  assigned_at   TIMESTAMPTZ,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- İş Kuyruğu (Task Queue)
CREATE TABLE IF NOT EXISTS wms.task_queue (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr      VARCHAR(10),
  task_type    VARCHAR(30) NOT NULL,
  reference_id UUID,
  reference_no VARCHAR(50),
  priority     INTEGER DEFAULT 5,
  status       VARCHAR(20) DEFAULT 'pending',
  assigned_to  VARCHAR(255),
  assigned_at  TIMESTAMPTZ,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  warehouse_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  bin_location VARCHAR(50),
  product_code VARCHAR(100),
  quantity     NUMERIC(18,5) DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- WMS Indeksleri
CREATE INDEX IF NOT EXISTS idx_counting_slips_firm_nr ON wms.counting_slips(firm_nr);
CREATE INDEX IF NOT EXISTS idx_counting_slips_status ON wms.counting_slips(status);
CREATE INDEX IF NOT EXISTS idx_counting_slips_store_id ON wms.counting_slips(store_id);
CREATE INDEX IF NOT EXISTS idx_counting_lines_slip_id ON wms.counting_lines(slip_id);
CREATE INDEX IF NOT EXISTS idx_counting_lines_product_id ON wms.counting_lines(product_id);
CREATE INDEX IF NOT EXISTS idx_counting_lines_barcode ON wms.counting_lines(barcode);
CREATE INDEX IF NOT EXISTS idx_receiving_slips_firm ON wms.receiving_slips(firm_nr);
CREATE INDEX IF NOT EXISTS idx_receiving_slips_status ON wms.receiving_slips(status);
CREATE INDEX IF NOT EXISTS idx_receiving_lines_slip ON wms.receiving_lines(slip_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_slips_firm ON wms.dispatch_slips(firm_nr);
CREATE INDEX IF NOT EXISTS idx_dispatch_slips_status ON wms.dispatch_slips(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_lines_slip ON wms.dispatch_lines(slip_id);
CREATE INDEX IF NOT EXISTS idx_wms_pick_waves_status ON wms.pick_waves(status, priority);
CREATE INDEX IF NOT EXISTS idx_wms_pick_waves_firm_status ON wms.pick_waves(firm_nr, status, priority);
CREATE INDEX IF NOT EXISTS idx_wms_yard_firm_status ON wms.yard_locations(firm_nr, status);
CREATE INDEX IF NOT EXISTS idx_wms_task_queue_status ON wms.task_queue(status, priority, assigned_to);
CREATE INDEX IF NOT EXISTS idx_wms_task_queue_type ON wms.task_queue(task_type, status);
CREATE INDEX IF NOT EXISTS idx_wms_task_queue_firm_status ON wms.task_queue(firm_nr, status, priority);

-- ============================================================================
-- 6. RESTAURANT SCHEMA (Global REST tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS rest.staff_roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(50) NOT NULL UNIQUE,
  permissions JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS rest.floors (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id      UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  color         VARCHAR(50) DEFAULT '#3B82F6',
  display_order INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rest.kroki_layouts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id    UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  floor_name  VARCHAR(100) NOT NULL DEFAULT 'Tümü',
  layout_data JSONB NOT NULL DEFAULT '{}',
  UNIQUE(store_id, floor_name)
);

CREATE TABLE IF NOT EXISTS rest.printer_profiles (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id   UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  type       VARCHAR(20) DEFAULT 'thermal',
  address    VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- İade/iptal raporu (VoidReturnReport) — 002 / SETUP_RESTAURANT_CHAT_ADDITIONS ile uyumlu
CREATE TABLE IF NOT EXISTS rest.return_log (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_number    VARCHAR(50) NOT NULL,
  original_receipt VARCHAR(100),
  product_id       UUID,
  product_name     VARCHAR(255) NOT NULL,
  quantity         DECIMAL(15,3) NOT NULL DEFAULT 1,
  unit_price       DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
  return_reason    TEXT NOT NULL,
  staff_name       VARCHAR(255),
  created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_return_log_created_at ON rest.return_log(created_at);
CREATE INDEX IF NOT EXISTS idx_return_log_reason ON rest.return_log(return_reason);

-- ============================================================================
-- 7. BEAUTY SCHEMA (Static global)
-- ============================================================================

CREATE TABLE IF NOT EXISTS beauty.body_regions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(100) NOT NULL UNIQUE,
  avg_shots  INTEGER DEFAULT 100,
  min_shots  INTEGER DEFAULT 50,
  max_shots  INTEGER DEFAULT 200,
  sort_order INTEGER DEFAULT 0
);

-- ============================================================================
-- 8. SYSTEM TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_settings (
  id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key     VARCHAR(100) NOT NULL,
  value   JSONB NOT NULL,
  firm_nr VARCHAR(10) NOT NULL,
  UNIQUE(key, firm_nr)
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name     VARCHAR(100) NOT NULL,
  record_id      UUID NOT NULL,
  action         VARCHAR(20) NOT NULL,
  firm_nr        VARCHAR(10) NOT NULL,
  data           JSONB,
  status         VARCHAR(20) DEFAULT 'pending',
  target_store_id UUID REFERENCES public.stores(id),
  source_system  VARCHAR(50) DEFAULT 'RetailEX',
  synced_at      TIMESTAMPTZ,
  retry_count    INTEGER DEFAULT 0,
  error_message  TEXT,
  created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID,
  firm_nr    VARCHAR(10) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id  UUID NOT NULL,
  action     VARCHAR(20) NOT NULL,
  old_data   JSONB,
  new_data   JSONB,
  client_info JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 9. GLOBAL MASTER DATA
-- ============================================================================

CREATE TABLE IF NOT EXISTS brands (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS product_groups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS categories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          VARCHAR(50) NOT NULL UNIQUE,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  parent_id     UUID REFERENCES categories(id),
  is_restaurant BOOLEAN DEFAULT false,
  icon          VARCHAR(100),
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS units (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(20) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.menu_items (
  id            SERIAL PRIMARY KEY,
  menu_type     VARCHAR(50) NOT NULL,
  title         VARCHAR(255),
  label         VARCHAR(255) NOT NULL,
  label_tr      VARCHAR(255),
  label_en      VARCHAR(255),
  label_ar      VARCHAR(255),
  parent_id     INTEGER,
  section_id    INTEGER,
  screen_id     VARCHAR(100),
  icon_name     VARCHAR(100),
  badge         VARCHAR(50),
  display_order INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  is_visible    BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Barcode Templates for automatic generation
CREATE TABLE IF NOT EXISTS public.barcode_templates (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(100) NOT NULL DEFAULT 'Varsayilan Sablon',
    prefix        VARCHAR(20) DEFAULT '869',
    current_value BIGINT DEFAULT 1000000,
    length        INTEGER DEFAULT 13,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial barcode template
INSERT INTO public.barcode_templates (name, prefix, current_value, length)
SELECT 'Varsayilan Sablon', '869', 1000000, 13
WHERE NOT EXISTS (SELECT 1 FROM public.barcode_templates);

-- History table for tracking product exchange rate changes
CREATE TABLE IF NOT EXISTS public.product_exchange_rate_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL,
    old_rate NUMERIC,
    new_rate NUMERIC,
    changed_by TEXT,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prod_rate_history_product_id ON public.product_exchange_rate_history(product_id);

-- ============================================================================
-- 10. FUNCTIONS & TRIGGERS
-- ============================================================================

-- 10.1 Timestamp Update Helper
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10.2 Sync Queue Trigger
CREATE OR REPLACE FUNCTION enqueue_sync_event()
RETURNS TRIGGER AS $$
DECLARE
  v_firm_nr  VARCHAR;
  v_record_id UUID;
  v_data     JSONB;
BEGIN
  BEGIN
    IF (TG_OP = 'DELETE') THEN
      v_firm_nr := OLD.firm_nr; v_record_id := OLD.id; v_data := row_to_json(OLD)::JSONB;
    ELSE
      v_firm_nr := NEW.firm_nr; v_record_id := NEW.id; v_data := row_to_json(NEW)::JSONB;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_firm_nr := '001';
    IF (TG_OP = 'DELETE') THEN v_record_id := OLD.id; v_data := row_to_json(OLD)::JSONB;
    ELSE v_record_id := NEW.id; v_data := row_to_json(NEW)::JSONB; END IF;
  END;
  UPDATE sync_queue SET data = v_data, action = TG_OP, created_at = NOW()
  WHERE table_name = TG_TABLE_NAME AND record_id = v_record_id AND status = 'pending';
  IF NOT FOUND THEN
    INSERT INTO sync_queue (table_name, record_id, action, firm_nr, data)
    VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_firm_nr, v_data);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 10.3 Apply Sync Triggers Helper
CREATE OR REPLACE FUNCTION public.APPLY_SYNC_TRIGGERS(p_table_name TEXT)
RETURNS void AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I; CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.enqueue_sync_event();',
    'sync_trg_' || p_table_name, p_table_name, 'sync_trg_' || p_table_name, p_table_name);
END;
$$ LANGUAGE plpgsql;

-- 10.4 Audit Log
CREATE OR REPLACE FUNCTION public.log_row_change()
RETURNS TRIGGER AS $$
DECLARE
  v_old_data JSONB := NULL;
  v_new_data JSONB := NULL;
  v_firm_nr  VARCHAR(10);
BEGIN
  IF (TG_OP = 'UPDATE') THEN v_old_data := to_jsonb(OLD); v_new_data := to_jsonb(NEW);
  ELSIF (TG_OP = 'DELETE') THEN v_old_data := to_jsonb(OLD);
  ELSIF (TG_OP = 'INSERT') THEN v_new_data := to_jsonb(NEW);
  END IF;
  BEGIN v_firm_nr := NEW.firm_nr; EXCEPTION WHEN OTHERS THEN
  BEGIN v_firm_nr := OLD.firm_nr; EXCEPTION WHEN OTHERS THEN v_firm_nr := 'SYSTEM'; END; END;
  INSERT INTO public.audit_logs (user_id, firm_nr, table_name, record_id, action, old_data, new_data, client_info)
  VALUES (current_setting('app.current_user_id', true)::UUID,
          COALESCE(v_firm_nr, 'SYSTEM'), TG_TABLE_NAME,
          COALESCE(NEW.id, OLD.id), TG_OP, v_old_data, v_new_data,
          jsonb_build_object('ip', inet_client_addr(), 'backend_pid', pg_backend_pid()));
  IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.ATTACH_AUDIT_LOG(p_table_name TEXT)
RETURNS void AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON %I', p_table_name);
  EXECUTE format('CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.log_row_change()', p_table_name);
END;
$$ LANGUAGE plpgsql;

-- 10.5 WMS Timestamp Trigger
CREATE OR REPLACE FUNCTION wms.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION wms.update_counting_slips_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_counting_slips_updated_at ON wms.counting_slips;
CREATE TRIGGER trg_counting_slips_updated_at
  BEFORE UPDATE ON wms.counting_slips FOR EACH ROW EXECUTE FUNCTION wms.update_counting_slips_updated_at();

DROP TRIGGER IF EXISTS trg_counting_lines_updated_at ON wms.counting_lines;
CREATE TRIGGER trg_counting_lines_updated_at
  BEFORE UPDATE ON wms.counting_lines FOR EACH ROW EXECUTE FUNCTION wms.update_counting_slips_updated_at();

DROP TRIGGER IF EXISTS trg_wms_pick_waves_updated ON wms.pick_waves;
CREATE TRIGGER trg_wms_pick_waves_updated
  BEFORE UPDATE ON wms.pick_waves FOR EACH ROW EXECUTE FUNCTION wms.update_timestamp();

DROP TRIGGER IF EXISTS trg_wms_task_queue_updated ON wms.task_queue;
CREATE TRIGGER trg_wms_task_queue_updated
  BEFORE UPDATE ON wms.task_queue FOR EACH ROW EXECUTE FUNCTION wms.update_timestamp();

DROP TRIGGER IF EXISTS trg_wms_dock_updated ON wms.dock_doors;
CREATE TRIGGER trg_wms_dock_updated
  BEFORE UPDATE ON wms.dock_doors FOR EACH ROW EXECUTE FUNCTION wms.update_timestamp();

DROP TRIGGER IF EXISTS trg_wms_yard_updated ON wms.yard_locations;
CREATE TRIGGER trg_wms_yard_updated
  BEFORE UPDATE ON wms.yard_locations FOR EACH ROW EXECUTE FUNCTION wms.update_timestamp();

-- ============================================================================
-- 11. DYNAMIC ENGINE: CREATE_FIRM_TABLES (v6.0 — Definitive)
-- ============================================================================
-- Bu fonksiyon yeni bir firma kurulduğunda çağrılır.
-- Tüm firma-seviyesi tablolar bu fonksiyon ile oluşturulur.
-- ============================================================================

CREATE OR REPLACE FUNCTION CREATE_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
  v_prefix    TEXT := lower('rex_' || p_firm_nr);
  v_unitset_id UUID;
BEGIN
  -- 1. Products (tam şema — tüm kolonlar dahil)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      firm_nr           VARCHAR(10) NOT NULL,
      ref_id            INTEGER UNIQUE,
      code              VARCHAR(100) UNIQUE,
      barcode           VARCHAR(100),
      name              VARCHAR(255) NOT NULL,
      name2             VARCHAR(255),
      image_url         TEXT,
      image_url_cdn     TEXT,
      description       TEXT,
      description_tr    TEXT,
      description_en    TEXT,
      description_ar    TEXT,
      description_ku    TEXT,
      category_id       UUID,
      category_code     VARCHAR(50),
      categorycode      VARCHAR(50),
      "categoryCode"    VARCHAR(50),
      group_code        VARCHAR(50),
      groupcode         VARCHAR(50),
      "groupCode"       VARCHAR(50),
      sub_group_code    VARCHAR(50),
      subgroupcode      VARCHAR(50),
      "subGroupCode"    VARCHAR(50),
      brand             VARCHAR(100),
      model             VARCHAR(100),
      manufacturer      VARCHAR(100),
      supplier          VARCHAR(100),
      origin            VARCHAR(50),
      material_type     VARCHAR(50),
      materialtype      VARCHAR(50),
      "materialType"    VARCHAR(50),
      unit              VARCHAR(50) DEFAULT ''Adet'',
      unit2             VARCHAR(20),
      unit3             VARCHAR(20),
      unit_id           UUID,
      unitset_id        UUID,
      unitsetid         UUID,
      "unitsetId"       UUID,
      vat_rate          DECIMAL(5,2) DEFAULT 20,
      vatrate           DECIMAL(5,2) DEFAULT 20,
      "vatRate"         DECIMAL(5,2) DEFAULT 20,
      tax_type          VARCHAR(20),
      withholding_rate  DECIMAL(5,2),
      currency          VARCHAR(10) DEFAULT ''IQD'',
      price             DECIMAL(15,2) DEFAULT 0,
      cost              DECIMAL(15,2) DEFAULT 0,
      stock             DECIMAL(15,2) DEFAULT 0,
      min_stock         DECIMAL(15,2) DEFAULT 0,
      max_stock         DECIMAL(15,2) DEFAULT 0,
      critical_stock    DECIMAL(15,2) DEFAULT 0,
      tracking_type     VARCHAR(20) DEFAULT ''none'',
      shelf_location    VARCHAR(50),
      warehouse_code    VARCHAR(50),
      special_code_1    VARCHAR(50),
      special_code_2    VARCHAR(50),
      special_code_3    VARCHAR(50),
      special_code_4    VARCHAR(50),
      special_code_5    VARCHAR(50),
      special_code_6    VARCHAR(50),
      specialcode1      VARCHAR(50),
      specialcode2      VARCHAR(50),
      specialcode3      VARCHAR(50),
      specialcode4      VARCHAR(50),
      specialcode5      VARCHAR(50),
      specialcode6      VARCHAR(50),
      price_list_1      DECIMAL(15,2) DEFAULT 0,
      price_list_2      DECIMAL(15,2) DEFAULT 0,
      price_list_3      DECIMAL(15,2) DEFAULT 0,
      price_list_4      DECIMAL(15,2) DEFAULT 0,
      price_list_5      DECIMAL(15,2) DEFAULT 0,
      price_list_6      DECIMAL(15,2) DEFAULT 0,
      pricelist1        DECIMAL(15,2),
      pricelist2        DECIMAL(15,2),
      pricelist3        DECIMAL(15,2),
      pricelist4        DECIMAL(15,2),
      pricelist5        DECIMAL(15,2),
      pricelist6        DECIMAL(15,2),
      purchase_price_usd DECIMAL(15,2) DEFAULT 0,
      purchase_price_eur DECIMAL(15,2) DEFAULT 0,
      sale_price_usd    DECIMAL(15,2) DEFAULT 0,
      sale_price_eur    DECIMAL(15,2) DEFAULT 0,
      custom_exchange_rate NUMERIC DEFAULT 0,
      auto_calculate_usd BOOLEAN DEFAULT false,
      preparation_time  INTEGER DEFAULT 5,
      has_variants      BOOLEAN DEFAULT false,
      hasvariants       BOOLEAN DEFAULT false,
      "hasVariants"     BOOLEAN DEFAULT false,
      is_active         BOOLEAN DEFAULT true,
      created_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_products');

  -- 2. Customers
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      firm_nr      VARCHAR(10) NOT NULL,
      code         VARCHAR(50) UNIQUE,
      name         VARCHAR(255) NOT NULL,
      phone        VARCHAR(50),
      email        VARCHAR(255),
      tax_nr       VARCHAR(50),
      taxi_nr      VARCHAR(50),
      tax_office   VARCHAR(100),
      address      TEXT,
      city         VARCHAR(100),
      neighborhood VARCHAR(100),
      district     VARCHAR(100),
      balance      DECIMAL(15,2) DEFAULT 0,
      points       DECIMAL(15,2) DEFAULT 0,
      is_active    BOOLEAN DEFAULT true,
      created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_customers');

  -- 3. Suppliers
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      firm_nr              VARCHAR(10) NOT NULL,
      code                 VARCHAR(50) UNIQUE,
      name                 VARCHAR(255) NOT NULL,
      phone                VARCHAR(50),
      email                VARCHAR(255),
      tax_nr               VARCHAR(50),
      tax_office           VARCHAR(100),
      address              TEXT,
      city                 VARCHAR(100),
      neighborhood         VARCHAR(100),
      district             VARCHAR(100),
      contact_person       VARCHAR(150),
      contact_person_phone VARCHAR(50),
      payment_terms        VARCHAR(100),
      credit_limit         DECIMAL(15,2) DEFAULT 0,
      notes                TEXT,
      balance              DECIMAL(15,2) DEFAULT 0,
      is_active            BOOLEAN DEFAULT true,
      created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_suppliers');

  -- 3b. Services (hizmet kartları — fatura / Excel / kasa)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      firm_nr VARCHAR(10) NOT NULL,
      code VARCHAR(100) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      description_tr TEXT,
      description_en TEXT,
      description_ar TEXT,
      description_ku TEXT,
      category VARCHAR(255),
      category_id UUID,
      category_code VARCHAR(50),
      brand VARCHAR(100),
      model VARCHAR(100),
      manufacturer VARCHAR(100),
      supplier VARCHAR(100),
      origin VARCHAR(50),
      group_code VARCHAR(50),
      sub_group_code VARCHAR(50),
      special_code_1 VARCHAR(50),
      special_code_2 VARCHAR(50),
      special_code_3 VARCHAR(50),
      special_code_4 VARCHAR(50),
      special_code_5 VARCHAR(50),
      special_code_6 VARCHAR(50),
      unit VARCHAR(50) DEFAULT ''Adet'',
      unit_price DECIMAL(15,2) DEFAULT 0,
      unit_price_usd DECIMAL(15,2) DEFAULT 0,
      unit_price_eur DECIMAL(15,2) DEFAULT 0,
      purchase_price DECIMAL(15,2) DEFAULT 0,
      purchase_price_usd DECIMAL(15,2) DEFAULT 0,
      purchase_price_eur DECIMAL(15,2) DEFAULT 0,
      tax_rate DECIMAL(5,2) DEFAULT 18,
      tax_type VARCHAR(20),
      withholding_rate DECIMAL(5,2) DEFAULT 0,
      discount1 DECIMAL(15,2) DEFAULT 0,
      discount2 DECIMAL(15,2) DEFAULT 0,
      discount3 DECIMAL(15,2) DEFAULT 0,
      image_url TEXT,
      price_list_1 DECIMAL(15,2) DEFAULT 0,
      price_list_2 DECIMAL(15,2) DEFAULT 0,
      price_list_3 DECIMAL(15,2) DEFAULT 0,
      price_list_4 DECIMAL(15,2) DEFAULT 0,
      price_list_5 DECIMAL(15,2) DEFAULT 0,
      price_list_6 DECIMAL(15,2) DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT %I UNIQUE (firm_nr, code)
    );
  ', v_prefix || '_services', v_prefix || '_services_firm_code_uq');

  -- 4. Definitions (Categories, Brands, Units)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      code          VARCHAR(50) UNIQUE,
      name          VARCHAR(255) NOT NULL,
      description   TEXT,
      parent_id     UUID,
      is_restaurant BOOLEAN DEFAULT false,
      icon          VARCHAR(100),
      is_active     BOOLEAN DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_categories');

  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_brands');
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(20) UNIQUE, name VARCHAR(100) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_units');

  -- Seed standard units (Comprehensive list matching default unit sets)
  EXECUTE format('INSERT INTO %I (code, name) VALUES 
    (''ADET'', ''Adet''), (''KG'', ''Kilogram''), (''GRAM'', ''Gram''), (''TON'', ''Ton''),
    (''METRE'', ''Metre''), (''TOP'', ''Top''), (''LITRE'', ''Litre''), (''ML'', ''Mililitre''),
    (''PAKET'', ''Paket''), (''KOLI'', ''Koli''), (''PALET'', ''Palet''), (''DUZINE'', ''Düzine''),
    (''M2'', ''Metrekare''), (''SAAT'', ''Saat''), (''DAK'', ''Dakika''), (''KUTU'', ''Kutu''),
    (''SET'', ''Set''), (''PARCA'', ''Parca''), (''SISE'', ''Sise''), (''KASA'', ''Kasa'')
    ON CONFLICT (code) DO NOTHING;', v_prefix || '_units');

  -- 5. Unit Sets & Lines (tam şema — code, name, main_unit, conv_fact1, conv_fact2)
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT true);', v_prefix || '_unitsets');
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      unitset_id  UUID,
      item_code   VARCHAR(20) NOT NULL,
      code        VARCHAR(50),
      name        VARCHAR(100),
      main_unit   BOOLEAN DEFAULT false,
      multiplier1 DECIMAL(15,2) DEFAULT 1,
      multiplier2 DECIMAL(15,2) DEFAULT 1,
      conv_fact1  DECIMAL(15,6) DEFAULT 1,
      conv_fact2  DECIMAL(15,6) DEFAULT 1,
      CONSTRAINT %I UNIQUE(unitset_id, item_code)
    );
  ', v_prefix || '_unitsetl', v_prefix || '_unitsetl_unique');

  -- 6. Product Variants
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), product_id UUID, sku VARCHAR(100) UNIQUE, attributes JSONB);', v_prefix || '_product_variants');

  -- 6b. Product Barcodes (multiple barcodes per product, each with its own unit)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      product_id   UUID NOT NULL,
      barcode_code VARCHAR(100) NOT NULL,
      unit         VARCHAR(50),
      sale_price   DECIMAL(15,2) DEFAULT 0,
      is_primary   BOOLEAN DEFAULT false,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_prefix || '_product_barcodes');

  -- 6c. Product Unit Conversions (e.g. 1 Koli = 12 Adet)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      product_id UUID NOT NULL,
      from_unit  VARCHAR(50) NOT NULL,
      to_unit    VARCHAR(50) NOT NULL,
      factor     DECIMAL(15,6) NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_prefix || '_product_unit_conversions');

  -- 7. Campaigns
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      firm_nr               VARCHAR(10) NOT NULL,
      name                  VARCHAR(255) NOT NULL,
      description           TEXT,
      type                  VARCHAR(50) NOT NULL,
      discount_type         VARCHAR(50) NOT NULL,
      discount_value        DECIMAL(15,2) DEFAULT 0,
      start_date            TIMESTAMPTZ,
      end_date              TIMESTAMPTZ,
      is_active             BOOLEAN DEFAULT true,
      min_purchase_amount   DECIMAL(15,2) DEFAULT 0,
      max_discount_amount   DECIMAL(15,2),
      applicable_categories VARCHAR(255),
      applicable_products   JSONB DEFAULT ''[]'',
      priority              INTEGER DEFAULT 0,
      created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_campaigns');

  -- 8. Finance Registers
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, currency_code VARCHAR(10) DEFAULT ''IQD'', balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_cash_registers');
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, bank_name VARCHAR(255), iban VARCHAR(50), currency_code VARCHAR(10) DEFAULT ''IQD'', balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_bank_registers');
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_expense_cards');
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255), is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_sales_reps');

  -- Sync Triggers
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_products');
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_customers');
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_suppliers');
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_services');
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_cash_registers');
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_bank_registers');
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_expense_cards');
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_sales_reps');
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_categories');
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_brands');
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_units');
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_campaigns');

  -- ═══════════════════════════════════════════════════════════════════
  -- STANDART BİRİM SETLERİ — tüm perakende/toptan senaryoları
  -- Ana birim = faturada varsayılan olarak kullanılan birim
  -- conv_fact1 = "1 ana birimde kaç alt birim var" (stok çarpanı)
  -- ═══════════════════════════════════════════════════════════════════

  -- 01 · Tekil (sadece Adet)
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''01-ADET'', ''Tekil (Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true, 1, 1 FROM %I WHERE code = ''01-ADET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 02 · Kilogram / Gram
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''02-KG'', ''Kilogram / Gram'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KG'',   ''KG'',   ''Kilogram'', true,  1,    1 FROM %I WHERE code = ''02-KG'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''GRAM'', ''GRAM'', ''Gram'',     false, 1000, 1 FROM %I WHERE code = ''02-KG'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 03 · Litre / Mililitre
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''03-LT'', ''Litre / Mililitre'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''LT'', ''LT'', ''Litre'',     true,  1,    1 FROM %I WHERE code = ''03-LT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ML'', ''ML'', ''Mililitre'', false, 1000, 1 FROM %I WHERE code = ''03-LT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 04 · Koli (6 Adet) — büyük ürünler / elektrikli ev aletleri
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''04-KOLI6'', ''Koli (6 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1, 1 FROM %I WHERE code = ''04-KOLI6'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'', ''KOLI'', ''Koli'', false, 6, 1 FROM %I WHERE code = ''04-KOLI6'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 05 · Koli (12 Adet) — içecek / deterjan
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''05-KOLI12'', ''Koli (12 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1,  1 FROM %I WHERE code = ''05-KOLI12'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'', ''KOLI'', ''Koli'', false, 12, 1 FROM %I WHERE code = ''05-KOLI12'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 06 · Koli (24 Adet) — su / küçük gıda ürünleri
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''06-KOLI24'', ''Koli (24 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1,  1 FROM %I WHERE code = ''06-KOLI24'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'', ''KOLI'', ''Koli'', false, 24, 1 FROM %I WHERE code = ''06-KOLI24'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 07 · Koli (48 Adet) — küçük paket ürünler / atıştırmalık
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''07-KOLI48'', ''Koli (48 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1,  1 FROM %I WHERE code = ''07-KOLI48'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'', ''KOLI'', ''Koli'', false, 48, 1 FROM %I WHERE code = ''07-KOLI48'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 08 · Adet / Koli (12) / Palet (144) — 3 kademeli hiyerarşi
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''08-PALET'', ''Adet / Koli(12) / Palet(144)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'',  ''ADET'',  ''Adet'',  true,  1,   1 FROM %I WHERE code = ''08-PALET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'',  ''KOLI'',  ''Koli'',  false, 12,  1 FROM %I WHERE code = ''08-PALET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''PALET'', ''PALET'', ''Palet'', false, 144, 1 FROM %I WHERE code = ''08-PALET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 09 · Düzine (12 Adet) — küçük aksesuar / tuhafiye
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''09-DUZINE'', ''Düzine (12 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'',   ''ADET'',   ''Adet'',   true,  1,  1 FROM %I WHERE code = ''09-DUZINE'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''DUZINE'', ''DUZINE'', ''Düzine'', false, 12, 1 FROM %I WHERE code = ''09-DUZINE'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 10 · Paket (10 Adet) — kırtasiye / ilaç / ambalaj
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''10-PKT10'', ''Paket (10 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'',  ''ADET'',  ''Adet'',  true,  1,  1 FROM %I WHERE code = ''10-PKT10'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''PAKET'', ''PAKET'', ''Paket'', false, 10, 1 FROM %I WHERE code = ''10-PKT10'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 11 · Paket (5 Adet) — güzellik / sağlık ürünleri
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''11-PKT5'', ''Paket (5 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'',  ''ADET'',  ''Adet'',  true,  1, 1 FROM %I WHERE code = ''11-PKT5'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''PAKET'', ''PAKET'', ''Paket'', false, 5, 1 FROM %I WHERE code = ''11-PKT5'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 12 · Metre / Top (50m) — tekstil / kumaş
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''12-METRE-TOP50'', ''Metre / Top (50m)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''METRE'', ''METRE'', ''Metre'', true,  1,  1 FROM %I WHERE code = ''12-METRE-TOP50'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''TOP'',   ''TOP'',   ''Top'',   false, 50, 1 FROM %I WHERE code = ''12-METRE-TOP50'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 13 · Metre / Top (100m) — halı / ip / büyük rulolar
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''13-METRE-TOP100'', ''Metre / Top (100m)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''METRE'', ''METRE'', ''Metre'', true,  1,   1 FROM %I WHERE code = ''13-METRE-TOP100'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''TOP'',   ''TOP'',   ''Top'',   false, 100, 1 FROM %I WHERE code = ''13-METRE-TOP100'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 14 · KG / Ton — demir-çelik / inşaat malzemesi
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''14-KG-TON'', ''Kilogram / Ton'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KG'',  ''KG'',  ''Kilogram'', true,  1,    1 FROM %I WHERE code = ''14-KG-TON'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''TON'', ''TON'', ''Ton'',      false, 1000, 1 FROM %I WHERE code = ''14-KG-TON'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 15 · Metrekare (M²) — zemin / fayans / cam
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''15-M2'', ''Metrekare (M²)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''M2'', ''M2'', ''Metrekare'', true, 1, 1 FROM %I WHERE code = ''15-M2'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 16 · Saat / Dakika — hizmet / iş gücü
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''16-SAAT'', ''Saat / Dakika'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''SAAT'', ''SAAT'', ''Saat'',    true,  1,  1 FROM %I WHERE code = ''16-SAAT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''DAK'',  ''DAK'',  ''Dakika'',  false, 60, 1 FROM %I WHERE code = ''16-SAAT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 17 · Kutu / Adet — ilaç / kimyasal / ampul
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''17-KUTU'', ''Kutu / Adet'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1,  1 FROM %I WHERE code = ''17-KUTU'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KUTU'', ''KUTU'', ''Kutu'', false, 10, 1 FROM %I WHERE code = ''17-KUTU'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 18 · Set (Takım) — mobilya / spor ekipmanı
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''18-SET'', ''Set / Parca'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''SET'',   ''SET'',   ''Set'',   true,  1, 1 FROM %I WHERE code = ''18-SET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''PARCA'', ''PARCA'', ''Parca'', false, 1, 1 FROM %I WHERE code = ''18-SET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- Varsayılan Kasa
  EXECUTE format('INSERT INTO %I (id, firm_nr, code, name, is_active) VALUES (''00000000-0000-0000-0000-000000000001'', %L, ''KASA.001'', ''MERKEZ KASA'', true) ON CONFLICT DO NOTHING;', v_prefix || '_cash_registers', p_firm_nr);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 12. DYNAMIC ENGINE: CREATE_PERIOD_TABLES (v6.0 — Definitive)
-- ============================================================================

CREATE OR REPLACE FUNCTION CREATE_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE
  v_prefix       TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
  v_tbl_sales    TEXT := v_prefix || '_sales';
  v_tbl_items    TEXT := v_prefix || '_sale_items';
BEGIN
  -- 1. Sales Header
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      firm_nr        VARCHAR(10) NOT NULL,
      period_nr      VARCHAR(10) NOT NULL,
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
      payment_method VARCHAR(50),
      cashier        VARCHAR(100),
      is_cancelled   BOOLEAN DEFAULT false,
      credit_amount  DECIMAL(15,2) DEFAULT 0,
      notes          TEXT,
      created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_tbl_sales);

  -- 2. Sale Items (kur desteği + birim çarpan dahil)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      invoice_id      UUID REFERENCES %I(id) ON DELETE CASCADE,
      firm_nr         VARCHAR(10),
      period_nr       VARCHAR(10),
      item_code       VARCHAR(100),
      item_name       VARCHAR(255),
      product_id      UUID,
      quantity        DECIMAL(15,3) NOT NULL,
      unit_price      DECIMAL(15,2) NOT NULL,
      vat_rate        DECIMAL(5,2) DEFAULT 0,
      discount_rate   DECIMAL(15,4) DEFAULT 0,
      discount_amount DECIMAL(15,2) DEFAULT 0,
      total_amount    DECIMAL(15,2) DEFAULT 0,
      net_amount      DECIMAL(15,2) NOT NULL,
      unit_cost       DECIMAL(15,2) DEFAULT 0,
      total_cost      DECIMAL(15,2) DEFAULT 0,
      gross_profit    DECIMAL(15,2) DEFAULT 0,
      unit            VARCHAR(20) DEFAULT ''Adet'',
      unit_multiplier DECIMAL(15,6) DEFAULT 1,
      base_quantity   DECIMAL(15,3),
      unit_price_fc   DECIMAL(15,4) DEFAULT 0,
      currency        VARCHAR(10) DEFAULT ''IQD''
    );
  ', v_tbl_items, v_tbl_sales);

  -- 3. Cash Transactions
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      firm_nr              VARCHAR(10) NOT NULL,
      period_nr            VARCHAR(10),
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

  -- 4. Bank Transactions
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

  -- 5. Virman (Warehouse Transfer Notes)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      virman_id   UUID REFERENCES %I(id) ON DELETE CASCADE,
      product_id  UUID,
      quantity    DECIMAL(15,4) DEFAULT 0,
      notes       TEXT,
      created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_virman_items', v_prefix || '_virman_operations');

  -- 6. Stock Movements (Header)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      firm_nr          VARCHAR(10) NOT NULL,
      period_nr        VARCHAR(10) NOT NULL,
      document_no      VARCHAR(50) UNIQUE,
      trcode           INTEGER,
      movement_type    VARCHAR(20), -- ''in'' | ''out'' | ''transfer'' | ''adjustment''
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

  -- 7. Stock Movement Items (Lines)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

  PERFORM public.APPLY_SYNC_TRIGGERS(v_tbl_sales);
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_cash_lines');
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_bank_lines');
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_stock_movements');
  PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_stock_movement_items');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 13. PRODUCTION SYSTEM
-- ============================================================================

CREATE OR REPLACE FUNCTION public.INIT_PRODUCTION_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, product_id UUID NOT NULL, name VARCHAR(255) NOT NULL, description TEXT, total_cost DECIMAL(15,2) DEFAULT 0, wastage_percent DECIMAL(5,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_production_recipes');
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), recipe_id UUID NOT NULL, material_id UUID NOT NULL, quantity DECIMAL(15,3) NOT NULL, unit VARCHAR(20), cost DECIMAL(15,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_production_recipe_ingredients');
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, order_no VARCHAR(50) UNIQUE, recipe_id UUID NOT NULL, product_id UUID NOT NULL, planned_qty DECIMAL(15,3) NOT NULL, produced_qty DECIMAL(15,3) DEFAULT 0, status VARCHAR(20) DEFAULT ''draft'', start_date DATE, end_date DATE, completed_at TIMESTAMPTZ, note TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_production_orders');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_recipes');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_recipe_ingredients');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_orders');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 14. RESTAURANT INITIALIZERS
-- ============================================================================

CREATE OR REPLACE FUNCTION INIT_RESTAURANT_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      floor_id             UUID REFERENCES rest.floors(id),
      number               VARCHAR(50) NOT NULL,
      seats                INTEGER DEFAULT 4,
      status               VARCHAR(20) DEFAULT ''empty'',
      total                DECIMAL(15,2) DEFAULT 0,
      pos_x                INTEGER DEFAULT 0,
      pos_y                INTEGER DEFAULT 0,
      is_large             BOOLEAN DEFAULT false,
      waiter               VARCHAR(255),
      staff_id             UUID,
      start_time           TIMESTAMPTZ,
      locked_by_staff_id   UUID,
      locked_by_staff_name VARCHAR(255),
      locked_at            TIMESTAMPTZ,
      linked_order_ids     text[] DEFAULT ''{}'',
      color                VARCHAR(20) DEFAULT NULL,
      updated_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_rest_tables');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), menu_item_id UUID, product_id UUID, total_cost DECIMAL(15,2) DEFAULT 0, wastage_percent DECIMAL(5,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_rest_recipes');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), recipe_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE, material_id UUID, quantity DECIMAL(15,3), unit VARCHAR(20), cost DECIMAL(15,2) DEFAULT 0);', v_prefix || '_rest_recipe_ingredients', v_prefix || '_rest_recipes');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(100) NOT NULL, role VARCHAR(50) DEFAULT ''Waiter'', pin VARCHAR(10) NOT NULL UNIQUE, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_rest_staff');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION INIT_RESTAURANT_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_no        VARCHAR(50) UNIQUE,
      table_id        UUID,
      floor_id        UUID REFERENCES rest.floors(id),
      waiter          VARCHAR(255),
      staff_id        UUID,
      customer_id     UUID,
      status          VARCHAR(20) DEFAULT ''open'',
      total_amount    DECIMAL(15,2) DEFAULT 0,
      discount_amount DECIMAL(15,2) DEFAULT 0,
      order_discount_pct DECIMAL(5,2) DEFAULT 0,
      tax_amount      DECIMAL(15,2) DEFAULT 0,
      note            TEXT,
      parent_order_id UUID,
      kitchen_note    TEXT,
      estimated_ready_at TIMESTAMPTZ,
      opened_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      billed_at       TIMESTAMPTZ,
      closed_at       TIMESTAMPTZ,
      payment_method  VARCHAR(50),
      created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_rest_orders');
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_id         UUID REFERENCES rest.%I(id) ON DELETE CASCADE,
      product_id       UUID,
      product_name     VARCHAR(255) NOT NULL,
      quantity         DECIMAL(15,3) NOT NULL DEFAULT 1,
      unit_price       DECIMAL(15,2) NOT NULL,
      discount_pct     DECIMAL(5,2) DEFAULT 0,
      subtotal         DECIMAL(15,2) NOT NULL,
      status           VARCHAR(20) DEFAULT ''pending'',
      course           VARCHAR(50),
      note             TEXT,
      options          JSONB,
      is_void          BOOLEAN DEFAULT false,
      void_reason      TEXT,
      is_complimentary BOOLEAN DEFAULT false,
      preparation_time INTEGER,
      sent_to_kitchen_at TIMESTAMPTZ,
      served_at        TIMESTAMPTZ,
      created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_rest_order_items', v_prefix || '_rest_orders');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), order_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE, table_number VARCHAR(50), floor_name VARCHAR(100), waiter VARCHAR(255), staff_id UUID, status VARCHAR(20) DEFAULT ''new'', note TEXT, estimated_ready_at TIMESTAMPTZ, sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_rest_kitchen_orders', v_prefix || '_rest_orders');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), kitchen_order_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE, order_item_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE, product_name VARCHAR(255) NOT NULL, quantity DECIMAL(15,3) NOT NULL, course VARCHAR(50), note TEXT, status VARCHAR(20) DEFAULT ''new'', preparation_time INTEGER, start_at TIMESTAMPTZ, estimated_ready_at TIMESTAMPTZ, served_at TIMESTAMPTZ);', v_prefix || '_rest_kitchen_items', v_prefix || '_rest_kitchen_orders', v_prefix || '_rest_order_items');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 15. BEAUTY INITIALIZERS
-- ============================================================================

CREATE OR REPLACE FUNCTION INIT_BEAUTY_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255), specialty VARCHAR(100), color VARCHAR(20) DEFAULT ''#9333ea'', commission_rate DECIMAL(5,2) DEFAULT 0, avatar_url TEXT, working_hours JSONB, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_specialists');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL, category VARCHAR(50) DEFAULT ''beauty'', duration_min INTEGER DEFAULT 30, price DECIMAL(15,2) DEFAULT 0, cost_price DECIMAL(15,2) DEFAULT 0, color VARCHAR(20) DEFAULT ''#9333ea'', commission_rate DECIMAL(5,2) DEFAULT 0, description TEXT, requires_device BOOLEAN DEFAULT false, expected_shots INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_services');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL, description TEXT, service_id UUID, total_sessions INTEGER DEFAULT 1, price DECIMAL(15,2) DEFAULT 0, cost_price DECIMAL(15,2) DEFAULT 0, discount_pct DECIMAL(5,2) DEFAULT 0, validity_days INTEGER DEFAULT 365, color VARCHAR(20) DEFAULT ''#6366f1'', is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_packages');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL, device_type VARCHAR(50) DEFAULT ''laser'', serial_number VARCHAR(100), manufacturer VARCHAR(100), model VARCHAR(100), total_shots BIGINT DEFAULT 0, max_shots BIGINT DEFAULT 500000, maintenance_due DATE, last_maintenance DATE, purchase_date DATE, warranty_expiry DATE, status VARCHAR(20) DEFAULT ''active'', notes TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_devices');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255), source VARCHAR(30) DEFAULT ''other'', status VARCHAR(30) DEFAULT ''new'', interested_services JSONB DEFAULT ''[]'', notes TEXT, assigned_to UUID, first_contact_date DATE DEFAULT CURRENT_DATE, last_contact_date DATE, converted_customer_id UUID, lost_reason TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_leads');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT false, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_satisfaction_surveys');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), survey_id UUID NOT NULL REFERENCES beauty.%I(id) ON DELETE CASCADE, sort_order INTEGER DEFAULT 0, question_type VARCHAR(30) DEFAULT ''rating'', scale_max SMALLINT DEFAULT 5, is_required BOOLEAN DEFAULT true, labels_json JSONB NOT NULL DEFAULT ''{}''::jsonb, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_satisfaction_questions', v_prefix || '_beauty_satisfaction_surveys');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL, address TEXT, phone VARCHAR(50), is_active BOOLEAN DEFAULT true, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_branches');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), branch_id UUID, name VARCHAR(255) NOT NULL, capacity INTEGER DEFAULT 1, is_active BOOLEAN DEFAULT true, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_rooms');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), online_booking_enabled BOOLEAN DEFAULT false, public_slug VARCHAR(120), public_token VARCHAR(128) NOT NULL DEFAULT encode(gen_random_bytes(24), ''hex''), reminder_hours_before SMALLINT DEFAULT 24, sms_template TEXT, whatsapp_template TEXT, sms_user VARCHAR(255), sms_password VARCHAR(255), sms_sender VARCHAR(80), whatsapp_provider VARCHAR(30) DEFAULT ''NONE'', whatsapp_base_url TEXT, whatsapp_token TEXT, whatsapp_instance_id VARCHAR(255), whatsapp_phone_id VARCHAR(80), default_reminder_channel VARCHAR(20) DEFAULT ''sms'', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_portal_settings');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL, tax_nr VARCHAR(50), discount_pct DECIMAL(5,2) DEFAULT 0, notes TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_corporate_accounts');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), title VARCHAR(255) NOT NULL, body_html TEXT, is_active BOOLEAN DEFAULT true, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_consent_templates');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL, monthly_price DECIMAL(15,2) DEFAULT 0, session_credit INTEGER DEFAULT 0, benefits_json JSONB DEFAULT ''{}''::jsonb, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_memberships');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), service_id UUID NOT NULL, product_id UUID NOT NULL, qty_per_service DECIMAL(15,4) NOT NULL DEFAULT 1, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_service_consumables');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (customer_id UUID PRIMARY KEY, allergies TEXT, medications TEXT, pregnancy BOOLEAN DEFAULT false, chronic_notes TEXT, warnings_banner TEXT, kvkk_consent_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_customer_health');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), product_id UUID NOT NULL, lot_code VARCHAR(80), expiry_date DATE, qty DECIMAL(15,3) DEFAULT 0, barcode VARCHAR(80), created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_product_batches');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL, channel VARCHAR(30) DEFAULT ''sms'', segment_filter_json JSONB DEFAULT ''{}''::jsonb, message_template TEXT, scheduled_at TIMESTAMPTZ, status VARCHAR(20) DEFAULT ''draft'', sent_count INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_marketing_campaigns');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1), google_calendar_id TEXT, external_calendar_json JSONB DEFAULT ''{}''::jsonb, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_integration_settings');
  EXECUTE format('INSERT INTO beauty.%I (id) VALUES (1) ON CONFLICT (id) DO NOTHING', v_prefix || '_beauty_integration_settings');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION INIT_BEAUTY_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), client_id UUID, service_id UUID, specialist_id UUID, device_id UUID, body_region_id UUID, appointment_date DATE, appointment_time TIME, duration INTEGER DEFAULT 30, status VARCHAR(20) DEFAULT ''scheduled'', type VARCHAR(20) DEFAULT ''regular'', notes TEXT, total_price DECIMAL(15,2) DEFAULT 0, commission_amount DECIMAL(15,2) DEFAULT 0, is_package_session BOOLEAN DEFAULT false, package_purchase_id UUID, reminder_sent BOOLEAN DEFAULT false, branch_id UUID, room_id UUID, tele_meeting_url TEXT, booking_channel VARCHAR(40) DEFAULT ''staff'', corporate_account_id UUID, reminder_sent_at TIMESTAMPTZ, last_notification_channel VARCHAR(30), created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_appointments');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), customer_id UUID, specialist_id UUID, service_id UUID, appointment_id UUID, session_date DATE DEFAULT CURRENT_DATE, shots_used INTEGER DEFAULT 0, skin_type VARCHAR(20), before_photo TEXT, after_photo TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_sessions');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), package_purchase_id UUID, appointment_id UUID, session_number INTEGER, recorded_at TIMESTAMPTZ DEFAULT NOW())', v_prefix || '_beauty_session_logs');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), customer_id UUID, package_id UUID, total_sessions INTEGER DEFAULT 1, used_sessions INTEGER DEFAULT 0, remaining_sessions INTEGER DEFAULT 1, sale_price DECIMAL(15,2) DEFAULT 0, purchase_date DATE DEFAULT CURRENT_DATE, expiry_date DATE, status VARCHAR(20) DEFAULT ''active'', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_package_purchases');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), customer_id UUID, package_id UUID, total_sessions INTEGER, sale_price DECIMAL(15,2), sale_date DATE, expiry_date DATE, status VARCHAR(20))', v_prefix || '_beauty_package_sales');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), device_id UUID, appointment_id UUID, customer_id UUID, specialist_id UUID, body_region_id UUID, shots_used INTEGER DEFAULT 0, expected_shots INTEGER DEFAULT 0, is_excessive BOOLEAN DEFAULT false, usage_date DATE DEFAULT CURRENT_DATE, notes TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_device_usage');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), device_id UUID, usage_id UUID, alert_type VARCHAR(50), message TEXT, severity VARCHAR(20) DEFAULT ''warning'', acknowledged BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_device_alerts');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), appointment_id UUID, customer_id UUID, service_rating SMALLINT DEFAULT 5, staff_rating SMALLINT DEFAULT 5, cleanliness_rating SMALLINT DEFAULT 5, overall_rating SMALLINT DEFAULT 5, comment TEXT, would_recommend BOOLEAN DEFAULT true, survey_id UUID, survey_answers JSONB, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_customer_feedback');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), invoice_number VARCHAR(30), customer_id UUID, subtotal DECIMAL(15,2) DEFAULT 0, discount DECIMAL(15,2) DEFAULT 0, tax DECIMAL(15,2) DEFAULT 0, total DECIMAL(15,2) DEFAULT 0, payment_method VARCHAR(30) DEFAULT ''cash'', payment_status VARCHAR(20) DEFAULT ''paid'', paid_amount DECIMAL(15,2) DEFAULT 0, remaining_amount DECIMAL(15,2) DEFAULT 0, notes TEXT, created_by UUID, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_sales');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), sale_id UUID, item_type VARCHAR(20) DEFAULT ''service'', item_id UUID, name VARCHAR(255), quantity INTEGER DEFAULT 1, unit_price DECIMAL(15,2) DEFAULT 0, discount DECIMAL(15,2) DEFAULT 0, total DECIMAL(15,2) DEFAULT 0, staff_id UUID, commission_amount DECIMAL(15,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_sale_items');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), customer_id UUID, service_id UUID, specialist_id UUID, preferred_date_from DATE, preferred_date_to DATE, notes TEXT, status VARCHAR(20) DEFAULT ''active'', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_waitlist');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL, phone VARCHAR(50) NOT NULL, email VARCHAR(255), service_id UUID, requested_date DATE, requested_time TIME, notes TEXT, status VARCHAR(20) DEFAULT ''pending'', public_token_used VARCHAR(128), processed_appointment_id UUID, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_booking_requests');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), appointment_id UUID, channel VARCHAR(30) NOT NULL, payload_json JSONB DEFAULT ''{}''::jsonb, status VARCHAR(20) DEFAULT ''pending'', scheduled_at TIMESTAMPTZ, sent_at TIMESTAMPTZ, error_text TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_notification_queue');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), customer_id UUID, appointment_id UUID, template_id UUID, signed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, signature_data TEXT, meta_json JSONB DEFAULT ''{}''::jsonb, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_consent_submissions');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), appointment_id UUID, customer_id UUID, subjective TEXT, objective TEXT, assessment TEXT, plan TEXT, extra_json JSONB DEFAULT ''{}''::jsonb, created_by UUID, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_clinical_notes');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), customer_id UUID NOT NULL, appointment_id UUID, kind VARCHAR(20) DEFAULT ''before'', storage_url TEXT NOT NULL, caption TEXT, taken_at DATE, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_patient_photos');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), customer_id UUID NOT NULL, membership_id UUID NOT NULL, start_date DATE, end_date DATE, status VARCHAR(20) DEFAULT ''active'', auto_renew BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_membership_subscriptions');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), table_name VARCHAR(80) NOT NULL, record_id UUID, action VARCHAR(40) NOT NULL, user_id UUID, payload_json JSONB DEFAULT ''{}''::jsonb, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_audit_log');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), appointment_id UUID, product_id UUID NOT NULL, qty DECIMAL(15,4) NOT NULL, batch_id UUID, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_consumable_usage_log');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 16. REFRESH FUNCTION (Mevcut Kurulumları Güncellemek İçin)
-- ============================================================================
-- Bu fonksiyon mevcut tüm firma/dönem tablolarını yeniden initialize eder.
-- Yeni kolonlar zaten IF NOT EXISTS ile eklenir.

CREATE OR REPLACE FUNCTION public.REFRESH_ALL_FIRM_TABLES()
RETURNS void AS $$
DECLARE
  f RECORD;
  p RECORD;
BEGIN
  FOR f IN SELECT firm_nr FROM firms WHERE is_active = true LOOP
    RAISE NOTICE 'Refreshing firm: %', f.firm_nr;
    PERFORM CREATE_FIRM_TABLES(f.firm_nr);
    FOR p IN SELECT nr FROM periods WHERE firm_id = (SELECT id FROM firms WHERE firm_nr = f.firm_nr) LOOP
      RAISE NOTICE 'Refreshing period: % / %', f.firm_nr, p.nr;
      PERFORM CREATE_PERIOD_TABLES(f.firm_nr, p.nr::varchar);
    END LOOP;
    PERFORM INIT_RESTAURANT_FIRM_TABLES(f.firm_nr);
    PERFORM INIT_BEAUTY_FIRM_TABLES(f.firm_nr);
    FOR p IN SELECT nr FROM periods WHERE firm_id = (SELECT id FROM firms WHERE firm_nr = f.firm_nr) LOOP
      PERFORM INIT_RESTAURANT_PERIOD_TABLES(f.firm_nr, p.nr::varchar);
      PERFORM INIT_BEAUTY_PERIOD_TABLES(f.firm_nr, p.nr::varchar);
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 17. SEED DATA
-- ============================================================================

-- Para Birimleri
INSERT INTO currencies (code, name, symbol, is_base_currency, sort_order) VALUES
('IQD', 'Iraqi Dinar', 'د.ع', true, 1),
('USD', 'US Dollar', '$', false, 2),
('EUR', 'Euro', '€', false, 3),
('TRY', 'Turkish Lira', '₺', false, 4),
('SAR', 'Saudi Riyal', '﷼', false, 5),
('AED', 'UAE Dirham', 'د.إ', false, 6),
('KWD', 'Kuwaiti Dinar', 'د.ك', false, 7),
('GBP', 'British Pound', '£', false, 8)
ON CONFLICT (code) DO NOTHING;

-- Birimler
INSERT INTO units (code, name) VALUES
('ADET', 'Adet'),
('KG',   'Kilogram'),
('GRAM', 'Gram'),
('LT',   'Litre'),
('ML',   'Militre'),
('KOLI', 'Koli'),
('PKT',  'Paket'),
('MT',   'Metre'),
('M2',   'Metrekare')
ON CONFLICT (code) DO NOTHING;

-- RBAC Rolleri (landing_route: giriş sonrası açılacak modül)
INSERT INTO public.roles (id, name, description, is_system_role, color, permissions, landing_route) VALUES
('00000000-0000-0000-0000-000000000001', 'admin',   'Tam yetkili sistem yöneticisi',  true, '#9333ea', '["*"]', NULL),
('00000000-0000-0000-0000-000000000002', 'manager', 'Mağaza Müdürü',                  true, '#3B82F6', '["pos.*", "management.*", "reports.*"]', NULL),
('00000000-0000-0000-0000-000000000003', 'cashier', 'Kasiyer — Satış Yetkisi',        true, '#10B981', '["pos.view", "pos.sell"]', 'pos'),
('00000000-0000-0000-0000-000000000004', 'stock',   'Stok ve Depo Sorumlusu',         true, '#F59E0B', '["management.products", "reports.inventory"]', NULL),
('00000000-0000-0000-0000-000000000005', 'garson', 'Garson — Restoran masa servisi', true, '#F97316', '["restaurant.pos", "restaurant.kds"]', 'restaurant')
ON CONFLICT (name) DO UPDATE SET landing_route = EXCLUDED.landing_route;

-- Admin Kullanıcısı
INSERT INTO public.users (id, firm_nr, username, password_hash, full_name, email, role, role_id, is_active)
VALUES (
  '10000000-0000-4000-a000-000000000001',
  '001',
  'admin',
  crypt('admin', gen_salt('bf')),
  'System Administrator',
  'admin@retailex.com',
  'admin',
  '00000000-0000-0000-0000-000000000001',
  true
) ON CONFLICT (username) DO UPDATE SET role_id = EXCLUDED.role_id, role = EXCLUDED.role;

-- Kategoriler
INSERT INTO categories (code, name) VALUES
('GENEL',   'Genel Ürünler'),
('HIZMET',  'Hizmetler'),
('GIDA',    'Gıda'),
('ICECEK',  'İçecek')
ON CONFLICT (code) DO NOTHING;

-- Rapor Şablonları
INSERT INTO public.report_templates (name, description, category, content, is_default)
VALUES
('Modern Satış Faturası', 'Temiz ve modern fatura tasarımı', 'fatura', '{"pageSize": {"width": 210, "height": 297}, "components": []}', true),
('Standart Ürün Etiketi (40x20mm)', 'Barkodlu raf etiketi', 'etiket', '{"pageSize": {"width": 40, "height": 20}, "components": []}', true)
ON CONFLICT DO NOTHING;

-- Restoran Rolleri
INSERT INTO rest.staff_roles (name) VALUES ('Manager'), ('Waiter'), ('Chef'), ('Cashier') ON CONFLICT DO NOTHING;

-- Beauty Bölgeleri
INSERT INTO beauty.body_regions (name, avg_shots, min_shots, max_shots, sort_order) VALUES
('Yüz',              200, 150, 350,  1),
('Koltuk Altı',      150, 100, 250,  2),
('Bacak (Tam)',      1200, 800,1800,  3),
('Bacak (Alt Yarı)',  600, 400, 900,  4),
('Bacak (Üst Yarı)', 600, 400, 900,  5),
('Bikini (Tam)',      300, 200, 500,  6),
('Bikini (Dar)',      150, 100, 250,  7),
('Kol (Tam)',         500, 350, 750,  8),
('Kol (Yarım)',       250, 175, 400,  9),
('Sırt',              800, 500,1200, 10),
('Göğüs',             500, 300, 800, 11),
('Yüz + Boyun',       350, 250, 500, 12),
('Bıyık / Çene',      100,  60, 180, 13)
ON CONFLICT (name) DO NOTHING;

-- Servis Sağlığı
INSERT INTO public.service_health (service_name, status, version, metadata)
VALUES
('RetailEX-Sync-Service', 'OFFLINE', '2.0.0', '{"description": "Core sync engine"}'),
('RetailEX-Logo-Connector', 'OFFLINE', '1.0.0', '{"description": "Logo ERP bridge"}')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 18. BOOTSTRAP — Birincil Firma (001) Kurulumu
-- Not: "RetailEx OS" şablon kaydıdır; Logo ile 002+ firma kullanıldığında kurulum
-- sonunda kaldırılabilir (015_remove_template_firm_001_retailex_os.sql ve SetupWizard).
-- ============================================================================

INSERT INTO firms (id, firm_nr, name, "default", ana_para_birimi, raporlama_para_birimi)
VALUES ('00000000-0000-4000-a000-000000000001', '001', 'RetailEx OS', true, 'IQD', 'IQD')
ON CONFLICT DO NOTHING;

INSERT INTO periods (firm_id, nr, beg_date, end_date, "default")
VALUES ('00000000-0000-4000-a000-000000000001', 1, '2026-01-01', '2026-12-31', true)
ON CONFLICT DO NOTHING;

INSERT INTO stores (code, name, firm_nr, is_main, "default")
VALUES ('ST_01', 'Merkez Depo', '001', true, true)
ON CONFLICT DO NOTHING;

SELECT CREATE_FIRM_TABLES('001');
SELECT CREATE_PERIOD_TABLES('001', '01');
SELECT INIT_RESTAURANT_FIRM_TABLES('001');
SELECT INIT_BEAUTY_FIRM_TABLES('001');
SELECT INIT_RESTAURANT_PERIOD_TABLES('001', '01');
SELECT INIT_BEAUTY_PERIOD_TABLES('001', '01');

-- Tamamlandı kaydı
INSERT INTO public.audit_logs (firm_nr, table_name, record_id, action, new_data)
VALUES ('000', 'system', '00000000-0000-0000-0000-000000000000', 'MASTER_SCHEMA_V6',
        '{"status": "completed", "version": "6.0", "description": "Clean consolidated master schema"}'::JSONB)
ON CONFLICT DO NOTHING;
