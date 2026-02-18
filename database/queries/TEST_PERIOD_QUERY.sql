-- =====================================================
-- DÖNEM SORGUSU TEST - Uygulamanın Kullandığı Sorgu
-- =====================================================

-- 1. Firma 009'un UUID'sini al
SELECT id, firm_nr, name 
FROM firms 
WHERE firm_nr = '009';

-- 2. Uygulamanın kullandığı EXACT sorguyu test et
SELECT * 
FROM periods 
WHERE firm_id = (SELECT id FROM firms WHERE firm_nr = '009') 
  AND is_active = true 
ORDER BY nr ASC;

-- 3. Tüm dönemleri göster (is_active filtresi olmadan)
SELECT 
    p.*,
    f.firm_nr,
    f.name as firma_adi
FROM periods p
JOIN firms f ON p.firm_id = f.id
WHERE f.firm_nr = '009'
ORDER BY p.nr;

-- 4. is_active field'ının tipini kontrol et
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'periods' 
  AND column_name = 'is_active';
