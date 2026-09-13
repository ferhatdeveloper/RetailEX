-- ============================================================================
-- retailex_demo — modül başına ayrı firma + enabled_modules
-- ============================================================================
-- 001 Demo Market     → pos + management (perakende)
-- 010 Demo Restoran   → restaurant + pos + management (Excel menü ayrı script)
-- 020 Demo Güzellik   → beauty + management
-- WMS / mobile-pos kabukta yok.
-- Idempotent. Çalıştırma: seed-retailex-demo-full.mjs
-- ============================================================================

-- Kolon yoksa ekle (150 henüz uygulanmamış ortamlarda)
ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS enabled_modules JSONB DEFAULT NULL;

-- ─── 001: Market / POS ───────────────────────────────────────────────────────
INSERT INTO public.firms (firm_nr, name, title, is_active, "default", ana_para_birimi, raporlama_para_birimi, regulatory_region, enabled_modules)
VALUES (
  '001', 'Demo Market', 'RetailEX Demo Market', true, true, 'TRY', 'TRY', 'TR',
  '["pos","management"]'::jsonb
)
ON CONFLICT (firm_nr) DO UPDATE SET
  name = EXCLUDED.name,
  title = EXCLUDED.title,
  is_active = true,
  "default" = true,
  ana_para_birimi = COALESCE(NULLIF(public.firms.ana_para_birimi, ''), 'TRY'),
  raporlama_para_birimi = COALESCE(NULLIF(public.firms.raporlama_para_birimi, ''), 'TRY'),
  regulatory_region = 'TR',
  enabled_modules = '["pos","management"]'::jsonb;

-- Dönem 01 yoksa ekle
INSERT INTO public.periods (firm_id, nr, beg_date, end_date, is_active, "default")
SELECT f.id, 1, DATE '2026-01-01', DATE '2026-12-31', true, true
FROM public.firms f
WHERE f.firm_nr = '001'
  AND NOT EXISTS (SELECT 1 FROM public.periods p WHERE p.firm_id = f.id AND p.nr = 1);

UPDATE public.firms
SET name = 'Demo Market',
    title = 'RetailEX Demo Market',
    is_active = true,
    "default" = true,
    ana_para_birimi = COALESCE(NULLIF(ana_para_birimi, ''), 'TRY'),
    raporlama_para_birimi = COALESCE(NULLIF(raporlama_para_birimi, ''), 'TRY'),
    regulatory_region = 'TR',
    enabled_modules = '["pos","management"]'::jsonb
WHERE firm_nr = '001';

-- Market firmasında restoran/güzellik karışmasını temizle
DELETE FROM beauty.rex_001_01_beauty_appointments WHERE true;
DELETE FROM beauty.rex_001_01_beauty_package_purchases WHERE true;
DELETE FROM beauty.rex_001_01_beauty_sales WHERE true;
DELETE FROM beauty.rex_001_beauty_leads WHERE true;
DELETE FROM beauty.rex_001_beauty_packages WHERE true;
DELETE FROM beauty.rex_001_beauty_devices WHERE true;
DELETE FROM beauty.rex_001_beauty_services WHERE true;
DELETE FROM beauty.rex_001_beauty_specialists WHERE true;

-- Restoran sipariş → masa → kat (FK sırası)
DO $$
BEGIN
  BEGIN EXECUTE 'DELETE FROM rest.rex_001_01_rest_kitchen_items'; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN EXECUTE 'DELETE FROM rest.rex_001_01_rest_kitchen_orders'; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN EXECUTE 'DELETE FROM rest.rex_001_01_rest_order_items'; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN EXECUTE 'DELETE FROM rest.rex_001_01_rest_orders'; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN EXECUTE 'DELETE FROM rest.rex_001_rest_tables'; EXCEPTION WHEN undefined_table THEN NULL; END;
END $$;

DELETE FROM rest.floors f
USING public.stores s
WHERE f.store_id = s.id AND s.firm_nr = '001';

DELETE FROM public.rex_001_products WHERE code LIKE 'MENU-%';
DELETE FROM public.rex_001_categories WHERE is_restaurant IS TRUE OR code LIKE 'REST-%';
DELETE FROM public.rex_001_customers WHERE code LIKE 'BCust-%';

-- Market (001) üzerinde restoran/güzellik faturaları kalmasın (firmalar arası karışma)
DELETE FROM public.rex_001_01_sale_items si
USING public.rex_001_01_sales s
WHERE si.invoice_id = s.id
  AND (
    s.fiche_no LIKE 'BEA-%'
    OR s.fiche_no LIKE 'REST-%'
    OR s.fiche_no LIKE 'GEL-%'
    OR s.fiche_no LIKE 'DLV-%'
    OR s.fiche_no LIKE 'RST-%'
    OR coalesce(s.notes, '') ILIKE '%GüzellikPOS%'
    OR coalesce(s.notes, '') ILIKE '%BeautyPOS%'
  );

