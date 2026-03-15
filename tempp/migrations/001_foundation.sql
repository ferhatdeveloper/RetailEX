-- ============================================================================
-- RetailEx - CONSOLIDATED FOUNDATION (v5.1 - ABSOLUTE PARITY)
-- ----------------------------------------------------------------------------
-- Base Schema, Global Infrastructure, Enterprise Modules, and WMS Advanced
-- ============================================================================

-- 0. Extensions & Schemas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS logic;
CREATE SCHEMA IF NOT EXISTS wms;
CREATE SCHEMA IF NOT EXISTS rest;
CREATE SCHEMA IF NOT EXISTS beauty;
CREATE SCHEMA IF NOT EXISTS pos;

-- 1.0 ORGANIZATIONAL & SYSTEM TABLES
----------------------------------------------------------------------------

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
  "default"             BOOLEAN DEFAULT false,
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
  nr INTEGER NOT NULL,
  beg_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  "default" BOOLEAN DEFAULT false,
  UNIQUE(firm_id, nr)
);

CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  city VARCHAR(100),
  region VARCHAR(100),
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(100),
  tax_office VARCHAR(100),
  tax_number VARCHAR(50),
  firm_nr VARCHAR(10) NOT NULL,
  manager_name VARCHAR(100),
  is_main BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  "default" BOOLEAN DEFAULT false,
  
  -- Logo ERP Mapping (from backup 034)
  logo_warehouse_id INTEGER,
  logo_division_id INTEGER,
  logo_firm_id INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS currencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  symbol VARCHAR(10),
  is_base_currency BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 1.1 RBAC SYSTEM (v5.5 - Absolute Parity)
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB DEFAULT '[]',
    is_system_role BOOLEAN DEFAULT false,
    color VARCHAR(20) DEFAULT '#3B82F6',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) DEFAULT 'cashier',
    role_id UUID REFERENCES public.roles(id),
    store_id UUID REFERENCES public.stores(id),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2.0 GLOBAL INFRASTRUCTURE (Restored Gems)
----------------------------------------------------------------------------

-- 2.1 Exchange Rates (from backup 037)
CREATE TABLE IF NOT EXISTS public.exchange_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency_code VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    buy_rate DECIMAL(18,8) NOT NULL,
    sell_rate DECIMAL(18,8) NOT NULL,
    effective_buy DECIMAL(18,8),
    effective_sell DECIMAL(18,8),
    source VARCHAR(50) DEFAULT 'Logo',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(currency_code, date, source)
);

-- 2.2 Service Health (from backup 035)
CREATE TABLE IF NOT EXISTS public.service_health (
    service_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name TEXT NOT NULL UNIQUE,
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL CHECK (status IN ('ONLINE', 'OFFLINE', 'ERROR', 'MAINTENANCE')),
    version TEXT,
    metadata JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.3 Report Templates (from backup 027)
CREATE TABLE IF NOT EXISTS public.report_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'fatura', 'etiket', 'fis', 'rapor'
    template_type VARCHAR(50) DEFAULT 'json',
    content JSONB NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    firm_nr VARCHAR(10),
    period_nr VARCHAR(10)
);

-- 2.4 Service Transactions (from backup 041)
CREATE TABLE IF NOT EXISTS public.service_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    store_id UUID REFERENCES public.stores(id),
    transaction_type VARCHAR(20) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    target_number VARCHAR(50) NOT NULL,
    package_name VARCHAR(100),
    amount DECIMAL(15,2) NOT NULL,
    cost DECIMAL(15,2) DEFAULT 0,
    profit DECIMAL(15,2) GENERATED ALWAYS AS (amount - cost) STORED,
    currency VARCHAR(10) DEFAULT 'IQD',
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.0 GLOBAL ENTERPRISE LOGIC (logic schema)
----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS logic.bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    bank_name VARCHAR(255),
    iban VARCHAR(50),
    currency_code VARCHAR(10),
    balance DECIMAL(15,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_nr, code)
);

CREATE TABLE IF NOT EXISTS logic.campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    campaign_type VARCHAR(50) NOT NULL,
    discount_value DECIMAL(15,2),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    conditions JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_nr, code)
);

-- 4.0 WMS ADVANCED (wms schema - restored from 011, 055)
----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wms.bins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id),
    code VARCHAR(50) NOT NULL,
    zone VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    UNIQUE(store_id, code)
);

-- Yard & Logistic Management
CREATE TABLE IF NOT EXISTS wms.yard_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50) DEFAULT 'parking',
    status VARCHAR(20) DEFAULT 'available',
    warehouse_id UUID REFERENCES public.stores(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wms.dock_doors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    warehouse_id UUID REFERENCES public.stores(id),
    status VARCHAR(20) DEFAULT 'available',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Task & Labor Queue
CREATE TABLE IF NOT EXISTS wms.task_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_type VARCHAR(30) NOT NULL,
    priority INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'pending',
    assigned_to VARCHAR(255),
    warehouse_id UUID REFERENCES public.stores(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5.0 VERTICAL INFRASTRUCTURE (Global rest/beauty)
----------------------------------------------------------------------------

-- Restaurant Layouts & Printers (from 053)
CREATE TABLE IF NOT EXISTS rest.floors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(50) DEFAULT '#3B82F6',
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rest.kroki_layouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    floor_name VARCHAR(100) NOT NULL DEFAULT 'Tümü',
    layout_data JSONB NOT NULL DEFAULT '{}',
    UNIQUE(store_id, floor_name)
);

CREATE TABLE IF NOT EXISTS rest.printer_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) DEFAULT 'thermal',
    address VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6.0 SYSTEM INFRASTRUCTURE
