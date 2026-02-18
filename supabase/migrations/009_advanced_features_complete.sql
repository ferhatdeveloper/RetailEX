-- Migration 009: Advanced Features Complete
-- Offline Sync + Audit Logs + Reporting + API + Training
-- Created: 2025-01-01

-- ============================================================================
-- REPORT BUILDER TABLES
-- ============================================================================

CREATE TABLE report_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT CHECK (category IN ('sales', 'inventory', 'finance', 'hr', 'custom')),
    is_system BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    
    data_source TEXT NOT NULL,
    query TEXT,
    columns JSONB NOT NULL,
    filters JSONB,
    grouping JSONB,
    sorting JSONB,
    aggregations JSONB,
    chart_config JSONB,
    
    is_public BOOLEAN DEFAULT false,
    shared_with UUID[],
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE scheduled_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID REFERENCES report_templates(id),
    name TEXT NOT NULL,
    schedule_type TEXT CHECK (schedule_type IN ('daily', 'weekly', 'monthly', 'custom')),
    schedule_config JSONB,
    
    delivery_method TEXT[] DEFAULT ARRAY['email'],
    recipients TEXT[],
    export_format TEXT[] DEFAULT ARRAY['pdf'],
    
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE report_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID REFERENCES report_templates(id),
    scheduled_report_id UUID REFERENCES scheduled_reports(id),
    executed_by UUID REFERENCES users(id),
    
    status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    execution_time_ms INTEGER,
    row_count INTEGER,
    file_url TEXT,
    file_size_bytes INTEGER,
    error_message TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- API MARKETPLACE TABLES
-- ============================================================================

CREATE TABLE api_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    category TEXT CHECK (category IN ('accounting', 'shipping', 'payment', 'ecommerce', 'other')),
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

CREATE TABLE installed_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID REFERENCES api_integrations(id),
    store_id UUID REFERENCES stores(id),
    
    config JSONB,
    credentials JSONB, -- Encrypted
    
    is_enabled BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    sync_status TEXT,
    
    installed_by UUID REFERENCES users(id),
    installed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash TEXT UNIQUE NOT NULL,
    key_prefix TEXT,
    name TEXT NOT NULL,
    
    scopes TEXT[] DEFAULT ARRAY['read'],
    allowed_endpoints TEXT[],
    
    rate_limit_per_minute INTEGER DEFAULT 60,
    rate_limit_per_day INTEGER DEFAULT 10000,
    
    last_used_at TIMESTAMPTZ,
    request_count INTEGER DEFAULT 0,
    
    ip_whitelist INET[],
    expires_at TIMESTAMPTZ,
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE api_request_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID REFERENCES api_keys(id),
    
    method TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_body JSONB,
    
    status_code INTEGER,
    response_time_ms INTEGER,
    
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_logs_key ON api_request_logs(api_key_id);
CREATE INDEX idx_api_logs_date ON api_request_logs(created_at DESC);

-- ============================================================================
-- TRAINING SYSTEM TABLES
-- ============================================================================

CREATE TABLE tutorials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT CHECK (category IN ('onboarding', 'sales', 'inventory', 'reports', 'advanced')),
    difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    
    video_url TEXT,
    video_duration_seconds INTEGER,
    transcript TEXT,
    steps JSONB,
    
    target_roles TEXT[],
    sequence_order INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_tutorial_progress (
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

CREATE TABLE achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    
    requirement_type TEXT CHECK (requirement_type IN ('tutorial_complete', 'sales_count', 'feature_use')),
    requirement_value INTEGER,
    points INTEGER DEFAULT 10,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    achievement_id UUID REFERENCES achievements(id),
    
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, achievement_id)
);

