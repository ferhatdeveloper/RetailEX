-- Migration 008: Voice Assistant, WhatsApp Business, Multi-Store Features
-- Created: 2025-01-01

-- ============================================================================
-- VOICE ASSISTANT TABLES
-- ============================================================================

CREATE TABLE voice_commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    transcript TEXT NOT NULL,
    intent TEXT NOT NULL,
    entities JSONB,
    action_taken TEXT,
    success BOOLEAN DEFAULT true,
    response_text TEXT,
    language TEXT DEFAULT 'tr-TR',
    confidence DECIMAL(3,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_voice_commands_user ON voice_commands(user_id);
CREATE INDEX idx_voice_commands_date ON voice_commands(created_at);
CREATE INDEX idx_voice_commands_intent ON voice_commands(intent);

-- ============================================================================
-- WHATSAPP BUSINESS TABLES
-- ============================================================================

CREATE TABLE whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id TEXT UNIQUE,
    direction TEXT CHECK (direction IN ('outgoing', 'incoming')),
    from_number TEXT,
    to_number TEXT,
    message_type TEXT CHECK (message_type IN ('text', 'document', 'template', 'interactive')),
    content TEXT,
    document_url TEXT,
    template_name TEXT,
    status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
    customer_id UUID REFERENCES customers(id),
    order_id UUID REFERENCES orders(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ
);

CREATE INDEX idx_whatsapp_customer ON whatsapp_messages(customer_id);
CREATE INDEX idx_whatsapp_date ON whatsapp_messages(created_at);
CREATE INDEX idx_whatsapp_status ON whatsapp_messages(status);

CREATE TABLE whatsapp_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    category TEXT CHECK (category IN ('order', 'invoice', 'campaign', 'reminder', 'support')),
    language TEXT DEFAULT 'tr',
    content TEXT NOT NULL,
    variables JSONB,
    approved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE whatsapp_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    template_id UUID REFERENCES whatsapp_templates(id),
    target_segment TEXT,
    customer_ids UUID[],
    scheduled_at TIMESTAMPTZ,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'cancelled')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE whatsapp_chatbot_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id),
    phone_number TEXT NOT NULL,
    context JSONB,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- MULTI-STORE TABLES
-- ============================================================================

CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    location TEXT,
    address TEXT,
    city TEXT,
    region TEXT,
    phone TEXT,
    email TEXT,
    manager_id UUID REFERENCES users(id),
    opening_hours JSONB,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stores_region ON stores(region);
CREATE INDEX idx_stores_status ON stores(status);

CREATE TABLE store_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id),
    product_id UUID REFERENCES products(id),
    quantity INTEGER DEFAULT 0,
    reserved_quantity INTEGER DEFAULT 0,
    available_quantity INTEGER GENERATED ALWAYS AS (quantity - reserved_quantity) STORED,
    reorder_point INTEGER DEFAULT 0,
    last_stock_take TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(store_id, product_id)
);

CREATE INDEX idx_store_inventory_store ON store_inventory(store_id);
CREATE INDEX idx_store_inventory_product ON store_inventory(product_id);

CREATE TABLE store_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_number TEXT UNIQUE NOT NULL,
    from_store_id UUID REFERENCES stores(id),
    to_store_id UUID REFERENCES stores(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'in_transit', 'received', 'cancelled')),
    requested_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    items JSONB NOT NULL,
    notes TEXT,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    
    CHECK (from_store_id != to_store_id)
);

CREATE INDEX idx_store_transfers_from ON store_transfers(from_store_id);
CREATE INDEX idx_store_transfers_to ON store_transfers(to_store_id);
CREATE INDEX idx_store_transfers_status ON store_transfers(status);

CREATE TABLE store_daily_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id),
    date DATE NOT NULL,
    total_sales DECIMAL(12,2) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    avg_basket_value DECIMAL(10,2) DEFAULT 0,
    vip_sales DECIMAL(12,2) DEFAULT 0,
    cash_sales DECIMAL(12,2) DEFAULT 0,
    card_sales DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(store_id, date)
);

CREATE INDEX idx_store_daily_sales_store ON store_daily_sales(store_id);
CREATE INDEX idx_store_daily_sales_date ON store_daily_sales(date);

-- ============================================================================
-- LOYALTY PROGRAM TABLES
-- ============================================================================

CREATE TABLE loyalty_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    min_spending DECIMAL(12,2) NOT NULL,
    max_spending DECIMAL(12,2) NOT NULL,
    points_multiplier DECIMAL(3,2) DEFAULT 1.0,
    discount_percentage INTEGER DEFAULT 0,
    benefits JSONB,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO loyalty_tiers (code, name, min_spending, max_spending, points_multiplier, discount_percentage, benefits, color) VALUES
