-- Onaylı / engelli kasa cihazlarında işyeri ve kasa adı düzenleme

CREATE OR REPLACE FUNCTION public.update_pos_terminal_placement(
  p_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_terminal_name TEXT DEFAULT NULL,
  p_firm_nr TEXT DEFAULT NULL
)
RETURNS TABLE (ok BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_firm TEXT;
BEGIN
  IF p_firm_nr IS NOT NULL AND trim(p_firm_nr) <> '' THEN
    v_firm := lpad(ltrim(trim(p_firm_nr), '0'), 3, '0');
  END IF;

  IF NULLIF(trim(p_terminal_name), '') IS NULL AND p_store_id IS NULL AND v_firm IS NULL THEN
    RETURN QUERY SELECT false, 'Güncellenecek en az bir alan girin.'::TEXT;
    RETURN;
  END IF;

  UPDATE public.pos_terminal_registrations
  SET store_id = COALESCE(p_store_id, store_id),
      terminal_name = COALESCE(NULLIF(trim(p_terminal_name), ''), terminal_name),
      firm_nr = COALESCE(v_firm, firm_nr),
      approved_by = COALESCE(p_user_id, approved_by)
  WHERE id = p_id AND status IN ('approved', 'blocked');

  IF FOUND THEN
    RETURN QUERY SELECT true, 'Cihaz yerleştirmesi güncellendi.'::TEXT;
  ELSE
    RETURN QUERY SELECT false, 'Kayıt bulunamadı veya düzenlenemez durumda.'::TEXT;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.update_pos_terminal_placement(UUID, UUID, UUID, TEXT, TEXT) TO anon;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
