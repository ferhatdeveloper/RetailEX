-- ============================================================================
-- EX-ROSERP - AUTHORIZATION MODULE (Logo ERP Style)
-- Migration: 013_authorization_module_complete.sql
-- Description: Granular permission system for all operations
-- ============================================================================

-- ============================================================================
-- 1. PERMISSIONS TABLE (TÃ¼m sistem izinleri)
-- ============================================================================

CREATE TABLE IF NOT EXISTS permissions (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,  -- 'SALE_CREATE', 'SALE_EDIT', etc.
    name VARCHAR(200) NOT NULL,
    description TEXT,
    module VARCHAR(50) NOT NULL,  -- 'SALES', 'ACCOUNTING', 'INVENTORY', etc.
    category VARCHAR(50),  -- 'CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE', 'CANCEL'
    is_system BOOLEAN DEFAULT FALSE,  -- System permissions cannot be deleted
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. ROLES TABLE (Roller - Kasiyer, MÃ¼dÃ¼r, Admin, vb.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS roles (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,  -- 'CASHIER', 'MANAGER', 'ADMIN', etc.
    name VARCHAR(100) NOT NULL,
    description TEXT,
    level INTEGER DEFAULT 0,  -- Hierarchy level (0=lowest, 100=highest)
    is_system BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. ROLE_PERMISSIONS (Rol-Ä°zin Ä°liÅŸkisi)
-- ============================================================================

CREATE TABLE IF NOT EXISTS role_permissions (
    id BIGSERIAL PRIMARY KEY,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_by BIGINT,  -- Who granted this permission
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

-- ============================================================================
-- 4. USER_ROLES (KullanÄ±cÄ±-Rol Ä°liÅŸkisi)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_roles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,  -- References auth.users or your users table
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    store_id BIGINT,  -- Optional: Role specific to a store
    assigned_by BIGINT,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,  -- GeÃ§ici yetkilendirme iÃ§in
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, role_id, store_id)
);

-- ============================================================================
-- 5. USER_PERMISSIONS (KullanÄ±cÄ±ya Ã–zel Ä°zinler - Override)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_permissions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted BOOLEAN DEFAULT TRUE,  -- TRUE=grant, FALSE=revoke (override role)
    store_id BIGINT,  -- Optional: Permission specific to a store
    granted_by BIGINT,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    reason TEXT,  -- Why this override was needed
    UNIQUE(user_id, permission_id, store_id)
);

-- ============================================================================
-- 6. PERMISSION_GROUPS (Ä°zin GruplarÄ± - Logo ERP tarzÄ±)
-- ============================================================================

CREATE TABLE IF NOT EXISTS permission_groups (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    parent_id BIGINT REFERENCES permission_groups(id),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permission_group_items (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    display_order INTEGER DEFAULT 0,
    UNIQUE(group_id, permission_id)
);

-- ============================================================================
-- 7. AUTHORIZATION_LOG (Yetkilendirme Ä°ÅŸlem GeÃ§miÅŸi)
-- ============================================================================

CREATE TABLE IF NOT EXISTS authorization_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    permission_code VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,  -- 'CHECK', 'GRANT', 'REVOKE'
    result BOOLEAN,  -- Was action successful?
    resource_type VARCHAR(50),  -- 'SALE', 'PRODUCT', etc.
    resource_id BIGINT,
    ip_address INET,
    user_agent TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auth_log_user ON authorization_log(user_id, created_at DESC);
CREATE INDEX idx_auth_log_permission ON authorization_log(permission_code, created_at DESC);

-- ============================================================================
-- INSERT DEFAULT PERMISSIONS
-- ============================================================================

-- SALES MODULE PERMISSIONS
INSERT INTO permissions (code, name, description, module, category, is_system) VALUES
-- Basic CRUD
('SALE_VIEW', 'SatÄ±ÅŸlarÄ± GÃ¶rÃ¼ntÃ¼leme', 'SatÄ±ÅŸ listesini ve detaylarÄ±nÄ± gÃ¶rÃ¼ntÃ¼leme', 'SALES', 'READ', TRUE),
('SALE_CREATE', 'SatÄ±ÅŸ OluÅŸturma', 'Yeni satÄ±ÅŸ fiÅŸi oluÅŸturma', 'SALES', 'CREATE', TRUE),
('SALE_EDIT', 'SatÄ±ÅŸ DÃ¼zenleme', 'Mevcut satÄ±ÅŸÄ± dÃ¼zenleme', 'SALES', 'UPDATE', TRUE),
('SALE_DELETE', 'SatÄ±ÅŸ Silme', 'SatÄ±ÅŸ fiÅŸini silme', 'SALES', 'DELETE', TRUE),

-- Advanced Sales
('SALE_APPROVE', 'SatÄ±ÅŸ Onaylama', 'SatÄ±ÅŸÄ± onaylama yetkisi', 'SALES', 'APPROVE', TRUE),
('SALE_CANCEL', 'SatÄ±ÅŸ Ä°ptal', 'OnaylanmÄ±ÅŸ satÄ±ÅŸÄ± iptal etme', 'SALES', 'CANCEL', TRUE),
('SALE_VOID', 'SatÄ±ÅŸ Ä°ade', 'SatÄ±ÅŸ iadesi yapma', 'SALES', 'VOID', TRUE),

-- Pricing & Discounts
('SALE_VIEW_COST', 'Maliyet GÃ¶rÃ¼ntÃ¼leme', 'ÃœrÃ¼n maliyetini gÃ¶rme', 'SALES', 'READ', TRUE),
('SALE_DISCOUNT', 'Ä°ndirim Yapma', 'SatÄ±r bazÄ±nda indirim yapma', 'SALES', 'UPDATE', TRUE),
('SALE_DISCOUNT_GENERAL', 'Genel Ä°ndirim', 'Toplam tutar Ã¼zerinden indirim', 'SALES', 'UPDATE', TRUE),
('SALE_DISCOUNT_MAX_10', 'Maks %10 Ä°ndirim', '%10\'a kadar indirim yapabilir', 'SALES', 'UPDATE', TRUE),
('SALE_DISCOUNT_MAX_25', 'Maks %25 Ä°ndirim', '%25\'e kadar indirim yapabilir', 'SALES', 'UPDATE', TRUE),
('SALE_DISCOUNT_UNLIMITED', 'SÄ±nÄ±rsÄ±z Ä°ndirim', 'Herhangi bir oranda indirim', 'SALES', 'UPDATE', TRUE),

-- Payment
('SALE_CHANGE_PRICE', 'Fiyat DeÄŸiÅŸtirme', 'ÃœrÃ¼n satÄ±ÅŸ fiyatÄ±nÄ± deÄŸiÅŸtirme', 'SALES', 'UPDATE', TRUE),
('SALE_CREDIT', 'Veresiye SatÄ±ÅŸ', 'Veresiye satÄ±ÅŸ yapabilme', 'SALES', 'CREATE', TRUE),
('SALE_MULTIPLE_PAYMENT', 'Ã‡oklu Ã–deme', 'Birden fazla Ã¶deme yÃ¶ntemi kullanma', 'SALES', 'CREATE', TRUE),

-- Reports
('SALE_REPORT_OWN', 'Kendi SatÄ±ÅŸ Raporu', 'Sadece kendi satÄ±ÅŸlarÄ±nÄ± gÃ¶rebilir', 'SALES', 'READ', TRUE),
('SALE_REPORT_STORE', 'MaÄŸaza SatÄ±ÅŸ Raporu', 'MaÄŸazanÄ±n tÃ¼m satÄ±ÅŸlarÄ±nÄ± gÃ¶rebilir', 'SALES', 'READ', TRUE),
('SALE_REPORT_ALL', 'TÃ¼m SatÄ±ÅŸ Raporu', 'TÃ¼m maÄŸazalarÄ±n satÄ±ÅŸlarÄ±nÄ± gÃ¶rebilir', 'SALES', 'READ', TRUE)

ON CONFLICT (code) DO NOTHING;

-- ACCOUNTING MODULE PERMISSIONS
INSERT INTO permissions (code, name, description, module, category, is_system) VALUES
('ACCOUNTING_VIEW', 'Muhasebe GÃ¶rÃ¼ntÃ¼leme', 'Yevmiye defterini gÃ¶rÃ¼ntÃ¼leme', 'ACCOUNTING', 'READ', TRUE),
('ACCOUNTING_CREATE', 'FiÅŸ OluÅŸturma', 'Yeni yevmiye fiÅŸi oluÅŸturma', 'ACCOUNTING', 'CREATE', TRUE),
('ACCOUNTING_EDIT', 'FiÅŸ DÃ¼zenleme', 'Taslak fiÅŸleri dÃ¼zenleme', 'ACCOUNTING', 'UPDATE', TRUE),
('ACCOUNTING_DELETE', 'FiÅŸ Silme', 'Taslak fiÅŸleri silme', 'ACCOUNTING', 'DELETE', TRUE),
('ACCOUNTING_APPROVE', 'FiÅŸ Onaylama', 'FiÅŸleri onaylama yetkisi', 'ACCOUNTING', 'APPROVE', TRUE),
('ACCOUNTING_CANCEL', 'FiÅŸ Ä°ptal', 'OnaylanmÄ±ÅŸ fiÅŸi iptal etme', 'ACCOUNTING', 'CANCEL', TRUE),
('ACCOUNTING_REPORTS', 'Mali Raporlar', 'Mali raporlarÄ± gÃ¶rÃ¼ntÃ¼leme', 'ACCOUNTING', 'READ', TRUE)
ON CONFLICT (code) DO NOTHING;

-- WORKFLOW MODULE PERMISSIONS
INSERT INTO permissions (code, name, description, module, category, is_system) VALUES
('WORKFLOW_VIEW', 'Workflow GÃ¶rÃ¼ntÃ¼leme', 'Workflow\'larÄ± gÃ¶rÃ¼ntÃ¼leme', 'WORKFLOW', 'READ', TRUE),
('WORKFLOW_CREATE', 'Workflow OluÅŸturma', 'Yeni workflow oluÅŸturma', 'WORKFLOW', 'CREATE', TRUE),
('WORKFLOW_EDIT', 'Workflow DÃ¼zenleme', 'Workflow dÃ¼zenleme', 'WORKFLOW', 'UPDATE', TRUE),
('WORKFLOW_DELETE', 'Workflow Silme', 'Workflow silme', 'WORKFLOW', 'DELETE', TRUE),
('WORKFLOW_ACTIVATE', 'Workflow AktifleÅŸtirme', 'Workflow\'u aktif/pasif yapma', 'WORKFLOW', 'UPDATE', TRUE),
('WORKFLOW_EXECUTE', 'Workflow Ã‡alÄ±ÅŸtÄ±rma', 'Manuel workflow tetikleme', 'WORKFLOW', 'EXECUTE', TRUE)
ON CONFLICT (code) DO NOTHING;

-- INVENTORY MODULE PERMISSIONS
INSERT INTO permissions (code, name, description, module, category, is_system) VALUES
('INVENTORY_VIEW', 'Stok GÃ¶rÃ¼ntÃ¼leme', 'Stok listesini gÃ¶rÃ¼ntÃ¼leme', 'INVENTORY', 'READ', TRUE),
('INVENTORY_CREATE', 'ÃœrÃ¼n Ekleme', 'Yeni Ã¼rÃ¼n ekleme', 'INVENTORY', 'CREATE', TRUE),
('INVENTORY_EDIT', 'ÃœrÃ¼n DÃ¼zenleme', 'ÃœrÃ¼n bilgilerini dÃ¼zenleme', 'INVENTORY', 'UPDATE', TRUE),
('INVENTORY_DELETE', 'ÃœrÃ¼n Silme', 'ÃœrÃ¼n silme', 'INVENTORY', 'DELETE', TRUE),
('INVENTORY_ADJUST', 'Stok DÃ¼zeltme', 'Stok miktarÄ±nÄ± dÃ¼zeltme', 'INVENTORY', 'UPDATE', TRUE),
('INVENTORY_TRANSFER', 'Stok Transfer', 'MaÄŸazalar arasÄ± stok transfer', 'INVENTORY', 'UPDATE', TRUE)
ON CONFLICT (code) DO NOTHING;

-- USER MANAGEMENT PERMISSIONS
INSERT INTO permissions (code, name, description, module, category, is_system) VALUES
('USER_VIEW', 'KullanÄ±cÄ± GÃ¶rÃ¼ntÃ¼leme', 'KullanÄ±cÄ± listesini gÃ¶rÃ¼ntÃ¼leme', 'USERS', 'READ', TRUE),
('USER_CREATE', 'KullanÄ±cÄ± Ekleme', 'Yeni kullanÄ±cÄ± ekleme', 'USERS', 'CREATE', TRUE),
('USER_EDIT', 'KullanÄ±cÄ± DÃ¼zenleme', 'KullanÄ±cÄ± bilgilerini dÃ¼zenleme', 'USERS', 'UPDATE', TRUE),
('USER_DELETE', 'KullanÄ±cÄ± Silme', 'KullanÄ±cÄ± silme', 'USERS', 'DELETE', TRUE),
('USER_ASSIGN_ROLE', 'Rol Atama', 'KullanÄ±cÄ±ya rol atama', 'USERS', 'UPDATE', TRUE),
('USER_ASSIGN_PERMISSION', 'Ä°zin Atama', 'KullanÄ±cÄ±ya Ã¶zel izin atama', 'USERS', 'UPDATE', TRUE)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- INSERT DEFAULT ROLES
-- ============================================================================

INSERT INTO roles (code, name, description, level, is_system, is_active) VALUES
('SUPER_ADMIN', 'SÃ¼per Admin', 'TÃ¼m yetkilere sahip sistem yÃ¶neticisi', 100, TRUE, TRUE),
('IT_ADMIN', 'IT Admin', 'Teknik yÃ¶netim ve sistem konfigÃ¼rasyonu', 90, TRUE, TRUE),
('COMPANY_OWNER', 'Åirket Sahibi', 'Åirket sahibi - tÃ¼m raporlar ve onaylar', 80, TRUE, TRUE),
('GENERAL_MANAGER', 'Genel MÃ¼dÃ¼r', 'Genel mÃ¼dÃ¼r - tÃ¼m maÄŸaza yetkileri', 70, TRUE, TRUE),
('STORE_MANAGER', 'MaÄŸaza MÃ¼dÃ¼rÃ¼', 'MaÄŸaza mÃ¼dÃ¼rÃ¼ - tek maÄŸaza yetkileri', 60, TRUE, TRUE),
('ACCOUNTANT', 'Muhasebeci', 'Muhasebe iÅŸlemleri', 50, TRUE, TRUE),
('CASHIER_SENIOR', 'KÄ±demli Kasiyer', 'GeliÅŸmiÅŸ kasiyer yetkileri', 40, TRUE, TRUE),
('CASHIER', 'Kasiyer', 'Temel satÄ±ÅŸ yetkileri', 30, TRUE, TRUE),
('WAREHOUSE_MANAGER', 'Depo YÃ¶neticisi', 'Depo ve stok yÃ¶netimi', 50, TRUE, TRUE),
('SALES_REP', 'SatÄ±ÅŸ Temsilcisi', 'Saha satÄ±ÅŸ yetkileri', 35, TRUE, TRUE),
('VIEWER', 'Ä°zleyici', 'Sadece gÃ¶rÃ¼ntÃ¼leme yetkisi', 10, TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- ASSIGN PERMISSIONS TO ROLES
-- ============================================================================

-- SUPER_ADMIN: ALL PERMISSIONS
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

-- CASHIER: Basic sales permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'CASHIER'
  AND p.code IN (
    'SALE_VIEW', 'SALE_CREATE', 
    'SALE_DISCOUNT_MAX_10',
    'SALE_REPORT_OWN',
    'INVENTORY_VIEW'
  )
ON CONFLICT DO NOTHING;

-- CASHIER_SENIOR: Enhanced sales permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'CASHIER_SENIOR'
  AND p.code IN (
    'SALE_VIEW', 'SALE_CREATE', 'SALE_EDIT', 'SALE_VOID',
    'SALE_DISCOUNT_MAX_25', 'SALE_DISCOUNT_GENERAL',
    'SALE_CREDIT', 'SALE_MULTIPLE_PAYMENT',
    'SALE_REPORT_OWN',
    'INVENTORY_VIEW'
  )
ON CONFLICT DO NOTHING;

-- STORE_MANAGER: Store-level permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'STORE_MANAGER'
  AND p.code IN (
    'SALE_VIEW', 'SALE_CREATE', 'SALE_EDIT', 'SALE_DELETE',
    'SALE_APPROVE', 'SALE_CANCEL', 'SALE_VOID',
    'SALE_VIEW_COST', 'SALE_DISCOUNT_UNLIMITED',
    'SALE_CHANGE_PRICE', 'SALE_CREDIT', 'SALE_MULTIPLE_PAYMENT',
    'SALE_REPORT_STORE',
    'INVENTORY_VIEW', 'INVENTORY_CREATE', 'INVENTORY_EDIT', 'INVENTORY_ADJUST',
    'USER_VIEW', 'USER_CREATE', 'USER_EDIT'
  )
ON CONFLICT DO NOTHING;

-- ACCOUNTANT: Accounting permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'ACCOUNTANT'
  AND p.code IN (
    'ACCOUNTING_VIEW', 'ACCOUNTING_CREATE', 'ACCOUNTING_EDIT', 
    'ACCOUNTING_APPROVE', 'ACCOUNTING_REPORTS',
    'SALE_VIEW', 'SALE_REPORT_ALL'
  )
ON CONFLICT DO NOTHING;

-- WAREHOUSE_MANAGER: Inventory permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'WAREHOUSE_MANAGER'
  AND p.code IN (
    'INVENTORY_VIEW', 'INVENTORY_CREATE', 'INVENTORY_EDIT', 'INVENTORY_DELETE',
    'INVENTORY_ADJUST', 'INVENTORY_TRANSFER',
    'SALE_VIEW'
  )
ON CONFLICT DO NOTHING;

-- VIEWER: Read-only permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'VIEWER'
  AND p.code IN (
    'SALE_VIEW', 'SALE_REPORT_OWN',
    'INVENTORY_VIEW',
    'ACCOUNTING_VIEW'
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- INSERT PERMISSION GROUPS (Logo ERP style hierarchy)
-- ============================================================================

INSERT INTO permission_groups (code, name, description, parent_id, display_order) VALUES
('SALES_MODULE', 'SatÄ±ÅŸ ModÃ¼lÃ¼', 'TÃ¼m satÄ±ÅŸ iÅŸlemleri', NULL, 1),
('SALES_BASIC', 'Temel SatÄ±ÅŸ Ä°ÅŸlemleri', 'CRUD iÅŸlemleri', (SELECT id FROM permission_groups WHERE code = 'SALES_MODULE'), 1),
('SALES_ADVANCED', 'GeliÅŸmiÅŸ SatÄ±ÅŸ Ä°ÅŸlemleri', 'Onay, iptal, iade', (SELECT id FROM permission_groups WHERE code = 'SALES_MODULE'), 2),
('SALES_PRICING', 'FiyatlandÄ±rma ve Ä°ndirim', 'Fiyat deÄŸiÅŸtirme ve indirimler', (SELECT id FROM permission_groups WHERE code = 'SALES_MODULE'), 3),
('SALES_REPORTS', 'SatÄ±ÅŸ RaporlarÄ±', 'Raporlama yetkileri', (SELECT id FROM permission_groups WHERE code = 'SALES_MODULE'), 4)
ON CONFLICT (code) DO NOTHING;

-- Assign permissions to groups
INSERT INTO permission_group_items (group_id, permission_id, display_order)
SELECT g.id, p.id, 
  CASE p.code
    WHEN 'SALE_VIEW' THEN 1
    WHEN 'SALE_CREATE' THEN 2
    WHEN 'SALE_EDIT' THEN 3
    WHEN 'SALE_DELETE' THEN 4
  END
FROM permission_groups g
CROSS JOIN permissions p
WHERE g.code = 'SALES_BASIC'
  AND p.code IN ('SALE_VIEW', 'SALE_CREATE', 'SALE_EDIT', 'SALE_DELETE')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Check if user has permission
CREATE OR REPLACE FUNCTION check_permission(
    p_user_id BIGINT,
    p_permission_code VARCHAR,
    p_store_id BIGINT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_has_permission BOOLEAN := FALSE;
BEGIN
    -- Check direct user permission (override)
    SELECT EXISTS (
        SELECT 1 FROM user_permissions up
        JOIN permissions p ON p.id = up.permission_id
        WHERE up.user_id = p_user_id
          AND p.code = p_permission_code
          AND up.granted = TRUE
          AND up.is_active = TRUE
          AND (up.store_id IS NULL OR up.store_id = p_store_id)
          AND (up.valid_from IS NULL OR up.valid_from <= NOW())
          AND (up.valid_until IS NULL OR up.valid_until > NOW())
    ) INTO v_has_permission;
    
    IF v_has_permission THEN
        RETURN TRUE;
    END IF;
    
    -- Check if explicitly denied
    SELECT EXISTS (
        SELECT 1 FROM user_permissions up
        JOIN permissions p ON p.id = up.permission_id
        WHERE up.user_id = p_user_id
          AND p.code = p_permission_code
          AND up.granted = FALSE
          AND (up.store_id IS NULL OR up.store_id = p_store_id)
    ) INTO v_has_permission;
    
    IF v_has_permission THEN
        RETURN FALSE;
    END IF;
    
    -- Check role permissions
    SELECT EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN role_permissions rp ON rp.role_id = ur.role_id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = p_user_id
          AND p.code = p_permission_code
          AND ur.is_active = TRUE
          AND (ur.store_id IS NULL OR ur.store_id = p_store_id)
          AND (ur.valid_from IS NULL OR ur.valid_from <= NOW())
          AND (ur.valid_until IS NULL OR ur.valid_until > NOW())
    ) INTO v_has_permission;
    
    RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all permissions for a user
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id BIGINT)
RETURNS TABLE(
    permission_code VARCHAR,
    permission_name VARCHAR,
    module VARCHAR,
    source VARCHAR  -- 'ROLE' or 'DIRECT'
) AS $$
BEGIN
    RETURN QUERY
    -- From roles
    SELECT DISTINCT
        p.code,
        p.name,
        p.module,
        'ROLE'::VARCHAR as source
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = p_user_id
      AND ur.is_active = TRUE
      AND (ur.valid_from IS NULL OR ur.valid_from <= NOW())
      AND (ur.valid_until IS NULL OR ur.valid_until > NOW())
    
    UNION
    
    -- From direct permissions (granted)
    SELECT DISTINCT
        p.code,
        p.name,
        p.module,
        'DIRECT'::VARCHAR as source
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = p_user_id
      AND up.granted = TRUE
      AND (up.valid_from IS NULL OR up.valid_from <= NOW())
      AND (up.valid_until IS NULL OR up.valid_until > NOW())
    
    -- Exclude explicitly denied permissions
    EXCEPT
    
    SELECT
        p.code,
        p.name,
        p.module,
        'DENIED'::VARCHAR
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = p_user_id
      AND up.granted = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log authorization check
CREATE OR REPLACE FUNCTION log_authorization(
    p_user_id BIGINT,
    p_permission_code VARCHAR,
    p_action VARCHAR,
    p_result BOOLEAN,
    p_resource_type VARCHAR DEFAULT NULL,
    p_resource_id BIGINT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO authorization_log (
        user_id, permission_code, action, result,
        resource_type, resource_id, reason
    ) VALUES (
        p_user_id, p_permission_code, p_action, p_result,
        p_resource_type, p_resource_id, p_reason
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- User permissions summary
CREATE OR REPLACE VIEW v_user_permissions_summary AS
SELECT 
    ur.user_id,
    r.name as role_name,
    r.level as role_level,
    COUNT(DISTINCT rp.permission_id) as permissions_count,
    STRING_AGG(DISTINCT p.module, ', ') as modules
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
LEFT JOIN role_permissions rp ON rp.role_id = r.id
LEFT JOIN permissions p ON p.id = rp.permission_id
WHERE ur.is_active = TRUE
GROUP BY ur.user_id, r.name, r.level;

-- Role permissions detail
CREATE OR REPLACE VIEW v_role_permissions_detail AS
SELECT 
    r.id as role_id,
    r.code as role_code,
    r.name as role_name,
    r.level as role_level,
    p.id as permission_id,
    p.code as permission_code,
    p.name as permission_name,
    p.module,
    p.category,
    rp.granted_at
FROM roles r
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.is_active = TRUE
ORDER BY r.level DESC, p.module, p.category;

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission ON user_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_permissions_code ON permissions(code);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);

-- ============================================================================
-- RLS POLICIES (Optional - enable if using Supabase Auth)
-- ============================================================================

-- Enable RLS
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own permissions
CREATE POLICY "Users can view their own permissions"
ON user_permissions FOR SELECT
USING (auth.uid()::BIGINT = user_id);

-- Only admins can modify permissions
CREATE POLICY "Admins can manage permissions"
ON permissions FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid()::BIGINT
          AND r.code IN ('SUPER_ADMIN', 'IT_ADMIN')
          AND ur.is_active = TRUE
    )
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE permissions IS 'System-wide permissions catalog';
COMMENT ON TABLE roles IS 'User roles with hierarchy levels';
COMMENT ON TABLE role_permissions IS 'Permissions assigned to roles';
COMMENT ON TABLE user_roles IS 'Roles assigned to users';
COMMENT ON TABLE user_permissions IS 'Direct user permissions (overrides role permissions)';
COMMENT ON TABLE authorization_log IS 'Audit log for all authorization checks';

COMMENT ON FUNCTION check_permission IS 'Check if user has a specific permission';
COMMENT ON FUNCTION get_user_permissions IS 'Get all effective permissions for a user';
COMMENT ON FUNCTION log_authorization IS 'Log an authorization check or action';

-- ============================================================================
-- SAMPLE DATA (for testing)
-- ============================================================================

-- Create a sample user_role assignment (adjust user_id as needed)
-- INSERT INTO user_roles (user_id, role_id) 
-- SELECT 1, id FROM roles WHERE code = 'CASHIER';

COMMENT ON MIGRATION IS 'Authorization module with granular permissions (Logo ERP style)';

