-- 210_appointment_payment_status_view.sql
-- Rezervasyon / Ön Ödeme Raporu (DepositPrePaymentReport) için gerekli view.
-- beautyService.getDepositPrePaymentReport bu view'a JOIN atıyor; view yoksa
-- "relation does not exist" hatası alıp catch'te yutuluyor ve rapor boş
-- dönüyordu. 181 migration'ında tanımlıydı ama sıfır kurulumda master şema ile
-- birlikte oluşmadığı için bazı DB'lerde eksik kalmıştı; bu migration kalıcı
-- çözüm olarak yeni DB'lere master üzerinden, mevcut DB'lere ise numaralı
-- migration olarak gelir.

CREATE OR REPLACE VIEW beauty.beauty_appointment_payment_status AS
SELECT
    a.id                                  AS appointment_id,
    a.client_id                           AS customer_id,
    a.appointment_date,
    a.status,
    COALESCE(a.total_price, 0)            AS total_price,
    COALESCE(a.deposit_amount, 0)         AS deposit_amount,
    COALESCE(a.deposit_provider, '')      AS deposit_provider,
    a.deposit_date,
    COALESCE(a.remainder_paid_amount, 0)  AS remainder_paid_amount,
    a.remainder_payment_date,
    GREATEST(
        0,
        ROUND(
            (COALESCE(a.total_price, 0) - COALESCE(a.deposit_amount, 0)
             - COALESCE(a.remainder_paid_amount, 0))::numeric,
            2
        )
    )                                     AS outstanding_amount,
    -- 18.10.2026 — CASE sıralaması düzeltildi: 'paid' kontrolü 'unpaid'
    -- kontrolünden ÖNCE yapılmalı. Aksi halde rezervasyon olmadan direkt
    -- satış yapıldığında (deposit=0, remainder=total) 'unpaid' dönüyordu
    -- çünkü deposit=0 kontrolü remainder kontrolünden önce geliyordu.
    -- Ayrıca status='completed' durumunda da 'paid' dönmeli (hizmet bitti,
    -- ödeme tamamlandı kabul edilir).
    CASE
        WHEN COALESCE(a.total_price, 0) = 0                                THEN 'no_amount'
        WHEN LOWER(TRIM(COALESCE(a.status, ''))) = 'completed'             THEN 'paid'
        WHEN (COALESCE(a.deposit_amount, 0) + COALESCE(a.remainder_paid_amount, 0))
             >= COALESCE(a.total_price, 0)                                 THEN 'paid'
        WHEN COALESCE(a.deposit_amount, 0) = 0
             AND COALESCE(a.remainder_paid_amount, 0) = 0                  THEN 'unpaid'
        WHEN COALESCE(a.deposit_amount, 0) > 0
             AND COALESCE(a.remainder_paid_amount, 0) = 0                  THEN 'deposit_only'
        ELSE 'partial'
    END                                   AS payment_state
FROM beauty.rex_001_01_beauty_appointments a;

COMMENT ON VIEW beauty.beauty_appointment_payment_status IS
    'Rezervasyon peşinat/ödeme durumu — DepositPrePaymentReport besleme view''u. payment_state: no_amount/unpaid/paid/deposit_only/partial. outstanding_amount >= 0 garantili; total = deposit + remainder + outstanding.';

NOTIFY pgrest, 'reload schema';
