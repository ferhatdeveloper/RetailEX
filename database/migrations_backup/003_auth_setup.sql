-- ============================================================================
-- 003_auth_setup.sql
-- Setup auth schema and users
-- ============================================================================

-- Extensions required for auth
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create auth schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS auth;

-- Create auth.users table
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- We use implicit UUIDs provided in the insert
  email VARCHAR(255) UNIQUE,
  encrypted_password VARCHAR(255),
  raw_user_meta_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- AUTH.USERS - LOGIN KULLANICILARI
-- ============================================================================

-- ADMIN KULLANICI (Global Access)
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '10000000-0000-4000-a000-000000000001',
  'admin@retailex.com',
  crypt('admin', gen_salt('bf')),
  '{"username": "admin", "full_name": "System Administrator", "role": "admin"}'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = NOW();

-- KASİYER 1
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '10000000-0000-4000-a000-000000000002',
  'kasiyer1@retailex.com',
  crypt('123456', gen_salt('bf')),
  '{"username": "kasiyer1", "full_name": "Berken NAS", "role": "cashier", "firm_nr": "001", "store_id": "11111111-1111-4111-a111-111111111111"}'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = NOW();

-- KASİYER 2
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '10000000-0000-4000-a000-000000000003',
  'kasiyer2@retailex.com',
  crypt('123456', gen_salt('bf')),
  '{"username": "kasiyer2", "full_name": "Zeynep Algit", "role": "cashier", "firm_nr": "001", "store_id": "22222222-2222-4222-a222-222222222222"}'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = NOW();

-- MÜDÜR
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '10000000-0000-4000-a000-000000000004',
  'mudur@retailex.com',
  crypt('123456', gen_salt('bf')),
  '{"username": "mudur", "full_name": "Muhavza Ken", "role": "manager", "firm_nr": "001", "store_id": "11111111-1111-4111-a111-111111111111"}'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = NOW();
