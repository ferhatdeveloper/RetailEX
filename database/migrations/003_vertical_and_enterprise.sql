-- ============================================================================
-- RetailEx - VERTICAL & ENTERPRISE MODULES (v5.1 - ABSOLUTE PARITY)
-- ----------------------------------------------------------------------------
-- Restaurant Kitchens, Beauty Sessions, and Professional Audit Trail
-- ============================================================================

-- 1.0 PROFESSIONAL AUDIT TRAIL (v5)
----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_row_change()
RETURNS TRIGGER AS $$
DECLARE
    v_old_data JSONB := NULL;
    v_new_data JSONB := NULL;
    v_firm_nr VARCHAR(10);
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
    ELSIF (TG_OP = 'DELETE') THEN
        v_old_data := to_jsonb(OLD);
    ELSIF (TG_OP = 'INSERT') THEN
        v_new_data := to_jsonb(NEW);
    END IF;

    -- Extract Firm Context
    BEGIN v_firm_nr := NEW.firm_nr; EXCEPTION WHEN OTHERS THEN 
    BEGIN v_firm_nr := OLD.firm_nr; EXCEPTION WHEN OTHERS THEN v_firm_nr := 'SYSTEM'; END; END;

    INSERT INTO public.audit_logs (
        user_id, firm_nr, table_name, record_id, action, 
        old_data, new_data, client_info
    ) VALUES (
        current_setting('app.current_user_id', true)::UUID,
        COALESCE(v_firm_nr, 'SYSTEM'), TG_TABLE_NAME, 
        COALESCE(NEW.id, OLD.id), TG_OP, v_old_data, v_new_data,
        jsonb_build_object('ip', inet_client_addr(), 'backend_pid', pg_backend_pid())
    );

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

-- 2.0 RESTAURANT INITIALIZERS (High-Fidelity)
----------------------------------------------------------------------------

-- Create staff table for the main schema (for lookup/management if needed)
CREATE TABLE IF NOT EXISTS rest.staff_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    permissions JSONB DEFAULT '{}'
);

