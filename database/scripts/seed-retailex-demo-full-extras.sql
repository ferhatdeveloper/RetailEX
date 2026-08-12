-- ============================================================================
-- RetailEX Demo (retailex_demo) — menü kilidi aç + 001 dışı örnek veri
-- Idempotent. Firma 001 / dönem 01.
-- Çalıştırma: scripts/seed-retailex-demo-full.mjs veya psql -f ...
-- ============================================================================

-- 1) Yönetim menüsü: gizli modül yok (tüm statik menü açık)
UPDATE public.system_settings
SET menu_preferences = '{"version":2,"presets":[]}'::jsonb,
    updated_at = NOW()
WHERE id = 1;

INSERT INTO public.system_settings (id, default_currency, menu_preferences)
VALUES (1, 'TRY', '{"version":2,"presets":[]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

UPDATE public.system_settings
SET menu_preferences = '{"version":2,"presets":[]}'::jsonb
WHERE id = 1
  AND (
    menu_preferences IS NULL
    OR menu_preferences = '{}'::jsonb
    OR COALESCE(jsonb_array_length(menu_preferences->'presets'), 0) > 0
  );

-- Admin rolü tam yetki + kullanıcı bağını güvenceye al
UPDATE public.roles
SET permissions = '["*"]'::jsonb
WHERE lower(name) = 'admin';

UPDATE public.users u
SET role_id = r.id,
    role = 'admin',
    is_active = true,
    allowed_firm_nrs = '["001","002","110"]'::jsonb,
    allowed_periods = '["01"]'::jsonb
FROM public.roles r
WHERE lower(u.username) = 'admin'
  AND lower(r.name) = 'admin';

UPDATE public.firms
SET regulatory_region = 'TR',
    ana_para_birimi = 'TRY',
    raporlama_para_birimi = 'TRY',
    is_active = true,
    "default" = true
WHERE firm_nr = '001';

UPDATE public.rex_001_cash_registers
SET currency_code = 'TRY',
    name = COALESCE(NULLIF(name, ''), 'Merkez Kasa')
WHERE code = 'KASA.001';

-- 2) Ek kasa
INSERT INTO public.rex_001_cash_registers (firm_nr, code, name, currency_code, balance, is_active)
VALUES
  ('001', 'KASA.002', 'Şube Kasa', 'TRY', 1500.00, true),
  ('001', 'KASA.POS', 'POS Kasa', 'TRY', 800.00, true)
ON CONFLICT (code) DO NOTHING;

-- 3) Banka kartları + hareketler (tahsilat +, ödeme −)
INSERT INTO public.rex_001_bank_registers (firm_nr, code, name, bank_name, iban, currency_code, balance, is_active)
VALUES
  ('001', 'BANK.001', 'Ziraat Vadesiz', 'Ziraat Bankası', 'TR000000000000000000000001', 'TRY', 125000.00, true),
  ('001', 'BANK.002', 'İş Bankası USD', 'İş Bankası', 'TR000000000000000000000002', 'USD', 8500.00, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.rex_001_01_bank_lines
  (firm_nr, period_nr, register_id, fiche_no, date, amount, sign, trcode, definition, transaction_type, currency_code, exchange_rate)
SELECT '001', '01', br.id, v.fiche_no, v.dt::timestamptz, v.amount, v.sign, v.trcode, v.def, v.ttype, v.cur, 1
FROM (VALUES
  ('BNK-2026-0001', '2026-01-08 11:00:00', 25000.00,  1, 21, 'Kurumsal satış havale tahsilatı', 'collection', 'TRY'),
  ('BNK-2026-0002', '2026-01-18 10:00:00', 12000.00, -1, 22, 'Tedarikçi havale ödemesi',       'payment',    'TRY'),
  ('BNK-2026-0003', '2026-02-02 09:30:00',  5000.00,  1, 21, 'POS gün sonu virman',            'transfer',   'TRY')
) AS v(fiche_no, dt, amount, sign, trcode, def, ttype, cur)
JOIN public.rex_001_bank_registers br ON br.code = 'BANK.001'
WHERE NOT EXISTS (SELECT 1 FROM public.rex_001_01_bank_lines bl WHERE bl.fiche_no = v.fiche_no);

-- 4) Kampanyalar
INSERT INTO public.rex_001_campaigns
  (firm_nr, name, description, type, discount_type, discount_value, start_date, end_date, is_active, min_purchase_amount, priority)