CREATE TABLE help_articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT[],
    
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('turkish', title || ' ' || content)
    ) STORED,
    
    view_count INTEGER DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_help_search ON help_articles USING GIN(search_vector);

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Pre-built report templates
INSERT INTO report_templates (name, description, category, is_system, data_source, columns, chart_config) VALUES
(
    'GÃ¼nlÃ¼k SatÄ±ÅŸ Raporu',
    'GÃ¼nlÃ¼k satÄ±ÅŸ Ã¶zeti - tÃ¼m maÄŸazalar',
    'sales',
    true,
    'sales',
    '[
        {"field": "date", "label": "Tarih", "type": "date"},
        {"field": "store_name", "label": "MaÄŸaza", "type": "text"},
        {"field": "total_sales", "label": "Toplam SatÄ±ÅŸ", "type": "currency", "aggregate": "sum"},
        {"field": "order_count", "label": "SipariÅŸ SayÄ±sÄ±", "type": "number", "aggregate": "sum"}
    ]'::JSONB,
    '{"type": "bar", "x": "store_name", "y": "total_sales"}'::JSONB
),
(
    'En Ã‡ok Satan ÃœrÃ¼nler',
    'Son 30 gÃ¼nÃ¼n en Ã§ok satan Ã¼rÃ¼nleri',
    'sales',
    true,
    'products',
    '[
        {"field": "product_name", "label": "ÃœrÃ¼n", "type": "text"},
        {"field": "quantity_sold", "label": "SatÄ±ÅŸ Adedi", "type": "number", "aggregate": "sum"},
        {"field": "revenue", "label": "Ciro", "type": "currency", "aggregate": "sum"}
    ]'::JSONB,
    '{"type": "pie", "values": "quantity_sold", "labels": "product_name", "limit": 10}'::JSONB
),
(
    'Stok Durum Raporu',
    'TÃ¼m Ã¼rÃ¼nlerin stok durumu',
    'inventory',
    true,
    'products',
    '[
        {"field": "product_name", "label": "ÃœrÃ¼n", "type": "text"},
        {"field": "stock", "label": "Stok", "type": "number"},
        {"field": "reorder_point", "label": "Min. Stok", "type": "number"},
        {"field": "stock_value", "label": "Stok DeÄŸeri", "type": "currency"}
    ]'::JSONB,
    '{"type": "table"}'::JSONB
);

-- API integrations
INSERT INTO api_integrations (name, slug, description, category, integration_type, is_free) VALUES
('E-Fatura GÄ°B', 'e-fatura-gib', 'Gelir Ä°daresi BaÅŸkanlÄ±ÄŸÄ± e-fatura entegrasyonu', 'accounting', 'builtin', true),
('ParaÅŸÃ¼t', 'parasut', 'ParaÅŸÃ¼t muhasebe programÄ±', 'accounting', 'builtin', false),
('Aras Kargo', 'aras-kargo', 'Aras kargo gÃ¶nderim', 'shipping', 'builtin', true),
('YurtiÃ§i Kargo', 'yurtici-kargo', 'YurtiÃ§i kargo', 'shipping', 'builtin', true),
('iyzico', 'iyzico', 'iyzico Ã¶deme altyapÄ±sÄ±', 'payment', 'builtin', false),
('Trendyol', 'trendyol', 'Trendyol pazaryeri', 'ecommerce', 'builtin', false),
('Hepsiburada', 'hepsiburada', 'Hepsiburada entegrasyonu', 'ecommerce', 'builtin', false);

-- Tutorials
INSERT INTO tutorials (title, description, category, difficulty, target_roles, sequence_order) VALUES
('Sisteme HoÅŸ Geldiniz', 'Ä°lk adÄ±mlar - sistem tanÄ±tÄ±mÄ±', 'onboarding', 'beginner', ARRAY['cashier', 'manager', 'admin'], 1),
('Ä°lk SatÄ±ÅŸÄ±nÄ±zÄ± YapÄ±n', 'AdÄ±m adÄ±m satÄ±ÅŸ iÅŸlemi', 'onboarding', 'beginner', ARRAY['cashier'], 2),
('ÃœrÃ¼n Ekleme', 'Yeni Ã¼rÃ¼n nasÄ±l eklenir?', 'inventory', 'beginner', ARRAY['manager', 'admin'], 3),
('MÃ¼ÅŸteri YÃ¶netimi', 'MÃ¼ÅŸteri kaydÄ± ve sadakat programÄ±', 'sales', 'beginner', ARRAY['cashier', 'manager'], 4),
('Rapor OluÅŸturma', 'Custom rapor nasÄ±l oluÅŸturulur?', 'reports', 'intermediate', ARRAY['manager', 'admin'], 5),
('Multi-Store YÃ¶netimi', 'MaÄŸazalar arasÄ± iÅŸlemler', 'advanced', 'advanced', ARRAY['admin'], 6);