INSERT INTO rest.staff_roles (name) VALUES ('Manager'), ('Waiter'), ('Chef'), ('Cashier') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION INIT_RESTAURANT_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
    -- 2.1 Restaurant Tables (Card)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            floor_id UUID REFERENCES rest.floors(id),
            number VARCHAR(50) NOT NULL,
            seats INTEGER DEFAULT 4,
            status VARCHAR(20) DEFAULT ''empty'',
            total DECIMAL(15,2) DEFAULT 0,
            pos_x INTEGER DEFAULT 0,
            pos_y INTEGER DEFAULT 0,
            is_large BOOLEAN DEFAULT false,
            waiter VARCHAR(255),
            staff_id UUID,
            start_time TIMESTAMPTZ,
            locked_by_staff_id UUID,
            locked_by_staff_name VARCHAR(255),
            locked_at TIMESTAMPTZ,
            linked_order_ids text[] DEFAULT ''{}'',
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_tables');

    EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), menu_item_id UUID, total_cost DECIMAL(15,2) DEFAULT 0, wastage_percent DECIMAL(5,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_rest_recipes');
    EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), recipe_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE, material_id UUID, quantity DECIMAL(15,3), unit VARCHAR(20), cost DECIMAL(15,2) DEFAULT 0);', v_prefix || '_rest_recipe_ingredients', v_prefix || '_rest_recipes');

    -- 2.3 Staff (Phase 3)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(100) NOT NULL,
            role VARCHAR(50) DEFAULT ''Waiter'',
            pin VARCHAR(10) NOT NULL UNIQUE,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_staff');

    -- Fix Recipe Table (084)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), 
            menu_item_id UUID, 
            product_id UUID,
            total_cost DECIMAL(15,2) DEFAULT 0, 
            wastage_percent DECIMAL(5,2) DEFAULT 0, 
            is_active BOOLEAN DEFAULT true, 
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_recipes');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION INIT_RESTAURANT_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
BEGIN
    -- 2.3 Rest Orders (Sipariş Başlığı)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_no        VARCHAR(50) UNIQUE,
            table_id        UUID,
            floor_id        UUID REFERENCES rest.floors(id),
            waiter          VARCHAR(255),
            staff_id        UUID, -- (Phase 3) Reference to staff table
            customer_id     UUID,
            status          VARCHAR(20) DEFAULT ''open'',
            total_amount    DECIMAL(15,2) DEFAULT 0,
            discount_amount DECIMAL(15,2) DEFAULT 0,
            tax_amount      DECIMAL(15,2) DEFAULT 0,
            note            TEXT,
            parent_order_id UUID, -- For Split Billing (Phase 1)
            kitchen_note    TEXT, -- For KDS coordination (Phase 2)
            estimated_ready_at TIMESTAMPTZ, -- For Timing Sync (Phase 2.5)
            opened_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            billed_at       TIMESTAMPTZ,
            closed_at       TIMESTAMPTZ,
            payment_method  VARCHAR(50),
            created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_orders');

    -- 2.4 Rest Order Items (Sipariş Kalemleri)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id          UUID REFERENCES rest.%I(id) ON DELETE CASCADE,
            product_id        UUID,
            product_name      VARCHAR(255) NOT NULL,
            quantity          DECIMAL(15,3)   NOT NULL DEFAULT 1,
            unit_price        DECIMAL(15,2)   NOT NULL,
            discount_pct      DECIMAL(5,2)    DEFAULT 0,
            subtotal          DECIMAL(15,2)   NOT NULL,
            status            VARCHAR(20)     DEFAULT ''pending'',
            course            VARCHAR(50),
            note              TEXT,
            options           JSONB, -- Structured modifiers (Phase 1)
            is_void           BOOLEAN         DEFAULT false, -- (Phase 2)
            void_reason       TEXT, -- (Phase 2)
            is_complimentary  BOOLEAN         DEFAULT false,
            preparation_time  INTEGER, -- (Phase 2.5)
            sent_to_kitchen_at TIMESTAMPTZ,
            served_at         TIMESTAMPTZ, -- (Phase 2)
            created_at        TIMESTAMPTZ     DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_order_items', v_prefix || '_rest_orders');

    -- 2.5 Kitchen Queue
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE,
            table_number VARCHAR(50),
            floor_name VARCHAR(100),
            waiter VARCHAR(255),
            staff_id UUID,
            status VARCHAR(20) DEFAULT ''new'', -- new, cooking, ready, served
            note TEXT,
            estimated_ready_at TIMESTAMPTZ,
            sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_kitchen_orders', v_prefix || '_rest_orders');

    -- 2.6 Kitchen Items
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            kitchen_order_id  UUID REFERENCES rest.%I(id) ON DELETE CASCADE,
            order_item_id     UUID REFERENCES rest.%I(id) ON DELETE CASCADE,
            product_name      VARCHAR(255) NOT NULL,
            quantity          DECIMAL(15,3) NOT NULL,
            course            VARCHAR(50),
            note              TEXT,
            status            VARCHAR(20) DEFAULT ''new'',
            preparation_time  INTEGER,
            start_at          TIMESTAMPTZ,
            estimated_ready_at TIMESTAMPTZ,
            served_at         TIMESTAMPTZ  -- (Phase 2)
        );
    ', v_prefix || '_rest_kitchen_items', v_prefix || '_rest_kitchen_orders', v_prefix || '_rest_order_items');
END;
$$ LANGUAGE plpgsql;

-- 3.0 BEAUTY INITIALIZERS (High-Fidelity)
----------------------------------------------------------------------------

-- Shared static table — beauty.body_regions
CREATE TABLE IF NOT EXISTS beauty.body_regions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(100) NOT NULL UNIQUE,
    avg_shots  INTEGER DEFAULT 100,
    min_shots  INTEGER DEFAULT 50,
    max_shots  INTEGER DEFAULT 200,
    sort_order INTEGER DEFAULT 0
);

