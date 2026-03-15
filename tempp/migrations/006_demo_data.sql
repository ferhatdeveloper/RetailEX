-- ============================================================================
-- RetailEX - COMPREHENSIVE DEMO DATA (v5.2 - EXTREME PARITY)
-- ----------------------------------------------------------------------------
-- Sample data for testing and demonstration purposes
-- Updated for v5.2 "Extreme Parity" architecture
-- ============================================================================

-- ============================================================================
-- 1.0 DEMO BRANDS & GROUPS (System Global)
-- ============================================================================

INSERT INTO brands (code, name, is_active, description) VALUES
  ('APPLE', 'Apple', true, 'Apple Inc. Products'),
  ('SAMSUNG', 'Samsung', true, 'Samsung Electronics'),
  ('DELL', 'Dell', true, 'Dell Compute Solutions'),
  ('LENOVO', 'Lenovo', true, 'Lenovo Global'),
  ('NESTLE', 'Nestlé', true, 'Nestlé Food & Beverage'),
  ('NIKE', 'Nike', true, 'Nike Sporting Goods')
ON CONFLICT (code) DO NOTHING;

INSERT INTO product_groups (code, name, is_active, description) VALUES
  ('ELECTRONIC', 'Elektronik Ürünler', true, 'Tüm elektronik cihazlar'),
  ('FOOD-DRINK', 'Gıda ve İçecek', true, 'Tüketilebilir gıda ürünleri'),
  ('TEXTILE', 'Tekstil ve Giyim', true, 'Giyim ve kumaş ürünleri')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 1.1 DEMO CATEGORIES (System Global)
-- ============================================================================