('BRONZE', 'Bronze', 0, 5000, 1.0, 0, '{"birthday_bonus": 100, "free_shipping": false}', '#CD7F32'),
('SILVER', 'Silver', 5000, 20000, 1.2, 5, '{"birthday_bonus": 200, "free_shipping": true}', '#C0C0C0'),
('GOLD', 'Gold', 20000, 50000, 1.5, 10, '{"birthday_bonus": 500, "free_shipping": true, "priority_support": true}', '#FFD700'),
('VIP', 'VIP', 50000, 999999999, 2.0, 15, '{"birthday_bonus": 1000, "free_shipping": true, "priority_support": true, "personal_shopper": true}', '#9B59B6');

CREATE TABLE customer_loyalty (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) UNIQUE,
    current_tier UUID REFERENCES loyalty_tiers(id),
    total_points INTEGER DEFAULT 0,
    available_points INTEGER DEFAULT 0,
    lifetime_spending DECIMAL(12,2) DEFAULT 0,
    last_purchase_date TIMESTAMPTZ,
    member_since TIMESTAMPTZ DEFAULT NOW(),
    card_number TEXT UNIQUE,
    qr_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customer_loyalty_customer ON customer_loyalty(customer_id);
CREATE INDEX idx_customer_loyalty_tier ON customer_loyalty(current_tier);

CREATE TABLE loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id),
    transaction_type TEXT CHECK (transaction_type IN ('earn', 'redeem', 'expire', 'bonus', 'adjustment')),
    points INTEGER NOT NULL,
    description TEXT,
    order_id UUID REFERENCES orders(id),
    reference_number TEXT,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_loyalty_transactions_customer ON loyalty_transactions(customer_id);
CREATE INDEX idx_loyalty_transactions_date ON loyalty_transactions(created_at);
CREATE INDEX idx_loyalty_transactions_type ON loyalty_transactions(transaction_type);

-- ============================================================================
-- MOBILE POS TABLES
-- ============================================================================

CREATE TABLE mobile_pos_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id TEXT UNIQUE NOT NULL,
    device_name TEXT,
    device_type TEXT CHECK (device_type IN ('tablet', 'phone')),
    os_type TEXT CHECK (os_type IN ('ios', 'android')),
    store_id UUID REFERENCES stores(id),
    assigned_to UUID REFERENCES users(id),
    last_sync TIMESTAMPTZ,
    battery_level INTEGER,
    is_online BOOLEAN DEFAULT false,
    peripherals JSONB, -- bluetooth printer, scanner, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mpos_store ON mobile_pos_devices(store_id);
CREATE INDEX idx_mpos_user ON mobile_pos_devices(assigned_to);

CREATE TABLE mpos_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES mobile_pos_devices(id),
    store_id UUID REFERENCES stores(id),
    cashier_id UUID REFERENCES users(id),
    customer_id UUID REFERENCES customers(id),
    sale_number TEXT UNIQUE NOT NULL,
    items JSONB NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) DEFAULT 0,
    tax DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    payment_method TEXT,
    location_lat DECIMAL(10,8),
    location_lng DECIMAL(11,8),
    synced_to_server BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mpos_sales_device ON mpos_sales(device_id);
CREATE INDEX idx_mpos_sales_store ON mpos_sales(store_id);
CREATE INDEX idx_mpos_sales_date ON mpos_sales(created_at);

-- ============================================================================
-- SMART INVENTORY AI TABLES
-- ============================================================================

CREATE TABLE inventory_forecasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id),
    store_id UUID REFERENCES stores(id),
    forecast_date DATE NOT NULL,
    predicted_demand INTEGER,
    confidence_level DECIMAL(3,2),
    actual_sales INTEGER,
    accuracy DECIMAL(5,2),
    model_version TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(product_id, store_id, forecast_date)
);

CREATE INDEX idx_inventory_forecasts_product ON inventory_forecasts(product_id);
CREATE INDEX idx_inventory_forecasts_date ON inventory_forecasts(forecast_date);

CREATE TABLE inventory_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type TEXT CHECK (alert_type IN ('low_stock', 'overstock', 'slow_moving', 'expiring', 'out_of_stock', 'reorder')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    product_id UUID REFERENCES products(id),
    store_id UUID REFERENCES stores(id),
    current_stock INTEGER,
    threshold_value INTEGER,
    recommended_action TEXT,
    recommended_quantity INTEGER,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'ignored')),
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_alerts_status ON inventory_alerts(status);
CREATE INDEX idx_inventory_alerts_priority ON inventory_alerts(priority);
CREATE INDEX idx_inventory_alerts_product ON inventory_alerts(product_id);

CREATE TABLE slow_moving_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id),
    store_id UUID REFERENCES stores(id),
    last_sale_date TIMESTAMPTZ,
    days_without_sale INTEGER,
    current_stock INTEGER,
    stock_value DECIMAL(12,2),
    recommended_action TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(product_id, store_id)
);

