-- 213_fix_payment_state_direct_sale.sql
-- Rezervasyon olmadan direkt hizmet satışı yapıldığında payment_state 'unpaid'
-- dönüyordu çünkü CASE sırasında deposit_amount=0 kontrolü paid kontrolünden
-- önce geliyordu. Bu migration view'ı güncelleyerek:
--   1) status='completed' durumunda direkt 'paid' döner
--   2) (deposit + remainder) >= total kontrolü deposit=0 kontrolünden önce yapılır
--   3) unpaid yalnızca deposit=0 VE remainder=0 ise döner

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
    'Rezervasyon peşinat/ödeme durumu — DepositPrePaymentReport besleme view''u. payment_state: no_amount/unpaid/paid/deposit_only/partial. 213 migration: direkt satış (deposit=0, status=completed) artık paid döner.';

NOTIFY pgrest, 'reload schema';
