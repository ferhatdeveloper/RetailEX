-- ============================================================================
-- 181 — Beauty: Randevu Ön Ödeme (Deposit) + Kalan Ödeme (Remainder)
-- ----------------------------------------------------------------------------
-- Amaç:
--   Müşteri randevuyu yarın/haftaya oluştururken kısmi ön ödeme (deposit)
--   alabilsin; geldiğinde kalan ödeme (remainder) tahsil edilsin. Hizmet
--   tamamlandığında stok/sarf düşümü tetiklensin.
--
-- Muhasebe modeli (kıdemli muhasebeci gözüyle — jRetail / Logo uyumlu):
--   • Deposit (ön ödeme):
--       cari avans ekstresi  → − (müşteri hesabı "alacak" yönünde artar;
--         bakiyeye yansır ama hizmet geliri sayılmaz)
--       kasa/banka           → +
--       stok                 → etkilenmez (hizmet henüz verilmedi)
--   • Remainder (kalan ödeme, hizmet verildikten SONRA):
--       cari                 → − (hizmet faturası borcuna karşılık)
--       kasa/banka           → +
--       stok                 → etkilenmez (zaten tamamlandı anında düşecek)
--   • completeAppointment():
--       cari                 → + (toplam hizmet borcu)
--       deposit zaten cari avans olarak durduğu için mahsup edilir;
--         kullanıcı yalnızca remainder farkını öder.
--       stok                 → − (applyConsumableDeductionForAppointment)
--
-- Tablo yapısı:
--   • beauty.rex_{firmNr}_{periodNr}_beauty_appointments  → ek kolonlar
--       deposit_amount, deposit_provider, deposit_date,
--       deposit_journal_entry_id, remainder_paid_amount,
--       remainder_payment_date, remainder_journal_entry_id
--   • beauty.rex_{firmNr}_{periodNr}_beauty_appointment_payments (YENİ)
--       Her deposit / remainder ödemesini ayrı satır olarak tutar.
-- ============================================================================

SET search_path TO public, beauty;

