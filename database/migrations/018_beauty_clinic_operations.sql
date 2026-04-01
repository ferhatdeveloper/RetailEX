-- ============================================================================
-- 018: Beauty — Klinik operasyonları (şube/oda, portal, bekleme, hatırlatma,
--       onam, klinik not, foto, sağlık profili, sarf, parti, üyelik, kampanya,
--       kurumsal, entegrasyon, denetim, sarf kullanım logu)
-- ============================================================================

-- Randevu kolonları (dönem tabloları)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_[0-9]+_beauty_appointments$'
  LOOP
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS branch_id UUID', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS room_id UUID', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS tele_meeting_url TEXT', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS booking_channel VARCHAR(40) DEFAULT ''staff''', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS corporate_account_id UUID', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS last_notification_channel VARCHAR(30)', r.tablename);
  END LOOP;
END $$;

-- Firma düzeyi tablolar
DO $$
DECLARE
  f RECORD;
  v_prefix TEXT;
BEGIN
  FOR f IN SELECT firm_nr FROM firms WHERE COALESCE(is_active, true) LOOP
    v_prefix := lower('rex_' || f.firm_nr);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        address TEXT,
        phone VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_prefix || '_beauty_branches');

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        branch_id UUID,
        name VARCHAR(255) NOT NULL,
        capacity INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_prefix || '_beauty_rooms');

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        online_booking_enabled BOOLEAN DEFAULT false,
        public_slug VARCHAR(120),
        public_token VARCHAR(128) NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
        reminder_hours_before SMALLINT DEFAULT 24,
        sms_template TEXT,
        whatsapp_template TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_prefix || '_beauty_portal_settings');

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        tax_nr VARCHAR(50),
        discount_pct DECIMAL(5,2) DEFAULT 0,
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_prefix || '_beauty_corporate_accounts');

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(255) NOT NULL,
        body_html TEXT,
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_prefix || '_beauty_consent_templates');

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        monthly_price DECIMAL(15,2) DEFAULT 0,
        session_credit INTEGER DEFAULT 0,
        benefits_json JSONB DEFAULT '{}'::jsonb,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_prefix || '_beauty_memberships');

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        service_id UUID NOT NULL,
        product_id UUID NOT NULL,
        qty_per_service DECIMAL(15,4) NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_prefix || '_beauty_service_consumables');

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS beauty.%I (
        customer_id UUID PRIMARY KEY,
        allergies TEXT,
        medications TEXT,
        pregnancy BOOLEAN DEFAULT false,
        chronic_notes TEXT,
        warnings_banner TEXT,
        kvkk_consent_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_prefix || '_beauty_customer_health');

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID NOT NULL,
        lot_code VARCHAR(80),
        expiry_date DATE,
        qty DECIMAL(15,3) DEFAULT 0,
        barcode VARCHAR(80),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_prefix || '_beauty_product_batches');

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        channel VARCHAR(30) DEFAULT 'sms',
        segment_filter_json JSONB DEFAULT '{}'::jsonb,
        message_template TEXT,
        scheduled_at TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'draft',
        sent_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_prefix || '_beauty_marketing_campaigns');

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS beauty.%I (
        id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        google_calendar_id TEXT,
        external_calendar_json JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_prefix || '_beauty_integration_settings');
  END LOOP;
END $$;

-- Dönem düzeyi tablolar
DO $$
DECLARE
  f RECORD;
  p RECORD;
  v_prefix TEXT;
BEGIN
  FOR f IN SELECT firm_nr FROM firms WHERE COALESCE(is_active, true) LOOP
    FOR p IN SELECT nr FROM periods WHERE firm_id = (SELECT id FROM firms WHERE firm_nr = f.firm_nr) LOOP
      v_prefix := lower('rex_' || f.firm_nr || '_' || lpad(p.nr::text, 2, '0'));

      EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS beauty.%I (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          customer_id UUID,
          service_id UUID,
          specialist_id UUID,
          preferred_date_from DATE,
          preferred_date_to DATE,
          notes TEXT,
          status VARCHAR(20) DEFAULT 'active',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      $f$, v_prefix || '_beauty_waitlist');

      EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS beauty.%I (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(50) NOT NULL,
          email VARCHAR(255),
          service_id UUID,
          requested_date DATE,
          requested_time TIME,
          notes TEXT,
          status VARCHAR(20) DEFAULT 'pending',
          public_token_used VARCHAR(128),
          processed_appointment_id UUID,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      $f$, v_prefix || '_beauty_booking_requests');

      EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS beauty.%I (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          appointment_id UUID,
          channel VARCHAR(30) NOT NULL,
          payload_json JSONB DEFAULT '{}'::jsonb,
          status VARCHAR(20) DEFAULT 'pending',
          scheduled_at TIMESTAMPTZ,
          sent_at TIMESTAMPTZ,
          error_text TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      $f$, v_prefix || '_beauty_notification_queue');

      EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS beauty.%I (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          customer_id UUID,
          appointment_id UUID,
          template_id UUID,
          signed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          signature_data TEXT,
          meta_json JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      $f$, v_prefix || '_beauty_consent_submissions');

      EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS beauty.%I (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          appointment_id UUID,
          customer_id UUID,
          subjective TEXT,
          objective TEXT,
          assessment TEXT,
          plan TEXT,
          extra_json JSONB DEFAULT '{}'::jsonb,
          created_by UUID,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      $f$, v_prefix || '_beauty_clinical_notes');

      EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS beauty.%I (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          customer_id UUID NOT NULL,
          appointment_id UUID,
          kind VARCHAR(20) DEFAULT 'before',
          storage_url TEXT NOT NULL,
          caption TEXT,
          taken_at DATE,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      $f$, v_prefix || '_beauty_patient_photos');

      EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS beauty.%I (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          customer_id UUID NOT NULL,
          membership_id UUID NOT NULL,
          start_date DATE,
          end_date DATE,
          status VARCHAR(20) DEFAULT 'active',
          auto_renew BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      $f$, v_prefix || '_beauty_membership_subscriptions');

      EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS beauty.%I (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          table_name VARCHAR(80) NOT NULL,
          record_id UUID,
          action VARCHAR(40) NOT NULL,
          user_id UUID,
          payload_json JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      $f$, v_prefix || '_beauty_audit_log');

      EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS beauty.%I (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          appointment_id UUID,
          product_id UUID NOT NULL,
          qty DECIMAL(15,4) NOT NULL,
          batch_id UUID,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      $f$, v_prefix || '_beauty_consumable_usage_log');
    END LOOP;
  END LOOP;
END $$;

-- integration_settings: singleton satır (INSERT ... ON CONFLICT)
DO $$
DECLARE
  f RECORD;
  v_t TEXT;
BEGIN
  FOR f IN SELECT firm_nr FROM firms WHERE COALESCE(is_active, true) LOOP
    v_t := lower('rex_' || f.firm_nr || '_beauty_integration_settings');
    EXECUTE format(
      'INSERT INTO beauty.%I (id) VALUES (1) ON CONFLICT (id) DO NOTHING',
      v_t
    );
  END LOOP;
END $$;
