-- Migration 040: Beauty Center Clinic Module
-- Created: 2026-02-25

-- ============================================================================
-- CLINIC MASTER TABLES
-- ============================================================================

-- Beauty Specialists (Staff)
CREATE TABLE IF NOT EXISTS beauty_specialists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    specialties TEXT[], -- Array of service categories
    commission_rate DECIMAL(5,2) DEFAULT 0,
    base_salary DECIMAL(15,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    avatar TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Beauty Services
CREATE TABLE IF NOT EXISTS beauty_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    duration INTEGER NOT NULL, -- in minutes
    price DECIMAL(15,2) NOT NULL,
    cost DECIMAL(15,2) DEFAULT 0,
    color TEXT, -- Hex color for calendar
    requires_device BOOLEAN DEFAULT false,
    device_type TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Beauty Devices (Laser, IPL, etc.)
CREATE TABLE IF NOT EXISTS beauty_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    serial_number TEXT UNIQUE,
    type TEXT CHECK (type IN ('laser', 'ipl', 'other')),
    total_shots BIGINT DEFAULT 0,
    max_shots BIGINT,
    last_maintenance DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CLINIC TRANSACTION TABLES
-- ============================================================================

-- Beauty Appointments
CREATE TABLE IF NOT EXISTS beauty_appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id),
    specialist_id UUID REFERENCES beauty_specialists(id),
    service_id UUID REFERENCES beauty_services(id),
    date DATE NOT NULL,
    time TIME NOT NULL,
    duration INTEGER NOT NULL,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'noshow')),
    notes TEXT,
    device_id UUID REFERENCES beauty_devices(id),
    total_price DECIMAL(15,2) DEFAULT 0,
    is_package_session BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Beauty Packages (Prepaid sessions)
CREATE TABLE IF NOT EXISTS beauty_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    service_id UUID REFERENCES beauty_services(id),
    total_sessions INTEGER NOT NULL,
    price DECIMAL(15,2) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer Package Purchases
CREATE TABLE IF NOT EXISTS beauty_package_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id),
    package_id UUID REFERENCES beauty_packages(id),
    total_sessions INTEGER NOT NULL,
    remaining_sessions INTEGER NOT NULL,
    purchase_date DATE DEFAULT CURRENT_DATE,
    expiry_date DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session Logs
CREATE TABLE IF NOT EXISTS beauty_session_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_purchase_id UUID REFERENCES beauty_package_purchases(id),
    appointment_id UUID REFERENCES beauty_appointments(id),
    session_number INTEGER NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Device Usage (Shots tracking)
CREATE TABLE IF NOT EXISTS beauty_device_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES beauty_devices(id),
    appointment_id UUID REFERENCES beauty_appointments(id),
    shots_fired INTEGER NOT NULL,
    body_region TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ACCOUNTING INTEGRATION TRIGGERS
-- ============================================================================

-- Trigger to create accounting entries for completed clinic appointments
CREATE OR REPLACE FUNCTION create_clinic_accounting_entry() RETURNS TRIGGER AS $$
DECLARE
    v_fis_id UUID;
    v_fis_no TEXT;
    v_donem_yil INTEGER;
    v_donem_ay INTEGER;
BEGIN
    -- Only act on completed appointments that are NOT package sessions (already paid)
    IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.is_package_session = false THEN
        
        v_donem_yil := EXTRACT(YEAR FROM NEW.date);
        v_donem_ay := EXTRACT(MONTH FROM NEW.date);

        -- Generate Fiche Number
        v_fis_no := 'CL-' || v_donem_yil || '-' || LPAD(v_donem_ay::TEXT, 2, '0') || '-' || 
                    LPAD(nextval('yevmiye_fis_seq')::TEXT, 6, '0');

        -- Create Journal Fiche
        INSERT INTO yevmiye_fisleri (
            fis_no, fis_tarihi, fis_tipi, donem_yil, donem_ay, 
            aciklama, evrak_no, onay_durumu, olusturan_id
        ) VALUES (
            v_fis_no, NEW.date, 'ISLEM', v_donem_yil, v_donem_ay,
            'Clinic Service: ' || (SELECT name FROM beauty_services WHERE id = NEW.service_id),
            'APT-' || NEW.id, 'ONAYLANDI', NEW.created_by
        ) RETURNING id INTO v_fis_id;

        -- Debit: Customer/Receivables (120.01)
        INSERT INTO yevmiye_fisi_detaylari (
            fis_id, sira_no, hesap_kodu, borc, alacak, aciklama, cari_hesap_id
        ) VALUES (
            v_fis_id, 1, '120.01', NEW.total_price, 0, 'Service Fee', NEW.customer_id
        );

        -- Credit: Sales Revenue (600.01)
        INSERT INTO yevmiye_fisi_detaylari (
            fis_id, sira_no, hesap_kodu, borc, alacak, aciklama
        ) VALUES (
            v_fis_id, 2, '600.01', 0, NEW.total_price, 'Clinic Revenue'
        );

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_clinic_accounting
AFTER UPDATE ON beauty_appointments
FOR EACH ROW
EXECUTE FUNCTION create_clinic_accounting_entry();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_beauty_apt_date ON beauty_appointments(date);
CREATE INDEX IF NOT EXISTS idx_beauty_apt_cust ON beauty_appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_beauty_apt_spec ON beauty_appointments(specialist_id);
CREATE INDEX IF NOT EXISTS idx_beauty_pkg_cust ON beauty_package_purchases(customer_id);