INSERT INTO categories (id, code, name, parent_id, is_active) VALUES
  ('10000000-0000-0000-0000-000000000001', 'ELEC', 'Elektronik', NULL, true),
  ('10000000-0000-0000-0000-000000000002', 'ELEC-PHONE', 'Telefonlar', '10000000-0000-0000-0000-000000000001', true),
  ('10000000-0000-0000-0000-000000000003', 'ELEC-LAPTOP', 'Bilgisayarlar', '10000000-0000-0000-0000-000000000001', true),
  ('10000000-0000-0000-0000-000000000004', 'FOOD', 'Gıda', NULL, true),
  ('10000000-0000-0000-0000-000000000005', 'FOOD-SNACK', 'Atıştırmalıklar', '10000000-0000-0000-0000-000000000004', true),
  ('10000000-0000-0000-0000-000000000006', 'CLOTH', 'Giyim', NULL, true),
  ('10000000-0000-0000-0000-000000000007', 'CLOTH-MEN', 'Erkek Giyim', '10000000-0000-0000-0000-000000000006', true),
  ('10000000-0000-0000-0000-000000000008', 'CLOTH-WOMEN', 'Kadın Giyim', '10000000-0000-0000-0000-000000000006', true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. DEMO PRODUCTS (REX_001_PRODUCTS)
-- ============================================================================

INSERT INTO rex_001_products (firm_nr, code, name, name2, category_id, vat_rate, price, stock, is_active) VALUES
  ('001', 'PHONE-001', 'iPhone 15 Pro', '256GB Titanyum', (SELECT id FROM categories WHERE code = 'ELEC-PHONE'), 20, 45000.00, 15, true),
  ('001', 'PHONE-002', 'Samsung Galaxy S24', '512GB Siyah', (SELECT id FROM categories WHERE code = 'ELEC-PHONE'), 20, 38000.00, 22, true),
  ('001', 'PHONE-003', 'Xiaomi 14 Pro', '256GB Beyaz', (SELECT id FROM categories WHERE code = 'ELEC-PHONE'), 20, 25000.00, 30, true),
  ('001', 'LAPTOP-001', 'MacBook Pro 16"', 'M3 Max 64GB RAM', (SELECT id FROM categories WHERE code = 'ELEC-LAPTOP'), 20, 95000.00, 8, true),
  ('001', 'LAPTOP-002', 'Dell XPS 15', 'i9 32GB RAM RTX 4060', (SELECT id FROM categories WHERE code = 'ELEC-LAPTOP'), 20, 55000.00, 12, true),
  ('001', 'LAPTOP-003', 'Lenovo ThinkPad X1', 'i7 16GB RAM', (SELECT id FROM categories WHERE code = 'ELEC-LAPTOP'), 20, 42000.00, 18, true),
  ('001', 'SNACK-001', 'Çikolata Bar', 'Sütlü Çikolata 80g', (SELECT id FROM categories WHERE code = 'FOOD-SNACK'), 10, 15.00, 500, true),
  ('001', 'SNACK-002', 'Cips', 'Klasik Tuzlu 150g', (SELECT id FROM categories WHERE code = 'FOOD-SNACK'), 10, 12.50, 350, true),
  ('001', 'SNACK-003', 'Bisküvi Paketi', 'Çikolatalı 200g', (SELECT id FROM categories WHERE code = 'FOOD-SNACK'), 10, 25.00, 280, true),
  ('001', 'CLOTH-M-001', 'Erkek Gömlek', 'Beyaz Klasik L', (SELECT id FROM categories WHERE code = 'CLOTH-MEN'), 10, 450.00, 45, true),
  ('001', 'CLOTH-M-002', 'Erkek Pantolon', 'Lacivert Kumaş 32', (SELECT id FROM categories WHERE code = 'CLOTH-MEN'), 10, 650.00, 38, true),
  ('001', 'CLOTH-W-001', 'Kadın Bluz', 'Pembe Şifon M', (SELECT id FROM categories WHERE code = 'CLOTH-WOMEN'), 10, 380.00, 52, true),
  ('001', 'CLOTH-W-002', 'Kadın Etek', 'Siyah Kalem S', (SELECT id FROM categories WHERE code = 'CLOTH-WOMEN'), 10, 420.00, 41, true)
ON CONFLICT (code) DO NOTHING;


-- ============================================================================
-- 3. DEMO CUSTOMERS (REX_001_CUSTOMERS)
-- ============================================================================

INSERT INTO rex_001_customers (firm_nr, code, name, tax_nr, tax_office, address, city, phone, email, balance, is_active) VALUES
  ('001', 'CUST-001', 'Ahmet Yılmaz', '1234567890', 'Kadıköy VD', 'Bağdat Cad. No:123 Kadıköy', 'İstanbul', '0532 111 2233', 'ahmet.yilmaz@example.com', 0, true),
  ('001', 'CUST-002', 'Ayşe Demir', '2345678901', 'Beşiktaş VD', 'Barbaros Blv. No:45 Beşiktaş', 'İstanbul', '0533 222 3344', 'ayse.demir@example.com', 0, true),
  ('001', 'CUST-003', 'Mehmet Kaya', '3456789012', 'Çankaya VD', 'Atatürk Blv. No:78 Çankaya', 'Ankara', '0534 333 4455', 'mehmet.kaya@example.com', 0, true),
  ('001', 'CUST-004', 'Fatma Şahin', '4567890123', 'Konak VD', 'Cumhuriyet Blv. No:234 Konak', 'İzmir', '0535 444 5566', 'fatma.sahin@example.com', 0, true),
  ('001', 'CUST-005', 'Ali Özdemir', '5678901234', 'Yenişehir VD', 'Gazi Blv. No:56 Yenişehir', 'Bursa', '0536 555 6677', 'ali.ozdemir@example.com', 0, true),
  
  -- Corporate Customers
  ('001', 'CORP-001', 'ABC Teknoloji A.Ş.', '9876543210', 'Maslak VD', 'Büyükdere Cad. No:100 Maslak', 'İstanbul', '0212 111 2233', 'info@abcteknoloji.com', 0, true),
  ('001', 'CORP-002', 'XYZ Perakende Ltd.', '8765432109', 'Mecidiyeköy VD', 'Şişli Plaza Kat:5 Mecidiyeköy', 'İstanbul', '0212 222 3344', 'info@xyzperakende.com', 0, true),
  ('001', 'CORP-003', 'DEF Giyim San. Tic.', '7654321098', 'Osmanbey VD', 'Halaskargazi Cad. No:234', 'İstanbul', '0212 333 4455', 'info@defgiyim.com', 0, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 4. DEMO SALES (REX_001_01_SALES)
-- ============================================================================

-- Sample Sale 1: Phone Sale
INSERT INTO rex_001_01_sales (firm_nr, period_nr, fiche_no, date, customer_id, total_net, total_vat, total_gross, is_cancelled)
VALUES (
  '001',
  '01',
  'SAT-2026-0001',
  '2026-02-01 10:30:00',
  (SELECT id FROM rex_001_customers WHERE code = 'CUST-001'),
  45000.00,
  9000.00,
  54000.00,
  false
) ON CONFLICT (fiche_no) DO NOTHING;

-- Sample Sale 2: Laptop Sale
INSERT INTO rex_001_01_sales (firm_nr, period_nr, fiche_no, date, customer_id, total_net, total_vat, total_gross, is_cancelled)
VALUES (
  '001',
  '01',
  'SAT-2026-0002',
  '2026-02-02 14:15:00',
  (SELECT id FROM rex_001_customers WHERE code = 'CORP-001'),
  95000.00,
  19000.00,
  114000.00,
  false
) ON CONFLICT (fiche_no) DO NOTHING;

-- Sample Sale 3: Mixed Sale
INSERT INTO rex_001_01_sales (firm_nr, period_nr, fiche_no, date, customer_id, total_net, total_vat, total_gross, is_cancelled)
VALUES (
  '001',
  '01',
  'SAT-2026-0003',
  '2026-02-03 16:45:00',
  (SELECT id FROM rex_001_customers WHERE code = 'CUST-002'),
  1520.00,
  304.00,
  1824.00,
  false
) ON CONFLICT (fiche_no) DO NOTHING;

-- ============================================================================
-- 5. DEMO SALE ITEMS (REX_001_01_SALE_ITEMS)
-- ============================================================================

-- Sale Lines (guarded with EXISTS to prevent duplicates on re-run)
INSERT INTO rex_001_01_sale_items (firm_nr, period_nr, invoice_id, product_id, item_code, item_name, quantity, unit_price, vat_rate, net_amount, total_amount)
SELECT '001', '01', s.id, p.id, p.code, p.name, 1, 45000.00, 20, 45000.00, 45000.00
FROM rex_001_01_sales s, rex_001_products p
WHERE s.fiche_no = 'SAT-2026-0001' AND p.code = 'PHONE-001'
  AND NOT EXISTS (SELECT 1 FROM rex_001_01_sale_items WHERE invoice_id = s.id AND product_id = p.id);

INSERT INTO rex_001_01_sale_items (firm_nr, period_nr, invoice_id, product_id, item_code, item_name, quantity, unit_price, vat_rate, net_amount, total_amount)
SELECT '001', '01', s.id, p.id, p.code, p.name, 1, 95000.00, 20, 95000.00, 95000.00
FROM rex_001_01_sales s, rex_001_products p
WHERE s.fiche_no = 'SAT-2026-0002' AND p.code = 'LAPTOP-001'
  AND NOT EXISTS (SELECT 1 FROM rex_001_01_sale_items WHERE invoice_id = s.id AND product_id = p.id);

INSERT INTO rex_001_01_sale_items (firm_nr, period_nr, invoice_id, product_id, item_code, item_name, quantity, unit_price, vat_rate, net_amount, total_amount)
SELECT '001', '01', s.id, p.id, p.code, p.name, 2, 450.00, 10, 900.00, 900.00
FROM rex_001_01_sales s, rex_001_products p
WHERE s.fiche_no = 'SAT-2026-0003' AND p.code = 'CLOTH-M-001'
  AND NOT EXISTS (SELECT 1 FROM rex_001_01_sale_items WHERE invoice_id = s.id AND product_id = p.id);

INSERT INTO rex_001_01_sale_items (firm_nr, period_nr, invoice_id, product_id, item_code, item_name, quantity, unit_price, vat_rate, net_amount, total_amount)
SELECT '001', '01', s.id, p.id, p.code, p.name, 1, 380.00, 10, 380.00, 380.00
FROM rex_001_01_sales s, rex_001_products p
WHERE s.fiche_no = 'SAT-2026-0003' AND p.code = 'CLOTH-W-001'
  AND NOT EXISTS (SELECT 1 FROM rex_001_01_sale_items WHERE invoice_id = s.id AND product_id = p.id);

INSERT INTO rex_001_01_sale_items (firm_nr, period_nr, invoice_id, product_id, item_code, item_name, quantity, unit_price, vat_rate, net_amount, total_amount)
SELECT '001', '01', s.id, p.id, p.code, p.name, 16, 15.00, 10, 240.00, 240.00
FROM rex_001_01_sales s, rex_001_products p
WHERE s.fiche_no = 'SAT-2026-0003' AND p.code = 'SNACK-001'
  AND NOT EXISTS (SELECT 1 FROM rex_001_01_sale_items WHERE invoice_id = s.id AND product_id = p.id);

-- ============================================================================
-- 5.1 DEMO VARIANTS & LOTS
-- ============================================================================

-- Variants
INSERT INTO rex_001_product_variants (product_id, sku, attributes) VALUES
  ((SELECT id FROM rex_001_products WHERE code = 'PHONE-001'), 'TSV-256', '{"color": "Silver", "size": "256GB"}'),
  ((SELECT id FROM rex_001_products WHERE code = 'PHONE-001'), 'TBL-256', '{"color": "Blue", "size": "256GB"}'),
  ((SELECT id FROM rex_001_products WHERE code = 'CLOTH-M-001'), 'WHT-L', '{"color": "White", "size": "L"}'),
  ((SELECT id FROM rex_001_products WHERE code = 'CLOTH-M-001'), 'WHT-XL', '{"color": "White", "size": "XL"}')
ON CONFLICT (sku) DO NOTHING;

-- ============================================================================
-- 6. UPDATE STOCK QUANTITIES (Reflect sales)
-- ============================================================================

UPDATE rex_001_products SET stock = stock - 1 WHERE code = 'PHONE-001';
UPDATE rex_001_products SET stock = stock - 1 WHERE code = 'LAPTOP-001';
UPDATE rex_001_products SET stock = stock - 2 WHERE code = 'CLOTH-M-001';
UPDATE rex_001_products SET stock = stock - 1 WHERE code = 'CLOTH-W-001';
UPDATE rex_001_products SET stock = stock - 16 WHERE code = 'SNACK-001';

-- ============================================================================
-- 7. DEMO CASH TRANSACTIONS (REX_001_01_CASH_LINES)
-- ============================================================================

INSERT INTO rex_001_01_cash_lines (firm_nr, period_nr, fiche_no, date, amount, trcode, definition)
SELECT '001', '01', v.fiche_no, v.date::TIMESTAMPTZ, v.amount, v.trcode, v.definition
FROM (VALUES
  ('KAS-2026-0001', '2026-02-01 10:35:00', 54000.00,  11, 'iPhone 15 Pro Satış Tahsilatı'),
  ('KAS-2026-0002', '2026-02-02 14:20:00', 114000.00, 11, 'MacBook Pro Satış Tahsilatı'),
  ('KAS-2026-0003', '2026-02-03 16:50:00', 1824.00,   11, 'Karma Satış Tahsilatı'),
  ('KAS-2026-0004', '2026-02-05 09:00:00', -5000.00,  12, 'Kira Ödemesi'),
  ('KAS-2026-0005', '2026-02-06 11:30:00', -2500.00,  12, 'Elektrik Faturası')
) AS v(fiche_no, date, amount, trcode, definition)
WHERE NOT EXISTS (
    SELECT 1 FROM rex_001_01_cash_lines WHERE fiche_no = v.fiche_no
);

-- ============================================================================
-- DEMO DATA SUMMARY
-- ============================================================================

DO $$
DECLARE
    v_products_count INTEGER := 0;
    v_customers_count INTEGER := 0;
    v_sales_count INTEGER := 0;
BEGIN
    BEGIN SELECT COUNT(*) INTO v_products_count FROM rex_001_products; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN SELECT COUNT(*) INTO v_customers_count FROM rex_001_customers; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN SELECT COUNT(*) INTO v_sales_count FROM rex_001_01_sales; EXCEPTION WHEN OTHERS THEN NULL; END;

    RAISE NOTICE '=== Demo Data Loaded Successfully ===';
    RAISE NOTICE 'Products: %, Customers: %, Sales: %', v_products_count, v_customers_count, v_sales_count;
END $$;
