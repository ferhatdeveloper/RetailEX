-- ============================================================================
-- Cleanup Script: Remove Menu System Migration Records
-- ============================================================================
-- This script removes the menu system migration from sys_migrations table
-- Run this if you've already run the menu system migration and want to remove it

-- Remove menu system migration records (both old and fixed versions)
DELETE FROM sys_migrations WHERE name IN ('015_menu_system.sql', '015_menu_system_fixed.sql');

-- Remove product seeding migration (has trigger issues with firm_nr field)
DELETE FROM sys_migrations WHERE name = '016_initial_product_seeding.sql';

-- Optionally, clear menu_items table if it was populated
-- TRUNCATE TABLE menu_items RESTART IDENTITY CASCADE;

-- Verify removal
SELECT * FROM sys_migrations WHERE name LIKE '%menu%';
