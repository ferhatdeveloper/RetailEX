-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. Core WMS Tables
-- ==========================================

-- Pallet Types and Definitions
DO $$ BEGIN
    CREATE TYPE pallet_type AS ENUM ('euro', 'epal_turpal', 'chep', 'plastic', 'unqualified', 'duseldorf', 'big_boy');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE pallet_status AS ENUM ('empty', 'partial', 'full');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS wms_pallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    type pallet_type NOT NULL,
    dimensions VARCHAR(50), 
    status pallet_status DEFAULT 'empty',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure columns exist
DO $$ BEGIN
    ALTER TABLE wms_pallets ADD COLUMN IF NOT EXISTS type pallet_type;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- Warehouse Locations
DO $$ BEGIN
    CREATE TYPE location_type AS ENUM ('picking', 'bulk', 'return', 'virtual', 'staging');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS wms_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    warehouse_id UUID NOT NULL, 
    zone VARCHAR(50) NOT NULL, 
    aisle VARCHAR(20) NOT NULL,
    rack VARCHAR(20) NOT NULL,
    shelf VARCHAR(20) NOT NULL,
    location_code VARCHAR(100) GENERATED ALWAYS AS (zone || '-' || aisle || '-' || rack || '-' || shelf) STORED,
    type location_type DEFAULT 'picking',
    capacity_m3 NUMERIC(10, 2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure columns exist
DO $$ BEGIN
    ALTER TABLE wms_locations ADD COLUMN IF NOT EXISTS type location_type DEFAULT 'picking';
EXCEPTION WHEN duplicate_column THEN null; END $$;


-- Inventory
DO $$ BEGIN
    CREATE TYPE inventory_status AS ENUM ('available', 'reserved', 'quarantine', 'damaged', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS wms_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL, 
    location_id UUID REFERENCES wms_locations(id),
    quantity NUMERIC(15, 3) NOT NULL DEFAULT 0,
    batch_no VARCHAR(50),
    expiration_date DATE,
    pallet_id UUID REFERENCES wms_pallets(id),
    status inventory_status DEFAULT 'available',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure columns exist (Fixes "column does not exist" errors)
DO $$ BEGIN
    ALTER TABLE wms_inventory ADD COLUMN IF NOT EXISTS product_id UUID;
EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE wms_inventory ADD COLUMN IF NOT EXISTS quantity NUMERIC(15, 3) NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE wms_inventory ADD COLUMN IF NOT EXISTS expiration_date DATE;
EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE wms_inventory ADD COLUMN IF NOT EXISTS batch_no VARCHAR(50);
EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN
    ALTER TABLE wms_inventory ADD COLUMN IF NOT EXISTS pallet_id UUID REFERENCES wms_pallets(id);
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- Indexes for Inventory (Safe to run after columns are ensured)
CREATE INDEX IF NOT EXISTS idx_wms_inventory_product ON wms_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_wms_inventory_location ON wms_inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_wms_inventory_expiry ON wms_inventory(expiration_date);
CREATE INDEX IF NOT EXISTS idx_wms_inventory_batch ON wms_inventory(batch_no);

-- Locations Indexes
CREATE INDEX IF NOT EXISTS idx_wms_locations_warehouse ON wms_locations(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wms_locations_code ON wms_locations(location_code);


-- ==========================================
-- 2. Operations Tables (Receiving & Logistics)
-- ==========================================

-- Receipts
DO $$ BEGIN
    CREATE TYPE receipt_status AS ENUM ('pending', 'conditional_acceptance', 'completed', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE acceptance_type AS ENUM ('full', 'conditional');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS wms_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_no VARCHAR(50) UNIQUE NOT NULL,
    supplier_id UUID,
    purchase_order_id UUID,
    status receipt_status DEFAULT 'pending',
    acceptance_type acceptance_type DEFAULT 'full',
    notes TEXT,
    metadata JSONB,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wms_receipt_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id UUID REFERENCES wms_receipts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    quantity_ordered NUMERIC(15, 3) NOT NULL,
    quantity_received NUMERIC(15, 3) NOT NULL DEFAULT 0,
    quantity_rejected NUMERIC(15, 3) DEFAULT 0,
    batch_no VARCHAR(50),
    expiration_date DATE,
    pallet_type pallet_type,
    quality_check_passed BOOLEAN DEFAULT TRUE,
    rejection_reason VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$ BEGIN
    ALTER TABLE wms_receipt_items ADD COLUMN IF NOT EXISTS product_id UUID;
EXCEPTION WHEN duplicate_column THEN null; END $$;


-- Vehicle Loads
DO $$ BEGIN
    CREATE TYPE load_status AS ENUM ('loading', 'full', 'dispatched', 'delivered');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS wms_vehicle_loads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_plate VARCHAR(20) NOT NULL,
    driver_name VARCHAR(100),
    driver_phone VARCHAR(20),
    route_name VARCHAR(100), 
    capacity_m3 NUMERIC(10, 2),
    current_load_m3 NUMERIC(10, 2) DEFAULT 0,
    status load_status DEFAULT 'loading',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Picking Tasks
DO $$ BEGIN
    CREATE TYPE pick_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS wms_picking_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL, 
    assigned_to UUID, 
    zone VARCHAR(50), 
    status pick_status DEFAULT 'pending',
    priority INT DEFAULT 1, 
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wms_picking_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES wms_picking_tasks(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    location_id UUID REFERENCES wms_locations(id),
    quantity_to_pick NUMERIC(15, 3) NOT NULL,
    quantity_picked NUMERIC(15, 3) DEFAULT 0,
    is_substituted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$ BEGIN
    ALTER TABLE wms_picking_items ADD COLUMN IF NOT EXISTS product_id UUID;
EXCEPTION WHEN duplicate_column THEN null; END $$;


-- ==========================================
-- 2.1 Logistics Master Data & Dispatch
-- ==========================================

DO $$ BEGIN
    CREATE TYPE vehicle_status AS ENUM ('available', 'maintenance', 'on_route', 'busy');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE driver_status AS ENUM ('available', 'on_duty', 'off_duty', 'leave');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS wms_vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    plate_number VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    type VARCHAR(20), 
    capacity_m3 NUMERIC(10, 2) NOT NULL DEFAULT 0,
    capacity_kg NUMERIC(10, 2) NOT NULL DEFAULT 0,
    capacity_pallet INT NOT NULL DEFAULT 0,
    status vehicle_status DEFAULT 'available',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$ BEGIN
    ALTER TABLE wms_vehicles ADD COLUMN IF NOT EXISTS type VARCHAR(20);
EXCEPTION WHEN duplicate_column THEN null; END $$;

CREATE TABLE IF NOT EXISTS wms_drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    license_class VARCHAR(10),
    status driver_status DEFAULT 'available',
    current_vehicle_id UUID REFERENCES wms_vehicles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ==========================================
-- 3. Accounting Integration (Structured Invoices)
-- ==========================================

DO $$ BEGIN
    CREATE TYPE invoice_type AS ENUM ('purchase', 'sales', 'return', 'service', 'proforma');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_no VARCHAR(50) UNIQUE NOT NULL,
    type invoice_type NOT NULL,
    
    customer_id UUID,
    supplier_id UUID,
    related_wms_receipt_id UUID REFERENCES wms_receipts(id),
    related_order_id UUID, 
    
    subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(15, 2) DEFAULT 0,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'TRY',
    exchange_rate NUMERIC(10, 4) DEFAULT 1.0,
    
    payment_status VARCHAR(20) DEFAULT 'unpaid',
    due_date DATE,
    issue_date DATE DEFAULT CURRENT_DATE,
    
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$ BEGIN
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS type invoice_type;
EXCEPTION WHEN duplicate_column THEN null; END $$;

CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    product_id UUID,
    product_name VARCHAR(255),
    quantity NUMERIC(15, 3) NOT NULL,
    unit_price NUMERIC(15, 2) NOT NULL,
    tax_rate NUMERIC(5, 2) DEFAULT 0,
    tax_amount NUMERIC(15, 2) DEFAULT 0,
    discount_amount NUMERIC(15, 2) DEFAULT 0,
    total_amount NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$ BEGIN
    ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS product_id UUID;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- Invoice Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_no ON invoices(invoice_no);
CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(type);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_id);

-- ==========================================
-- 4. Security & Row Level Security (RLS)
-- ==========================================

-- Implement RLS for all critical tables
-- For dev/demo speed, we allow broad access, but this ensures infrastructure is Ready.

DO $$ BEGIN
    ALTER TABLE wms_pallets ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public Read/Write Pallets" ON wms_pallets FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE wms_locations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public Read/Write Locations" ON wms_locations FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE wms_inventory ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public Read/Write Inventory" ON wms_inventory FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE wms_receipts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public Read/Write Receipts" ON wms_receipts FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE wms_receipt_items ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public Read/Write ReceiptItems" ON wms_receipt_items FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE wms_vehicle_loads ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public Read/Write VehicleLoads" ON wms_vehicle_loads FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE wms_picking_tasks ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public Read/Write PickingTasks" ON wms_picking_tasks FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE wms_picking_items ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public Read/Write PickingItems" ON wms_picking_items FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE wms_vehicles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public Read/Write Vehicles" ON wms_vehicles FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE wms_drivers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public Read/Write Drivers" ON wms_drivers FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public Read/Write Invoices" ON invoices FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public Read/Write InvoiceItems" ON invoice_items FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

