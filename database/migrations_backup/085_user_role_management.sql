-- 085_user_role_management.sql
-- Role and User Management Schema

-- 1. Roles Table
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB DEFAULT '[]', -- List of permission IDs or complex matrix
    is_system_role BOOLEAN DEFAULT false,
    color VARCHAR(20) DEFAULT '#3B82F6',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users Table (Public schema for application usage)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) DEFAULT 'cashier', -- Legacy compatibility
    role_id UUID REFERENCES public.roles(id),
    store_id UUID REFERENCES public.stores(id),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. User Roles (Many-to-Many - Optional for higher complexity, but RoleManagement.tsx uses single role for now)
-- CREATE TABLE IF NOT EXISTS public.user_roles (
--     user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
--     role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
--     PRIMARY KEY (user_id, role_id)
-- );

-- 4. Initial Roles Seed
INSERT INTO public.roles (id, name, description, is_system_role, color, permissions) VALUES
('00000000-0000-0000-0000-000000000001', 'admin', 'Tam yetkili sistem yöneticisi', true, '#9333ea', '["*"]'),
('00000000-0000-0000-0000-000000000002', 'manager', 'Mağaza Müdürü', true, '#3B82F6', '["pos.*", "management.*", "reports.*"]'),
('00000000-0000-0000-0000-000000000003', 'cashier', 'Kasiyer - Satış Yetkisi', true, '#10B981', '["pos.view", "pos.sell"]'),
('00000000-0000-0000-0000-000000000004', 'stock', 'Stok ve Depo Sorumlusu', true, '#F59E0B', '["management.products", "reports.inventory"]')
ON CONFLICT (name) DO NOTHING;

-- 5. Default Admin User (If not exists in public.users)
INSERT INTO public.users (id, firm_nr, username, password_hash, full_name, email, role, role_id, is_active)
VALUES (
    '10000000-0000-4000-a000-000000000001', 
    '001', 
    'admin', 
    crypt('admin', gen_salt('bf')), 
    'System Administrator', 
    'admin@retailex.com', 
    'admin',
    '00000000-0000-0000-0000-000000000001',
    true
) ON CONFLICT (username) DO UPDATE SET 
    role_id = EXCLUDED.role_id,
    role = EXCLUDED.role;

-- 6. Triggers for updated_at
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
