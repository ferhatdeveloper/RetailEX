-- ============================================================================
-- 004_auth_patch.sql
-- Force DEFAULT UUID on auth.users(id) for existing databases
-- NOTE: Renamed from 003_1_auth_patch.sql to ensure it runs AFTER 003_auth_setup.sql
-- ============================================================================

-- Ensure uuid-ossp is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Force DEFAULT uuid_generate_v4() on id column if it's missing the default
ALTER TABLE auth.users ALTER COLUMN id SET DEFAULT uuid_generate_v4();

-- Ensure raw_user_meta_data is JSONB
DO $$
BEGIN
    IF (SELECT data_type FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'raw_user_meta_data') = 'text' THEN
        ALTER TABLE auth.users ALTER COLUMN raw_user_meta_data TYPE JSONB USING raw_user_meta_data::jsonb;
    END IF;
END $$;
