-- ============================================================================
-- RetailEX Beauty — Demo veri seed (idempotent, ON CONFLICT DO NOTHING)
-- Firma 001 / Dönem 01
--   3 şube, 5 oda, 4 uzman, 8 hizmet, 6 müşteri, 10 randevu
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Şubeler (branches) — 3 adet
-- ----------------------------------------------------------------------------
INSERT INTO beauty.rex_001_beauty_branches (id, name, address, phone, is_active, sort_order)
VALUES
  ('11111111-1111-1111-1111-000000000001', 'Merkez Şube', 'Bağdat Cad. No:123 Kadıköy/İstanbul', '+90 216 555 11 01', true, 1),
  ('11111111-1111-1111-1111-000000000002', 'Levent Şube', 'Levent Mah. No:45 Beşiktaş/İstanbul',   '+90 212 555 11 02', true, 2),
  ('11111111-1111-1111-1111-000000000003', 'Başakşehir Şube', 'Başakşehir Mah. No:7 İstanbul',      '+90 212 555 11 03', true, 3)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2) Odalar (rooms) — şubelere 1-2 oda
-- ----------------------------------------------------------------------------
INSERT INTO beauty.rex_001_beauty_rooms (id, branch_id, name, capacity, is_active, sort_order)
VALUES
  ('22222222-2222-2222-2222-000000000001', '11111111-1111-1111-1111-000000000001', 'Lazer Oda 1', 1, true, 1),
  ('22222222-2222-2222-2222-000000000002', '11111111-1111-1111-1111-000000000001', 'Cilt Bakım Odası', 1, true, 2),
  ('22222222-2222-2222-2222-000000000003', '11111111-1111-1111-1111-000000000002', 'Lazer Oda 2', 1, true, 1),
  ('22222222-2222-2222-2222-000000000004', '11111111-1111-1111-1111-000000000002', 'Masaj Odası', 1, true, 2),
  ('22222222-2222-2222-2222-000000000005', '11111111-1111-1111-1111-000000000003', 'Epilasyon Odası', 1, true, 1)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3) Uzmanlar (specialists) — 4 yeni + mevcut ZAHRA'yı güncelle
-- ----------------------------------------------------------------------------
UPDATE beauty.rex_001_beauty_specialists
   SET phone='+90 532 100 11 01', email='zahra@retailex.com',
       specialty='Lazer Epilasyon', color='#ec4899',
       commission_rate=20, product_unit_commission=5,
       is_active=true
 WHERE name='ZAHRA';

INSERT INTO beauty.rex_001_beauty_specialists (id, name, phone, email, specialty, color, commission_rate, product_unit_commission, is_active)
VALUES
  ('33333333-3333-3333-3333-000000000001', 'Elif Yıldız',  '+90 532 100 22 02', 'elif@retailex.com',  'Cilt Bakım',     '#8b5cf6', 22, 6, true),
  ('33333333-3333-3333-3333-000000000002', 'Mert Demir',   '+90 532 100 33 03', 'mert@retailex.com',  'Masaj',          '#10b981', 25, 4, true),
  ('33333333-3333-3333-3333-000000000003', 'Selin Kaya',   '+90 532 100 44 04', 'selin@retailex.com', 'Lazer Epilasyon', '#f59e0b', 20, 5, true),
  ('33333333-3333-3333-3333-000000000004', 'Burak Aydın',  '+90 532 100 55 05', 'burak@retailex.com', 'Tırnak Bakım',    '#3b82f6', 18, 3, true)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4) Hizmetler (services) — 8 adet
-- ----------------------------------------------------------------------------
INSERT INTO beauty.rex_001_beauty_services
  (id, name, category, parent_category, duration_min, price, cost_price, color, commission_rate, requires_device, expected_shots, default_sessions, follow_up_reminder_days, is_active)
VALUES
  ('44444444-4444-4444-4444-000000000001', 'Lazer Epilasyon - Tüm Vücut', 'Lazer', 'Epilasyon', 90, 2500.00,  300.00, '#ec4899', 20, true,  6, 8, 30, true),
  ('44444444-4444-4444-4444-000000000002', 'Lazer Epilasyon - Yarım Bacak','Lazer', 'Epilasyon', 45, 1200.00,  150.00, '#ec4899', 20, true,  3, 6, 30, true),
  ('44444444-4444-4444-4444-000000000003', 'HydraFacial Cilt Bakımı',     'Cilt',  'Bakım',     60, 1800.00,  250.00, '#8b5cf6', 22, false, 0, 1, 14, true),
  ('44444444-4444-4444-4444-000000000004', 'Anti-Aging Bakım',             'Cilt',  'Bakım',     75, 2200.00,  350.00, '#8b5cf6', 22, false, 0, 1, 21, true),
  ('44444444-4444-4444-4444-000000000005', 'İsveç Masajı (60 dk)',         'Masaj', 'Masaj',     60, 1500.00,  200.00, '#10b981', 25, false, 0, 1,  0, true),
  ('44444444-4444-4444-4444-000000000006', 'Aromaterapi Masajı (90 dk)',   'Masaj', 'Masaj',     90, 2100.00,  280.00, '#10b981', 25, false, 0, 1,  0, true),
  ('44444444-4444-4444-4444-000000000007', 'Manikür + Pedikür',            'Tırnak','Bakım',     75,  900.00,  120.00, '#3b82f6', 18, false, 0, 1, 14, true),
  ('44444444-4444-4444-4444-000000000008', 'Kalıcı Makyaj - Kaş',          'Makyaj','Estetik',   90, 3500.00,  500.00, '#f59e0b', 30, false, 0, 1, 60, true)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5) Müşteriler (customers) — 6 adet
