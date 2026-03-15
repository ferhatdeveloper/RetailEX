-- ============================================================================
-- Migration 007: Add currency columns to firms table
-- ----------------------------------------------------------------------------
-- Adds ana_para_birimi (local/functional currency) and raporlama_para_birimi
-- (reporting currency) to the firms table.
-- ============================================================================

ALTER TABLE firms ADD COLUMN IF NOT EXISTS ana_para_birimi VARCHAR(10) DEFAULT 'IQD';
ALTER TABLE firms ADD COLUMN IF NOT EXISTS raporlama_para_birimi VARCHAR(10) DEFAULT 'IQD';
