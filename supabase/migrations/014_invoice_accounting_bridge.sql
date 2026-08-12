-- Migration 014: Invoice-Accounting Bridge
-- Automate Journal Entry creation for all invoice types

-- 1. Update/Add function for Invoices specifically
CREATE OR REPLACE FUNCTION create_yevmiye_from_invoice() RETURNS TRIGGER AS $$
DECLARE
    v_fis_id UUID;
    v_fis_no TEXT;
    v_donem_yil INTEGER;
    v_donem_ay INTEGER;
    v_total DECIMAL(15,2);
    v_hesap_borc TEXT;
    v_hesap_alacak TEXT;
BEGIN
    -- DÃ¶nem bilgisi
    v_donem_yil := EXTRACT(YEAR FROM NEW.created_at);
    v_donem_ay := EXTRACT(MONTH FROM NEW.created_at);
    v_total := NEW.total_amount;

    -- FiÅŸ numarasÄ± oluÅŸtur
    v_fis_no := 'YF-' || v_donem_yil || '-' || LPAD(v_donem_ay::TEXT, 2, '0') || '-' || 
                LPAD(NEXTVAL('yevmiye_fis_seq')::TEXT, 6, '0');

    -- Determine accounts based on category
    -- Default accounts (Simplified for now, can be sophisticated later)
    IF NEW.invoice_category = 'Satis' THEN
        v_hesap_borc := '120.01'; -- AlÄ±cÄ±lar
        v_hesap_alacak := '600.01'; -- SatÄ±ÅŸlar
    ELSIF NEW.invoice_category = 'Alis' THEN
        v_hesap_borc := '153.01'; -- Ticari Mallar
        v_hesap_alacak := '320.01'; -- SatÄ±cÄ±lar
    ELSE
        -- Default to generic if unknown
        v_hesap_borc := '120.01';
        v_hesap_alacak := '600.01';
    END IF;

    -- Yevmiye fiÅŸi oluÅŸtur
    INSERT INTO yevmiye_fisleri (
        fis_no,
        fis_tarihi,
        fis_tipi,
        donem_yil,
        donem_ay,
        aciklama,
        evrak_no,
        onay_durumu,
        olusturan_id
    ) VALUES (
        v_fis_no,
        NEW.created_at::DATE,
        'ISLEM',
        v_donem_yil,
        v_donem_ay,
        NEW.invoice_category || ' FaturasÄ± - ' || NEW.invoice_no,
        NEW.invoice_no,
        'TASLAK', -- Keep as draft for review
        auth.uid()
    ) RETURNING id INTO v_fis_id;

    -- BorÃ§ kaydÄ±
    INSERT INTO yevmiye_fisi_detaylari (
        fis_id,
        sira_no,
        hesap_kodu,
        borc,
        alacak,
        aciklama,
        cari_hesap_id
    ) VALUES (
        v_fis_id,
        1,
        v_hesap_borc,
        v_total,
        0,
        NEW.invoice_category || ' iÅŸlemi',
        CASE 
            WHEN NEW.invoice_category = 'Satis' THEN NEW.customer_id 
            WHEN NEW.invoice_category = 'Alis' THEN NEW.supplier_id
            ELSE NULL 
        END
    );

    -- Alacak kaydÄ±
    INSERT INTO yevmiye_fisi_detaylari (
        fis_id,
        sira_no,
        hesap_kodu,
        borc,
        alacak,
        aciklama,
        cari_hesap_id
    ) VALUES (
        v_fis_id,
        2,
        v_hesap_alacak,
        0,
        v_total,
        NEW.invoice_category || ' iÅŸlemi',
        CASE 
            WHEN NEW.invoice_category = 'Satis' THEN NEW.customer_id 
            WHEN NEW.invoice_category = 'Alis' THEN NEW.supplier_id
            ELSE NULL 
        END
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create Trigger on invoices table
DROP TRIGGER IF EXISTS trigger_create_yevmiye_from_invoice ON invoices;
CREATE TRIGGER trigger_create_yevmiye_from_invoice
AFTER INSERT ON invoices
FOR EACH ROW
EXECUTE FUNCTION create_yevmiye_from_invoice();

