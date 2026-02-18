-- ============================================================================
-- Database Cleanup Script
-- ============================================================================
-- This script removes old migration records that no longer have corresponding files
-- Run this if you're getting errors about missing migration files like 004_demo_data.sql

-- Option 1: Remove specific old migration record
DELETE FROM sys_migrations WHERE name = '004_demo_data.sql';

-- Option 2: Reset ALL migrations (use with caution - will re-run all migrations)
-- TRUNCATE TABLE sys_migrations;

-- Option 3: View all migration records to see what's registered
SELECT * FROM sys_migrations ORDER BY version;
