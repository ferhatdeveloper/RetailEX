-- =====================================================
-- Dönem Durumu Kontrol ve Düzeltme Scripti
-- =====================================================

-- 1. Firma 009'un tüm dönemlerini listele
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

-- 2. Eğer dönem 01 kapalıysa (is_active = false), aç:
UPDATE periods 
SET is_active = true 
WHERE nr = '01' 
  AND firm_id = (SELECT id FROM firms WHERE firm_nr = '009')
  AND is_active = false;

-- 3. Kontrol et - Tekrar listele
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