-- Achievements
INSERT INTO achievements (code, name, description, requirement_type, requirement_value, points) VALUES
('first_sale', 'ğŸ‰ Ä°lk SatÄ±ÅŸ', 'Ä°lk satÄ±ÅŸÄ±nÄ±zÄ± tamamladÄ±nÄ±z!', 'sales_count', 1, 10),
('sales_10', 'ğŸ’° 10 SatÄ±ÅŸ', '10 satÄ±ÅŸ yaptÄ±nÄ±z!', 'sales_count', 10, 20),
('sales_100', 'ğŸ† SatÄ±ÅŸ UstasÄ±', '100 satÄ±ÅŸ tamamladÄ±nÄ±z!', 'sales_count', 100, 100),
('tutorial_complete', 'ğŸ“š Ã–ÄŸrenci', 'TÃ¼m eÄŸitimleri tamamladÄ±nÄ±z!', 'tutorial_complete', 6, 50),
('first_report', 'ğŸ“Š Rapor UzmanÄ±', 'Ä°lk raporunuzu oluÅŸturdunuz!', 'feature_use', 1, 15),
('voice_assistant', 'ğŸ¤ Sesli Komut KullanÄ±cÄ±sÄ±', 'Sesli asistan ile iÅŸlem yaptÄ±nÄ±z!', 'feature_use', 1, 15);

-- Help articles
INSERT INTO help_articles (title, content, category, tags) VALUES
(
    'NasÄ±l SatÄ±ÅŸ YaparÄ±m?',
    'SatÄ±ÅŸ yapmak iÃ§in:\n1. ÃœrÃ¼nleri sepete ekleyin\n2. MÃ¼ÅŸteri seÃ§in (opsiyonel)\n3. Ã–deme yÃ¶ntemini seÃ§in\n4. "Ã–deme Al" butonuna tÄ±klayÄ±n',
    'sales',
    ARRAY['satÄ±ÅŸ', 'pos', 'Ã¶deme']
),
(
    'Fiyat NasÄ±l DeÄŸiÅŸtirilir?',
    'ÃœrÃ¼n fiyatÄ± deÄŸiÅŸtirmek iÃ§in:\n1. ÃœrÃ¼nler sayfasÄ±na gidin\n2. ÃœrÃ¼nÃ¼ bulun ve dÃ¼zenle\n3. Yeni fiyatÄ± girin\n4. DeÄŸiÅŸiklik sebebini yazÄ±n (zorunlu)\n5. Kaydet',
    'inventory',
    ARRAY['fiyat', 'Ã¼rÃ¼n', 'dÃ¼zenleme']
),
(
    'Stok SayÄ±mÄ± NasÄ±l YapÄ±lÄ±r?',
    'Stok sayÄ±mÄ± iÃ§in:\n1. Envanter > Stok SayÄ±mÄ±\n2. Yeni SayÄ±m OluÅŸtur\n3. ÃœrÃ¼nleri tara veya manuel gir\n4. FarklarÄ± gÃ¶zden geÃ§ir\n5. Onayla',
    'inventory',
    ARRAY['stok', 'sayÄ±m', 'envanter']
);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Award achievement to user
CREATE OR REPLACE FUNCTION award_achievement(
    p_user_id UUID,
    p_achievement_code TEXT
) RETURNS void AS $$
DECLARE
    v_achievement_id UUID;
BEGIN
    -- Get achievement ID
    SELECT id INTO v_achievement_id
    FROM achievements
    WHERE code = p_achievement_code;

    IF v_achievement_id IS NULL THEN
        RETURN;
    END IF;

    -- Check if already earned
    IF EXISTS (
        SELECT 1 FROM user_achievements
        WHERE user_id = p_user_id AND achievement_id = v_achievement_id
    ) THEN
        RETURN;
    END IF;

    -- Award achievement
    INSERT INTO user_achievements (user_id, achievement_id)
    VALUES (p_user_id, v_achievement_id);

    -- TODO: Send notification