SELECT * FROM (VALUES
  ('001'::varchar, 'Yaz Elektronik %10'::varchar, 'Telefon ve bilgisayarlarda %10'::text,
   'product'::varchar, 'percent'::varchar, 10.00::numeric,
   '2026-01-01'::timestamptz, '2026-12-31'::timestamptz, true, 0::numeric, 10),
  ('001', 'Sepette 500+ 50 TL', 'Minimum 500 TL alışverişte 50 TL indirim',
   'basket', 'fixed', 50.00,
   '2026-01-01'::timestamptz, '2026-06-30'::timestamptz, true, 500.00, 5),
  ('001', 'İçecek 2 Al 1 Öde', 'DRINK kategorisi',
   'product', 'percent', 50.00,
   '2026-02-01'::timestamptz, '2026-08-31'::timestamptz, true, 0, 3)
) AS v(firm_nr, name, description, type, discount_type, discount_value, start_date, end_date, is_active, min_purchase_amount, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM public.rex_001_campaigns c WHERE c.firm_nr = v.firm_nr AND c.name = v.name
);

-- 5) Restoran personel + ekstra masalar
INSERT INTO rest.rex_001_rest_staff (name, role, pin, is_active)
SELECT v.name, v.role, v.pin, true
FROM (VALUES
  ('Ali Garson', 'Waiter', '1111'),
  ('Ayşe Kasa', 'Cashier', '2222'),
  ('Mehmet Mutfak', 'Kitchen', '3333')
) AS v(name, role, pin)
WHERE NOT EXISTS (SELECT 1 FROM rest.rex_001_rest_staff s WHERE s.pin = v.pin);

INSERT INTO rest.floors (store_id, name, color, display_order)
SELECT s.id, 'Zemin Kat', '#3B82F6', 1
FROM stores s
WHERE s.firm_nr = '001'
  AND NOT EXISTS (
    SELECT 1 FROM rest.floors f
    WHERE f.store_id = s.id AND f.name = 'Zemin Kat'
  )
LIMIT 1;

INSERT INTO rest.floors (store_id, name, color, display_order)
SELECT s.id, 'Teras', '#10B981', 2
FROM stores s
WHERE s.firm_nr = '001'
  AND NOT EXISTS (
    SELECT 1 FROM rest.floors f
    WHERE f.store_id = s.id AND f.name = 'Teras'
  )
LIMIT 1;

INSERT INTO rest.rex_001_rest_tables (floor_id, number, seats, status, pos_x, pos_y)
SELECT f.id, v.number::varchar, v.seats, 'empty', v.px, v.py
FROM rest.floors f,
(VALUES
  ('1', 4, 50, 50),
  ('2', 4, 150, 50),
  ('3', 2, 250, 50),
  ('4', 4, 50, 150),
  ('5', 6, 150, 150),
  ('6', 4, 350, 50),
  ('7', 8, 450, 100)
) AS v(number, seats, px, py)
WHERE f.name = 'Zemin Kat'
  AND NOT EXISTS (
    SELECT 1 FROM rest.rex_001_rest_tables t WHERE t.number = v.number::varchar
  );

-- 6) Lojistik
INSERT INTO logistics.vehicles (firm_nr, plate, brand, model, capacity_kg, cold_chain, is_active)
SELECT '001', v.plate, v.brand, v.model, v.cap, v.cold, true
FROM (VALUES
  ('34 DEMO 01', 'Ford', 'Transit', 1200.000, false),
  ('34 DEMO 02', 'Mercedes', 'Sprinter', 1800.000, true)
) AS v(plate, brand, model, cap, cold)
WHERE NOT EXISTS (
  SELECT 1 FROM logistics.vehicles x WHERE x.firm_nr = '001' AND x.plate = v.plate
);

INSERT INTO logistics.couriers (firm_nr, full_name, phone, default_vehicle_id, is_active)
SELECT '001', v.full_name, v.phone, veh.id, true
FROM (VALUES
  ('Kurye Ahmet', '+90 532 100 0001', '34 DEMO 01'),
  ('Kurye Selin', '+90 532 100 0002', '34 DEMO 02')
) AS v(full_name, phone, plate)
JOIN logistics.vehicles veh ON veh.firm_nr = '001' AND veh.plate = v.plate
WHERE NOT EXISTS (
  SELECT 1 FROM logistics.couriers c WHERE c.firm_nr = '001' AND c.full_name = v.full_name
);

