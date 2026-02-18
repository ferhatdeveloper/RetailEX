-- Mark migrations as applied
INSERT INTO sys_migrations (version, name, app_version) VALUES 
('043', '043_fix_cash_transactions_schema.sql', '0.1.20'),
('044', '044_fix_sync_trigger_firm_context.sql', '0.1.20')
ON CONFLICT (name) DO NOTHING;

-- Clean up test data
DELETE FROM rex_009_01_cash_lines 
WHERE amount = 50000 
  AND transaction_type = 'CH_TAHSILAT' 
  AND date = '2026-02-17'::date;
