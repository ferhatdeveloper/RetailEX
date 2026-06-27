-- Cihaz kaydı: detaylı donanım/OS bilgisi (ilsasupport destek paneli benzeri)

ALTER TABLE public.pos_terminal_registrations
  ADD COLUMN IF NOT EXISTS computer_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS os_platform VARCHAR(50),
  ADD COLUMN IF NOT EXISTS os_arch VARCHAR(50),
  ADD COLUMN IF NOT EXISTS os_version VARCHAR(120),
  ADD COLUMN IF NOT EXISTS local_ip VARCHAR(45),
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(80),
  ADD COLUMN IF NOT EXISTS locale VARCHAR(20);

CREATE OR REPLACE FUNCTION public.register_pos_terminal(
  p_device_id     TEXT,
  p_terminal_name TEXT,
  p_store_id      UUID DEFAULT NULL,
  p_firm_nr       TEXT DEFAULT '001',
  p_role          TEXT DEFAULT 'client',
  p_hostname      TEXT DEFAULT NULL,
  p_os_user       TEXT DEFAULT NULL,
  p_app_version   TEXT DEFAULT NULL,
  p_metadata      JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (out_id UUID, out_status TEXT, out_message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_firm TEXT := lpad(ltrim(COALESCE(p_firm_nr, ''), '0'), 3, '0');
  v_name TEXT := COALESCE(NULLIF(trim(p_terminal_name), ''), p_device_id);
  v_meta JSONB := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  IF p_device_id IS NULL OR trim(p_device_id) = '' THEN
    RETURN QUERY SELECT NULL::UUID, 'error'::TEXT, 'device_id zorunlu'::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.pos_terminal_registrations (
    device_id, terminal_name, store_id, firm_nr, status, role,
    hostname, os_user, app_version, metadata, last_seen_at,
    computer_name, os_platform, os_arch, os_version, local_ip, timezone, locale
  )
  VALUES (
    trim(p_device_id), v_name, p_store_id, v_firm, 'pending',
    COALESCE(NULLIF(trim(p_role), ''), 'client'),
    COALESCE(p_hostname, v_meta->>'computer_name', v_meta->>'hostname'),
    COALESCE(p_os_user, v_meta->>'os_user'),
    COALESCE(p_app_version, v_meta->>'app_version'),
    v_meta,
    NOW(),
    COALESCE(v_meta->>'computer_name', p_hostname),
    v_meta->>'os_platform',
    v_meta->>'os_arch',
    v_meta->>'os_version',
    v_meta->>'local_ip',
    v_meta->>'timezone',
    v_meta->>'locale'
  )
  ON CONFLICT (device_id) DO UPDATE SET
    terminal_name = EXCLUDED.terminal_name,
    store_id = COALESCE(EXCLUDED.store_id, pos_terminal_registrations.store_id),
    firm_nr = EXCLUDED.firm_nr,
    role = EXCLUDED.role,
    hostname = COALESCE(EXCLUDED.hostname, pos_terminal_registrations.hostname),
    os_user = COALESCE(EXCLUDED.os_user, pos_terminal_registrations.os_user),
    app_version = COALESCE(EXCLUDED.app_version, pos_terminal_registrations.app_version),
    metadata = EXCLUDED.metadata,
    computer_name = COALESCE(EXCLUDED.computer_name, pos_terminal_registrations.computer_name),
    os_platform = COALESCE(EXCLUDED.os_platform, pos_terminal_registrations.os_platform),
    os_arch = COALESCE(EXCLUDED.os_arch, pos_terminal_registrations.os_arch),
    os_version = COALESCE(EXCLUDED.os_version, pos_terminal_registrations.os_version),
    local_ip = COALESCE(EXCLUDED.local_ip, pos_terminal_registrations.local_ip),
    timezone = COALESCE(EXCLUDED.timezone, pos_terminal_registrations.timezone),
    locale = COALESCE(EXCLUDED.locale, pos_terminal_registrations.locale),
    last_seen_at = NOW(),
    status = CASE
      WHEN pos_terminal_registrations.status = 'approved' THEN 'approved'
      WHEN pos_terminal_registrations.status = 'blocked' THEN 'blocked'
      ELSE 'pending'
    END,
    registered_at = CASE
      WHEN pos_terminal_registrations.status IN ('approved', 'blocked') THEN pos_terminal_registrations.registered_at
      ELSE NOW()
    END;

  RETURN QUERY
  SELECT r.id, r.status,
         CASE r.status
           WHEN 'approved' THEN 'Cihaz zaten onaylı.'
           WHEN 'blocked' THEN 'Cihaz engellenmiş.'
           WHEN 'pending' THEN 'Kayıt alındı, merkez onayı bekleniyor.'
           ELSE 'Kayıt güncellendi.'
         END
  FROM public.pos_terminal_registrations r
  WHERE r.device_id = trim(p_device_id);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.register_pos_terminal(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