-- ----------------------------------------------------------------------------
-- 1. Mevcut beauty_appointments tablolarına deposit + remainder kolonları
-- ----------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT tablename
          FROM pg_tables
         WHERE schemaname = 'beauty'
           AND tablename ~ '^rex_[0-9]+_[0-9]+_beauty_appointments$'
    LOOP
        EXECUTE format(
            'ALTER TABLE beauty.%I
                ADD COLUMN IF NOT EXISTS deposit_amount             NUMERIC(15,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS deposit_provider           VARCHAR(40),
                ADD COLUMN IF NOT EXISTS deposit_date               TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS deposit_journal_entry_id  UUID,
                ADD COLUMN IF NOT EXISTS remainder_paid_amount      NUMERIC(15,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS remainder_payment_date    TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS remainder_journal_entry_id UUID',
            r.tablename
        );

        -- deposit_amount tutar kontrolü (negatif olamaz)
        EXECUTE format(
            'ALTER TABLE beauty.%I
                DROP CONSTRAINT IF EXISTS %I',
            r.tablename,
            r.tablename || '_deposit_amount_ck'
        );
        EXECUTE format(
            'ALTER TABLE beauty.%I
                ADD CONSTRAINT %I
                CHECK (deposit_amount >= 0 AND deposit_amount <= total_price OR total_price = 0)',
            r.tablename,
            r.tablename || '_deposit_amount_ck'
        );

        -- remainder_paid_amount kontrolü
        EXECUTE format(
            'ALTER TABLE beauty.%I
                DROP CONSTRAINT IF EXISTS %I',
            r.tablename,
            r.tablename || '_remainder_paid_amount_ck'
        );
        EXECUTE format(
            'ALTER TABLE beauty.%I
                ADD CONSTRAINT %I
                CHECK (remainder_paid_amount >= 0)',
            r.tablename,
            r.tablename || '_remainder_paid_amount_ck'
        );
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Yeni tablo: beauty_appointment_payments (deposit + remainder hareketleri)
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_firm TEXT;
DECLARE v_pn   TEXT;
BEGIN
    FOR v_firm IN
        SELECT lpad(trim(firm_nr::text), 3, '0')
          FROM public.firms
         WHERE COALESCE(is_active, true) = true
    LOOP
        FOR v_pn IN
            SELECT nr::text
              FROM public.periods
             WHERE firm_id = (SELECT id FROM public.firms
                               WHERE lpad(trim(firm_nr::text), 3, '0') = v_firm)
        LOOP
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS beauty.%I (
                    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    appointment_id           UUID NOT NULL,
                    customer_id              UUID,
                    payment_kind             VARCHAR(20) NOT NULL
                                              CHECK (payment_kind IN (''deposit'',''remainder'',''full'')),
                    amount                   NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
                    currency                 VARCHAR(10) DEFAULT ''IQD'',
                    provider                 VARCHAR(40),
                        -- ''cash'' | ''card'' | ''gateway'' | ''bank_transfer'' | ''veresiye''
                    cash_register_id         UUID,
                    cash_register_code       VARCHAR(40),
                    journal_entry_id         UUID,
                        -- cari/kasa muhasebe hareketine bağlantı (FK account_transactions)
                    notes                    TEXT,
                    paid_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    created_by               UUID,
                    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT %I FOREIGN KEY (appointment_id)
                        REFERENCES beauty.%I (id) ON DELETE CASCADE
                )',
                'rex_' || v_firm || '_' || v_pn || '_beauty_appointment_payments',
                'rex_' || v_firm || '_' || v_pn || '_beauty_appointment_payments_apt_fk',
                'rex_' || v_firm || '_' || v_pn || '_beauty_appointments'
            );

            -- Sık sorgu için index: randevuya göre
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I
                   ON beauty.%I (appointment_id, paid_at DESC)',
                'rex_' || v_firm || '_' || v_pn || '_beauty_appointment_payments_apt_idx',
                'rex_' || v_firm || '_' || v_pn || '_beauty_appointment_payments'
            );

            -- Cari/müşteri bazlı ekstre için index
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I
                   ON beauty.%I (customer_id, paid_at DESC)
                  WHERE customer_id IS NOT NULL',
                'rex_' || v_firm || '_' || v_pn || '_beauty_appointment_payments_cust_idx',
                'rex_' || v_firm || '_' || v_pn || '_beauty_appointment_payments'
            );

            -- Tür (deposit / remainder) bazlı raporlama için index
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I
                   ON beauty.%I (payment_kind, paid_at DESC)',
                'rex_' || v_firm || '_' || v_pn || '_beauty_appointment_payments_kind_idx',
                'rex_' || v_firm || '_' || v_pn || '_beauty_appointment_payments'
            );
        END LOOP;
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Yardımcı görünüm (view): randevunun kalan ödemesini hesaplar
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW beauty.beauty_appointment_payment_status AS
SELECT
    a.id                              AS appointment_id,
    a.client_id                       AS customer_id,
    a.appointment_date,
    a.status,
    COALESCE(a.total_price, 0)        AS total_price,
    COALESCE(a.deposit_amount, 0)     AS deposit_amount,
    COALESCE(a.deposit_provider, '')  AS deposit_provider,
    a.deposit_date,
    COALESCE(a.remainder_paid_amount, 0) AS remainder_paid_amount,
    a.remainder_payment_date,
    GREATEST(
        0,
        ROUND(
            (COALESCE(a.total_price, 0) - COALESCE(a.deposit_amount, 0)
             - COALESCE(a.remainder_paid_amount, 0))::numeric,
            2
        )
    )                                 AS outstanding_amount,
    CASE
        WHEN COALESCE(a.total_price, 0) = 0                                THEN 'no_amount'
        WHEN COALESCE(a.deposit_amount, 0) = 0                             THEN 'unpaid'
        WHEN (COALESCE(a.deposit_amount, 0) + COALESCE(a.remainder_paid_amount, 0))
             >= COALESCE(a.total_price, 0)                                THEN 'paid'
        WHEN COALESCE(a.deposit_amount, 0) > 0
             AND COALESCE(a.remainder_paid_amount, 0) = 0                  THEN 'deposit_only'
        ELSE 'partial'
    END                                AS payment_state
FROM beauty.rex_001_01_beauty_appointments a;

NOTIFY pgrest, 'reload schema';
