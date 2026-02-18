-- =====================================================
-- ACİL ÇÖZÜM: Firma 009 için Dönem Oluştur
-- =====================================================
-- Bu scripti PgAdmin'de çalıştırın!

DO $$
DECLARE
    v_firm_id UUID;
    v_period_exists BOOLEAN;
BEGIN
    -- 1. Firma 009'un ID'sini al
    SELECT id INTO v_firm_id 
    FROM firms 
    WHERE firm_nr = '009';
    
    IF v_firm_id IS NULL THEN
        RAISE EXCEPTION 'Firma 009 bulunamadı!';
    END IF;
    
    RAISE NOTICE 'Firma 009 ID: %', v_firm_id;
    
    -- 2. Dönem var mı kontrol et
    SELECT EXISTS(
        SELECT 1 FROM periods 
        WHERE firm_id = v_firm_id AND nr = 1
    ) INTO v_period_exists;
    
    IF v_period_exists THEN
        -- Dönem varsa sadece aktif yap
        UPDATE periods 
        SET is_active = true 
        WHERE firm_id = v_firm_id AND nr = 1;
        
        RAISE NOTICE '✅ Dönem 01/2026 aktif yapıldı!';
    ELSE
        -- Dönem yoksa oluştur
        INSERT INTO periods (firm_id, nr, beg_date, end_date, is_active)
        VALUES (v_firm_id, 1, '2026-01-01', '2026-12-31', true);
        
        RAISE NOTICE '✅ Dönem 01/2026 oluşturuldu!';
    END IF;
    
    -- 3. Diğer dönemleri pasif yap
    UPDATE periods 
    SET is_active = false 
    WHERE firm_id = v_firm_id AND nr != 1;
    
    RAISE NOTICE '✅ Diğer dönemler pasif yapıldı!';
    
END $$;

-- 4. Sonucu kontrol et
SELECT 
    f.firm_nr,
    f.name,
    p.nr as donem_no,
    p.beg_date,
    p.end_date,
    p.is_active,
    CASE 
        WHEN p.is_active = true THEN '✅ AÇIK'
        ELSE '❌ KAPALI'
    END as durum
FROM periods p
JOIN firms f ON p.firm_id = f.id
WHERE f.firm_nr = '009'
ORDER BY p.nr;
