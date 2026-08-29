-- RetailEX kasap DB — müşteri duplicate bakiyelerinin tedarikçi TAZA primary'sine aktarımı
-- Tarih: 2026-08-29
-- Yedek: /Users/ferhatnas/Desktop/retailex_kasap_pre_merge_20260829_215416.dump
--
-- Önceki migration (130): duplicate kayıtlar silindi (9 kayıt, 0 hareket)
-- Bu migration (131): silinen müşteri duplicate bakiyelerini TAZA primary'ye aktarır
--
-- İşlem:
--   TED-002 (TAZA tedarikçi primary) bakiyesinden düşülür:
--     - MUS-013 (silinen müşteri TAZa):     -780,553.75
--     - MUS-014 (silinen müşteri TAZA MRESHK): -335,556.25
--   Yeni bakiye: 7,409,913.75 - 1,116,110.00 = 6,293,803.75
--
-- Mantık: Müşteri duplicate'ları kullanıcı tarafından TAZA olarak tanımlandı
-- (müşteri/tedarikçi ayrımı yapılmamış). Bu yüzden bakiyeleri tedarikçi primary'ye aktarıldı.

BEGIN;

UPDATE rex_001_suppliers
SET balance = 7409913.75 - 780553.75 - 335556.25,
    notes = COALESCE(notes, '') ||
            E'\n[2026-08-29] Müşteri duplicate birleştirme: MUS-013 TAZa (780,553.75) + MUS-014 TAZA MRESHK (335,556.25) bakiyeleri bu hesaba aktarıldı.'
WHERE id = '5bb0a60b-feec-449a-94f4-baa07d42e867';

COMMIT;

-- Doğrulama:
-- SELECT code, name, balance, notes FROM rex_001_suppliers WHERE id = '5bb0a60b-feec-449a-94f4-baa07d42e867';