CREATE INDEX idx_slow_moving_product ON slow_moving_items(product_id);
CREATE INDEX idx_slow_moving_days ON slow_moving_items(days_without_sale);

CREATE TABLE product_expiry_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id),
    store_id UUID REFERENCES stores(id),
    batch_number TEXT,
    expiry_date DATE NOT NULL,
    quantity INTEGER NOT NULL,
    alert_sent BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring_soon', 'expired', 'sold', 'discarded')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expiry_date ON product_expiry_tracking(expiry_date);
CREATE INDEX idx_expiry_status ON product_expiry_tracking(status);

CREATE TABLE seasonal_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season TEXT CHECK (season IN ('spring', 'summer', 'fall', 'winter')),
    month INTEGER CHECK (month >= 1 AND month <= 12),
    category TEXT,
    product_ids UUID[],
    recommended_increase_percentage INTEGER,
    reason TEXT,
    historical_data JSONB,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_seasonal_month ON seasonal_recommendations(month);
CREATE INDEX idx_seasonal_category ON seasonal_recommendations(category);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Auto-update loyalty points on purchase
CREATE OR REPLACE FUNCTION add_loyalty_points_on_purchase() RETURNS TRIGGER AS $$
DECLARE
    v_points INTEGER;
    v_multiplier DECIMAL;
