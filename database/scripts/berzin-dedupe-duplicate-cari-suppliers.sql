-- Berzin (ve benzeri kiracılar): TED-* cari hesaplar hem müşteri hem tedarikçi tablosunda
-- çift kayıtlı. Satış/tahsilat müşteri UUID'sinde; tedarikçi kopyasını pasifleştir.
--
-- Çalıştırma (VPS):
--   psql -d berzin_com -f database/scripts/berzin-dedupe-duplicate-cari-suppliers.sql
--
-- Önizleme:
--   psql -d berzin_com -c "SELECT s.code, s.name, s.balance FROM rex_001_suppliers s
--     INNER JOIN rex_001_customers c ON UPPER(TRIM(c.code)) = UPPER(TRIM(s.code))
--     WHERE COALESCE(s.is_active, true) = true LIMIT 20;"

BEGIN;

-- Aynı kodlu tedarikçi kopyalarını kapat (müşteri kaydı esas)
UPDATE rex_001_suppliers s
SET is_active = false,
    notes = COALESCE(NULLIF(TRIM(s.notes), ''), '') ||
      CASE WHEN COALESCE(NULLIF(TRIM(s.notes), ''), '') = '' THEN '' ELSE ' | ' END ||
      'Pasif: müşteri tablosunda aynı kod (' || TO_CHAR(NOW(), 'YYYY-MM-DD') || ')'
FROM rex_001_customers c
WHERE UPPER(TRIM(COALESCE(c.code, ''))) = UPPER(TRIM(COALESCE(s.code, '')))
  AND TRIM(COALESCE(c.code, '')) <> ''
  AND COALESCE(s.is_active, true) = true;

-- Aynı ünvanda farklı kodlu tedarikçi kopyalarını kapat (ör. MUS-016 / TED-054 ALI ROMI)
UPDATE rex_001_suppliers s
SET is_active = false,
    notes = COALESCE(NULLIF(TRIM(s.notes), ''), '') ||
      CASE WHEN COALESCE(NULLIF(TRIM(s.notes), ''), '') = '' THEN '' ELSE ' | ' END ||
      'Pasif: müşteri tablosunda aynı ünvan (' || TO_CHAR(NOW(), 'YYYY-MM-DD') || ')'
FROM rex_001_customers c
WHERE TRIM(LOWER(COALESCE(c.name, ''))) = TRIM(LOWER(COALESCE(s.name, '')))
  AND TRIM(COALESCE(c.name, '')) <> ''
  AND COALESCE(s.is_active, true) = true
  AND NOT (
    UPPER(TRIM(COALESCE(c.code, ''))) = UPPER(TRIM(COALESCE(s.code, '')))
    AND TRIM(COALESCE(c.code, '')) <> ''
  );

-- ankawa TED-002: müşteri eşi yok; anormal bakiye sıfırlanır (defter onarımı UI'da)
UPDATE rex_001_suppliers
SET balance = 0,
    is_active = false,
    notes = COALESCE(NULLIF(TRIM(notes), ''), '') ||
      CASE WHEN COALESCE(NULLIF(TRIM(notes), ''), '') = '' THEN '' ELSE ' | ' END ||
      'Pasif: anormal bakiye temizliği (' || TO_CHAR(NOW(), 'YYYY-MM-DD') || ')'
WHERE UPPER(TRIM(code)) = 'TED-002'
  AND UPPER(TRIM(COALESCE(name, ''))) = 'ANKAWA';

COMMIT;
