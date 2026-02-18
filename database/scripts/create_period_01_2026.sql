-- =====================================================
-- 01 Numaralı 2026 Dönemi Oluşturma
-- =====================================================
-- Bu script, firma için 01 numaralı 2026 dönemini oluşturur
-- Kullanım: Firma numarasını (firm_nr) değiştirerek kullanabilirsiniz

-- Değişkenler (İhtiyaca göre değiştirin)
DO $$
DECLARE
    v_firm_nr VARCHAR(10) := '009'; -- Firma numarası
    v_firm_id UUID;
    v_period_nr INTEGER := 1; -- Dönem numarası
    v_beg_date DATE := '2026-01-01'; -- Başlangıç tarihi
    v_end_date DATE := '2026-12-31'; -- Bitiş tarihi
    v_existing_period_id UUID;
BEGIN
    -- 1. Firma ID'sini al
    SELECT id INTO v_firm_id 
    FROM firms 
    WHERE firm_nr = v_firm_nr;
    
    IF v_firm_id IS NULL THEN
        RAISE EXCEPTION 'Firma bulunamadı: %', v_firm_nr;
    END IF;
    
    RAISE NOTICE 'Firma bulundu: % (ID: %)', v_firm_nr, v_firm_id;
    
    -- 2. Aynı dönem var mı kontrol et
    SELECT id INTO v_existing_period_id
    FROM periods
    WHERE firm_id = v_firm_id AND nr = v_period_nr;
    
    IF v_existing_period_id IS NOT NULL THEN
        RAISE NOTICE 'Dönem zaten mevcut (ID: %). Güncelleniyor...', v_existing_period_id;
        
        -- Mevcut dönemi güncelle
        UPDATE periods
        SET 
            beg_date = v_beg_date,
            end_date = v_end_date,
            is_active = true
        WHERE id = v_existing_period_id;
        
        RAISE NOTICE 'Dönem güncellendi: % - % / %', v_period_nr, v_beg_date, v_end_date;
    ELSE
        -- Yeni dönem oluştur
        INSERT INTO periods (firm_id, nr, beg_date, end_date, is_active)
        VALUES (v_firm_id, v_period_nr, v_beg_date, v_end_date, true)
        RETURNING id INTO v_existing_period_id;
        
        RAISE NOTICE 'Yeni dönem oluşturuldu: % - % / % (ID: %)', 
            v_period_nr, v_beg_date, v_end_date, v_existing_period_id;
    END IF;
    
    -- 3. Diğer dönemleri pasif yap (opsiyonel - sadece bir dönem aktif olsun)
    UPDATE periods
    SET is_active = false
    WHERE firm_id = v_firm_id 
      AND id != v_existing_period_id
      AND is_active = true;
    
    RAISE NOTICE 'Diğer dönemler pasif yapıldı.';
    
END $$;

-- =====================================================
-- Kontrol Sorgusu - Oluşturulan dönemi göster
-- =====================================================
SELECT 
    p.id,
    p.nr AS donem_no,
    p.beg_date AS baslangic,
    p.end_date AS bitis,
    p.is_active AS aktif_mi,
    f.firm_nr AS firma_no,
    f.name AS firma_adi
FROM periods p
JOIN firms f ON p.firm_id = f.id
WHERE f.firm_nr = '009'
ORDER BY p.nr;
