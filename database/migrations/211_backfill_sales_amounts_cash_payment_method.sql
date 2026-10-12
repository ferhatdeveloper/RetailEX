-- 211_backfill_sales_amounts_cash_payment_method.sql
-- BEA-2026-MV5NWLR1 vakası (12.10.2026): sales.total_gross=0,
-- sales.paid_amount=0, sales.net_amount yanlış (peşinat düşülmüş gibi),
-- cash_lines.payment_method=NULL. Yeni INSERT/UPDATE bu kolonları yazıyor;
-- eski veri için geriye dönük backfill.
--
-- Muhasebe kuralı (KDV=0, indirim=0 varsayımı):
--   total_gross = total_net (KDV ayrılırsa: total_net + total_vat)
--   paid_amount = Σ(cash_lines.amount * cash_lines.sign)  — KASA_GIRIS/CH_TAHSILAT
--   net_amount  = total_net (peşinat ayrı cash_lines; başlıkta düşülmez)
--   payment_method (cash_lines): NULL ise transaction_type'tan tahmin
--     (KASA_GIRIS/CH_TAHSILAT → 'cash').

-- 1) sales.total_gross = total_net (KDV=0 varsayımı)
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE tablename ~ '^rex_[0-9]+_[0-9]+_sales$'
    LOOP
        EXECUTE format(
            'UPDATE %I.%I
                SET total_gross = COALESCE(total_net, 0)
              WHERE COALESCE(total_gross, 0) = 0
                AND COALESCE(total_net, 0) > 0
                AND COALESCE(is_cancelled, false) = false',
            r.schemaname, r.tablename);
    END LOOP;
END $$;

-- 2) sales.paid_amount = cash_lines Σ (KASA_GIRIS / CH_TAHSILAT, sign dahil)
DO $$
DECLARE r RECORD;
    cash_table text;
BEGIN
    FOR r IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE tablename ~ '^rex_[0-9]+_[0-9]+_sales$'
    LOOP
        cash_table := replace(r.tablename, '_sales', '_cash_lines');
        -- İlgili cash_lines tablosu var mı kontrol et
        IF EXISTS (
            SELECT 1 FROM pg_tables
            WHERE schemaname = r.schemaname AND tablename = cash_table
        ) THEN
            EXECUTE format(
                'UPDATE %I.%I s
                    SET paid_amount = COALESCE((
                        SELECT SUM(cl.amount * cl.sign)
                          FROM %I.%I cl
                         WHERE cl.fiche_no = s.fiche_no
                           AND cl.transaction_type IN (''KASA_GIRIS'',''CH_TAHSILAT'')
                    ), 0)
                  WHERE COALESCE(s.paid_amount, 0) = 0
                    AND COALESCE(s.is_cancelled, false) = false',
                r.schemaname, r.tablename, r.schemaname, cash_table);
        END IF;
    END LOOP;
END $$;

-- 3) sales.net_amount = total_net (peşinat düşülmemeli)
--    Koşul: net_amount < total_net ise düzelt; iade (negative) veya farklı
--    durumlar için > durumuna dokunma.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE tablename ~ '^rex_[0-9]+_[0-9]+_sales$'
    LOOP
        EXECUTE format(
            'UPDATE %I.%I
                SET net_amount = COALESCE(total_net, 0)
              WHERE COALESCE(net_amount, 0) < COALESCE(total_net, 0)
                AND COALESCE(is_cancelled, false) = false
                AND COALESCE(total_net, 0) > 0',
            r.schemaname, r.tablename);
    END LOOP;
END $$;

-- 4) cash_lines.payment_method backfill (NULL ise transaction_type'tan)
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE tablename ~ '^rex_[0-9]+_[0-9]+_cash_lines$'
    LOOP
        EXECUTE format(
            'UPDATE %I.%I
                SET payment_method = ''cash''
              WHERE payment_method IS NULL
                AND transaction_type IN (''KASA_GIRIS'',''CH_TAHSILAT'')',
            r.schemaname, r.tablename);
    END LOOP;
END $$;