DELETE FROM public.rex_001_01_sales s
WHERE (
  s.fiche_no LIKE 'BEA-%'
  OR s.fiche_no LIKE 'REST-%'
  OR s.fiche_no LIKE 'GEL-%'
  OR s.fiche_no LIKE 'DLV-%'
  OR s.fiche_no LIKE 'RST-%'
  OR coalesce(s.notes, '') ILIKE '%GüzellikPOS%'
  OR coalesce(s.notes, '') ILIKE '%BeautyPOS%'
);

-- WMS demo slip'leri market firmasında kalsın ama kabuk WMS kapalı; isteğe bağlı temizlikte bırakıyoruz.

-- ─── 010: Restoran ───────────────────────────────────────────────────────────
SELECT * FROM public.provision_firm_schema('010', '01', 'Demo Restoran', 'TRY', true);

UPDATE public.firms
SET name = 'Demo Restoran',
    title = 'RetailEX Demo Restoran',
    is_active = true,
    "default" = false,
    ana_para_birimi = 'TRY',
    raporlama_para_birimi = 'TRY',
    regulatory_region = 'TR',
    enabled_modules = '["restaurant","pos","management"]'::jsonb
WHERE firm_nr = '010';

INSERT INTO public.stores (code, name, firm_nr, is_main, "default", is_active)
VALUES ('ST_010', 'Restoran Salon', '010', true, true, true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, firm_nr = EXCLUDED.firm_nr, is_active = true;

-- Restoran kategorileri (ürünler Excel script ile gelir)
INSERT INTO public.rex_010_categories (code, name, parent_id, is_restaurant, is_active) VALUES
  ('REST-ANA',    'Ana Yemekler', NULL, true, true),
  ('REST-ICECEK', 'İçecekler',    NULL, true, true),
  ('REST-TATLI',  'Tatlılar',     NULL, true, true),
  ('REST-CORBA',  'Çorbalar',     NULL, true, true),
  ('REST-SALATA', 'Salatalar',    NULL, true, true),
  ('REST-ARA',    'Ara Sıcak',    NULL, true, true)
ON CONFLICT (code) DO NOTHING;

-- Kat / masa
INSERT INTO rest.floors (store_id, name, color, display_order)
SELECT s.id, 'Salon', '#F97316', 1
FROM public.stores s
WHERE s.firm_nr = '010' AND s.code = 'ST_010'
  AND NOT EXISTS (
    SELECT 1 FROM rest.floors f WHERE f.store_id = s.id AND f.name = 'Salon'
  );

INSERT INTO rest.floors (store_id, name, color, display_order)
SELECT s.id, 'Teras', '#10B981', 2
FROM public.stores s
WHERE s.firm_nr = '010' AND s.code = 'ST_010'
  AND NOT EXISTS (
    SELECT 1 FROM rest.floors f WHERE f.store_id = s.id AND f.name = 'Teras'
  );

INSERT INTO rest.rex_010_rest_tables (floor_id, number, seats, status, pos_x, pos_y)
SELECT f.id, v.number::VARCHAR, v.seats, 'empty', v.px, v.py
FROM rest.floors f
JOIN public.stores s ON s.id = f.store_id AND s.firm_nr = '010'
CROSS JOIN (VALUES
  ('1', 4, 60, 60),
  ('2', 4, 180, 60),
  ('3', 2, 300, 60),
  ('4', 4, 60, 180),
  ('5', 6, 180, 180),
  ('6', 4, 300, 180),
  ('7', 8, 420, 120),
  ('8', 4, 60, 300)
) AS v(number, seats, px, py)
WHERE f.name = 'Salon'
  AND NOT EXISTS (
    SELECT 1 FROM rest.rex_010_rest_tables t WHERE t.floor_id = f.id AND t.number = v.number::VARCHAR
  );

-- Restoran müşterileri (yalnız 010)
INSERT INTO public.rex_010_customers (firm_nr, code, name, phone, email, balance, is_active) VALUES
  ('010', 'RCust-001', 'Ahmet Yılmaz',  '+90 532 100 0001', 'ahmet.y@demo.local', 0, true),
  ('010', 'RCust-002', 'Elif Demir',    '+90 532 100 0002', 'elif.d@demo.local',   0, true),
  ('010', 'RCust-003', 'Can Öztürk',    '+90 532 100 0003', 'can.o@demo.local',    0, true)
ON CONFLICT (code) DO NOTHING;

-- ─── 020: Güzellik ───────────────────────────────────────────────────────────
SELECT * FROM public.provision_firm_schema('020', '01', 'Demo Güzellik', 'TRY', true);

UPDATE public.firms
SET name = 'Demo Güzellik',
    title = 'RetailEX Demo Güzellik Merkezi',
    is_active = true,
    "default" = false,
    ana_para_birimi = 'TRY',
    raporlama_para_birimi = 'TRY',
    regulatory_region = 'TR',
    enabled_modules = '["beauty","management"]'::jsonb
WHERE firm_nr = '020';

INSERT INTO public.stores (code, name, firm_nr, is_main, "default", is_active)
VALUES ('ST_020', 'Güzellik Merkezi', '020', true, true, true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, firm_nr = EXCLUDED.firm_nr, is_active = true;

INSERT INTO public.rex_020_customers (firm_nr, code, name, phone, email, balance, is_active) VALUES
  ('020', 'BCust-001', 'Lena Al-Rashidi', '+964 770 400 0001', 'lena@demo.local',  0, true),
  ('020', 'BCust-002', 'Maya Hassan',     '+964 770 400 0002', 'maya@demo.local',  0, true),
  ('020', 'BCust-003', 'Sara Karim',      '+964 770 400 0003', 'sara@demo.local',  0, true),
  ('020', 'BCust-004', 'Noor Ali',        '+964 770 400 0004', 'noor@demo.local',  0, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO beauty.rex_020_beauty_specialists (name, phone, specialty, color, commission_rate, is_active)
SELECT v.name, v.phone, v.specialty, v.color, v.rate, true
FROM (VALUES
  ('Zahra',  '+964 770 300 0001', 'Lazer Epilasyon', '#9333ea', 15.00),
  ('Fatma',  '+964 770 300 0002', 'Cilt Bakımı',     '#ec4899', 12.00),
  ('Shoxan', '+964 770 300 0003', 'Saç Bakımı',      '#f97316', 10.00)
) AS v(name, phone, specialty, color, rate)
WHERE NOT EXISTS (
  SELECT 1 FROM beauty.rex_020_beauty_specialists s WHERE s.name = v.name
);

INSERT INTO beauty.rex_020_beauty_services (name, category, duration_min, price, cost_price, commission_rate, expected_shots, is_active)
SELECT v.name, v.cat, v.dur, v.price, v.cost, v.comm, v.shots, true
FROM (VALUES
  ('Bacak Lazer Epilasyon (Tam)', 'laser',  90, 2500.00, 800.00, 15.00, 1200),
  ('Koltuk Altı Lazer',          'laser',  30,  800.00, 250.00, 15.00,  150),
  ('Yüz Bakımı',                 'facial', 60, 1200.00, 400.00, 12.00,    0),
  ('Saç Boyama',                 'hair',   90, 1800.00, 600.00, 10.00,    0),
  ('Manikür & Pedikür',          'nail',   60,  650.00, 200.00, 10.00,    0)
) AS v(name, cat, dur, price, cost, comm, shots)
WHERE NOT EXISTS (
  SELECT 1 FROM beauty.rex_020_beauty_services s WHERE s.name = v.name
);

INSERT INTO beauty.rex_020_beauty_packages (name, description, service_id, total_sessions, price, cost_price, discount_pct, validity_days, is_active)
SELECT 'Bacak Epilasyon 6li Paket', '6 seans — %15 indirimli', sv.id, 6, 12750.00, 4800.00, 15.00, 365, true
FROM beauty.rex_020_beauty_services sv
WHERE sv.name LIKE 'Bacak%'
  AND NOT EXISTS (SELECT 1 FROM beauty.rex_020_beauty_packages p WHERE p.name = 'Bacak Epilasyon 6li Paket');

INSERT INTO beauty.rex_020_beauty_packages (name, description, service_id, total_sessions, price, cost_price, discount_pct, validity_days, is_active)
SELECT 'Yüz Bakımı 4lü Paket', '4 seans — %10 indirimli', sv.id, 4, 4320.00, 1600.00, 10.00, 180, true
FROM beauty.rex_020_beauty_services sv
WHERE sv.name = 'Yüz Bakımı'
  AND NOT EXISTS (SELECT 1 FROM beauty.rex_020_beauty_packages p WHERE p.name = 'Yüz Bakımı 4lü Paket');

INSERT INTO beauty.rex_020_beauty_devices (name, device_type, serial_number, manufacturer, model, total_shots, max_shots, status, is_active)
SELECT v.name, v.dtype, v.sn, v.mfr, v.model, v.shots, v.max, 'active', true
FROM (VALUES
  ('Candela 1',   'laser',  'CD-020-001', 'Candela',    'Gentle series', 45200, 500000),
  ('Hydrafacial', 'facial', 'HF-020-001', 'HydraFacial','Syndeo',            0,      0)
) AS v(name, dtype, sn, mfr, model, shots, max)
WHERE NOT EXISTS (
  SELECT 1 FROM beauty.rex_020_beauty_devices d WHERE d.serial_number = v.sn
);

INSERT INTO beauty.rex_020_01_beauty_appointments
  (client_id, service_id, specialist_id, appointment_date, appointment_time, duration, status, total_price, is_package_session)
SELECT c.id, sv.id, sp.id, v.adate::DATE, v.atime::TIME, v.dur, v.stat, v.price, false
FROM (VALUES
  ('BCust-001', 'Bacak Lazer Epilasyon (Tam)', 'Zahra',  '2026-01-15', '10:00', 90, 'completed', 2500.00),
  ('BCust-002', 'Yüz Bakımı',                 'Fatma',  '2026-01-20', '14:00', 60, 'completed', 1200.00),
  ('BCust-003', 'Saç Boyama',                 'Shoxan', '2026-01-25', '11:00', 90, 'completed', 1800.00),
  ('BCust-001', 'Bacak Lazer Epilasyon (Tam)', 'Zahra',  '2026-02-05', '10:00', 90, 'scheduled', 2500.00),
  ('BCust-004', 'Manikür & Pedikür',          'Fatma',  '2026-02-08', '15:00', 60, 'scheduled',  650.00)
) AS v(ccode, sname, spname, adate, atime, dur, stat, price)
JOIN public.rex_020_customers c ON c.code = v.ccode
JOIN beauty.rex_020_beauty_services sv ON sv.name = v.sname
JOIN beauty.rex_020_beauty_specialists sp ON sp.name = v.spname
WHERE NOT EXISTS (
  SELECT 1 FROM beauty.rex_020_01_beauty_appointments a
  WHERE a.client_id = c.id AND a.appointment_date = v.adate::DATE AND a.appointment_time = v.atime::TIME
);

INSERT INTO beauty.rex_020_beauty_leads (name, phone, email, source, status, interested_services, notes)
SELECT v.name, v.phone, v.email, v.src, v.stat, to_jsonb(ARRAY[v.svc]), v.notes
FROM (VALUES
  ('Yasemin Kaya', '+90 532 200 0001', 'yasemin@demo.local', 'instagram', 'new', 'Lazer', 'Demo güzellik lead'),
  ('Derya Polat',  '+90 532 200 0002', 'derya@demo.local',   'referral',  'contacted', 'Yüz bakımı', NULL)
) AS v(name, phone, email, src, stat, svc, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM beauty.rex_020_beauty_leads l WHERE l.phone = v.phone
);

-- Firma 020 adını sabitle (elle değiştirilmiş olabilir)
UPDATE public.firms
SET name = 'Demo Güzellik',
    title = 'RetailEX Demo Güzellik Merkezi',
    enabled_modules = '["beauty","management"]'::jsonb
WHERE firm_nr = '020';

-- ─── Demo satışlar (listelerde görünsün) ─────────────────────────────────────
-- 010 Restoran: POS satış + masa adisyonu
INSERT INTO public.rex_010_01_sales
  (firm_nr, period_nr, fiche_no, fiche_type, date, customer_id, customer_name, total_net, total_vat, total_gross, net_amount, is_cancelled)
SELECT '010', '01', v.fiche, 'S', v.dt::timestamptz, c.id, c.name, v.net, v.vat, v.gross, v.net, false
FROM (VALUES
  ('RST-2026-0001', '2026-02-01 12:30:00', 'RCust-001', 1500.00, 150.00, 1650.00),
  ('RST-2026-0002', '2026-02-03 19:15:00', 'RCust-002', 6750.00, 675.00, 7425.00),
  ('RST-2026-0003', '2026-02-05 13:00:00', 'RCust-003', 2500.00, 250.00, 2750.00)
) AS v(fiche, dt, ccode, net, vat, gross)
JOIN public.rex_010_customers c ON c.code = v.ccode
WHERE NOT EXISTS (SELECT 1 FROM public.rex_010_01_sales s WHERE s.fiche_no = v.fiche);

INSERT INTO public.rex_010_01_sale_items
  (firm_nr, period_nr, invoice_id, product_id, item_code, quantity, unit_price, vat_rate, net_amount, total_amount)
SELECT '010', '01', s.id, p.id, p.code, 1, p.price, COALESCE(p.vat_rate, 10), p.price, p.price * (1 + COALESCE(p.vat_rate, 10) / 100.0)
FROM public.rex_010_01_sales s
JOIN public.rex_010_products p ON p.code = CASE s.fiche_no
  WHEN 'RST-2026-0001' THEN 'YMK-00001'
  WHEN 'RST-2026-0002' THEN 'YMK-00002'
  WHEN 'RST-2026-0003' THEN 'YMK-00003'
END
WHERE s.fiche_no IN ('RST-2026-0001', 'RST-2026-0002', 'RST-2026-0003')
  AND NOT EXISTS (
    SELECT 1 FROM public.rex_010_01_sale_items si WHERE si.invoice_id = s.id AND si.item_code = p.code
  );

-- Kapalı masa adisyonu (restoran listesi)
INSERT INTO rest.rex_010_01_rest_orders
  (order_no, table_id, floor_id, waiter, customer_id, status, total_amount, discount_amount, tax_amount, opened_at, billed_at, closed_at, payment_method, source)
SELECT v.ono, t.id, t.floor_id, 'Demo Garson', c.id, 'closed', v.total, 0, v.tax,
       v.opened::timestamptz, v.billed::timestamptz, v.closed::timestamptz, 'cash', 'pos'
FROM (VALUES
  ('RO-2026-0001', '1', 'RCust-001', 1650.00, 150.00, '2026-02-01 12:00:00', '2026-02-01 12:25:00', '2026-02-01 12:30:00'),
  ('RO-2026-0002', '3', 'RCust-002', 7425.00, 675.00, '2026-02-03 18:40:00', '2026-02-03 19:10:00', '2026-02-03 19:15:00')
) AS v(ono, tnum, ccode, total, tax, opened, billed, closed)
JOIN rest.rex_010_rest_tables t ON t.number = v.tnum
JOIN public.rex_010_customers c ON c.code = v.ccode
WHERE NOT EXISTS (SELECT 1 FROM rest.rex_010_01_rest_orders o WHERE o.order_no = v.ono);

INSERT INTO rest.rex_010_01_rest_order_items
  (order_id, product_id, product_name, quantity, unit_price, discount_pct, subtotal, status)
SELECT o.id, p.id, p.name, 1, p.price, 0, p.price, 'served'
FROM rest.rex_010_01_rest_orders o
JOIN public.rex_010_products p ON p.code = CASE o.order_no
  WHEN 'RO-2026-0001' THEN 'YMK-00001'
  WHEN 'RO-2026-0002' THEN 'YMK-00002'
END
WHERE o.order_no IN ('RO-2026-0001', 'RO-2026-0002')
  AND NOT EXISTS (
    SELECT 1 FROM rest.rex_010_01_rest_order_items i WHERE i.order_id = o.id AND i.product_id = p.id
  );

-- 020 Güzellik: POS satış kaydı
INSERT INTO beauty.rex_020_01_beauty_sales
  (invoice_number, customer_id, subtotal, discount, tax, total, payment_method, payment_status, paid_amount, remaining_amount)
SELECT v.inv, c.id, v.sub, 0, v.tax, v.tot, 'cash', 'paid', v.tot, 0
FROM (VALUES
  ('BPOS-2026-001', 'BCust-001', 2500.00, 0, 2500.00),
  ('BPOS-2026-002', 'BCust-002', 1200.00, 0, 1200.00),
  ('BPOS-2026-003', 'BCust-003', 1800.00, 0, 1800.00)
) AS v(inv, ccode, sub, tax, tot)
JOIN public.rex_020_customers c ON c.code = v.ccode
WHERE NOT EXISTS (
  SELECT 1 FROM beauty.rex_020_01_beauty_sales bs WHERE bs.invoice_number = v.inv
);

-- Admin: üç demo firmaya erişim
UPDATE public.users u
SET allowed_firm_nrs = '["001","010","020"]'::jsonb,
    allowed_periods = '["01"]'::jsonb
WHERE lower(u.username) = 'admin';

UPDATE public.system_settings
SET primary_firm_nr = '001',
    primary_period_nr = '01',
    updated_at = NOW()
WHERE id = 1;

-- Demo dışı / test firmaları gizle
UPDATE public.firms
SET is_active = false, "default" = false
WHERE firm_nr NOT IN ('001', '010', '020')
  AND firm_nr ~ '^[0-9]+$';

NOTIFY pgrst, 'reload schema';