INSERT INTO logistics.deliveries (
  firm_nr, period_nr, delivery_no, delivery_date, sales_id, sales_fiche_no,
  customer_id, customer_name, address_text, phone, vehicle_id, courier_id,
  driver_name, status, notes, created_by
)
SELECT
  '001', '01', 'DLV-2026-0001', CURRENT_DATE - 2,
  s.id, s.fiche_no,
  s.customer_id, COALESCE(c.name, s.customer_name),
  COALESCE(c.address, 'Demo Adres'), c.phone,
  veh.id, cour.id, cour.full_name,
  'delivered', 'Demo teslimat', 'admin'
FROM public.rex_001_01_sales s
LEFT JOIN public.rex_001_customers c ON c.id = s.customer_id
CROSS JOIN LATERAL (
  SELECT id FROM logistics.vehicles WHERE firm_nr = '001' ORDER BY plate LIMIT 1
) veh
CROSS JOIN LATERAL (
  SELECT id, full_name FROM logistics.couriers WHERE firm_nr = '001' ORDER BY full_name LIMIT 1
) cour
WHERE s.fiche_no IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM logistics.deliveries d WHERE d.firm_nr = '001' AND d.delivery_no = 'DLV-2026-0001'
  )
ORDER BY s.date DESC NULLS LAST
LIMIT 1;

-- 7) Kasap reçete (girdi/çıktı ürünleri demo kodlarından)
INSERT INTO public.rex_001_products (firm_nr, code, barcode, name, vat_rate, price, cost, stock, unit, currency, is_active)
VALUES
  ('001', 'MEAT-CARCASS', '8680000000100', 'Koyun Karkas', 1, 0, 180.00, 50, 'KG', 'TRY', true),
  ('001', 'MEAT-LEG',     '8680000000101', 'But',          1, 320.00, 0, 0, 'KG', 'TRY', true),
  ('001', 'MEAT-RIB',     '8680000000102', 'Kaburga',      1, 280.00, 0, 0, 'KG', 'TRY', true),
  ('001', 'MEAT-WASTE',   '8680000000103', 'Fire / Kemik', 0, 0, 0, 0, 'KG', 'TRY', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.rex_001_butcher_recipes (firm_nr, code, name, animal_type, input_product_id, waste_product_id, description, is_active)
SELECT
  '001', 'BUTCH-SHEEP-01', 'Koyun Parçalama', 'sheep',
  (SELECT id FROM rex_001_products WHERE code = 'MEAT-CARCASS'),
  (SELECT id FROM rex_001_products WHERE code = 'MEAT-WASTE'),
  'Demo kasap reçetesi', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.rex_001_butcher_recipes r
  WHERE r.firm_nr = '001' AND lower(r.code) = lower('BUTCH-SHEEP-01')
);

INSERT INTO public.rex_001_butcher_recipe_outputs (recipe_id, product_id, sort_order, standard_ratio_percent, coefficient)
SELECT r.id, p.id, v.ord, v.ratio, 1
FROM public.rex_001_butcher_recipes r
JOIN (VALUES
  ('MEAT-LEG', 1, 35.000),
  ('MEAT-RIB', 2, 25.000)
) AS v(pcode, ord, ratio) ON true
JOIN public.rex_001_products p ON p.code = v.pcode
WHERE r.code = 'BUTCH-SHEEP-01'
  AND NOT EXISTS (
    SELECT 1 FROM public.rex_001_butcher_recipe_outputs o
    WHERE o.recipe_id = r.id AND o.product_id = p.id
  );

-- 8) E-ticaret demo siparişleri
INSERT INTO public.eticaret_web_orders (
  tenant_code, order_no, status, demo_mode, customer_name, customer_email, customer_phone,
  shipping_address, payment_provider, payment_status, currency, subtotal, total, items,
  firm_nr, period_nr, notes
)
SELECT * FROM (VALUES
  (
    'demo'::varchar, 'WEB-2026-0001'::varchar, 'pending'::varchar, true,
    'Demo Müşteri'::varchar, 'demo@retailex.app'::varchar, '+90 555 100 0001'::varchar,
    'İstanbul Demo Cad. No:1'::text, 'mock'::varchar, 'paid'::varchar, 'TRY'::varchar,
    450.00::numeric, 450.00::numeric,
    '[{"code":"SNACK-001","name":"Çikolata Bar","qty":2,"price":15}]'::jsonb,
    '001'::varchar, '01'::varchar, 'Demo web siparişi'::text
  ),
  (
    'demo', 'WEB-2026-0002', 'confirmed', true,
    'Ayşe Yılmaz', 'ayse@mail.com', '+90 555 100 0002',
    'Ankara Kızılay Mh.', 'mock', 'paid', 'TRY',
    250.00, 250.00,
    '[{"code":"MENU-007","name":"Hamburger Menü","qty":1,"price":180}]'::jsonb,
    '001', '01', 'Onaylı demo sipariş'
  )
) AS v(
  tenant_code, order_no, status, demo_mode, customer_name, customer_email, customer_phone,
  shipping_address, payment_provider, payment_status, currency, subtotal, total, items,
  firm_nr, period_nr, notes
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.eticaret_web_orders e WHERE e.order_no = v.order_no
);

