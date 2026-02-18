-- Migration: 016_audit_voice_marketplace.sql
-- Description: Comprehensive schema for Audit, API Marketplace, and Training systems.

-- ============================================================================
-- 1. AUDIT LOG SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    user_name TEXT NOT NULL,
    user_role TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    store_id UUID REFERENCES stores(id),
    kasa_id TEXT,
    ip_address INET,
    device_info JSONB,
    old_values JSONB,
    new_values JSONB,
    changes JSONB,
    reason TEXT,
    request_id TEXT,
    session_id TEXT,
    hash TEXT,
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

CREATE TABLE IF NOT EXISTS price_change_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) NOT NULL,
    product_name TEXT NOT NULL,
    old_price DECIMAL(10,2) NOT NULL,
    new_price DECIMAL(10,2) NOT NULL,
    change_percentage DECIMAL(5,2),
    reason TEXT NOT NULL,
    changed_by UUID REFERENCES users(id) NOT NULL,
    approved_by UUID REFERENCES users(id),
    store_id UUID REFERENCES stores(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS user_activity_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    activity_type TEXT NOT NULL,
    ip_address INET,
    device_info JSONB,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    failure_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Audit Trigger Function
CREATE OR REPLACE FUNCTION audit_trigger_function() RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_user_name TEXT;
    v_old_values JSONB;
    v_new_values JSONB;
BEGIN
    v_user_id := current_setting('app.current_user_id', true)::UUID;
    v_user_name := current_setting('app.current_user_name', true);

    IF TG_OP = 'DELETE' THEN
        v_old_values := to_jsonb(OLD);
        v_new_values := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        v_old_values := to_jsonb(OLD);
        v_new_values := to_jsonb(NEW);
    ELSIF TG_OP = 'INSERT' THEN
        v_old_values := NULL;
        v_new_values := to_jsonb(NEW);
    END IF;

    INSERT INTO audit_logs (
        user_id, user_name, action, entity_type, entity_id, old_values, new_values, category
    ) VALUES (
        v_user_id, v_user_name, TG_OP, TG_TABLE_NAME, 
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id::TEXT ELSE NEW.id::TEXT END,
        v_old_values, v_new_values, 'data'
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. API MARKETPLACE & PLUGINS
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    category TEXT,
    provider TEXT,
    logo_url TEXT,
    integration_type TEXT CHECK (integration_type IN ('builtin', 'plugin', 'custom')),
    config_schema JSONB,
    default_config JSONB,
    is_active BOOLEAN DEFAULT true,
    requires_approval BOOLEAN DEFAULT false,
    is_free BOOLEAN DEFAULT true,
    price_monthly DECIMAL(10,2),
    revenue_share_percentage INTEGER DEFAULT 30,
    install_count INTEGER DEFAULT 0,
    rating DECIMAL(2,1) DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS installed_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID REFERENCES api_integrations(id),
    store_id UUID REFERENCES stores(id),
    config JSONB,
    credentials JSONB,
    is_enabled BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    sync_status TEXT,
    installed_by UUID REFERENCES users(id),
    installed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. INTERACTIVE TRAINING SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS tutorials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    video_url TEXT,
    video_duration_seconds INTEGER,
    transcript TEXT,
    steps JSONB,
    target_roles TEXT[],
    sequence_order INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_tutorial_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    tutorial_id UUID REFERENCES tutorials(id),
    status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
    current_step INTEGER DEFAULT 0,
    completion_percentage INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    time_spent_seconds INTEGER DEFAULT 0,
    UNIQUE(user_id, tutorial_id)
);

CREATE TABLE IF NOT EXISTS help_articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT[],
    view_count INTEGER DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