INSERT INTO beauty.body_regions (name, avg_shots, min_shots, max_shots, sort_order) VALUES
    ('Yüz',              200, 150, 350,  1), ('Koltuk Altı',      150, 100, 250,  2),
    ('Bacak (Tam)',     1200, 800,1800,  3), ('Bacak (Alt Yarı)', 600, 400, 900,  4),
    ('Bacak (Üst Yarı)', 600, 400, 900,  5), ('Bikini (Tam)',     300, 200, 500,  6),
    ('Bikini (Dar)',     150, 100, 250,  7), ('Kol (Tam)',        500, 350, 750,  8),
    ('Kol (Yarım)',      250, 175, 400,  9), ('Sırt',             800, 500,1200, 10),
    ('Göğüs',            500, 300, 800, 11), ('Yüz + Boyun',      350, 250, 500, 12),
    ('Bıyık / Çene',     100,  60, 180, 13)
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION INIT_BEAUTY_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
    -- beauty_specialists (full schema)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name            VARCHAR(255) NOT NULL,
        phone           VARCHAR(50),
        email           VARCHAR(255),
        specialty       VARCHAR(100),
        color           VARCHAR(20) DEFAULT ''#9333ea'',
        commission_rate DECIMAL(5,2) DEFAULT 0,
        avatar_url      TEXT,
        working_hours   JSONB,
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_specialists');

    -- beauty_services (full schema)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name            VARCHAR(255) NOT NULL,
        category        VARCHAR(50) DEFAULT ''beauty'',
        duration_min    INTEGER DEFAULT 30,
        price           DECIMAL(15,2) DEFAULT 0,
        cost_price      DECIMAL(15,2) DEFAULT 0,
        color           VARCHAR(20) DEFAULT ''#9333ea'',
        commission_rate DECIMAL(5,2) DEFAULT 0,
        description     TEXT,
        requires_device BOOLEAN DEFAULT false,
        expected_shots  INTEGER DEFAULT 0,
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_services');

    -- beauty_packages (full schema)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        service_id      UUID,
        total_sessions  INTEGER DEFAULT 1,
        price           DECIMAL(15,2) DEFAULT 0,
        cost_price      DECIMAL(15,2) DEFAULT 0,
        discount_pct    DECIMAL(5,2) DEFAULT 0,
        validity_days   INTEGER DEFAULT 365,
        color           VARCHAR(20) DEFAULT ''#6366f1'',
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_packages');

    -- beauty_devices (full schema)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name             VARCHAR(255) NOT NULL,
        device_type      VARCHAR(50) DEFAULT ''laser'',
        serial_number    VARCHAR(100),
        manufacturer     VARCHAR(100),
        model            VARCHAR(100),
        total_shots      BIGINT DEFAULT 0,
        max_shots        BIGINT DEFAULT 500000,
        maintenance_due  DATE,
        last_maintenance DATE,
        purchase_date    DATE,
        warranty_expiry  DATE,
        status           VARCHAR(20) DEFAULT ''active'',
        notes            TEXT,
        is_active        BOOLEAN DEFAULT true,
        created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_devices');

    -- beauty_leads (CRM pipeline — firm card table)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name                  VARCHAR(255) NOT NULL,
        phone                 VARCHAR(50),
        email                 VARCHAR(255),
        source                VARCHAR(30) DEFAULT ''other'',
        status                VARCHAR(30) DEFAULT ''new'',
        interested_services   JSONB DEFAULT ''[]'',
        notes                 TEXT,
        assigned_to           UUID,
        first_contact_date    DATE DEFAULT CURRENT_DATE,
        last_contact_date     DATE,
        converted_customer_id UUID,
        lost_reason           TEXT,
        created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_leads');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION INIT_BEAUTY_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
