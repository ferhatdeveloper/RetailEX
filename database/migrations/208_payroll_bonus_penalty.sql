-- ============================================================================
-- 208: Personel bordrosu — bonus & ceza (BONUS_HAKKEDIS / CEZA_ODEME)
-- ----------------------------------------------------------------------------
-- RetailEX cari modülünde personel maaş ödemesinde **bonus** ve **ceza**
-- (kesinti) desteği. Mevcut yapı yalnızca MAAS_HAKKEDIS / MAAS_ODEME /
-- AVANS_ODEME / AVANS_MAHSUP kabul ediyordu.
--
-- Yeni işlem tipleri:
--   * BONUS_HAKKEDIS — kasa 0, party balance +tutar (işletme personele
--     daha fazla borçlanır: ek hakkediş).
--   * CEZA_ODEME    — kasa 0, party balance −tutar (maaştan kesildi;
--     personelin alacağı azalır).
--
-- 90 yıllık muhasebeci denetimi:
--   party_balance = MAAS_HAKKEDIS + BONUS_HAKKEDIS
--                 − MAAS_ODEME − AVANS_ODEME − CEZA_ODEME
-- Pozitif = ödenmemiş maaş + bonus alacağı, negatif = avans / kesinti
-- maaşı aşıyor. Bu migration yalnızca yorum/defter oluşturur; mevcut
-- MAAS_ODEME/AVANS_ODEME mantığına dokunmaz.
--
-- Neden yeni dosya? party_ledger_movements.transaction_type VARCHAR(50) —
-- CHECK yok; yeni enum değerleri serbestçe kabul edilir. Bu migration
-- yalnızca açıklayıcı doküman + idempotent yardımcı görünüm sağlar;
-- mevcut tabloları ALTER etmez.
-- ============================================================================

-- Bilgi amaçlı view: Mevcut dönemlerde BONUS/MAAS/AVANS/CEZA hareketlerini
-- tek raporda görmek için (idempotent — yoksa oluşturur).
CREATE OR REPLACE VIEW public.v_payroll_bonus_penalty AS
SELECT
  pl.firm_nr,
  pl.period_nr,
  pl.party_id,
  pl.card_type,
  pl.transaction_type,
  pl.date,
  pl.amount,
  pl.sign,
  pl.definition,
  pl.source_module,
  pl.source_id,
  pl.cash_line_id,
  pl.created_at
FROM public.rex_001_01_party_ledger_movements pl
WHERE pl.card_type = 'employee'
  AND pl.transaction_type IN (
    'MAAS_HAKKEDIS',
    'MAAS_ODEME',
    'AVANS_ODEME',
    'AVANS_MAHSUP',
    'BONUS_HAKKEDIS',
    'CEZA_ODEME'
  );

-- Görünüm tek bir dönem için; firma/dönem geneli UNION için aşağıdaki fonksiyon.
CREATE OR REPLACE FUNCTION public.list_payroll_bonus_penalty(
  p_firm_nr VARCHAR DEFAULT NULL,
  p_period_nr VARCHAR DEFAULT NULL,
  p_party_id UUID DEFAULT NULL
)
RETURNS TABLE (
  firm_nr VARCHAR,
  period_nr VARCHAR,
  party_id UUID,
  transaction_type VARCHAR,
  txn_date TIMESTAMPTZ,
  amount NUMERIC,
  sign INTEGER,
  definition TEXT,
  source_module VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pl.firm_nr,
    pl.period_nr,
    pl.party_id,
    pl.transaction_type,
    pl.date,
    pl.amount,
    pl.sign,
    pl.definition,
    pl.source_module
  FROM public.rex_001_01_party_ledger_movements pl
  WHERE pl.card_type = 'employee'
    AND pl.transaction_type IN (
      'MAAS_HAKKEDIS', 'MAAS_ODEME', 'AVANS_ODEME', 'AVANS_MAHSUP',
      'BONUS_HAKKEDIS', 'CEZA_ODEME'
    )
    AND (p_firm_nr IS NULL OR pl.firm_nr = p_firm_nr)
    AND (p_period_nr IS NULL OR pl.period_nr = p_period_nr)
    AND (p_party_id IS NULL OR pl.party_id = p_party_id)
  ORDER BY pl.date DESC, pl.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- GRANT (anon varsa)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT SELECT ON public.v_payroll_bonus_penalty TO anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.list_payroll_bonus_penalty TO anon';
  END IF;
END $$;

COMMENT ON VIEW public.v_payroll_bonus_penalty IS
  'Migration 208 — Personel bordrosu bonus/ceza bilgi görünümü. 001/01 dönemi örnek.';
COMMENT ON FUNCTION public.list_payroll_bonus_penalty IS
  'Migration 208 — Bonus/ceza dahil bordro hareketlerini firma/dönem/personel filtresi ile listeler.';