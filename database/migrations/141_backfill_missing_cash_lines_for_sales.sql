-- Migration 141: Cash satış faturalarında eksik kasa satırlarını tamamla
--
-- Skandal (2026-09-01 kasap/testere): Kullanıcı "Nakit" ödeme ile
-- yeni satış faturası kaydettiğinde kasaya tahsilat satırı
-- (cash_lines) yazılmıyordu. Hata faturanın create akışında
-- sessizce `console.warn` ile yutulduğu için fatura yine
-- "başarıyla" kaydedildi — fakat kasa defteri boş kaldı.
-- Edit → save yaptığında ise yardımcı aynı fiche_no için
-- idempotent güncelleme yoluna düştüğü için kasa satırı var
-- görünüyordu (eski veriler için) veya eksikse yeniden INSERT
-- çalıştığı için arada düzeliyordu.
--
-- Etki: 31 Ağustos 2026'dan beri pek çok cash satış faturasının
-- kasa karşılığı yok. Ciro / kasa raporu eksik; cari bakiye
-- (CH_TAHSILAT için) müşteri tarafında zaten düşmüş olabilir.
-- Bu migration yalnızca KASA tarafını onarır.
--
-- Koşullar:
--  1. Satış faturası (trcode 7, 8, 4 veya 9 → sales_invoice / service)
--  2. payment_method 'cash', 'nakit' veya 'Cash'/'Nakit' büyük-küçük
--  3. net_amount > 0 (kasaya yansıtılacak tutar)
--  4. İptal edilmemiş (is_cancelled = false)
--  5. cash_lines tablosunda aynı fiche_no için kayıt YOK
--  6. ERP'nin "PATRON KASA" register'ı aktif (yoksa ilk aktif kasa)
--
-- Davranış:
--  - sign: +1 (KASA_GIRIS / CH_TAHSILAT)
--  - transaction_type: 'KASA_GIRIS' (sales kaynaklı otomatik tahsilat)
--  - amount: net_amount (gerçek tahsil edilen tutar, indirim sonrası)
--  - definition: 'Satış faturası — <fiche_no>'
--  - date: sales.date (veya created_at)
--  - customer_id: sales.customer_id valid ise yazılır, aksi null
--  - currency_code: 'YEREL', f_amount: 0
--  - transfer_status: 0
--  - special_code: ''
--  - tax_rate / withholding_tax_rate: 0

-- 1) Geçici tablo: backfill için aday listesi
DROP TABLE IF EXISTS _migration_141_candidates;
CREATE TEMP TABLE _migration_141_candidates AS
SELECT
  s.firm_nr,
  s.period_nr,
  s.fiche_no,
  COALESCE(s.date, s.created_at) AS date,
  s.net_amount,
  s.customer_id,
  s.customer_name,
  -- İlk aktif kasa: MERKEZ KASA tercih (sales kaynaklı tahsilatların
  -- hedefi createKasaIslemi içinde ERP_SETTINGS.selected_cash_registers[0]
  -- veya fallback olarak olusturma_tarihi sırasına göre ilk aktif kasa.
  -- testere DB'sinde MERKEZ KASA birikimli 869.900 tutar ile birikmiş;
  -- fatura INSERT'leri buraya düşüyor). PATRON KASA yedek tercih.
  (SELECT id FROM rex_001_cash_registers
    WHERE firm_nr = s.firm_nr AND is_active = true
    ORDER BY (name ILIKE 'MERKEZ KASA') DESC,
             (name ILIKE 'PATRON KASA') DESC,
             code ASC
    LIMIT 1) AS register_id
FROM rex_001_01_sales s
WHERE s.is_cancelled = false
  AND s.trcode IN (7, 8, 4, 9)
  AND LOWER(COALESCE(s.payment_method, '')) IN ('cash', 'nakit')
  AND COALESCE(s.net_amount, 0) > 0
  AND s.fiche_no IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rex_001_01_cash_lines cl
     WHERE cl.firm_nr = s.firm_nr
       AND cl.fiche_no = s.fiche_no
  );

-- 2) cash_lines INSERT (NOT EXISTS ile idempotent; UNIQUE(fiche_no) korur)
INSERT INTO rex_001_01_cash_lines (
  firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
  definition, transaction_type,
  customer_id, party_id, currency_code, exchange_rate, f_amount,
  transfer_status, special_code,
  target_register_id, bank_id, bank_account_id, expense_card_id,
  tax_rate, withholding_tax_rate,
  created_at
)
SELECT
  c.firm_nr,
  c.period_nr,
  c.register_id,
  c.fiche_no,
  c.date,
  c.net_amount,
  1,
  'Satış faturası — ' || c.fiche_no,
  'KASA_GIRIS',
  CASE WHEN c.customer_id IS NOT NULL
       THEN c.customer_id
       ELSE NULL END,
  NULL,
  'YEREL',
  1,
  0,
  0,
  '',
  NULL, NULL, NULL, NULL,
  0, 0,
  NOW()
FROM _migration_141_candidates c
WHERE c.register_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rex_001_01_cash_lines cl
     WHERE cl.firm_nr = c.firm_nr
       AND cl.fiche_no = c.fiche_no
  );

-- 3) Kasa bakiyelerini güncelle (backfill edilen + bakiye delta)
UPDATE rex_001_cash_registers r
   SET balance = COALESCE(r.balance, 0) + COALESCE(agg.total, 0),
       updated_at = NOW()
FROM (
  SELECT cl.register_id, SUM(cl.amount * cl.sign) AS total
  FROM rex_001_01_cash_lines cl
  WHERE cl.created_at >= NOW() - INTERVAL '1 minute'   -- bu migration ile eklenen
    AND cl.transaction_type = 'KASA_GIRIS'
    AND cl.definition LIKE 'Satış faturası — %'
  GROUP BY cl.register_id
) agg
WHERE r.id = agg.register_id;

-- 4) Temizlik
DROP TABLE _migration_141_candidates;
