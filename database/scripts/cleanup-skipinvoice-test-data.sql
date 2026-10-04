-- ============================================================================
-- RetailEX — "Fişsiz avans" (skipInvoice=true) test verilerinin temizliği
-- Tarih: 04.10.2026 (güncel karar)
-- Amaç: ""Satış faturası oluşturulsun mu?"" checkbox'ı kaldırıldığında
--        (`createInvoiceWithDeposit=false`) avans + cari + kasa + (varsa)
--        randevu deposit alanları DB'ye yazılır; SADECE ana satış fişi
--        (`salesAPI.create` / `beautyService.createSale`) atlanır.
--
-- Test sırasında oluşan kalıntıları temizlemek için admin tarafından
-- elle çalıştırılır. ÜRETIM ORTAMINDA ÇALIŞTIRMAYIN!
-- ============================================================================

BEGIN;

-- 1) Bugünkü tek müşteri (test amaçlı oluşturulan)
--    Kullanıcı adı / telefon / kod'a göre dinamik seçim yapılabilir;
--    aşağıda id'yi bulmak için yardımcı sorgu:
--
--    SELECT id, code, name, created_at FROM public.rex_001_customers
--     WHERE created_at::date = CURRENT_DATE
--     ORDER BY created_at DESC;
--
-- Bulunan id'yi aşağıdaki DELETE'e koyun (veya daha güvenli yaklaşım:
-- test müşterinin adını / kodunu biliyorsanız WHERE koşulunu ona göre
-- genişletin).

-- DELETE FROM public.rex_001_customers
--  WHERE id = '<BUGÜN OLUŞTURULAN TEST MÜŞTERİSİ UUID>';

-- 2) Beauty randevuları (bugünkü tüm randevular — fişsiz avans test kapsamı)
--    skipInvoice modunda deposit_amount alanları yazılmış olabilir.
DELETE FROM beauty.rex_001_01_beauty_appointments
 WHERE appointment_date = CURRENT_DATE
    OR created_at::date = CURRENT_DATE;

-- 3) Cari avanslar (bugün — fişsiz avans kayıtları)
DELETE FROM public.rex_001_01_cari_avans
 WHERE created_at::date = CURRENT_DATE;

-- 4) Cari hareketleri — avans sign=+1 (müşteri alacak)
DELETE FROM public.rex_001_account_movements
 WHERE created_at::date = CURRENT_DATE
   AND transaction_type = 'AVANS';

-- 5) Kasa hareketleri — CH_TAHSILAT (avans tahsilatı)
DELETE FROM public.rex_001_01_cash_lines
 WHERE created_at::date = CURRENT_DATE
   AND ozel_kod = 'AVANS';

-- 6) Stok rezervasyonları — avansa bağlı reserved kayıtlar
DELETE FROM public.rex_001_01_inventory_reservations
 WHERE created_at::date = CURRENT_DATE;

COMMIT;

-- ============================================================================
-- Doğrulama sorguları (script sonunda çalıştırın):
-- ============================================================================
-- SELECT count(*) FROM public.rex_001_customers WHERE created_at::date = CURRENT_DATE;
-- SELECT count(*) FROM beauty.rex_001_01_beauty_appointments WHERE created_at::date = CURRENT_DATE;
-- SELECT count(*) FROM public.rex_001_01_cari_avans WHERE created_at::date = CURRENT_DATE;
-- SELECT count(*) FROM public.rex_001_account_movements
--  WHERE created_at::date = CURRENT_DATE AND transaction_type = 'AVANS';
-- SELECT count(*) FROM public.rex_001_01_cash_lines
--  WHERE created_at::date = CURRENT_DATE AND ozel_kod = 'AVANS';
-- SELECT count(*) FROM public.rex_001_01_inventory_reservations WHERE created_at::date = CURRENT_DATE;
--
-- Beklenen: fişsiz avans modunda sales / invoice kayıtları YOK (atlanır),
-- ama cari_avans + account_movements + cash_lines + inventory_reservations
-- + beauty_appointments deposit_amount alanları DOLU olur.
-- ============================================================================