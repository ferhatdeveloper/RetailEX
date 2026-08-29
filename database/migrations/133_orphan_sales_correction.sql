-- ============================================================================
-- 133: Orphan sales düzeltme — alış faturaları (purchase_invoice) için
-- ============================================================================
-- Tarih: 2026-08-29
-- DB: kasap
-- Yedek: database/backups/retailex_kasap_pre_133_20260829_221319.dump
--
-- Önceki migration'lar (130/131/132) müşteri/tedarikçi tablolarını temizledi,
-- orphan satışları dokunmamıştı. Bu migration 208 orphan satış kaydını düzeltir.
--
-- SORUN:
--   rex_001_01_sales tablosunda customer_id kolonuna tedarikçi UUID'leri
--   yazılmış (veri giriş hatası). Bu UUID'ler rex_001_customers'da yok
--   ama rex_001_suppliers'da var. Sonuç: alış faturaları müşteri tablosunda
--   orphan olarak kalmış, cari raporlarına yansımıyor.
--
--   Tüm orphan'lar purchase_invoice (trcode=1 veya 6) veya opening_balance (trcode=99).
--   trcode=7 (sales_invoice) olan orphan YOK — yani gerçek müşteri satışı etkilenmez.
--
-- KAPSAM ANALİZİ (migration öncesi):
--   208 satır orphan, 299,824,006.06 IQD
--   - 205 satır (288.7M): customer_id supplier UUID'si (TED-001..TED-019)
--     → customer_id NULL yapılacak (supplier'a ait, müşteri değil)
--   - 1 satır (11M): 41390aca (silinmiş TED-011) TAZA adına purchase_invoice
--     → TED-002 supplier UUID'sine yönlendir (aynı kişi)
--   - 2 satır (13K): a86fa54b (silinmiş MUS-002) BADIA adına purchase_invoice
--     → TED-005 supplier UUID'sine yönlendir (aynı kişi)
--
-- ETKİ:
--   - Tedarikçi bakiyeleri DEĞİŞMEZ (sales.balance zaten supplier balance'ı
--     etkilemiyor — supplier.balance manuel/cron ile ayrı tutuluyor)
--   - Müşteri ekstreleri/cari raporları artık bu purchase_invoice'ları
--     GÖSTERMEZ (doğru davranış — alış faturası müşteri değil tedarikçi)
--   - Frontend purchase_invoice listesi trcode/fiche_type ile filtreliyor,
--     customer_id NULL olması bunları etkilemez
--   - Veri kaybı: YOK
--
-- ============================================================================

BEGIN;

-- ============================================================
-- BÖLÜM 1: Silinmiş kayıt ID'lerini aktif tedarikçi UUID'sine yönlendir
-- ============================================================
-- 41390aca-bbd7-4cb1-a301-b831c71a4372 → TED-002 (5bb0a60b...) (TAZA, eski TED-011)
-- a86fa54b-20bb-421e-a26e-4381d7a8538a → TED-005 (0807abd4...) (BADIA, eski MUS-002)

UPDATE rex_001_01_sales
   SET customer_id = '5bb0a60b-feec-449a-94f4-baa07d42e867'::uuid
 WHERE customer_id = '41390aca-bbd7-4cb1-a301-b831c71a4372'::uuid;

UPDATE rex_001_01_sales
   SET customer_id = '0807abd4-3132-42b4-877a-baa8ef497380'::uuid
 WHERE customer_id = 'a86fa54b-20bb-421e-a26e-4381d7a8538a'::uuid;

-- ============================================================
-- BÖLÜM 2: Tedarikçi UUID'si olan orphan customer_id'leri NULL yap
-- ============================================================
-- Müşteri tablosunda olmayan, tedarikçi tablosunda bulunan customer_id'ler
-- alış faturası kayıtlarıdır. Müşteri tablosuna referans olmamalı.

UPDATE rex_001_01_sales
   SET customer_id = NULL
 WHERE customer_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM rex_001_customers c WHERE c.id = rex_001_01_sales.customer_id)
   AND EXISTS (SELECT 1 FROM rex_001_suppliers sp WHERE sp.id = rex_001_01_sales.customer_id);

-- ============================================================
-- BÖLÜM 3: schema_migrations kaydı
-- ============================================================

INSERT INTO public.schema_migrations (filename, applied_at)
VALUES ('133_orphan_sales_correction.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- ============================================================================
-- DOĞRULAMA SORGULARI (psql'den ayrı çalıştırılabilir)
-- ============================================================================
-- 1) Orphan sales kalmamalı:
--    SELECT COUNT(*) FROM rex_001_01_sales s
--     WHERE s.customer_id IS NOT NULL
--       AND NOT EXISTS (SELECT 1 FROM rex_001_customers c WHERE c.id = s.customer_id);
--    -- Beklenen: 0
--
-- 2) purchase_invoice'lar artık NULL customer_id (veya geçerli müşteri):
--    SELECT COUNT(*) FROM rex_001_01_sales
--     WHERE fiche_type = 'purchase_invoice' AND customer_id IS NULL;
--    -- Beklenen: ~205 (Bölüm 1'deki 3 redirect sonrası)
--
-- 3) Tedarikçi bakiyeleri migration öncesi/sonrası AYNI olmalı:
--    SELECT code, name, balance FROM rex_001_suppliers
--     WHERE code IN ('TED-001','TED-002','TED-003','TED-005','TED-006',
--                    'TED-007','TED-008','TED-009','TED-010','TED-016',
--                    'TED-017','TED-018','TED-019')
--     ORDER BY code;
--
-- 4) Toplam purchase_invoice tutarı korunmalı:
--    SELECT COUNT(*), SUM(total_gross) FROM rex_001_01_sales WHERE fiche_type = 'purchase_invoice';
--    -- Beklenen: 209 satır, ~299.8M IQD
