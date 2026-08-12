-- ============================================================================
-- Master şema (000) ile gelen şablon firma 001 "RetailEx OS" kaydı.
-- Logo'da başka firma (örn. 002) kullanılırken bu kayıt kullanıcı tarafından
-- oluşturulmamış gibi listede ikinci firma olarak görünür; gereksizse kaldırılır.
-- Koşul: Başka bir firma varken ve 001 hâlâ şablon adıyla duruyorsa.
-- ============================================================================

DO $$
DECLARE
  tpl_id UUID;
BEGIN
  SELECT id INTO tpl_id
  FROM firms
  WHERE firm_nr = '001' AND name = 'RetailEx OS'
  LIMIT 1;

  IF tpl_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM firms WHERE firm_nr <> '001') THEN
    RETURN;
  END IF;

  DELETE FROM periods WHERE firm_id = tpl_id;
  DELETE FROM stores WHERE firm_nr = '001';
  DELETE FROM firms WHERE id = tpl_id;

  -- Varsayılan firma bayrağı kaldıysa ilk kalan firmaya ver
  IF NOT EXISTS (SELECT 1 FROM firms WHERE "default" = true) THEN
    UPDATE firms SET "default" = true
    WHERE id = (SELECT id FROM firms ORDER BY firm_nr LIMIT 1);
  END IF;
END $$;
