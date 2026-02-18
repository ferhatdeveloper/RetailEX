-- ============================================================================
-- RetailEx - CONSOLIDATED CORE SCHEMA (v3.1)
-- ----------------------------------------------------------------------------
-- Professional AI-Native ERP & Platform Infrastructure
-- Compatible with PostgreSQL (Local & Remote)
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Schemas
CREATE SCHEMA IF NOT EXISTS wms;
CREATE SCHEMA IF NOT EXISTS logic; -- For Stored Procedures if needed separately, or just keep in public

-- ============================================================================
-- SECTION 1: ORGANIZATION & SYSTEM
-- ============================================================================

-- 1.0 Firms (Tenant mapping - Logo Standard)
CREATE TABLE IF NOT EXISTS firms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  tax_nr VARCHAR(50),
  tax_office VARCHAR(100),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(50),
  "default" BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 1.0.1 Periods (Logo Standard)
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

-- 1.1 Stores / Warehouses
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
  firm_nr VARCHAR(10) NOT NULL, -- Associated firm (Logo Standard)
  manager_name VARCHAR(100), -- Store Manager
  is_main BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  "default" BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stores_firm_nr ON stores(firm_nr);

-- 1.2 Currencies
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

-- 1.3 Users (REMOVED - migrated to auth.users)
-- See 003_auth_setup.sql for auth.users definition

-- 1.3 Terminals & Device Identification
CREATE TABLE IF NOT EXISTS terminals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id TEXT UNIQUE NOT NULL, -- Hardware ID / Unique ID
    name VARCHAR(255) NOT NULL,
    store_id UUID REFERENCES stores(id),
    firm_nr VARCHAR(10) NOT NULL, -- Isolated by firm
    is_active BOOLEAN DEFAULT true,
    last_sync TIMESTAMPTZ,
    registered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_terminals_firm_nr ON terminals(firm_nr);

-- 1.4 System Settings & Infrastructure
CREATE TABLE IF NOT EXISTS app_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) NOT NULL, -- Key is not unique across firms
    value JSONB NOT NULL,
    firm_nr VARCHAR(10) NOT NULL, -- Isolated by firm
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(key, firm_nr)
);
CREATE INDEX IF NOT EXISTS idx_settings_firm_nr ON app_settings(firm_nr);

-- 1.5 Hybrid Sync Queue
CREATE TABLE IF NOT EXISTS sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
    firm_nr VARCHAR(10) NOT NULL, -- Isolated by firm (Added for Hybrid Sync)
    data JSONB,
    status VARCHAR(20) DEFAULT 'pending', -- pending, syncing, completed, error
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_firm_nr ON sync_queue(firm_nr);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);

-- ============================================================================
-- SECTION 2: COMMON MASTER DATA (Global across firms)
-- ============================================================================

CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2.4 Tax Rates
CREATE TABLE IF NOT EXISTS tax_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rate DECIMAL(5,2) NOT NULL,
  description VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2.5 Units of Measure
CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2.6 Categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  parent_id UUID REFERENCES categories(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Note: products, product_variants, customers, sales, sale_items, stock_movements
-- are now created dynamically per firm/period using:
-- SELECT CREATE_FIRM_TABLES('001');
-- SELECT CREATE_PERIOD_TABLES('001', '01');

-- ============================================================================
-- SECTION 4: AUDIT & SYNC
-- ============================================================================

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID, -- References auth.users(id) but loosely coupled here to avoid cross-schema dependency issues in basic dump
  firm_nr VARCHAR(10) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL, 
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_firm_nr ON audit_logs(firm_nr);

