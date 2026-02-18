-- =====================================================
-- FIRM_NR KONTROLÜ - Hangi firma seçili?
-- =====================================================

-- Tüm firmaları listele
SELECT 
    id,
    firm_nr,
    name,
    is_active
FROM firms
ORDER BY firm_nr;

-- Firma 009'un detaylarını göster
SELECT 
    id,
    firm_nr,
    name,
    is_active,
    pg_typeof(firm_nr) as firm_nr_type
FROM firms
WHERE firm_nr = '009';

-- Firma 009'un dönemlerini göster
SELECT 
    p.*,
    f.firm_nr,
    f.name as firma_adi
FROM periods p
JOIN firms f ON p.firm_id = f.id
WHERE f.firm_nr = '009';