-- ----------------------------------------------------------------------------
INSERT INTO rex_001_customers
  (id, firm_nr, ref_id, code, name, phone, phone2, age, gender, customer_tier, email, total_spent, points, balance, notes, call_plan_enabled)
VALUES
  ('55555555-5555-5555-5555-000000000001', '001', 1001, 'M001', 'Ayşe Demir',     '+90 533 111 22 11', NULL, 32, 'F', 'Gold',   'ayse@example.com',   8500.00, 85, 0,     'Düzenli müşteri', true),
  ('55555555-5555-5555-5555-000000000002', '001', 1002, 'M002', 'Fatma Şahin',    '+90 533 222 33 22', NULL, 28, 'F', 'Silver', 'fatma@example.com',  3200.00, 32, 250.00, 'Paket aldı',       true),
  ('55555555-5555-5555-5555-000000000003', '001', 1003, 'M003', 'Zeynep Korkmaz', '+90 533 333 44 33', '+90 533 333 44 44', 41, 'F', 'Platinum','zeynep@example.com', 15000.00, 150, 0,  'VIP',              true),
  ('55555555-5555-5555-5555-000000000004', '001', 1004, 'M004', 'Mehmet Çelik',   '+90 533 444 55 44', NULL, 35, 'M', 'Bronze', 'mehmet@example.com',  850.00,  8, 0,    '',                 false),
  ('55555555-5555-5555-5555-000000000005', '001', 1005, 'M005', 'Ali Yılmaz',     '+90 533 555 66 55', NULL, 45, 'M', 'Silver', 'ali@example.com',    4200.00, 42, 0,    '',                 true),
  ('55555555-5555-5555-5555-000000000006', '001', 1006, 'M006', 'Emine Arslan',   '+90 533 666 77 66', NULL, 29, 'F', 'Gold',   'emine@example.com',  6800.00, 68, 0,    'Follow-up aktif',  true)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6) Randevular (appointments) — bugün + gelecek 9 gün, 10 randevu
-- ----------------------------------------------------------------------------
INSERT INTO beauty.rex_001_01_beauty_appointments
  (id, client_id, service_id, specialist_id, body_region_id, appointment_date, appointment_time,
   duration, status, type, total_price, commission_amount, booking_channel, branch_id, room_id, is_package_session, reminder_sent)