END;
$$ LANGUAGE plpgsql;

-- Check and award achievements based on sales count
CREATE OR REPLACE FUNCTION check_sales_achievements() RETURNS TRIGGER AS $$
DECLARE
    v_sale_count INTEGER;
    v_user_id UUID;
BEGIN
    v_user_id := NEW.cashier_id;

    -- Count total sales by this user
    SELECT COUNT(*) INTO v_sale_count
    FROM orders
    WHERE cashier_id = v_user_id;

    -- Award achievements
    IF v_sale_count = 1 THEN
        PERFORM award_achievement(v_user_id, 'first_sale');
    ELSIF v_sale_count = 10 THEN
        PERFORM award_achievement(v_user_id, 'sales_10');
    ELSIF v_sale_count = 100 THEN
        PERFORM award_achievement(v_user_id, 'sales_100');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sales_achievements
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION check_sales_achievements();

-- Search help articles
CREATE OR REPLACE FUNCTION search_help_articles(p_query TEXT)
RETURNS TABLE (
    id UUID,
    title TEXT,
    content TEXT,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ha.id,
        ha.title,
        ha.content,
        ts_rank(ha.search_vector, plainto_tsquery('turkish', p_query)) as rank
    FROM help_articles ha
    WHERE ha.search_vector @@ plainto_tsquery('turkish', p_query)
    ORDER BY rank DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- User training progress summary
CREATE OR REPLACE VIEW v_user_training_progress AS
SELECT
    u.id as user_id,
    u.name as user_name,
    COUNT(utp.id) as tutorials_started,
    COUNT(utp.id) FILTER (WHERE utp.status = 'completed') as tutorials_completed,
    COALESCE(ROUND(
        (COUNT(utp.id) FILTER (WHERE utp.status = 'completed')::DECIMAL / NULLIF(COUNT(t.id), 0)) * 100
    ), 0) as completion_percentage,
    SUM(utp.time_spent_seconds) as total_time_spent_seconds
FROM users u
CROSS JOIN tutorials t
LEFT JOIN user_tutorial_progress utp ON u.id = utp.user_id AND t.id = utp.tutorial_id
WHERE t.target_roles @> ARRAY[u.role]
GROUP BY u.id, u.name;

-- User achievement summary
CREATE OR REPLACE VIEW v_user_achievements_summary AS
SELECT
    u.id as user_id,
    u.name as user_name,
    COUNT(ua.id) as achievements_earned,
    SUM(a.points) as total_points,
    RANK() OVER (ORDER BY SUM(a.points) DESC) as leaderboard_rank
FROM users u
LEFT JOIN user_achievements ua ON u.id = ua.user_id
LEFT JOIN achievements a ON ua.achievement_id = a.id
GROUP BY u.id, u.name;

-- API usage statistics
CREATE OR REPLACE VIEW v_api_usage_stats AS
SELECT
    ak.name as api_key_name,
    u.name as owner_name,
    COUNT(arl.id) as total_requests,
    COUNT(arl.id) FILTER (WHERE arl.created_at >= NOW() - INTERVAL '24 hours') as requests_last_24h,
    AVG(arl.response_time_ms) as avg_response_time_ms,
    COUNT(arl.id) FILTER (WHERE arl.status_code >= 400) as error_count,
    MAX(arl.created_at) as last_request_at
FROM api_keys ak
JOIN users u ON ak.created_by = u.id
LEFT JOIN api_request_logs arl ON ak.id = arl.api_key_id
GROUP BY ak.id, ak.name, u.name;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT, UPDATE ON report_templates, scheduled_reports, report_executions TO authenticated;
GRANT INSERT ON api_request_logs TO authenticated;
GRANT INSERT, UPDATE ON user_tutorial_progress, user_achievements TO authenticated;
GRANT UPDATE (view_count, helpful_count) ON help_articles TO authenticated;

