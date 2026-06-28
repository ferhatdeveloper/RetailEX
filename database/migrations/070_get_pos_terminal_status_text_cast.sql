-- PostgREST 42804: get_pos_terminal_status dönüş kolonları TEXT olmalı (status VARCHAR(20))

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
  SELECT r.status::text, r.terminal_name::text, r.store_id,
         CASE r.status
           WHEN 'approved' THEN 'Onaylı — giriş yapılabilir.'
           WHEN 'pending' THEN 'Merkez onayı bekleniyor.'
           WHEN 'rejected' THEN COALESCE(r.rejected_reason, 'Cihaz reddedildi.')
           WHEN 'blocked' THEN 'Cihaz engellendi.'
           ELSE 'Kayıt bulunamadı.'
         END::text
  FROM public.pos_terminal_registrations r
  WHERE r.device_id = trim(p_device_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_registered'::TEXT, NULL::TEXT, NULL::UUID, 'Cihaz kaydı yok'::TEXT;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.get_pos_terminal_status(TEXT) TO anon;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