VALUES
  ('66666666-6666-6666-6666-000000000001', '55555555-5555-5555-5555-000000000001',
   '44444444-4444-4444-4444-000000000001', '33333333-3333-3333-3333-000000000001',
   'b5ff3dbf-02a9-43cf-8f7d-624b135cc960', CURRENT_DATE,               '10:00:00', 90, 'scheduled', 'lazer', 2500, 500, 'phone', '11111111-1111-1111-1111-000000000001','22222222-2222-2222-2222-000000000001', false, false),
  ('66666666-6666-6666-6666-000000000002', '55555555-5555-5555-5555-000000000002',
   '44444444-4444-4444-4444-000000000003', '33333333-3333-3333-3333-000000000002',
   'b5ff3dbf-02a9-43cf-8f7d-624b135cc960', CURRENT_DATE,               '11:30:00', 60, 'scheduled', 'bakim', 1800, 396, 'web',   '11111111-1111-1111-1111-000000000001','22222222-2222-2222-2222-000000000002', false, false),
  ('66666666-6666-6666-6666-000000000003', '55555555-5555-5555-5555-000000000003',
   '44444444-4444-4444-4444-000000000005', '33333333-3333-3333-3333-000000000003',
   'b5ff3dbf-02a9-43cf-8f7d-624b135cc960', CURRENT_DATE,               '14:00:00', 60, 'in_progress','masaj',1500, 375, 'phone', '11111111-1111-1111-1111-000000000002','22222222-2222-2222-2222-000000000004', false, false),
  ('66666666-6666-6666-6666-000000000004', '55555555-5555-5555-5555-000000000004',
   '44444444-4444-4444-4444-000000000007', '33333333-3333-3333-3333-000000000004',
   'b5ff3dbf-02a9-43cf-8f7d-624b135cc960', CURRENT_DATE,               '15:30:00', 75, 'completed', 'tirnak', 900, 162, 'web',   '11111111-1111-1111-1111-000000000001','22222222-2222-2222-2222-000000000002', false, true),
  ('66666666-6666-6666-6666-000000000005', '55555555-5555-5555-5555-000000000005',
   '44444444-4444-4444-4444-000000000002', '33333333-3333-3333-3333-000000000001',
   'ce326f12-f475-4d31-8643-e1a6ee3050bd', CURRENT_DATE + 1,           '09:30:00', 45, 'scheduled', 'lazer', 1200, 240, 'phone', '11111111-1111-1111-1111-000000000001','22222222-2222-2222-2222-000000000001', false, false),
  ('66666666-6666-6666-6666-000000000006', '55555555-5555-5555-5555-000000000006',
   '44444444-4444-4444-4444-000000000004', '33333333-3333-3333-3333-000000000002',
   'b5ff3dbf-02a9-43cf-8f7d-624b135cc960', CURRENT_DATE + 1,           '13:00:00', 75, 'scheduled', 'bakim', 2200, 484, 'web',   '11111111-1111-1111-1111-000000000002','22222222-2222-2222-2222-000000000003', false, false),
  ('66666666-6666-6666-6666-000000000007', '55555555-5555-5555-5555-000000000001',
   '44444444-4444-4444-4444-000000000006', '33333333-3333-3333-3333-000000000003',
   'b5ff3dbf-02a9-43cf-8f7d-624b135cc960', CURRENT_DATE + 2,           '11:00:00', 90, 'scheduled', 'masaj', 2100, 525, 'phone', '11111111-1111-1111-1111-000000000001','22222222-2222-2222-2222-000000000004', false, false),
  ('66666666-6666-6666-6666-000000000008', '55555555-5555-5555-5555-000000000002',
   '44444444-4444-4444-4444-000000000008', '33333333-3333-3333-3333-000000000003',
   'b5ff3dbf-02a9-43cf-8f7d-624b135cc960', CURRENT_DATE + 3,           '10:30:00', 90, 'scheduled', 'makyaj',3500, 1050,'web',   '11111111-1111-1111-1111-000000000002','22222222-2222-2222-2222-000000000003', false, false),
  ('66666666-6666-6666-6666-000000000009', '55555555-5555-5555-5555-000000000003',
   '44444444-4444-4444-4444-000000000001', '33333333-3333-3333-3333-000000000001',
   'fbf2ce15-7c98-43d1-a295-20b47118b92a', CURRENT_DATE + 5,           '09:00:00', 90, 'scheduled', 'lazer', 2500, 500, 'phone', '11111111-1111-1111-1111-000000000001','22222222-2222-2222-2222-000000000001', false, false),
  ('66666666-6666-6666-6666-000000000010', '55555555-5555-5555-5555-000000000005',
   '44444444-4444-4444-4444-000000000003', '33333333-3333-3333-3333-000000000002',
   'b5ff3dbf-02a9-43cf-8f7d-624b135cc960', CURRENT_DATE + 7,           '14:00:00', 60, 'scheduled', 'bakim', 1800, 396, 'web',   '11111111-1111-1111-1111-000000000003','22222222-2222-2222-2222-000000000005', false, false)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7) Mevcut memnuniyet anketini aktif et (varsa)
-- ----------------------------------------------------------------------------
UPDATE beauty.rex_001_beauty_satisfaction_surveys
   SET is_active = true
 WHERE is_active = false
   AND EXISTS (SELECT 1 FROM beauty.rex_001_beauty_satisfaction_surveys);

COMMIT;

-- ----------------------------------------------------------------------------
-- Özet rapor
-- ----------------------------------------------------------------------------
SELECT 'branches' AS tablo, COUNT(*) AS adet FROM beauty.rex_001_beauty_branches
UNION ALL SELECT 'rooms',    COUNT(*) FROM beauty.rex_001_beauty_rooms
UNION ALL SELECT 'specialists', COUNT(*) FROM beauty.rex_001_beauty_specialists
UNION ALL SELECT 'services', COUNT(*) FROM beauty.rex_001_beauty_services
UNION ALL SELECT 'customers', COUNT(*) FROM rex_001_customers
UNION ALL SELECT 'appointments', COUNT(*) FROM beauty.rex_001_01_beauty_appointments
UNION ALL SELECT 'surveys_active', COUNT(*) FROM beauty.rex_001_beauty_satisfaction_surveys WHERE is_active;
