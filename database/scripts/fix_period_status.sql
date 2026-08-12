-- =====================================================
-- Dönem Durumu Analiz ve Düzeltme Scripti
-- =====================================================

-- 1. Tüm dönemlerin durumunu kontrol et
SELECT 
    f.firm_nr AS firma_no,
    f.name AS firma_adi,
    p.nr AS donem_no,
    p.beg_date AS baslangic,
    p.end_date AS bitis,
    p.is_active AS aktif_mi,
    CASE 
        WHEN p.is_active = true THEN '✅ AÇIK'
        WHEN p.is_active = false THEN '❌ KAPALI'
        ELSE '⚠️ NULL'
    END AS durum
FROM periods p
JOIN firms f ON p.firm_id = f.id
ORDER BY f.firm_nr, p.nr;

-- 2. Kapalı dönemleri listele
SELECT 
    f.firm_nr AS firma_no,
    f.name AS firma_adi,
    p.nr AS donem_no,
    p.beg_date AS baslangic,
    p.end_date AS bitis
FROM periods p
JOIN firms f ON p.firm_id = f.id
WHERE p.is_active = false OR p.is_active IS NULL
ORDER BY f.firm_nr, p.nr;

-- 3. TÜM DÖNEMLERİ AKTİF YAP (DİKKAT: Bu tüm dönemleri açar!)
-- UPDATE periods SET is_active = true;

-- 4. Sadece 2026 yılı dönemlerini aktif yap
UPDATE periods 
SET is_active = true
WHERE EXTRACT(YEAR FROM beg_date) = 2026;

-- 5. Kontrol: Güncellenmiş durumu göster
SELECT 
    f.firm_nr AS firma_no,
    f.name AS firma_adi,
    p.nr AS donem_no,
    p.beg_date AS baslangic,
    p.end_date AS bitis,
    p.is_active AS aktif_mi,
    CASE 
        WHEN p.is_active = true THEN '✅ AÇIK'
        WHEN p.is_active = false THEN '❌ KAPALI'
        ELSE '⚠️ NULL'
    END AS durum
FROM periods p
JOIN firms f ON p.firm_id = f.id
ORDER BY f.firm_nr, p.nr;
