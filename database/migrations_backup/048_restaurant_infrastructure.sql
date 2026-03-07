-- ============================================================================
-- RetailEx - RESTAURANT INFRASTRUCTURE MIGRATION (v3.1)
-- ----------------------------------------------------------------------------
-- Tables for Floor Management, Table Layouts, and Recipe Control
-- ============================================================================

-- NOTE: Tables that are FIRM or PERIOD specific will be created via 
-- CREATE_FIRM_TABLES and CREATE_PERIOD_TABLES functions.

-- 1. Floors / Areas (Master Data - Usually tied to a Store)
CREATE TABLE IF NOT EXISTS public.rest_floors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- e.g., 'Bahçe', 'Salon', 'Teras'
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Restaurant Tables Template (This will be cloned into rex_FFF_rest_tables)
-- We define a template structure here for clarity.

/*
CREATE TABLE IF NOT EXISTS templates.rest_tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    floor_id UUID REFERENCES public.rest_floors(id),
    number VARCHAR(50) NOT NULL,
    seats INTEGER DEFAULT 4,
    status VARCHAR(20) DEFAULT 'empty', -- empty, occupied, billing, reserved
    waiter VARCHAR(255),
    start_time TIMESTAMPTZ,
    last_order_time TIMESTAMPTZ,
    total DECIMAL(15,2) DEFAULT 0,
    is_large BOOLEAN DEFAULT false,
    pos_x INTEGER DEFAULT 0,
    pos_y INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
*/

-- 3. Recipes (Ürün Reçeteleri - Firm Specific Template)
/*
CREATE TABLE IF NOT EXISTS templates.rest_recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID, -- Reference to products table in same firm
    total_cost DECIMAL(15,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS templates.rest_recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID REFERENCES rest_recipes(id) ON DELETE CASCADE,
    material_id UUID, -- Reference to products table (raw materials)
    quantity DECIMAL(15,3) NOT NULL,
    unit VARCHAR(20),
    cost DECIMAL(15,2) DEFAULT 0
);
*/

-- 4. Restaurant Orders (Waitlist/Active/History - Period Specific Template)
/*
CREATE TABLE IF NOT EXISTS templates.rest_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_id UUID,
    waiter_id UUID,
    customer_id UUID,
    status VARCHAR(20) DEFAULT 'open', -- open, closed, cancelled
    total_amount DECIMAL(15,2) DEFAULT 0,
    start_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
*/
