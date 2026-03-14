-- ============================================================================
-- RetailEX — DEMO DATA (v6.0)
-- ============================================================================
-- 000_master_schema.sql çalıştırıldıktan sonra bu dosyayı çalıştırın.
-- Tüm modüller için gerçekçi örnek veriler içerir.
-- Çalıştırma: psql -U postgres -d retailex_local -f 001_demo_data.sql
-- ============================================================================

-- ============================================================================
-- 1. GLOBAL DEMO MARKALARI & GRUPLAR
-- ============================================================================

INSERT INTO brands (code, name, description, is_active) VALUES
  ('APPLE',   'Apple',    'Apple Inc.',             true),
  ('SAMSUNG', 'Samsung',  'Samsung Electronics',    true),
  ('NESTLE',  'Nestlé',   'Nestlé Gıda',           true),
  ('COLA',    'Cola-Cola','İçecek Grubu',           true),
  ('LOREAL',  'L''Oréal', 'Güzellik & Bakım',      true),
  ('DELL',    'Dell',     'Dell Bilgisayar',        true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO product_groups (code, name, description, is_active) VALUES
  ('ELECTRONIC', 'Elektronik',       'Elektronik cihazlar',      true),
  ('FOOD',       'Gıda & İçecek',    'Tüm gıda ürünleri',       true),
  ('BEAUTY',     'Güzellik & Bakım', 'Kişisel bakım ürünleri',  true),
  ('TEXTILE',    'Tekstil',          'Giyim ve kumaş',           true),
  ('CLEANING',   'Temizlik',         'Temizlik ürünleri',        true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. DEMO KATEGORİLER (firma 001)
-- ============================================================================

INSERT INTO categories (id, code, name, parent_id, is_restaurant, is_active) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'ELEC',       'Elektronik',       NULL,                                        false, true),
  ('c0000001-0000-0000-0000-000000000002', 'ELEC-PHONE', 'Telefonlar',       'c0000001-0000-0000-0000-000000000001',      false, true),
  ('c0000001-0000-0000-0000-000000000003', 'ELEC-PC',    'Bilgisayarlar',    'c0000001-0000-0000-0000-000000000001',      false, true),
  ('c0000001-0000-0000-0000-000000000004', 'FOOD',       'Gıda',             NULL,                                        false, true),
  ('c0000001-0000-0000-0000-000000000005', 'FOOD-SNACK', 'Atıştırmalık',     'c0000001-0000-0000-0000-000000000004',      false, true),
  ('c0000001-0000-0000-0000-000000000006', 'FOOD-DRINK', 'İçecekler',        'c0000001-0000-0000-0000-000000000004',      false, true),
  ('c0000001-0000-0000-0000-000000000007', 'BEAUTY-CAT', 'Güzellik',         NULL,                                        false, true),
  ('c0000001-0000-0000-0000-000000000008', 'CLOTH',      'Giyim',            NULL,                                        false, true),
  -- Restaurant kategorileri
  ('c0000001-0000-0000-0000-000000000010', 'REST-ANA',   'Ana Yemekler',     NULL,                                        true,  true),
  ('c0000001-0000-0000-0000-000000000011', 'REST-ICECEK','İçecekler (Rest)', NULL,                                        true,  true),
  ('c0000001-0000-0000-0000-000000000012', 'REST-TATLI', 'Tatlılar',         NULL,                                        true,  true),
  ('c0000001-0000-0000-0000-000000000013', 'REST-FAST',  'Fast Food',        NULL,                                        true,  true)
ON CONFLICT (code) DO NOTHING;

-- Firma 001 kategorileri de eşitle
INSERT INTO rex_001_categories (code, name, parent_id, is_restaurant, is_active) VALUES
  ('ELEC',       'Elektronik',       NULL, false, true),
  ('ELEC-PHONE', 'Telefonlar',       (SELECT id FROM rex_001_categories WHERE code = 'ELEC'), false, true),
  ('ELEC-PC',    'Bilgisayarlar',    (SELECT id FROM rex_001_categories WHERE code = 'ELEC'), false, true),
  ('FOOD',       'Gıda',             NULL, false, true),
  ('FOOD-SNACK', 'Atıştırmalık',     (SELECT id FROM rex_001_categories WHERE code = 'FOOD'), false, true),
  ('FOOD-DRINK', 'İçecekler',        (SELECT id FROM rex_001_categories WHERE code = 'FOOD'), false, true),
  ('BEAUTY-P',   'Güzellik Ürünleri',NULL, false, true),
  ('CLOTH',      'Giyim',            NULL, false, true),
  ('REST-ANA',   'Ana Yemekler',     NULL, true,  true),
  ('REST-ICECEK','İçecekler',        NULL, true,  true),
  ('REST-TATLI', 'Tatlılar',         NULL, true,  true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 3. BİRİM SETLERİ GÜNCELLE (isimler ile)
-- ============================================================================
-- is_active ekle ve birim satırlarına name/code kolonlarını doldur

UPDATE rex_001_unitsets SET is_active = true WHERE is_active IS NULL;

UPDATE rex_001_unitsetl SET
  code = item_code,
  name = CASE item_code
    WHEN 'ADET' THEN 'Adet'
    WHEN 'KG'   THEN 'Kilogram'
    WHEN 'GRAM' THEN 'Gram'
    WHEN 'LT'   THEN 'Litre'
    WHEN 'ML'   THEN 'Militre'
    WHEN 'KOLI' THEN 'Koli'
    ELSE item_code
  END,
  main_unit = (conv_fact1 = 1)
WHERE code IS NULL OR code = '';

-- Ek birim seti: Şişe (500ml = 1 şişe, kasa = 24 şişe)
DO $$
DECLARE v_uid UUID := uuid_generate_v4();
BEGIN
  INSERT INTO rex_001_unitsets (id, code, name, is_active) VALUES (v_uid, '05-SISE24', 'Şişe (24li Kasa)', true) ON CONFLICT (code) DO NOTHING;
  INSERT INTO rex_001_unitsetl (unitset_id, item_code, code, name, main_unit, conv_fact1)
    SELECT id, 'KASA', 'KASA', 'Kasa', true, 1 FROM rex_001_unitsets WHERE code = '05-SISE24' ON CONFLICT DO NOTHING;
  INSERT INTO rex_001_unitsetl (unitset_id, item_code, code, name, main_unit, conv_fact1)
    SELECT id, 'SISE', 'SISE', 'Şişe', false, 24 FROM rex_001_unitsets WHERE code = '05-SISE24' ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- 4. DEMO ÜRÜNLER (rex_001_products)
-- ============================================================================

INSERT INTO rex_001_products (firm_nr, code, barcode, name, name2, category_id, vat_rate, price, cost, stock, min_stock, unit, currency, is_active) VALUES
  -- Telefonlar
  ('001', 'PHONE-001', '8680000000001', 'iPhone 15 Pro',       '256GB Titanyum',     (SELECT id FROM rex_001_categories WHERE code='ELEC-PHONE'), 20, 45000.00, 35000.00, 15, 3, 'Adet', 'IQD', true),
  ('001', 'PHONE-002', '8680000000002', 'Samsung Galaxy S24',  '512GB Siyah',        (SELECT id FROM rex_001_categories WHERE code='ELEC-PHONE'), 20, 38000.00, 29000.00, 22, 3, 'Adet', 'IQD', true),
  ('001', 'PHONE-003', '8680000000003', 'Xiaomi 14 Pro',       '256GB Beyaz',        (SELECT id FROM rex_001_categories WHERE code='ELEC-PHONE'), 20, 25000.00, 19000.00, 30, 5, 'Adet', 'IQD', true),
  -- Bilgisayarlar
  ('001', 'PC-001',    '8680000000010', 'MacBook Pro 16"',     'M3 Max 64GB',        (SELECT id FROM rex_001_categories WHERE code='ELEC-PC'),    20, 95000.00, 75000.00,  8, 2, 'Adet', 'IQD', true),
  ('001', 'PC-002',    '8680000000011', 'Dell XPS 15',         'i9 32GB RTX4060',    (SELECT id FROM rex_001_categories WHERE code='ELEC-PC'),    20, 55000.00, 43000.00, 12, 2, 'Adet', 'IQD', true),
  -- Gıda (koli birimi var)
  ('001', 'SNACK-001', '8680000000020', 'Çikolata Bar',        'Sütlü 80g',          (SELECT id FROM rex_001_categories WHERE code='FOOD-SNACK'), 10,    15.00,    10.00,500, 50, 'Adet', 'IQD', true),
  ('001', 'SNACK-002', '8680000000021', 'Cips',                'Klasik Tuzlu 150g',  (SELECT id FROM rex_001_categories WHERE code='FOOD-SNACK'), 10,    12.50,     8.00,350, 50, 'Adet', 'IQD', true),
  ('001', 'SNACK-003', '8680000000022', 'Bisküvi Paketi',      'Çikolatalı 200g',    (SELECT id FROM rex_001_categories WHERE code='FOOD-SNACK'), 10,    25.00,    17.00,280, 30, 'Adet', 'IQD', true),
  -- İçecek (şişe/kasa)
  ('001', 'DRINK-001', '8680000000030', 'Kola 500ml',          'Şişe',               (SELECT id FROM rex_001_categories WHERE code='FOOD-DRINK'), 10,     8.50,     5.50,600,100, 'Adet', 'IQD', true),
  ('001', 'DRINK-002', '8680000000031', 'Su 1.5L',             'Büyük Şişe',         (SELECT id FROM rex_001_categories WHERE code='FOOD-DRINK'), 10,     4.00,     2.50,800,100, 'Adet', 'IQD', true),
  -- Güzellik
  ('001', 'BEAUTY-001','8680000000040', 'Şampuan 400ml',       'Bakım Serisi',       (SELECT id FROM rex_001_categories WHERE code='BEAUTY-P'),   10,   120.00,    75.00,200, 20, 'Adet', 'IQD', true),
  ('001', 'BEAUTY-002','8680000000041', 'Saç Bakım Kremi',     '250ml',              (SELECT id FROM rex_001_categories WHERE code='BEAUTY-P'),   10,    95.00,    60.00,180, 20, 'Adet', 'IQD', true),
  -- Giyim
  ('001', 'CLOTH-001', '8680000000050', 'Erkek Gömlek',        'Beyaz Klasik',       (SELECT id FROM rex_001_categories WHERE code='CLOTH'),       10,   450.00,   280.00, 45, 10, 'Adet', 'IQD', true),
  ('001', 'CLOTH-002', '8680000000051', 'Erkek Pantolon',      'Lacivert Kumaş',     (SELECT id FROM rex_001_categories WHERE code='CLOTH'),       10,   650.00,   400.00, 38, 10, 'Adet', 'IQD', true),
  ('001', 'CLOTH-003', '8680000000052', 'Kadın Bluz',          'Pembe Şifon',        (SELECT id FROM rex_001_categories WHERE code='CLOTH'),       10,   380.00,   230.00, 52, 10, 'Adet', 'IQD', true),
  -- Varyantlı ürünler
  ('001', 'TSHIRT-VAR', NULL, 'Unisex T-Shirt',      'Pamuk %100',         (SELECT id FROM rex_001_categories WHERE code='CLOTH'),       10,   250.00,   140.00,  0, 10, 'Adet', 'IQD', true),
  ('001', 'PHONE-VAR',  NULL, 'Akıllı Telefon X12',  'Çift SIM 5G',        (SELECT id FROM rex_001_categories WHERE code='ELEC-PHONE'), 20, 18000.00, 13500.00,  0,  2, 'Adet', 'IQD', true),
  -- Restaurant menü ürünleri
  ('001', 'MENU-001',  NULL, 'Izgara Köfte',         '200g, Salata ile',   (SELECT id FROM rex_001_categories WHERE code='REST-ANA'),   10,   250.00,    80.00,999,  1, 'Porsiyon', 'IQD', true),
  ('001', 'MENU-002',  NULL, 'Tavuk Şiş',            '3''lü, Pilav ile',   (SELECT id FROM rex_001_categories WHERE code='REST-ANA'),   10,   220.00,    65.00,999,  1, 'Porsiyon', 'IQD', true),
  ('001', 'MENU-003',  NULL, 'Mercimek Çorbası',     'Kase',               (SELECT id FROM rex_001_categories WHERE code='REST-ANA'),   10,    80.00,    20.00,999,  1, 'Porsiyon', 'IQD', true),
  ('001', 'MENU-004',  NULL, 'Çay',                  'Demlik',             (SELECT id FROM rex_001_categories WHERE code='REST-ICECEK'),  0,    20.00,     4.00,999,  1, 'Bardak',   'IQD', true),
  ('001', 'MENU-005',  NULL, 'Ayran',                '300ml',              (SELECT id FROM rex_001_categories WHERE code='REST-ICECEK'), 10,    25.00,     6.00,999,  1, 'Bardak',   'IQD', true),
  ('001', 'MENU-006',  NULL, 'Sütlaç',               'Fırın',              (SELECT id FROM rex_001_categories WHERE code='REST-TATLI'), 10,    85.00,    25.00,999,  1, 'Porsiyon', 'IQD', true),
  ('001', 'MENU-007',  NULL, 'Hamburger Menü',       'Patates + İçecek',   (SELECT id FROM rex_001_categories WHERE code='REST-FAST'),  10,   180.00,    55.00,999,  1, 'Porsiyon', 'IQD', true)
ON CONFLICT (code) DO NOTHING;

-- Birim seti ata: koli olan ürünler (06-KOLI24 = Adet ana birim, Koli ×24)
UPDATE rex_001_products SET
  unitset_id = (SELECT id FROM rex_001_unitsets WHERE code = '06-KOLI24')
WHERE code IN ('SNACK-001', 'SNACK-002', 'SNACK-003');

-- İçecekler: Koli (24 adet)
UPDATE rex_001_products SET
  unitset_id = (SELECT id FROM rex_001_unitsets WHERE code = '06-KOLI24')
WHERE code IN ('DRINK-001', 'DRINK-002');

-- Giyim: Tekil (varyantlı ürünler birim seti almaz, ama temel birim tanımlı olsun)
UPDATE rex_001_products SET
  unitset_id = (SELECT id FROM rex_001_unitsets WHERE code = '01-ADET')
WHERE code IN ('CLOTH-001', 'CLOTH-002', 'CLOTH-003', 'TSHIRT-VAR', 'PHONE-VAR');

-- ============================================================================
-- 4b. VARYANTLI ÜRÜN KURULUMU
-- ============================================================================

-- has_variants işaretle
UPDATE rex_001_products SET has_variants = true
WHERE code IN ('TSHIRT-VAR', 'PHONE-VAR');

-- ── T-Shirt Varyantları (Beden × Renk = 12 kombinasyon) ──────────────────────
INSERT INTO rex_001_product_variants (product_id, sku, attributes)
SELECT
  p.id,
  'TSHIRT-VAR-' || beden || '-' || renk,
  jsonb_build_object(
    'variant_name', beden || ' ' || renk,
    'size',         beden,
    'color',        renk,
    'barcode',      '',
    'price',        250.00,
    'cost',         140.00,
    'stock',        CASE WHEN beden IN ('M','L') THEN 20 ELSE 10 END,
    'is_active',    true
  )
FROM rex_001_products p
CROSS JOIN (VALUES ('S'),('M'),('L'),('XL')) AS b(beden)
CROSS JOIN (VALUES ('Beyaz'),('Siyah'),('Lacivert')) AS c(renk)
WHERE p.code = 'TSHIRT-VAR'
ON CONFLICT (sku) DO NOTHING;

-- ── Telefon Varyantları (Renk × Depolama = 6 kombinasyon) ────────────────────
INSERT INTO rex_001_product_variants (product_id, sku, attributes)
SELECT
  p.id,
  'PHONE-VAR-' || renk || '-' || dep,
  jsonb_build_object(
    'variant_name', dep || ' ' || renk,
    'size',         dep,
    'color',        renk,
    'barcode',      '',
    'price',        CASE dep WHEN '128GB' THEN 18000.00 WHEN '256GB' THEN 21000.00 ELSE 26000.00 END,
    'cost',         CASE dep WHEN '128GB' THEN 13500.00 WHEN '256GB' THEN 15800.00 ELSE 19500.00 END,
    'stock',        8,
    'is_active',    true
  )
FROM rex_001_products p
CROSS JOIN (VALUES ('Siyah'),('Beyaz'),('Gümüş')) AS c(renk)
CROSS JOIN (VALUES ('128GB'),('256GB'),('512GB')) AS d(dep)
WHERE p.code = 'PHONE-VAR'
ON CONFLICT (sku) DO NOTHING;

-- ============================================================================
-- 5. DEMO TEDARİKÇİLER (rex_001_suppliers)
-- ============================================================================

INSERT INTO rex_001_suppliers (firm_nr, code, name, phone, email, tax_nr, city, contact_person, payment_terms, is_active) VALUES
  ('001', 'SUP-001', 'Teknoloji Dağıtım A.Ş.',   '+964 750 111 0001', 'info@tekdag.iq',   '1111111111', 'Bağdat',        'Tarık Al-Mazidi',   'Net 30',  true),
  ('001', 'SUP-002', 'Gıda Tedarik Ltd.',         '+964 750 111 0002', 'info@gidated.iq',  '2222222222', 'Erbil',         'Soran Mustafa',     'Net 15',  true),
  ('001', 'SUP-003', 'İçecek Distribütör',        '+964 750 111 0003', 'info@icecekd.iq',  '3333333333', 'Süleymaniye',   'Rizgar Karim',      'Peşin',   true),
  ('001', 'SUP-004', 'Güzellik Ürünleri AŞ',      '+964 750 111 0004', 'info@guzellik.iq', '4444444444', 'Bağdat',        'Nour Al-Hassan',    'Net 45',  true),
  ('001', 'SUP-005', 'Tekstil Toptan A.Ş.',       '+964 750 111 0005', 'info@tekstil.iq',  '5555555555', 'Basra',         'Ali Jabbar',        'Net 30',  true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 6. DEMO MÜŞTERİLER (rex_001_customers)
-- ============================================================================

INSERT INTO rex_001_customers (firm_nr, code, name, phone, email, tax_nr, city, address, balance, is_active) VALUES
  -- Bireysel
  ('001', 'CUST-001', 'Ahmed Al-Rashidi',    '+964 770 100 0001', 'ahmed@mail.com',    '9001001001', 'Bağdat',       'Kerkük Cad. No:12',     0, true),
  ('001', 'CUST-002', 'Sara Mahmoud',        '+964 770 100 0002', 'sara@mail.com',     '9002002002', 'Erbil',        'Havalar Mh. No:45',     0, true),
  ('001', 'CUST-003', 'Karim Hassan',        '+964 770 100 0003', 'karim@mail.com',    '9003003003', 'Süleymaniye',  'Salahaddin Blv. No:78', 0, true),
  ('001', 'CUST-004', 'Lara Aziz',           '+964 770 100 0004', 'lara@mail.com',     '9004004004', 'Musul',        'Yarmouk Mh. No:23',     0, true),
  ('001', 'CUST-005', 'Omar Khalil',         '+964 770 100 0005', 'omar@mail.com',     '9005005005', 'Basra',        'Corniche Cad. No:5',    0, true),
  -- Kurumsal
  ('001', 'CORP-001', 'Al-Noor Teknoloji',   '+964 770 200 0001', 'info@alnoor.iq',    '8001001001', 'Bağdat',       'Mansour Mh. No:100',    0, true),
  ('001', 'CORP-002', 'Kurdistan Market',    '+964 750 200 0002', 'info@kurdmkt.iq',   '8002002002', 'Erbil',        'Ankawa Cad. No:55',     0, true),
  ('001', 'CORP-003', 'Basra Trade Co.',     '+964 780 200 0003', 'info@basratrade.iq','8003003003', 'Basra',        'Port Mh. No:7',         0, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 7. DEMO FATURALAR — SATIŞ (rex_001_01_sales)
-- ============================================================================

INSERT INTO rex_001_01_sales
  (firm_nr, period_nr, fiche_no, fiche_type, date, customer_id, total_net, total_vat, total_gross, currency, currency_rate, payment_method, status, is_cancelled)
VALUES
  ('001','01','SAT-2026-0001','S', '2026-01-05 10:30:00', (SELECT id FROM rex_001_customers WHERE code='CUST-001'), 45000.00, 9000.00,  54000.00, 'IQD', 1, 'cash',   'completed', false),
  ('001','01','SAT-2026-0002','S', '2026-01-07 14:15:00', (SELECT id FROM rex_001_customers WHERE code='CORP-001'), 95000.00,19000.00, 114000.00, 'IQD', 1, 'credit', 'completed', false),
  ('001','01','SAT-2026-0003','S', '2026-01-10 09:20:00', (SELECT id FROM rex_001_customers WHERE code='CUST-002'), 25000.00, 5000.00,  30000.00, 'IQD', 1, 'cash',   'completed', false),
  ('001','01','SAT-2026-0004','S', '2026-01-12 16:00:00', (SELECT id FROM rex_001_customers WHERE code='CORP-002'),  1500.00,  150.00,   1650.00, 'IQD', 1, 'cash',   'completed', false),
  ('001','01','SAT-2026-0005','S', '2026-01-15 11:45:00', (SELECT id FROM rex_001_customers WHERE code='CUST-003'), 38000.00, 7600.00,  45600.00, 'IQD', 1, 'credit', 'completed', false),
  -- USD fatura örneği
  ('001','01','SAT-2026-0006','S', '2026-01-18 13:30:00', (SELECT id FROM rex_001_customers WHERE code='CORP-003'),   250.00,   50.00,    300.00, 'USD', 1300, 'cash', 'completed', false)
ON CONFLICT (fiche_no) DO NOTHING;

-- Fatura kalemleri
INSERT INTO rex_001_01_sale_items
  (firm_nr, period_nr, invoice_id, product_id, item_code, item_name, quantity, unit_price, vat_rate, net_amount, total_amount, unit, unit_multiplier, base_quantity, currency, unit_price_fc)
SELECT '001','01', s.id, p.id, p.code, p.name, 1, 45000.00, 20, 45000.00, 54000.00, 'Adet', 1, 1, 'IQD', 45000.00
FROM rex_001_01_sales s, rex_001_products p
WHERE s.fiche_no='SAT-2026-0001' AND p.code='PHONE-001'
  AND NOT EXISTS (SELECT 1 FROM rex_001_01_sale_items WHERE invoice_id=s.id AND item_code=p.code);

INSERT INTO rex_001_01_sale_items
  (firm_nr, period_nr, invoice_id, product_id, item_code, item_name, quantity, unit_price, vat_rate, net_amount, total_amount, unit, unit_multiplier, base_quantity, currency, unit_price_fc)
SELECT '001','01', s.id, p.id, p.code, p.name, 1, 95000.00, 20, 95000.00, 114000.00, 'Adet', 1, 1, 'IQD', 95000.00
FROM rex_001_01_sales s, rex_001_products p
WHERE s.fiche_no='SAT-2026-0002' AND p.code='PC-001'
  AND NOT EXISTS (SELECT 1 FROM rex_001_01_sale_items WHERE invoice_id=s.id AND item_code=p.code);

INSERT INTO rex_001_01_sale_items
  (firm_nr, period_nr, invoice_id, product_id, item_code, item_name, quantity, unit_price, vat_rate, net_amount, total_amount, unit, unit_multiplier, base_quantity, currency, unit_price_fc)
SELECT '001','01', s.id, p.id, p.code, p.name, 1, 25000.00, 20, 25000.00, 30000.00, 'Adet', 1, 1, 'IQD', 25000.00
FROM rex_001_01_sales s, rex_001_products p
WHERE s.fiche_no='SAT-2026-0003' AND p.code='PHONE-003'
  AND NOT EXISTS (SELECT 1 FROM rex_001_01_sale_items WHERE invoice_id=s.id AND item_code=p.code);

-- Koli satışı (çarpan örneği: 2 KOLI = 48 ADET)
INSERT INTO rex_001_01_sale_items
  (firm_nr, period_nr, invoice_id, product_id, item_code, item_name, quantity, unit_price, vat_rate, net_amount, total_amount, unit, unit_multiplier, base_quantity, currency, unit_price_fc)
SELECT '001','01', s.id, p.id, p.code, p.name, 2, 288.00, 10, 576.00, 633.60, 'KOLI', 24, 48, 'IQD', 288.00
FROM rex_001_01_sales s, rex_001_products p
WHERE s.fiche_no='SAT-2026-0004' AND p.code='SNACK-001'
  AND NOT EXISTS (SELECT 1 FROM rex_001_01_sale_items WHERE invoice_id=s.id AND item_code=p.code);

-- USD fatura kalemi
INSERT INTO rex_001_01_sale_items
  (firm_nr, period_nr, invoice_id, product_id, item_code, item_name, quantity, unit_price, vat_rate, net_amount, total_amount, unit, unit_multiplier, base_quantity, currency, unit_price_fc)
SELECT '001','01', s.id, p.id, p.code, p.name, 2, 162500.00, 20, 325000.00, 390000.00, 'Adet', 1, 2, 'USD', 250.00
FROM rex_001_01_sales s, rex_001_products p
WHERE s.fiche_no='SAT-2026-0006' AND p.code='PHONE-001'
  AND NOT EXISTS (SELECT 1 FROM rex_001_01_sale_items WHERE invoice_id=s.id AND item_code=p.code);

-- ============================================================================
-- 8. DEMO ALIŞ FATURALARI (supplier invoices)
-- ============================================================================

INSERT INTO rex_001_01_sales
  (firm_nr, period_nr, fiche_no, fiche_type, date, customer_id, total_net, total_vat, total_gross, currency, currency_rate, payment_method, status, notes)
VALUES
  ('001','01','ALI-2026-0001','A', '2026-01-03 09:00:00', (SELECT id FROM rex_001_suppliers WHERE code='SUP-001'), 120000.00, 24000.00, 144000.00, 'IQD', 1, 'credit', 'completed', 'Telefon stoğu alımı'),
  ('001','01','ALI-2026-0002','A', '2026-01-06 11:00:00', (SELECT id FROM rex_001_suppliers WHERE code='SUP-002'),   8000.00,    800.00,   8800.00, 'IQD', 1, 'cash',   'completed', 'Atıştırmalık stoğu'),
  ('001','01','ALI-2026-0003','A', '2026-01-08 10:30:00', (SELECT id FROM rex_001_suppliers WHERE code='SUP-003'),   4000.00,    400.00,   4400.00, 'USD', 1300, 'credit','completed', 'İçecek stoğu USD')
ON CONFLICT (fiche_no) DO NOTHING;

-- ============================================================================
-- 9. DEMO KASA İŞLEMLERİ (rex_001_01_cash_lines)
-- ============================================================================

INSERT INTO rex_001_01_cash_lines (firm_nr, period_nr, fiche_no, date, amount, sign, trcode, definition, transaction_type, currency_code, exchange_rate)
SELECT '001','01', v.fiche_no, v.dt::TIMESTAMPTZ, v.amount, v.sign, v.trcode, v.def, v.ttype, v.cur, v.rate
FROM (VALUES
  ('KAS-2026-0001','2026-01-05 11:00:00',  54000.00, 1, 11, 'iPhone 15 Pro Satış Tahsilatı',    'sales_payment',   'IQD', 1),
  ('KAS-2026-0002','2026-01-07 15:00:00', 114000.00, 1, 11, 'MacBook Pro Satış Tahsilatı',       'sales_payment',   'IQD', 1),
  ('KAS-2026-0003','2026-01-10 10:00:00',  30000.00, 1, 11, 'Telefon Satış Tahsilatı',           'sales_payment',   'IQD', 1),
  ('KAS-2026-0004','2026-01-12 09:00:00',  -8800.00,-1, 12, 'Gıda Tedarik Ödemesi',             'purchase_payment','IQD', 1),
  ('KAS-2026-0005','2026-01-15 09:30:00',  -5000.00,-1, 12, 'Kira Ödemesi — Ocak',              'expense',         'IQD', 1),
  ('KAS-2026-0006','2026-01-20 10:00:00',  -2500.00,-1, 12, 'Elektrik Faturası',                'expense',         'IQD', 1),
  ('KAS-2026-0007','2026-02-01 09:00:00',  45600.00, 1, 11, 'Samsung Galaxy Satış Tahsilatı',   'sales_payment',   'IQD', 1),
  ('KAS-2026-0008','2026-02-05 14:00:00',  390000.00,1, 11, 'USD Fatura Tahsilatı (IQD)',        'sales_payment',   'IQD', 1)
) AS v(fiche_no, dt, amount, sign, trcode, def, ttype, cur, rate)
WHERE NOT EXISTS (SELECT 1 FROM rex_001_01_cash_lines WHERE fiche_no = v.fiche_no);

-- ============================================================================
-- 10. DEMO STOK GÜNCELLEMELERİ
-- ============================================================================

UPDATE rex_001_products SET stock = stock - 1  WHERE code = 'PHONE-001';
UPDATE rex_001_products SET stock = stock - 1  WHERE code = 'PC-001';
UPDATE rex_001_products SET stock = stock - 1  WHERE code = 'PHONE-003';
UPDATE rex_001_products SET stock = stock - 48 WHERE code = 'SNACK-001';
UPDATE rex_001_products SET stock = stock + 3  WHERE code = 'PHONE-001'; -- alış
UPDATE rex_001_products SET stock = stock + 50 WHERE code = 'SNACK-001'; -- alış

-- ============================================================================
-- 11. WMS — DEMO VERİLER
-- ============================================================================

-- Sayım Fişi (counting slip)
INSERT INTO wms.counting_slips (firm_nr, store_id, fiche_no, date, status, count_type, description, created_by)
SELECT '001', s.id, 'SAY-2026-0001', '2026-01-20 08:00:00', 'completed', 'full', 'Ocak Ayı Tam Sayım', (SELECT id FROM public.users WHERE username='admin')
FROM stores s WHERE s.firm_nr = '001' LIMIT 1
ON CONFLICT (firm_nr, fiche_no) DO NOTHING;

INSERT INTO wms.counting_slips (firm_nr, store_id, fiche_no, date, status, count_type, description)
SELECT '001', s.id, 'SAY-2026-0002', '2026-02-10 09:00:00', 'active', 'cycle', 'Elektronik Bölüm Döngüsel Sayım'
FROM stores s WHERE s.firm_nr = '001' LIMIT 1
ON CONFLICT (firm_nr, fiche_no) DO NOTHING;

-- Sayım Satırları
INSERT INTO wms.counting_lines (slip_id, firm_nr, product_id, barcode, product_name, expected_qty, counted_qty, variance, counted_by, counted_at)
SELECT cs.id, '001', p.id, p.barcode, p.name, p.stock+1, p.stock, -1, 'admin', '2026-01-20 12:00:00'
FROM wms.counting_slips cs, rex_001_products p
WHERE cs.fiche_no = 'SAY-2026-0001' AND p.code IN ('PHONE-001','PHONE-002','PC-001')
  AND NOT EXISTS (SELECT 1 FROM wms.counting_lines cl WHERE cl.slip_id=cs.id AND cl.product_id=p.id);

-- Mal Kabul Fişi (receiving slip)
INSERT INTO wms.receiving_slips (firm_nr, store_id, slip_no, supplier_name, status, notes, created_by)
SELECT '001', s.id, 'MAL-2026-0001', 'Teknoloji Dağıtım A.Ş.', 'completed', 'iPhone ve MacBook stoğu', 'admin'
FROM stores s WHERE s.firm_nr = '001' LIMIT 1
ON CONFLICT (slip_no) DO NOTHING;

INSERT INTO wms.receiving_slips (firm_nr, store_id, slip_no, supplier_name, status, notes)
SELECT '001', s.id, 'MAL-2026-0002', 'Gıda Tedarik Ltd.', 'pending', 'Atıştırmalık stoğu — bekleniyor'
FROM stores s WHERE s.firm_nr = '001' LIMIT 1
ON CONFLICT (slip_no) DO NOTHING;

INSERT INTO wms.receiving_lines (slip_id, product_id, product_code, product_name, barcode, ordered_qty, received_qty, unit)
SELECT rs.id, p.id, p.code, p.name, p.barcode, 5, 5, 'Adet'
FROM wms.receiving_slips rs, rex_001_products p
WHERE rs.slip_no = 'MAL-2026-0001' AND p.code = 'PHONE-001'
  AND NOT EXISTS (SELECT 1 FROM wms.receiving_lines rl WHERE rl.slip_id=rs.id AND rl.product_code=p.code);

INSERT INTO wms.receiving_lines (slip_id, product_id, product_code, product_name, barcode, ordered_qty, received_qty, unit)
SELECT rs.id, p.id, p.code, p.name, p.barcode, 3, 3, 'Adet'
FROM wms.receiving_slips rs, rex_001_products p
WHERE rs.slip_no = 'MAL-2026-0001' AND p.code = 'PC-001'
  AND NOT EXISTS (SELECT 1 FROM wms.receiving_lines rl WHERE rl.slip_id=rs.id AND rl.product_code=p.code);

-- Sevkiyat Fişi (dispatch slip)
INSERT INTO wms.dispatch_slips (firm_nr, store_id, slip_no, customer_name, priority, status, notes)
SELECT '001', s.id, 'SEV-2026-0001', 'Al-Noor Teknoloji', 'high', 'completed', 'Acil sipariş — öncelikli'
FROM stores s WHERE s.firm_nr = '001' LIMIT 1
ON CONFLICT (slip_no) DO NOTHING;

INSERT INTO wms.dispatch_lines (slip_id, product_id, product_code, product_name, requested_qty, picked_qty, unit)
SELECT ds.id, p.id, p.code, p.name, 2, 2, 'Adet'
FROM wms.dispatch_slips ds, rex_001_products p
WHERE ds.slip_no = 'SEV-2026-0001' AND p.code = 'PHONE-002'
  AND NOT EXISTS (SELECT 1 FROM wms.dispatch_lines dl WHERE dl.slip_id=ds.id AND dl.product_code=p.code);

-- Depo Transfer Emri
INSERT INTO wms.transfers (firm_nr, fiche_no, source_store_id, target_store_id, date, status)
SELECT '001', 'TRF-2026-0001', s.id, s.id, '2026-01-25 10:00:00', 'completed'
FROM stores s WHERE s.firm_nr = '001' LIMIT 1
ON CONFLICT (firm_nr, fiche_no) DO NOTHING;

-- ============================================================================
-- 12. RESTORAN — DEMO VERİLER
-- ============================================================================

-- Kat (floor) ekle
INSERT INTO rest.floors (store_id, name, color, display_order)
SELECT s.id, 'Zemin Kat', '#3B82F6', 1 FROM stores s WHERE s.firm_nr = '001' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO rest.floors (store_id, name, color, display_order)
SELECT s.id, 'Teras', '#10B981', 2 FROM stores s WHERE s.firm_nr = '001' LIMIT 1
ON CONFLICT DO NOTHING;

-- Masalar
INSERT INTO rest.rex_001_rest_tables (floor_id, number, seats, status, pos_x, pos_y)
SELECT f.id, v.number::VARCHAR, v.seats, 'empty', v.px, v.py
FROM rest.floors f,
(VALUES ('1',4,50,50),('2',4,150,50),('3',2,250,50),('4',4,50,150),('5',6,150,150),('6',4,350,50)) AS v(number,seats,px,py)
WHERE f.name = 'Zemin Kat'
ON CONFLICT DO NOTHING;

-- Örnek açık sipariş (masa 3)
INSERT INTO rest.rex_001_01_rest_orders
  (order_no, table_id, floor_id, waiter, status, total_amount, opened_at)
SELECT
  'ORD-2026-0001',
  t.id,
  f.id,
  'Hasan',
  'open',
  355.00,
  NOW() - INTERVAL '25 minutes'
FROM rest.rex_001_rest_tables t
JOIN rest.floors f ON f.id = t.floor_id
WHERE t.number = '3' AND f.name = 'Zemin Kat'
ON CONFLICT (order_no) DO NOTHING;

-- Sipariş kalemleri
INSERT INTO rest.rex_001_01_rest_order_items
  (order_id, product_id, product_name, quantity, unit_price, subtotal, status, course)
SELECT
  o.id,
  p.id,
  p.name,
  v.qty,
  p.price,
  p.price * v.qty,
  'served',
  v.course
FROM rest.rex_001_01_rest_orders o,
     rex_001_products p,
     (VALUES ('MENU-001',1,'main'),('MENU-003',2,'starter'),('MENU-004',3,'drink')) AS v(code,qty,course)
WHERE o.order_no = 'ORD-2026-0001' AND p.code = v.code
  AND NOT EXISTS (SELECT 1 FROM rest.rex_001_01_rest_order_items oi WHERE oi.order_id=o.id AND oi.product_id=p.id);

-- Tamamlanmış sipariş örnekleri
INSERT INTO rest.rex_001_01_rest_orders
  (order_no, waiter, status, total_amount, opened_at, closed_at, payment_method)
VALUES
  ('ORD-2026-0002', 'Fatma', 'closed', 485.00, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour',   'cash'),
  ('ORD-2026-0003', 'Hasan', 'closed', 220.00, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours',  'credit'),
  ('ORD-2026-0004', 'Merve', 'closed', 670.00, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '3 hours',  'cash')
ON CONFLICT (order_no) DO NOTHING;

-- ============================================================================
-- 13. GÜZELLİK MERKEZİ — DEMO VERİLER
-- ============================================================================

-- Uzmanlar
INSERT INTO beauty.rex_001_beauty_specialists (name, phone, specialty, color, commission_rate, is_active) VALUES
  ('Ayşe Kaya',    '+964 770 300 0001', 'Lazer Epilasyon', '#9333ea', 15.00, true),
  ('Zeynep Arslan','+964 770 300 0002', 'Cilt Bakımı',     '#ec4899', 12.00, true),
  ('Merve Demir',  '+964 770 300 0003', 'Saç Bakımı',      '#f97316', 10.00, true)
ON CONFLICT DO NOTHING;

-- Hizmetler
INSERT INTO beauty.rex_001_beauty_services (name, category, duration_min, price, cost_price, commission_rate, expected_shots, is_active) VALUES
  ('Bacak Lazer Epilasyon (Tam)', 'laser',  90, 2500.00, 800.00, 15.00, 1200, true),
  ('Koltuk Altı Lazer',          'laser',  30,  800.00, 250.00, 15.00,  150, true),
  ('Yüz Bakımı',                 'facial', 60, 1200.00, 400.00, 12.00,    0, true),
  ('Saç Boyama',                 'hair',   90, 1800.00, 600.00, 10.00,    0, true),
  ('Manikür & Pedikür',          'nail',   60,  650.00, 200.00, 10.00,    0, true)
ON CONFLICT DO NOTHING;

-- Paketler
INSERT INTO beauty.rex_001_beauty_packages (name, description, service_id, total_sessions, price, cost_price, discount_pct, validity_days, is_active) VALUES
  ('Bacak Epilasyon 6li Paket', '6 seans — %15 indirimli',
    (SELECT id FROM beauty.rex_001_beauty_services WHERE name LIKE 'Bacak%'), 6, 12750.00, 4800.00, 15.00, 365, true),
  ('Yüz Bakımı 4lü Paket', '4 seans — %10 indirimli',
    (SELECT id FROM beauty.rex_001_beauty_services WHERE name='Yüz Bakımı'), 4,  4320.00, 1600.00, 10.00, 180, true)
ON CONFLICT DO NOTHING;

-- Cihazlar
INSERT INTO beauty.rex_001_beauty_devices (name, device_type, serial_number, manufacturer, model, total_shots, max_shots, status, is_active) VALUES
  ('Lumina Pro Lazer',   'laser', 'LP-2023-001', 'MedLaser',   'Lumina Pro 1200', 45200,  500000, 'active', true),
  ('Soprano Ice Titan',  'laser', 'SI-2022-002', 'Alma Lasers','Soprano Ice',    128000, 1000000, 'active', true),
  ('RF Cilt Germe',      'rf',    'RF-2023-003', 'TheraTech',  'RF Pro X',            0,  100000, 'active', true)
ON CONFLICT DO NOTHING;

-- Müşteriler (güzellik — genel müşterilerden bağımsız)
-- (rex_001_customers tablosu kullanılıyor, güzellik için özel müşteriler eklendi)
INSERT INTO rex_001_customers (firm_nr, code, name, phone, email, balance, is_active) VALUES
  ('001', 'BCust-001', 'Lena Al-Rashidi', '+964 770 400 0001', 'lena@mail.com',  0, true),
  ('001', 'BCust-002', 'Maya Hassan',     '+964 770 400 0002', 'maya@mail.com',  0, true),
  ('001', 'BCust-003', 'Sara Karim',      '+964 770 400 0003', 'sara.k@mail.com',0, true)
ON CONFLICT (code) DO NOTHING;

-- Randevular
INSERT INTO beauty.rex_001_01_beauty_appointments
  (client_id, service_id, specialist_id, appointment_date, appointment_time, duration, status, total_price, is_package_session)
SELECT
  c.id, sv.id, sp.id,
  v.adate::DATE, v.atime::TIME, v.dur, v.stat, v.price, false
FROM (VALUES
  ('BCust-001','Bacak Lazer Epilasyon (Tam)','Ayşe Kaya',  '2026-01-15','10:00', 90,'completed', 2500.00),
  ('BCust-001','Koltuk Altı Lazer',          'Ayşe Kaya',  '2026-01-22','10:00', 30,'completed',  800.00),
  ('BCust-002','Yüz Bakımı',                 'Zeynep Arslan','2026-01-20','14:00',60,'completed', 1200.00),
  ('BCust-003','Saç Boyama',                 'Merve Demir','2026-01-25','11:00', 90,'completed', 1800.00),
  ('BCust-001','Bacak Lazer Epilasyon (Tam)','Ayşe Kaya',  '2026-02-05','10:00', 90,'scheduled', 2500.00),
  ('BCust-002','Manikür & Pedikür',          'Merve Demir','2026-02-07','15:00', 60,'scheduled',  650.00)
) AS v(ccode, sname, spname, adate, atime, dur, stat, price)
JOIN rex_001_customers c ON c.code = v.ccode
JOIN beauty.rex_001_beauty_services sv ON sv.name = v.sname
JOIN beauty.rex_001_beauty_specialists sp ON sp.name = v.spname
ON CONFLICT DO NOTHING;

-- Paket Satışı
INSERT INTO beauty.rex_001_01_beauty_package_purchases
  (customer_id, package_id, total_sessions, used_sessions, remaining_sessions, sale_price, purchase_date, expiry_date, status)
SELECT
  c.id, pk.id, 6, 2, 4, 12750.00, '2026-01-15', '2027-01-15', 'active'
FROM rex_001_customers c, beauty.rex_001_beauty_packages pk
WHERE c.code = 'BCust-001' AND pk.name LIKE 'Bacak%'
  AND NOT EXISTS (SELECT 1 FROM beauty.rex_001_01_beauty_package_purchases pp WHERE pp.customer_id=c.id AND pp.package_id=pk.id);

-- Güzellik POS Satışı
INSERT INTO beauty.rex_001_01_beauty_sales
  (invoice_number, customer_id, subtotal, discount, total, payment_method, payment_status, paid_amount)
SELECT 'BPOS-2026-001', c.id, 4300.00, 0, 4300.00, 'cash', 'paid', 4300.00
FROM rex_001_customers c WHERE c.code = 'BCust-002'
  AND NOT EXISTS (SELECT 1 FROM beauty.rex_001_01_beauty_sales bs WHERE bs.invoice_number='BPOS-2026-001');

-- ============================================================================
-- 14. CRM — LEADLER (beauty)
-- ============================================================================

INSERT INTO beauty.rex_001_beauty_leads (name, phone, email, source, status, interested_services, notes) VALUES
  ('Hira Al-Ansari', '+964 770 500 0001', 'hira@mail.com',   'instagram', 'interested', '["Bacak Lazer Epilasyon (Tam)"]', 'Instagram reklamından geldi'),
  ('Nour Jamil',     '+964 770 500 0002', 'nour@mail.com',   'referral',  'contacted',  '["Yüz Bakımı","Saç Boyama"]',   'BCust-001 tarafından yönlendirildi'),
  ('Rania Said',     '+964 770 500 0003', 'rania@mail.com',  'walk_in',   'new',        '["Manikür & Pedikür"]',         'Mağaza önünden girdi')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 15. DÖVİZ KURLARI (exchange_rates)
-- ============================================================================

INSERT INTO public.exchange_rates (currency_code, date, buy_rate, sell_rate, source) VALUES
  ('USD', '2026-01-01', 1308.00, 1312.00, 'manual'),
  ('USD', '2026-01-15', 1305.00, 1309.00, 'manual'),
  ('USD', '2026-02-01', 1310.00, 1314.00, 'manual'),
  ('USD', '2026-03-01', 1312.00, 1316.00, 'manual'),
  ('EUR', '2026-01-01', 1420.00, 1426.00, 'manual'),
  ('EUR', '2026-02-01', 1418.00, 1424.00, 'manual'),
  ('TRY', '2026-01-01',   37.50,   38.20, 'manual'),
  ('TRY', '2026-02-01',   37.80,   38.50, 'manual')
ON CONFLICT (currency_code, date, source) DO NOTHING;

-- ============================================================================
-- TAMAMLANDI
-- ============================================================================

DO $$
DECLARE
  v_prod  INTEGER := 0;
  v_cust  INTEGER := 0;
  v_sales INTEGER := 0;
  v_appt  INTEGER := 0;
  v_count INTEGER := 0;
BEGIN
  BEGIN SELECT COUNT(*) INTO v_prod  FROM rex_001_products;                       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN SELECT COUNT(*) INTO v_cust  FROM rex_001_customers;                      EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN SELECT COUNT(*) INTO v_sales FROM rex_001_01_sales;                       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN SELECT COUNT(*) INTO v_appt  FROM beauty.rex_001_01_beauty_appointments;  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN SELECT COUNT(*) INTO v_count FROM wms.counting_slips WHERE firm_nr='001'; EXCEPTION WHEN OTHERS THEN NULL; END;

  RAISE NOTICE '=== RetailEX Demo Data Yüklendi ===';
  RAISE NOTICE 'Ürünler: % | Müşteriler: % | Faturalar: % | Güzellik Randevuları: % | WMS Sayım: %',
    v_prod, v_cust, v_sales, v_appt, v_count;
END $$;
