-- Cihaz onayı: işyeri (store) ve kasa (terminal_name) yerleştirmesi

DROP FUNCTION IF EXISTS public.get_pos_terminal_status(TEXT);
DROP FUNCTION IF EXISTS public.approve_pos_terminal(UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_pos_terminal_status(p_device_id TEXT)
RETURNS TABLE (
  out_status TEXT,
  out_terminal_name TEXT,
  out_store_id UUID,
  out_message TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT r.status, r.terminal_name, r.store_id,
         CASE r.status
           WHEN 'approved' THEN 'Onaylı — giriş yapılabilir.'
           WHEN 'pending' THEN 'Merkez onayı bekleniyor.'
           WHEN 'rejected' THEN COALESCE(r.rejected_reason, 'Cihaz reddedildi.')
           WHEN 'blocked' THEN 'Cihaz engellendi.'
           ELSE 'Kayıt bulunamadı.'
         END
  FROM public.pos_terminal_registrations r
  WHERE r.device_id = trim(p_device_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_registered'::TEXT, NULL::TEXT, NULL::UUID, 'Cihaz kaydı yok'::TEXT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_pos_terminal(
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

  UPDATE public.pos_terminal_registrations
  SET status = 'approved',
      approved_at = NOW(),
      approved_by = p_user_id,
      rejected_reason = NULL,
      store_id = COALESCE(p_store_id, store_id),
      terminal_name = COALESCE(NULLIF(trim(p_terminal_name), ''), terminal_name),
      firm_nr = COALESCE(v_firm, firm_nr)
  WHERE id = p_id AND status = 'pending';

  IF FOUND THEN
    RETURN QUERY SELECT true, 'Cihaz onaylandı.'::TEXT;
  ELSE
    RETURN QUERY SELECT false, 'Kayıt bulunamadı veya zaten işlenmiş.'::TEXT;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.get_pos_terminal_status(TEXT) TO anon;
    GRANT EXECUTE ON FUNCTION public.approve_pos_terminal(UUID, UUID, UUID, TEXT, TEXT) TO anon;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
