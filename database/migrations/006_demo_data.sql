-- ============================================================================
-- RetailEX - COMPREHENSIVE DEMO DATA (v1.0)
-- ----------------------------------------------------------------------------
-- Sample data for testing and demonstration purposes
-- Includes: Products, Customers, Sales, Cash Transactions
-- ============================================================================

-- ============================================================================
-- 1. DEMO CATEGORIES
-- ============================================================================

INSERT INTO categories (code, name, parent_id, is_active) VALUES
  ('ELEC', 'Elektronik', NULL, true),
  ('ELEC-PHONE', 'Telefonlar', (SELECT id FROM categories WHERE code = 'ELEC'), true),
  ('ELEC-LAPTOP', 'Bilgisayarlar', (SELECT id FROM categories WHERE code = 'ELEC'), true),
  ('FOOD', 'Gıda', NULL, true),
  ('FOOD-SNACK', 'Atıştırmalıklar', (SELECT id FROM categories WHERE code = 'FOOD'), true),
  ('CLOTH', 'Giyim', NULL, true),
  ('CLOTH-MEN', 'Erkek Giyim', (SELECT id FROM categories WHERE code = 'CLOTH'), true),
  ('CLOTH-WOMEN', 'Kadın Giyim', (SELECT id FROM categories WHERE code = 'CLOTH'), true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. DEMO PRODUCTS (REX_XXX_PRODUCTS)
-- ============================================================================

-- Dynamically get the first firm code from sys_firms
DO $$
DECLARE
    v_firm_code VARCHAR(3);
    v_period_code VARCHAR(2);
    v_full_firm_code VARCHAR(10);
BEGIN
    -- Get the first active firm
    SELECT firm_nr INTO v_firm_code FROM sys_firms WHERE is_active = true ORDER BY firm_nr LIMIT 1;
    
    IF v_firm_code IS NULL THEN
        RAISE EXCEPTION 'No active firm found. Please create a firm first.';
    END IF;
    
    -- Get the first active period for this firm
    SELECT period_nr INTO v_period_code FROM sys_periods WHERE firm_nr = v_firm_code AND is_active = true ORDER BY period_nr LIMIT 1;
    
    IF v_period_code IS NULL THEN
        RAISE EXCEPTION 'No active period found for firm %. Please create a period first.', v_firm_code;
    END IF;
    
    v_full_firm_code := v_firm_code || '_' || v_period_code;
    
    RAISE NOTICE 'Loading demo data for firm: % (period: %)', v_firm_code, v_period_code;
    
    -- Ensure firm tables exist
    PERFORM create_firm_tables(v_firm_code);
    PERFORM create_period_tables(v_firm_code, v_period_code);
    
    -- Insert demo products dynamically
    EXECUTE format('
        INSERT INTO rex_%s_products (code, name, name2, category_id, vat_rate, price, stock, is_active) VALUES
          (''PHONE-001'', ''iPhone 15 Pro'', ''256GB Titanyum'', (SELECT id FROM categories WHERE code = ''ELEC-PHONE''), 20, 45000.00, 15, true),
          (''PHONE-002'', ''Samsung Galaxy S24'', ''512GB Siyah'', (SELECT id FROM categories WHERE code = ''ELEC-PHONE''), 20, 38000.00, 22, true),
          (''PHONE-003'', ''Xiaomi 14 Pro'', ''256GB Beyaz'', (SELECT id FROM categories WHERE code = ''ELEC-PHONE''), 20, 25000.00, 30, true),
          (''LAPTOP-001'', ''MacBook Pro 16"'', ''M3 Max 64GB RAM'', (SELECT id FROM categories WHERE code = ''ELEC-LAPTOP''), 20, 95000.00, 8, true),
          (''LAPTOP-002'', ''Dell XPS 15'', ''i9 32GB RAM RTX 4060'', (SELECT id FROM categories WHERE code = ''ELEC-LAPTOP''), 20, 55000.00, 12, true),
          (''LAPTOP-003'', ''Lenovo ThinkPad X1'', ''i7 16GB RAM'', (SELECT id FROM categories WHERE code = ''ELEC-LAPTOP''), 20, 42000.00, 18, true),
          (''SNACK-001'', ''Çikolata Bar'', ''Sütlü Çikolata 80g'', (SELECT id FROM categories WHERE code = ''FOOD-SNACK''), 10, 15.00, 500, true),
          (''SNACK-002'', ''Cips'', ''Klasik Tuzlu 150g'', (SELECT id FROM categories WHERE code = ''FOOD-SNACK''), 10, 12.50, 350, true),
          (''SNACK-003'', ''Bisküvi Paketi'', ''Çikolatalı 200g'', (SELECT id FROM categories WHERE code = ''FOOD-SNACK''), 10, 25.00, 280, true),
          (''CLOTH-M-001'', ''Erkek Gömlek'', ''Beyaz Klasik L'', (SELECT id FROM categories WHERE code = ''CLOTH-MEN''), 10, 450.00, 45, true),
          (''CLOTH-M-002'', ''Erkek Pantolon'', ''Lacivert Kumaş 32'', (SELECT id FROM categories WHERE code = ''CLOTH-MEN''), 10, 650.00, 38, true),
          (''CLOTH-W-001'', ''Kadın Bluz'', ''Pembe Şifon M'', (SELECT id FROM categories WHERE code = ''CLOTH-WOMEN''), 10, 380.00, 52, true),
          (''CLOTH-W-002'', ''Kadın Etek'', ''Siyah Kalem S'', (SELECT id FROM categories WHERE code = ''CLOTH-WOMEN''), 10, 420.00, 41, true)
        ON CONFLICT (code) DO NOTHING
    ', v_firm_code);


-- ============================================================================
-- 3. DEMO CUSTOMERS (REX_001_CUSTOMERS)
-- ============================================================================

INSERT INTO rex_001_customers (code, name, tax_nr, tax_office, address, city, phone, email, balance, is_active) VALUES
  ('CUST-001', 'Ahmet Yılmaz', '1234567890', 'Kadıköy VD', 'Bağdat Cad. No:123 Kadıköy', 'İstanbul', '0532 111 2233', 'ahmet.yilmaz@example.com', 0, true),
  ('CUST-002', 'Ayşe Demir', '2345678901', 'Beşiktaş VD', 'Barbaros Blv. No:45 Beşiktaş', 'İstanbul', '0533 222 3344', 'ayse.demir@example.com', 0, true),
  ('CUST-003', 'Mehmet Kaya', '3456789012', 'Çankaya VD', 'Atatürk Blv. No:78 Çankaya', 'Ankara', '0534 333 4455', 'mehmet.kaya@example.com', 0, true),
  ('CUST-004', 'Fatma Şahin', '4567890123', 'Konak VD', 'Cumhuriyet Blv. No:234 Konak', 'İzmir', '0535 444 5566', 'fatma.sahin@example.com', 0, true),
  ('CUST-005', 'Ali Özdemir', '5678901234', 'Yenişehir VD', 'Gazi Blv. No:56 Yenişehir', 'Bursa', '0536 555 6677', 'ali.ozdemir@example.com', 0, true),
  
  -- Corporate Customers
  ('CORP-001', 'ABC Teknoloji A.Ş.', '9876543210', 'Maslak VD', 'Büyükdere Cad. No:100 Maslak', 'İstanbul', '0212 111 2233', 'info@abcteknoloji.com', 0, true),
  ('CORP-002', 'XYZ Perakende Ltd.', '8765432109', 'Mecidiyeköy VD', 'Şişli Plaza Kat:5 Mecidiyeköy', 'İstanbul', '0212 222 3344', 'info@xyzperakende.com', 0, true),
  ('CORP-003', 'DEF Giyim San. Tic.', '7654321098', 'Osmanbey VD', 'Halaskargazi Cad. No:234', 'İstanbul', '0212 333 4455', 'info@defgiyim.com', 0, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 4. DEMO SALES (REX_001_01_SALES)
-- ============================================================================

-- Sample Sale 1: Phone Sale
INSERT INTO rex_001_01_sales (fiche_no, date, customer_ref, total_net, total_vat, total_gross, is_cancelled)
VALUES (
  'SAT-2026-0001',
  '2026-02-01 10:30:00',
  (SELECT ref_id FROM rex_001_customers WHERE code = 'CUST-001'),
  45000.00,
  9000.00,
  54000.00,
  false
) ON CONFLICT (fiche_no) DO NOTHING;

-- Sample Sale 2: Laptop Sale
INSERT INTO rex_001_01_sales (fiche_no, date, customer_ref, total_net, total_vat, total_gross, is_cancelled)
VALUES (
  'SAT-2026-0002',
  '2026-02-02 14:15:00',
  (SELECT ref_id FROM rex_001_customers WHERE code = 'CORP-001'),
  95000.00,
  19000.00,
  114000.00,
  false
) ON CONFLICT (fiche_no) DO NOTHING;

-- Sample Sale 3: Mixed Sale
INSERT INTO rex_001_01_sales (fiche_no, date, customer_ref, total_net, total_vat, total_gross, is_cancelled)
VALUES (
  'SAT-2026-0003',
  '2026-02-03 16:45:00',
  (SELECT ref_id FROM rex_001_customers WHERE code = 'CUST-002'),
  1520.00,
  304.00,
  1824.00,
  false
) ON CONFLICT (fiche_no) DO NOTHING;

-- ============================================================================
-- 5. DEMO SALE ITEMS (REX_001_01_SALE_ITEMS)
-- ============================================================================

-- Sale 1 Lines
INSERT INTO rex_001_01_sale_items (sale_ref, product_ref, amount, price, vat_rate, total_net, total_vat, total_gross)
VALUES (
  (SELECT id FROM rex_001_01_sales WHERE fiche_no = 'SAT-2026-0001'),
  (SELECT ref_id FROM rex_001_products WHERE code = 'PHONE-001'),
  1,
  45000.00,
  20,
  45000.00,
  9000.00,
  54000.00
);

-- Sale 2 Lines
INSERT INTO rex_001_01_sale_items (sale_ref, product_ref, amount, price, vat_rate, total_net, total_vat, total_gross)
VALUES (
  (SELECT id FROM rex_001_01_sales WHERE fiche_no = 'SAT-2026-0002'),
  (SELECT ref_id FROM rex_001_products WHERE code = 'LAPTOP-001'),
  1,
  95000.00,
  20,
  95000.00,
  19000.00,
  114000.00
);

-- Sale 3 Lines (Multiple items)
INSERT INTO rex_001_01_sale_items (sale_ref, product_ref, amount, price, vat_rate, total_net, total_vat, total_gross)
VALUES 
  (
    (SELECT id FROM rex_001_01_sales WHERE fiche_no = 'SAT-2026-0003'),
    (SELECT ref_id FROM rex_001_products WHERE code = 'CLOTH-M-001'),
    2,
    450.00,
    10,
    900.00,
    90.00,
    990.00
  ),
  (
    (SELECT id FROM rex_001_01_sales WHERE fiche_no = 'SAT-2026-0003'),
    (SELECT ref_id FROM rex_001_products WHERE code = 'CLOTH-W-001'),
    1,
    380.00,
    10,
    380.00,
    38.00,
    418.00
  ),
  (
    (SELECT id FROM rex_001_01_sales WHERE fiche_no = 'SAT-2026-0003'),
    (SELECT ref_id FROM rex_001_products WHERE code = 'SNACK-001'),
    16,
    15.00,
    10,
    240.00,
    24.00,
    264.00
  ) ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5.1 DEMO VARIANTS & LOTS
-- ============================================================================

INSERT INTO rex_001_product_variants (product_id, variant_name, sku, barcode, attributes, price, stock) VALUES
  ((SELECT id FROM rex_001_products WHERE code = 'PHONE-001'), 'T-Silver 256GB', 'TSV-256', '888001', '{"color": "Silver", "size": "256GB"}', 45000.00, 5),
  ((SELECT id FROM rex_001_products WHERE code = 'PHONE-001'), 'T-Blue 256GB', 'TBL-256', '888002', '{"color": "Blue", "size": "256GB"}', 45000.00, 10),
  ((SELECT id FROM rex_001_products WHERE code = 'CLOTH-M-001'), 'Beyaz L', 'WHT-L', '999001', '{"color": "White", "size": "L"}', 450.00, 20),
  ((SELECT id FROM rex_001_products WHERE code = 'CLOTH-M-001'), 'Beyaz XL', 'WHT-XL', '999002', '{"color": "White", "size": "XL"}', 450.00, 25);

INSERT INTO rex_001_lots (product_id, variant_id, lot_no, expiration_date, quantity) VALUES
  ((SELECT id FROM rex_001_products WHERE code = 'SNACK-001'), NULL, 'LOT-001', '2027-01-01', 500),
  ((SELECT id FROM rex_001_products WHERE code = 'PHONE-001'), (SELECT id FROM rex_001_product_variants WHERE sku = 'TSV-256'), 'SN-1001', NULL, 5);

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

INSERT INTO rex_001_01_cash_lines (fiche_no, date, amount, trcode, definition) VALUES
  ('KAS-2026-0001', '2026-02-01 10:35:00', 54000.00, 11, 'iPhone 15 Pro Satış Tahsilatı'),
  ('KAS-2026-0002', '2026-02-02 14:20:00', 114000.00, 11, 'MacBook Pro Satış Tahsilatı'),
  ('KAS-2026-0003', '2026-02-03 16:50:00', 1824.00, 11, 'Karma Satış Tahsilatı'),
  ('KAS-2026-0004', '2026-02-05 09:00:00', -5000.00, 12, 'Kira Ödemesi'),
  ('KAS-2026-0005', '2026-02-06 11:30:00', -2500.00, 12, 'Elektrik Faturası')
ON CONFLICT (fiche_no) DO NOTHING;

-- ============================================================================
-- DEMO DATA SUMMARY
-- ============================================================================

DO $$
DECLARE
    v_products_count INTEGER;
    v_customers_count INTEGER;
    v_sales_count INTEGER;
    v_sale_items_count INTEGER;
    v_variants_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_products_count FROM rex_001_products;
    SELECT COUNT(*) INTO v_customers_count FROM rex_001_customers;
    SELECT COUNT(*) INTO v_sales_count FROM rex_001_01_sales;
    SELECT COUNT(*) INTO v_sale_items_count FROM rex_001_01_sale_items;
    SELECT COUNT(*) INTO v_variants_count FROM rex_001_product_variants;
    
    RAISE NOTICE '=== Demo Data Loaded Successfully ===';
    RAISE NOTICE 'Products: %', v_products_count;
    RAISE NOTICE 'Customers: %', v_customers_count;
    RAISE NOTICE 'Sales: %', v_sales_count;
    RAISE NOTICE 'Sale Items: %', v_sale_items_count;
    RAISE NOTICE 'Variants: %', v_variants_count;
    RAISE NOTICE 'Cash Transactions: 5';
END $$;