----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    firm_nr VARCHAR(10) NOT NULL,
    UNIQUE(key, firm_nr)
);

CREATE TABLE IF NOT EXISTS sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,
    firm_nr VARCHAR(10) NOT NULL,
    data JSONB,
    status VARCHAR(20) DEFAULT 'pending',
    target_store_id UUID REFERENCES public.stores(id),
    source_system VARCHAR(50) DEFAULT 'RetailEX',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  firm_nr VARCHAR(10) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL, 
  old_data JSONB,
  new_data JSONB,
  client_info JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7.0 MASTER DATA (Global)
----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS product_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES categories(id),
  is_restaurant BOOLEAN DEFAULT false,
  icon VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true
);

-- 8.0 MENU SYSTEM (Professional UI Configuration)
----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.menu_items (
    id SERIAL PRIMARY KEY,
    menu_type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    label VARCHAR(255) NOT NULL,
    label_tr VARCHAR(255),
    label_en VARCHAR(255),
    label_ar VARCHAR(255),
    parent_id INTEGER,
    section_id INTEGER,
    screen_id VARCHAR(100),
    icon_name VARCHAR(100),
    badge VARCHAR(50),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_visible BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INITIAL SEED DATA & SYSTEM BOOTSTRAP
-- ============================================================================

-- Base Firm & Period
INSERT INTO firms (id, firm_nr, name, "default") 
VALUES ('00000000-0000-4000-a000-000000000001', '001', 'RetailEx OS', true) ON CONFLICT DO NOTHING;

INSERT INTO periods (firm_id, nr, beg_date, end_date, "default")
VALUES ('00000000-0000-4000-a000-000000000001', 1, '2026-01-01', '2026-12-31', true) ON CONFLICT DO NOTHING;

INSERT INTO stores (code, name, firm_nr, is_main, "default")
VALUES ('ST_01', 'Merkez Depo', '001', true, true) ON CONFLICT DO NOTHING;

-- Admin
INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
VALUES ('10000000-0000-4000-a000-000000000001', 'admin@retailex.com', crypt('admin', gen_salt('bf')), '{"username": "admin", "full_name": "System Administrator", "role": "admin"}')
ON CONFLICT DO NOTHING;

-- MENU SEED (Consolidated Professional Set)
INSERT INTO public.menu_items (id, menu_type, label, label_tr, icon_name, display_order)
VALUES (10, 'sidebar', 'Malzeme Yönetimi', 'Malzeme Yönetimi', 'Settings', 10) ON CONFLICT DO NOTHING;

INSERT INTO public.menu_items (id, menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
(11, 'sidebar', 'Ana Kayıtlar', 'Ana Kayıtlar', 'material-definitions', 'Settings', 10, 10),
(12, 'sidebar', 'Malzemeler', 'Malzemeler', 'products', 'Package', 11, 20),
(13, 'sidebar', 'Birim Setleri', 'Birim Setleri', 'unit-sets', 'Scale', 11, 30),
(14, 'sidebar', 'Varyantlar', 'Varyantlar', 'variants', 'Tag', 11, 40);

INSERT INTO public.menu_items (id, menu_type, label, label_tr, icon_name, display_order)
VALUES (20, 'sidebar', 'Faturalar', 'Faturalar', 'FileText', 30) ON CONFLICT DO NOTHING;

INSERT INTO public.menu_items (id, menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
(21, 'sidebar', 'Satış Faturaları', 'Satış Faturaları', 'salesinvoice', 'FileText', 20, 10),
(22, 'sidebar', 'Perakende Satış', 'Perakende Satış', 'sales-invoice-retail', 'FileText', 21, 20),
(23, 'sidebar', 'Toptan Satış', 'Toptan Satış', 'sales-invoice-wholesale', 'FileText', 21, 30);

INSERT INTO public.menu_items (id, menu_type, label, label_tr, icon_name, display_order)
VALUES (30, 'sidebar', 'Finans Yönetimi', 'Finans Yönetimi', 'Wallet', 40) ON CONFLICT DO NOTHING;

INSERT INTO public.menu_items (id, menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
(31, 'sidebar', 'Kasa Hesapları', 'Kasa Hesapları', 'cashbank', 'Wallet', 30, 20),
(32, 'sidebar', 'Banka Hesapları', 'Banka Hesapları', 'bank-accounts', 'CreditCard', 30, 40);

-- Service Health Init
INSERT INTO public.service_health (service_name, status, version, metadata)
VALUES ('RetailEX-Sync-Service', 'OFFLINE', '2.0.0', '{"description": "Core synchronization engine"}'),
       ('RetailEX-Logo-Connector', 'OFFLINE', '1.0.0', '{"description": "Logo ERP data bridge"}')
ON CONFLICT DO NOTHING;
