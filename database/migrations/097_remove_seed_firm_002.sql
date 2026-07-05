-- ============================================================================
-- Eski master şema / 072 ile gelen demo firma 002 "Firma 002".
-- Kullanıcı tek firma kurduğunda listede ikinci satır olarak görünür; kaldırılır.
-- Koşul: Başka firma varken 002 hâlâ seed adıyla duruyorsa.
-- ============================================================================

DO $$
DECLARE
  seed_id UUID;
BEGIN
  SELECT id INTO seed_id
  FROM firms
  WHERE firm_nr = '002' AND name = 'Firma 002'
  LIMIT 1;

  IF seed_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM firms WHERE firm_nr <> '002') THEN
    RETURN;
  END IF;

  DELETE FROM periods WHERE firm_id = seed_id;
  DELETE FROM stores WHERE firm_nr = '002' AND code = 'BAGHDAD';
  DELETE FROM firms WHERE id = seed_id;

  IF NOT EXISTS (SELECT 1 FROM firms WHERE "default" = true) THEN
    UPDATE firms SET "default" = true
    WHERE id = (SELECT id FROM firms ORDER BY firm_nr LIMIT 1);
  END IF;
END $$;
