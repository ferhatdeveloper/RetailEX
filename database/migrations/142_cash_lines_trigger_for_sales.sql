-- 142_cash_lines_trigger_for_sales.sql
--
-- Skandal (2026-09-01): Yeni satış faturası oluşturulduğunda
-- writeCashRegisterLineForInvoice (frontend) sessizce başarısız
-- oluyordu; fatura kaydedilmiş görünüyordu ama kasaya para düşmüyordu.
-- Sebep: createKasaIslemi zinciri (BEGIN/COMMIT, assertPeriodOpen,
-- resolveCariAccountKind) veya rest_api modunda postgres.query erişimi.
--
-- Düzeltme: PostgreSQL trigger ile satış INSERT/UPDATE'i sonrası
-- otomatik cash_lines INSERT + cash_registers balance UPDATE.
-- Frontend tarafında hangi build olursa olsun tetiklenir; deploy'dan
-- bağımsız.
--
-- Idempotent: cash_lines UNIQUE(fiche_no) çakışmasında mevcut satır
-- UPDATE edilir, bakiye değişmez. Yalnızca yeni INSERT ise bakiye artırılır.

SET search_path TO public;

CREATE OR REPLACE FUNCTION public.fn_auto_cash_line_on_sale()
RETURNS TRIGGER AS $$
DECLARE
  v_register_id uuid;
  v_pm text;
  v_cat text;
  v_status text;
  v_is_cancelled boolean;
  v_amount numeric;
  v_period_nr text;
  v_date_text text;
  v_fiche_no text;
  v_fiche_type text;
  v_customer_id uuid;
  v_inserted boolean := false;
  v_existing_id uuid;
  v_existing_amount numeric;