BEGIN
    -- beauty_appointments (full schema)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        client_id           UUID,
        service_id          UUID,
        specialist_id       UUID,
        device_id           UUID,
        body_region_id      UUID,
        appointment_date    DATE,
        appointment_time    TIME,
        duration            INTEGER DEFAULT 30,
        status              VARCHAR(20) DEFAULT ''scheduled'',
        type                VARCHAR(20) DEFAULT ''regular'',
        notes               TEXT,
        total_price         DECIMAL(15,2) DEFAULT 0,
        commission_amount   DECIMAL(15,2) DEFAULT 0,
        is_package_session  BOOLEAN DEFAULT false,
        package_purchase_id UUID,
        reminder_sent       BOOLEAN DEFAULT false,
        created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_appointments');

    -- beauty_sessions
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id     UUID,
        specialist_id   UUID,
        service_id      UUID,
        appointment_id  UUID,
        session_date    DATE DEFAULT CURRENT_DATE,
        shots_used      INTEGER DEFAULT 0,
        skin_type       VARCHAR(20),
        before_photo    TEXT,
        after_photo     TEXT,
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_sessions');

    -- beauty_session_logs
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        package_purchase_id UUID,
        appointment_id      UUID,
        session_number      INTEGER,
        recorded_at         TIMESTAMPTZ DEFAULT NOW()
    )', v_prefix || '_beauty_session_logs');

    -- beauty_package_purchases (full schema)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id        UUID,
        package_id         UUID,
        total_sessions     INTEGER DEFAULT 1,
        used_sessions      INTEGER DEFAULT 0,
        remaining_sessions INTEGER DEFAULT 1,
        sale_price         DECIMAL(15,2) DEFAULT 0,
        purchase_date      DATE DEFAULT CURRENT_DATE,
        expiry_date        DATE,
        status             VARCHAR(20) DEFAULT ''active'',
        created_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_package_purchases');

    -- beauty_package_sales (legacy alias)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id     UUID,
        package_id      UUID,
        total_sessions  INTEGER,
        sale_price      DECIMAL(15,2),
        sale_date       DATE,
        expiry_date     DATE,
        status          VARCHAR(20)
    )', v_prefix || '_beauty_package_sales');

    -- beauty_device_usage (full schema)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_id       UUID,
        appointment_id  UUID,
        customer_id     UUID,
        specialist_id   UUID,
        body_region_id  UUID,
        shots_used      INTEGER DEFAULT 0,
        expected_shots  INTEGER DEFAULT 0,
        is_excessive    BOOLEAN DEFAULT false,
        usage_date      DATE DEFAULT CURRENT_DATE,
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_device_usage');

    -- beauty_device_alerts (NEW)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_id    UUID,
        usage_id     UUID,
        alert_type   VARCHAR(50),
        message      TEXT,
        severity     VARCHAR(20) DEFAULT ''warning'',
        acknowledged BOOLEAN DEFAULT false,
        created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_device_alerts');

    -- beauty_customer_feedback (NEW)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        appointment_id     UUID,
        customer_id        UUID,
        service_rating     SMALLINT DEFAULT 5,
        staff_rating       SMALLINT DEFAULT 5,
        cleanliness_rating SMALLINT DEFAULT 5,
        overall_rating     SMALLINT DEFAULT 5,
        comment            TEXT,
        would_recommend    BOOLEAN DEFAULT true,
        created_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_customer_feedback');

    -- beauty_sales (NEW — beauty POS)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        invoice_number   VARCHAR(30),
        customer_id      UUID,
        subtotal         DECIMAL(15,2) DEFAULT 0,
        discount         DECIMAL(15,2) DEFAULT 0,
        tax              DECIMAL(15,2) DEFAULT 0,
        total            DECIMAL(15,2) DEFAULT 0,
        payment_method   VARCHAR(30) DEFAULT ''cash'',
        payment_status   VARCHAR(20) DEFAULT ''paid'',
        paid_amount      DECIMAL(15,2) DEFAULT 0,
        remaining_amount DECIMAL(15,2) DEFAULT 0,
        notes            TEXT,
        created_by       UUID,
        created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_sales');

    -- beauty_sale_items (NEW)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sale_id           UUID,
        item_type         VARCHAR(20) DEFAULT ''service'',
        item_id           UUID,
        name              VARCHAR(255),
        quantity          INTEGER DEFAULT 1,
        unit_price        DECIMAL(15,2) DEFAULT 0,
        discount          DECIMAL(15,2) DEFAULT 0,
        total             DECIMAL(15,2) DEFAULT 0,
        staff_id          UUID,
        commission_amount DECIMAL(15,2) DEFAULT 0,
        created_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_sale_items');
END;
$$ LANGUAGE plpgsql;

-- 4.0 RESTAURANT OPERATIONAL LOGIC (Professional)
----------------------------------------------------------------------------

-- Function to void an order item and update order total
-- NOTE: Targeted at dynamic tables if search_path is active or simplified for single-tenant template.
CREATE OR REPLACE FUNCTION rest.rest_void_order_item(
    p_item_id UUID,
    p_reason TEXT
) RETURNS VOID AS $$
DECLARE
    v_order_id UUID;
    v_item_total DECIMAL;
BEGIN
    -- This assumes standard 'rest_order_items' name is available via search_path or alias
    EXECUTE 'SELECT order_id, (unit_price * quantity * (1 - COALESCE(discount_pct, 0) / 100))
             FROM rest_order_items WHERE id = $1'
    INTO v_order_id, v_item_total USING p_item_id;

    IF v_order_id IS NOT NULL THEN
        EXECUTE 'UPDATE rest_order_items SET is_void = TRUE, void_reason = $1 WHERE id = $2'
        USING p_reason, p_item_id;

        EXECUTE 'UPDATE rest_orders SET total_amount = total_amount - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2'
        USING v_item_total, v_order_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to mark item as complementary
CREATE OR REPLACE FUNCTION rest.rest_mark_complementary(
    p_item_id UUID
) RETURNS VOID AS $$
DECLARE
    v_order_id UUID;
    v_item_total DECIMAL;
BEGIN
    EXECUTE 'SELECT order_id, (unit_price * quantity * (1 - COALESCE(discount_pct, 0) / 100))
             FROM rest_order_items WHERE id = $1 AND is_complimentary = FALSE'
    INTO v_order_id, v_item_total USING p_item_id;

    IF v_order_id IS NOT NULL THEN
        EXECUTE 'UPDATE rest_order_items SET is_complimentary = TRUE WHERE id = $1'
        USING p_item_id;

        EXECUTE 'UPDATE rest_orders SET total_amount = total_amount - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2'
        USING v_item_total, v_order_id;
    END IF;
END;
$$ LANGUAGE plpgsql;
