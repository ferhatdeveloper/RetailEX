-- 1. Firma Tanımı (Mevcut değilse oluştur)
INSERT INTO firms (firm_nr, name, title, city)
VALUES ('001', 'MERKEZ FIRMA', 'MERKEZ FIRMA', 'ISTANBUL')
ON CONFLICT (firm_nr) DO UPDATE SET name = EXCLUDED.name;

-- 2. Dönem Tanımı (Firma ID'sini dinamik olarak alarak ekle)
INSERT INTO periods (firm_id, nr, beg_date, end_date, is_active)
SELECT 
    id as firm_id, 
    1 as nr,              -- Dönem No (Örn: 1)
    '2025-01-01'::date,   -- Başlangıç
    '2025-12-31'::date,   -- Bitiş
    true
FROM firms 
WHERE firm_nr = '001'
ON CONFLICT (firm_id, nr) DO UPDATE SET
    beg_date = EXCLUDED.beg_date,
    end_date = EXCLUDED.end_date;

-- Kontrol
SELECT f.firm_nr, p.nr, p.beg_date, p.end_date 
FROM periods p 
JOIN firms f ON f.id = p.firm_id;
