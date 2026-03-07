-- ============================================================================
-- RetailEx - MASTER SEED & INITIALIZATION (v5.1 - ABSOLUTE PARITY)
-- ----------------------------------------------------------------------------
-- Standard reference data and initial bootstrap
-- ============================================================================

-- 1.0 CURRENCIES
INSERT INTO currencies (code, name, symbol, is_base_currency, sort_order) VALUES
('IQD', 'Iraqi Dinar', 'د.ع', true, 1),
('USD', 'US Dollar', '$', false, 2),
('TRY', 'Turkish Lira', '₺', false, 3),
('EUR', 'Euro', '€', false, 4)
ON CONFLICT (code) DO NOTHING;

-- 2.0 UNITS
INSERT INTO units (code, name) VALUES
('ADET', 'Adet'),
('KG', 'Kilogram'),
('LT', 'Litre'),
('MT', 'Metre'),
('PKT', 'Paket'),
('KOLI', 'Koli')
ON CONFLICT (code) DO NOTHING;

-- 3.0 CATEGORIES (Default)
INSERT INTO categories (code, name) VALUES
('GENEL', 'Genel Ürünler'),
('HIZMET', 'Hizmetler')
ON CONFLICT (code) DO NOTHING;

-- 4.0 REPORT TEMPLATES (Standard Modern Designs from 028)
INSERT INTO public.report_templates (name, description, category, content, is_default)
VALUES 
(
    'Modern Satış Faturası', 
    'Logo ERP standartlarında modern ve temiz bir fatura tasarımı.', 
    'fatura', 
    '{"pageSize": {"width": 210, "height": 297}, "components": []}', 
    true
),
(
    'Standart Ürün Etiketi (40x20mm)', 
    'Raf ve ürünler için standart barkodlu etiket.', 
    'etiket', 
    '{"pageSize": {"width": 40, "height": 20}, "components": []}', 
    true
) ON CONFLICT DO NOTHING;

-- 5.0 INITIAL FIRM BOOTSTRAP
----------------------------------------------------------------------------
-- This ensures the dynamic tables for the primary firm are created immediately.

SELECT CREATE_FIRM_TABLES('001');
SELECT CREATE_PERIOD_TABLES('001', '01');

-- Vertical Inits
SELECT INIT_RESTAURANT_FIRM_TABLES('001');
SELECT INIT_BEAUTY_FIRM_TABLES('001');
SELECT INIT_RESTAURANT_PERIOD_TABLES('001', '01');
SELECT INIT_BEAUTY_PERIOD_TABLES('001', '01');

-- Default Restaurant Prep Times
UPDATE public.products SET preparation_time = 15 WHERE category ilike '%Ana Yemek%' OR category ilike '%Main%';
UPDATE public.products SET preparation_time = 20 WHERE category ilike '%Izgara%' OR category ilike '%Grill%';
UPDATE public.products SET preparation_time = 7 WHERE category ilike '%Ara Sıcak%' OR category ilike '%Starter%';
UPDATE public.products SET preparation_time = 3 WHERE category ilike '%İçecek%' OR category ilike '%Drink%';

-- Success log
INSERT INTO public.audit_logs (firm_nr, table_name, record_id, action, new_data)
VALUES ('000', 'system', '00000000-0000-0000-0000-000000000000', 'CONSOLIDATION_V5', '{"status": "completed", "version": "5.1", "parity": "100%"}'::JSONB)
ON CONFLICT DO NOTHING;
