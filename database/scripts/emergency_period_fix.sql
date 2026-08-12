-- =====================================================
-- DÖNEM SORUNU - ACİL TANI
-- =====================================================

-- 1. Firmalar tablosunu kontrol et
SELECT 
    id,
    firm_nr,
    name,
    pg_typeof(firm_nr) as firm_nr_type
FROM firms
ORDER BY firm_nr;

-- 2. Periods tablosunu kontrol et
SELECT 
    p.id,
    p.firm_id,
    p.nr,
    p.beg_date,
    p.end_date,
    p.is_active,
    f.firm_nr,
    f.name
FROM periods p
LEFT JOIN firms f ON p.firm_id = f.id
ORDER BY f.firm_nr, p.nr;

-- 3. Firma 009 için dönem sorgusunu test et (String)
SELECT * 
FROM periods 
WHERE firm_id = (SELECT id FROM firms WHERE firm_nr = '009') 
  AND is_active = true 
ORDER BY nr ASC;

-- 4. Firma 009 için dönem sorgusunu test et (Integer)
SELECT * 
FROM periods 
WHERE firm_id = (SELECT id FROM firms WHERE firm_nr = '9') 
  AND is_active = true 
ORDER BY nr ASC;

-- 5. Tüm firmaların ID'lerini göster
SELECT 
    id,
    firm_nr,
    name,
    (SELECT COUNT(*) FROM periods WHERE firm_id = firms.id) as period_count
FROM firms;

-- 6. ÇÖZÜM: Eğer dönem yoksa oluştur
DO $$
DECLARE
    v_firm_id UUID;
BEGIN
    -- Firma 009'un ID'sini al
    SELECT id INTO v_firm_id FROM firms WHERE firm_nr = '009';
    
    IF v_firm_id IS NULL THEN
        RAISE NOTICE 'Firma 009 bulunamadı!';
    ELSE
        RAISE NOTICE 'Firma 009 ID: %', v_firm_id;
        
        -- Dönem var mı kontrol et
        IF NOT EXISTS (SELECT 1 FROM periods WHERE firm_id = v_firm_id AND nr = 1) THEN
            -- Dönem yoksa oluştur
            INSERT INTO periods (firm_id, nr, beg_date, end_date, is_active)
            VALUES (v_firm_id, 1, '2026-01-01', '2026-12-31', true);
            RAISE NOTICE 'Dönem 01/2026 oluşturuldu!';
        ELSE
            -- Dönem varsa aktif yap
            UPDATE periods 
            SET is_active = true 
            WHERE firm_id = v_firm_id AND nr = 1;
            RAISE NOTICE 'Dönem 01/2026 aktif yapıldı!';
        END IF;
    END IF;
END $$;

-- 7. Kontrol: Sonucu göster
SELECT 
    f.firm_nr,
    f.name,
    p.nr as donem_no,
    p.beg_date,
    p.end_date,
    p.is_active
FROM periods p
JOIN firms f ON p.firm_id = f.id
WHERE f.firm_nr = '009'
ORDER BY p.nr;