BEGIN
    IF NEW.customer_id IS NOT NULL THEN
        -- Get customer's tier multiplier
        SELECT lt.points_multiplier INTO v_multiplier
        FROM customer_loyalty cl
        JOIN loyalty_tiers lt ON cl.current_tier = lt.id
        WHERE cl.customer_id = NEW.customer_id;

        -- If customer doesn't have loyalty account, create one
        IF v_multiplier IS NULL THEN
            INSERT INTO customer_loyalty (customer_id, current_tier)
            VALUES (NEW.customer_id, (SELECT id FROM loyalty_tiers WHERE code = 'BRONZE' LIMIT 1));
            v_multiplier := 1.0;
        END IF;

        -- Calculate points (10 points per 100 TL)
        v_points := FLOOR((NEW.total / 100) * 10 * v_multiplier);

        -- Add points
        UPDATE customer_loyalty
        SET total_points = total_points + v_points,
            available_points = available_points + v_points,
            lifetime_spending = lifetime_spending + NEW.total,
            last_purchase_date = NOW(),
            updated_at = NOW()
        WHERE customer_id = NEW.customer_id;

        -- Log transaction
        INSERT INTO loyalty_transactions (customer_id, transaction_type, points, description, order_id)
        VALUES (NEW.customer_id, 'earn', v_points, 'Purchase reward', NEW.id);

        -- Check tier upgrade
        PERFORM check_tier_upgrade(NEW.customer_id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_add_loyalty_points
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION add_loyalty_points_on_purchase();

-- Check and upgrade customer tier
CREATE OR REPLACE FUNCTION check_tier_upgrade(p_customer_id UUID) RETURNS void AS $$
DECLARE
    v_lifetime_spending DECIMAL;
    v_new_tier UUID;
    v_current_tier UUID;
BEGIN
    -- Get lifetime spending and current tier
    SELECT lifetime_spending, current_tier INTO v_lifetime_spending, v_current_tier
    FROM customer_loyalty
    WHERE customer_id = p_customer_id;

    -- Find appropriate tier
    SELECT id INTO v_new_tier
    FROM loyalty_tiers
    WHERE v_lifetime_spending >= min_spending 
      AND v_lifetime_spending < max_spending
    ORDER BY min_spending DESC
    LIMIT 1;

    -- Update tier if changed
    IF v_new_tier != v_current_tier THEN
        UPDATE customer_loyalty
        SET current_tier = v_new_tier,
            updated_at = NOW()
        WHERE customer_id = p_customer_id;

        -- Send notification (could trigger WhatsApp message)
        -- ... notification logic here
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Update store daily sales
CREATE OR REPLACE FUNCTION update_store_daily_sales() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO store_daily_sales (store_id, date, total_sales, total_orders)
    VALUES (NEW.store_id, CURRENT_DATE, NEW.total, 1)
    ON CONFLICT (store_id, date)
    DO UPDATE SET
        total_sales = store_daily_sales.total_sales + NEW.total,
        total_orders = store_daily_sales.total_orders + 1,
        avg_basket_value = (store_daily_sales.total_sales + NEW.total) / (store_daily_sales.total_orders + 1);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_store_daily_sales
AFTER INSERT ON orders
FOR EACH ROW
WHEN (NEW.store_id IS NOT NULL)
EXECUTE FUNCTION update_store_daily_sales();

-- Detect slow-moving items (run daily)
CREATE OR REPLACE FUNCTION detect_slow_moving_items() RETURNS void AS $$
BEGIN
    INSERT INTO slow_moving_items (product_id, store_id, last_sale_date, days_without_sale, current_stock, stock_value)
    SELECT 
        p.id,
        si.store_id,
        MAX(o.created_at) as last_sale_date,
        EXTRACT(DAY FROM NOW() - MAX(o.created_at))::INTEGER as days_without_sale,
        si.quantity,
        si.quantity * p.cost_price as stock_value
    FROM products p
    JOIN store_inventory si ON p.id = si.product_id
    LEFT JOIN order_items oi ON p.id = oi.product_id
    LEFT JOIN orders o ON oi.order_id = o.id
    GROUP BY p.id, si.store_id, si.quantity, p.cost_price
    HAVING EXTRACT(DAY FROM NOW() - MAX(o.created_at)) > 90
    ON CONFLICT (product_id, store_id) 
    DO UPDATE SET
        days_without_sale = EXCLUDED.days_without_sale,
        current_stock = EXCLUDED.current_stock,
        stock_value = EXCLUDED.stock_value;
END;
$$ LANGUAGE plpgsql;

-- Check expiring products (run daily)
CREATE OR REPLACE FUNCTION check_expiring_products() RETURNS void AS $$
BEGIN
    -- Mark products expiring within 30 days
    UPDATE product_expiry_tracking
    SET status = 'expiring_soon'
    WHERE expiry_date <= CURRENT_DATE + INTERVAL '30 days'
      AND expiry_date > CURRENT_DATE
      AND status = 'active';

    -- Mark expired products
    UPDATE product_expiry_tracking
    SET status = 'expired'
    WHERE expiry_date <= CURRENT_DATE
      AND status IN ('active', 'expiring_soon');

    -- Create alerts for expiring products
    INSERT INTO inventory_alerts (alert_type, priority, product_id, store_id, recommended_action)
    SELECT 
        'expiring' as alert_type,
        CASE 
            WHEN expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'critical'
            WHEN expiry_date <= CURRENT_DATE + INTERVAL '15 days' THEN 'high'
            ELSE 'medium'
        END as priority,
        product_id,
        store_id,
        'Apply discount or remove from shelf' as recommended_action
    FROM product_expiry_tracking
    WHERE status = 'expiring_soon'
      AND alert_sent = false;

    -- Mark alerts as sent
    UPDATE product_expiry_tracking
    SET alert_sent = true
    WHERE status = 'expiring_soon';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SCHEDULED JOBS (using pg_cron extension)
-- ============================================================================

-- Run slow-moving detection daily at 2 AM
SELECT cron.schedule(
    'detect-slow-movers',
    '0 2 * * *',
    $$ SELECT detect_slow_moving_items(); $$
);

-- Check expiring products daily at 3 AM
SELECT cron.schedule(
    'check-expiring-products',
    '0 3 * * *',
    $$ SELECT check_expiring_products(); $$
);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Multi-store performance view
CREATE OR REPLACE VIEW v_store_performance AS
SELECT 
    s.id,
    s.code,
    s.name,
    s.region,
    s.manager_id,
    sds.date,
    sds.total_sales,
    sds.total_orders,
    sds.avg_basket_value,
    RANK() OVER (PARTITION BY sds.date ORDER BY sds.total_sales DESC) as daily_rank
FROM stores s
LEFT JOIN store_daily_sales sds ON s.id = sds.store_id
WHERE s.status = 'active';

-- Loyalty tier summary
CREATE OR REPLACE VIEW v_loyalty_summary AS
SELECT 
    lt.name as tier_name,
    COUNT(cl.id) as customer_count,
    SUM(cl.lifetime_spending) as total_spending,
    AVG(cl.lifetime_spending) as avg_spending_per_customer,
    SUM(cl.available_points) as total_points
FROM loyalty_tiers lt
LEFT JOIN customer_loyalty cl ON lt.id = cl.current_tier
GROUP BY lt.id, lt.name
ORDER BY lt.min_spending;

-- Inventory alerts dashboard
CREATE OR REPLACE VIEW v_inventory_alerts_summary AS
SELECT 
    ia.alert_type,
    ia.priority,
    COUNT(*) as alert_count,
    SUM(CASE WHEN ia.status = 'active' THEN 1 ELSE 0 END) as active_count,
    SUM(si.quantity * p.cost_price) as affected_stock_value
FROM inventory_alerts ia
JOIN products p ON ia.product_id = p.id
LEFT JOIN store_inventory si ON ia.product_id = si.product_id AND ia.store_id = si.store_id
WHERE ia.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY ia.alert_type, ia.priority
ORDER BY ia.priority DESC, ia.alert_type;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

