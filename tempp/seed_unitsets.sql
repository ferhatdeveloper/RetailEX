-- =============================================
-- Örnek Birim Setleri (Unit Sets) Seed Data
-- Tablolar: rex_009_unitsets + rex_009_unitsetl
-- =============================================

-- 1) Gıda Birim Seti (ADET / KOLİ / PALET)
INSERT INTO rex_009_unitsets (id, code, name, is_active)
VALUES ('a0000001-0001-0001-0001-000000000001', 'GIDA_BS', 'Gıda Birim Seti', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rex_009_unitsetl (unitset_id, code, name, main_unit, conv_fact1, conv_fact2)
VALUES
  ('a0000001-0001-0001-0001-000000000001', 'ADET', 'Adet', true, 1, 1),
  ('a0000001-0001-0001-0001-000000000001', 'KOLI', 'Koli', false, 12, 1),
  ('a0000001-0001-0001-0001-000000000001', 'PALET', 'Palet', false, 480, 1);

-- 2) Ağırlık Birim Seti (GRAM / KG / TON)
INSERT INTO rex_009_unitsets (id, code, name, is_active)
VALUES ('a0000002-0002-0002-0002-000000000002', 'AGIRLIK_BS', 'Ağırlık Birim Seti', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rex_009_unitsetl (unitset_id, code, name, main_unit, conv_fact1, conv_fact2)
VALUES
  ('a0000002-0002-0002-0002-000000000002', 'GR', 'Gram', true, 1, 1),
  ('a0000002-0002-0002-0002-000000000002', 'KG', 'Kilogram', false, 1000, 1),
  ('a0000002-0002-0002-0002-000000000002', 'TON', 'Ton', false, 1000000, 1);

-- 3) Hacim Birim Seti (ML / LT / M3)
INSERT INTO rex_009_unitsets (id, code, name, is_active)
VALUES ('a0000003-0003-0003-0003-000000000003', 'HACIM_BS', 'Hacim Birim Seti', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rex_009_unitsetl (unitset_id, code, name, main_unit, conv_fact1, conv_fact2)
VALUES
  ('a0000003-0003-0003-0003-000000000003', 'ML', 'Mililitre', true, 1, 1),
  ('a0000003-0003-0003-0003-000000000003', 'CL', 'Santilitre', false, 10, 1),
  ('a0000003-0003-0003-0003-000000000003', 'DL', 'Desilitre', false, 100, 1),
  ('a0000003-0003-0003-0003-000000000003', 'LT', 'Litre', false, 1000, 1),
  ('a0000003-0003-0003-0003-000000000003', 'M3', 'Metreküp', false, 1000000, 1);

-- 4) Uzunluk Birim Seti (MM / CM / M / KM)
INSERT INTO rex_009_unitsets (id, code, name, is_active)
VALUES ('a0000004-0004-0004-0004-000000000004', 'UZUNLUK_BS', 'Uzunluk Birim Seti', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rex_009_unitsetl (unitset_id, code, name, main_unit, conv_fact1, conv_fact2)
VALUES
  ('a0000004-0004-0004-0004-000000000004', 'MM', 'Milimetre', true, 1, 1),
  ('a0000004-0004-0004-0004-000000000004', 'CM', 'Santimetre', false, 10, 1),
  ('a0000004-0004-0004-0004-000000000004', 'M', 'Metre', false, 1000, 1),
  ('a0000004-0004-0004-0004-000000000004', 'KM', 'Kilometre', false, 1000000, 1);

-- 5) Alan Birim Seti (CM2 / M2 / HA)
INSERT INTO rex_009_unitsets (id, code, name, is_active)
VALUES ('a0000005-0005-0005-0005-000000000005', 'ALAN_BS', 'Alan Birim Seti', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rex_009_unitsetl (unitset_id, code, name, main_unit, conv_fact1, conv_fact2)
VALUES
  ('a0000005-0005-0005-0005-000000000005', 'CM2', 'Santimetrekare', true, 1, 1),
  ('a0000005-0005-0005-0005-000000000005', 'M2', 'Metrekare', false, 10000, 1),
  ('a0000005-0005-0005-0005-000000000005', 'HA', 'Hektar', false, 100000000, 1);

-- 6) Zaman Birim Seti (DAK / SAAT / GUN)
INSERT INTO rex_009_unitsets (id, code, name, is_active)
VALUES ('a0000006-0006-0006-0006-000000000006', 'ZAMAN_BS', 'Zaman Birim Seti', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rex_009_unitsetl (unitset_id, code, name, main_unit, conv_fact1, conv_fact2)
VALUES
  ('a0000006-0006-0006-0006-000000000006', 'DAK', 'Dakika', true, 1, 1),
  ('a0000006-0006-0006-0006-000000000006', 'SAAT', 'Saat', false, 60, 1),
  ('a0000006-0006-0006-0006-000000000006', 'GUN', 'Gün', false, 1440, 1);

-- 7) Tekstil Birim Seti (TOP / M / DUZINE)
INSERT INTO rex_009_unitsets (id, code, name, is_active)
VALUES ('a0000007-0007-0007-0007-000000000007', 'TEKSTIL_BS', 'Tekstil Birim Seti', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rex_009_unitsetl (unitset_id, code, name, main_unit, conv_fact1, conv_fact2)
VALUES
  ('a0000007-0007-0007-0007-000000000007', 'ADET', 'Adet', true, 1, 1),
  ('a0000007-0007-0007-0007-000000000007', 'DUZINE', 'Düzine', false, 12, 1),
  ('a0000007-0007-0007-0007-000000000007', 'TOP', 'Top', false, 100, 1);

-- 8) İçecek Birim Seti (ADET / KASA / PALET)
INSERT INTO rex_009_unitsets (id, code, name, is_active)
VALUES ('a0000008-0008-0008-0008-000000000008', 'ICECEK_BS', 'İçecek Birim Seti', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rex_009_unitsetl (unitset_id, code, name, main_unit, conv_fact1, conv_fact2)
VALUES
  ('a0000008-0008-0008-0008-000000000008', 'ADET', 'Adet', true, 1, 1),
  ('a0000008-0008-0008-0008-000000000008', 'KASA', 'Kasa', false, 24, 1),
  ('a0000008-0008-0008-0008-000000000008', 'PALET', 'Palet', false, 1200, 1);

-- Verify
SELECT s.code AS set_code, s.name AS set_name, l.code AS unit_code, l.name AS unit_name, l.main_unit, l.conv_fact1, l.conv_fact2
FROM rex_009_unitsets s
JOIN rex_009_unitsetl l ON l.unitset_id = s.id
ORDER BY s.code, l.main_unit DESC, l.conv_fact1 ASC;