-- 9) Güzellik: uzman / hizmet yoksa (001 tekrarında ON CONFLICT yoksa)
INSERT INTO beauty.rex_001_beauty_specialists (name, phone, specialty, color, commission_rate, is_active)
SELECT v.name, v.phone, v.specialty, v.color, v.rate, true
FROM (VALUES
  ('Zahra',  '+964 770 300 0001', 'Lazer Epilasyon', '#9333ea', 15.00),
  ('Fatma',  '+964 770 300 0002', 'Cilt Bakımı',     '#ec4899', 12.00),
  ('Shoxan', '+964 770 300 0003', 'Saç Bakımı',      '#f97316', 10.00)
) AS v(name, phone, specialty, color, rate)
WHERE NOT EXISTS (
  SELECT 1 FROM beauty.rex_001_beauty_specialists s WHERE s.name = v.name
);

INSERT INTO beauty.rex_001_beauty_services (name, category, duration_min, price, cost_price, commission_rate, expected_shots, is_active)
SELECT v.name, v.cat, v.dur, v.price, v.cost, v.comm, v.shots, true
FROM (VALUES
  ('Bacak Lazer Epilasyon (Tam)', 'laser',  90, 2500.00, 800.00, 15.00, 1200),
  ('Koltuk Altı Lazer',          'laser',  30,  800.00, 250.00, 15.00,  150),
  ('Yüz Bakımı',                 'facial', 60, 1200.00, 400.00, 12.00,    0),
  ('Saç Boyama',                 'hair',   90, 1800.00, 600.00, 10.00,    0),
  ('Manikür & Pedikür',          'nail',   60,  650.00, 200.00, 10.00,    0)
) AS v(name, cat, dur, price, cost, comm, shots)
WHERE NOT EXISTS (
  SELECT 1 FROM beauty.rex_001_beauty_services s WHERE s.name = v.name
);

INSERT INTO beauty.rex_001_beauty_devices (name, device_type, serial_number, manufacturer, model, total_shots, max_shots, status, is_active)
SELECT v.name, v.dtype, v.serial, v.mfr, v.model, v.shots, v.max, 'active', true
FROM (VALUES
  ('Candela 1',   'laser',  'CD-001', 'Candela',    'Gentle series', 45200, 500000),
  ('Candela 2',   'laser',  'CD-002', 'Candela',    'Gentle series', 38000, 500000),
  ('Hydrafacial', 'facial', 'HF-001', 'HydraFacial','Syndeo',            0,      0)
) AS v(name, dtype, serial, mfr, model, shots, max)
WHERE NOT EXISTS (
  SELECT 1 FROM beauty.rex_001_beauty_devices d WHERE d.serial_number = v.serial
);

-- 10) Satış elemanı / gider kartı (yönetim listeleri)
INSERT INTO public.rex_001_sales_reps (firm_nr, code, name, phone, is_active)
SELECT '001', v.code, v.name, v.phone, true
FROM (VALUES
  ('SR-001', 'Satış Elemanı Demo', '+90 555 200 0001'),
  ('SR-002', 'Saha Temsilcisi', '+90 555 200 0002')
) AS v(code, name, phone)
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'rex_001_sales_reps' AND column_name = 'code'
)
AND NOT EXISTS (
  SELECT 1 FROM public.rex_001_sales_reps r WHERE r.code = v.code
);

INSERT INTO public.rex_001_expense_cards (firm_nr, code, name, is_active)
SELECT '001', v.code, v.name, true
FROM (VALUES
  ('EXP-RENT', 'Kira'),
  ('EXP-UTIL', 'Elektrik / Su'),
  ('EXP-MISC', 'Genel Gider')
) AS v(code, name)
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'rex_001_expense_cards'
)
AND NOT EXISTS (
  SELECT 1 FROM public.rex_001_expense_cards e WHERE e.code = v.code
);

NOTIFY pgrst, 'reload schema';