BEGIN
  -- Erken çıkış koşulları: yalnızca satış faturası, nakit/kart ödeme, tutar > 0
  v_pm := lower(coalesce(NEW.payment_method::text, ''));
  v_cat := lower(coalesce(NEW.fiche_type::text, ''));
  v_status := lower(coalesce(NEW.status::text, ''));
  v_is_cancelled := coalesce(NEW.is_cancelled, false) OR v_status = 'cancelled';

  IF v_is_cancelled THEN
    RETURN NEW;
  END IF;

  -- payment_method kabul: 'cash', 'nakit', 'Nakit', 'Cash' (case-insensitive)
  IF v_pm NOT IN ('cash', 'nakit', 'kasa', 'kasa_giris', 'kasa_giriş', 'kasa_girişi') THEN
    RETURN NEW;
  END IF;

  v_amount := coalesce(NEW.net_amount, 0)::numeric;
  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- fiche_type kabul: sales_invoice / sales / satis / service / hizmet
  IF v_cat NOT IN (
    'sales_invoice','sales','satis','satış',
    'service_invoice','service','hizmet','sale'
  ) THEN
    RETURN NEW;
  END IF;

  v_period_nr := coalesce(NEW.period_nr::text, '01');
  v_fiche_no := coalesce(NEW.fiche_no::text, '');
  v_fiche_type := coalesce(NEW.fiche_type::text, 'sales_invoice');
  v_date_text := to_char(
    coalesce(NEW.date::timestamptz, now()),
    'YYYY-MM-DD HH24:MI:SS'
  );
  v_customer_id := CASE
    WHEN NEW.customer_id IS NOT NULL
         AND NEW.customer_id::text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN NEW.customer_id
    ELSE NULL
  END;

  -- Hedef kasa: header_fields.cash_register_id → ERP.selected_cash_registers[0]
  -- → MERKEZ KASA / PATRON KASA tercihli aktif kasa.
  -- Header_fields JSON'dan cash_register_id çek
  BEGIN
    IF NEW.header_fields IS NOT NULL
       AND (NEW.header_fields ? 'cash_register_id')
       AND ((NEW.header_fields->>'cash_register_id')::text) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN
      SELECT id INTO v_register_id
        FROM public.rex_001_cash_registers
       WHERE id = ((NEW.header_fields->>'cash_register_id')::text)::uuid
         AND is_active = true
       LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_register_id := NULL;
  END;

  -- Fallback: en aktif kasa (MERKEZ KASA / PATRON KASA tercihli)
  IF v_register_id IS NULL THEN
    SELECT id INTO v_register_id
      FROM public.rex_001_cash_registers
     WHERE firm_nr = coalesce(NEW.firm_nr::text, '001')
       AND is_active = true
     ORDER BY
       (lower(coalesce(name, '')) LIKE '%merkez kasa%') DESC,
       (lower(coalesce(name, '')) LIKE '%patron kasa%') DESC,
       code ASC
     LIMIT 1;
  END IF;

  IF v_register_id IS NULL THEN
    -- Aktif kasa yok, sessizce geç (frontend zaten logluyor)
    RETURN NEW;
  END IF;

  -- Idempotent: aynı fiche_no ile mevcut satır varsa UPDATE et (balance değişmez)
  SELECT id, amount INTO v_existing_id, v_existing_amount
    FROM public.rex_001_01_cash_lines
   WHERE fiche_no = v_fiche_no
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.rex_001_01_cash_lines
       SET amount = abs(v_amount),
           date = v_date_text::timestamptz,
           definition = 'Satış faturası — ' || v_fiche_no,
           register_id = v_register_id,
           customer_id = COALESCE(v_customer_id, customer_id),
           transaction_type = 'KASA_GIRIS',
           sign = 1
     WHERE id = v_existing_id;
    RETURN NEW;
  END IF;

  -- Yeni INSERT
  BEGIN
    INSERT INTO public.rex_001_01_cash_lines (
      firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
      definition, transaction_type,
      customer_id, party_id, currency_code, exchange_rate, f_amount,
      transfer_status, special_code,
      target_register_id, bank_id, bank_account_id, expense_card_id,
      tax_rate, withholding_tax_rate
    ) VALUES (
      coalesce(NEW.firm_nr::text, '001'), v_period_nr, v_register_id,
      v_fiche_no, v_date_text::timestamptz, abs(v_amount), 1,
      'Satış faturası — ' || v_fiche_no, 'KASA_GIRIS',
      v_customer_id, NULL, 'YEREL', 1, 0,
      0, '', NULL, NULL, NULL, NULL, 0, 0
    );
    v_inserted := true;
  EXCEPTION WHEN unique_violation THEN
    -- Yarış durumu: başka bir yol bu arada INSERT etti, sadece UPDATE et
    UPDATE public.rex_001_01_cash_lines
       SET amount = abs(v_amount),
           date = v_date_text::timestamptz,
           definition = 'Satış faturası — ' || v_fiche_no,
           register_id = v_register_id,
           customer_id = COALESCE(v_customer_id, customer_id)
     WHERE fiche_no = v_fiche_no;
    v_inserted := false;
  END;

  IF v_inserted THEN
    UPDATE public.rex_001_cash_registers
       SET balance = COALESCE(balance, 0) + abs(v_amount),
           updated_at = NOW()
     WHERE id = v_register_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_cash_line_sales ON public.rex_001_01_sales;

CREATE TRIGGER trg_auto_cash_line_sales
AFTER INSERT OR UPDATE OF payment_method, net_amount, status, is_cancelled, fiche_type, header_fields
  ON public.rex_001_01_sales
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_cash_line_on_sale();

COMMENT ON FUNCTION public.fn_auto_cash_line_on_sale() IS
'Satış faturası (cash/nakit, status<>cancelled, net_amount>0, sales_invoice) için
otomatik cash_lines INSERT + cash_registers balance UPDATE. Frontend
writeCashRegisterLineForInvoice başarısız olsa bile bu trigger devreye girer
(2026-09-01 skandalı). Idempotent: UNIQUE(fiche_no) çakışmasında UPDATE.';

COMMENT ON TRIGGER trg_auto_cash_line_sales ON public.rex_001_01_sales IS
'2026-09-01: Frontend bug bypass — her INSERT/UPDATE sonrası cash satırı garantilenir.';