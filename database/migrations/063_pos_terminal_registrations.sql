-- Masaüstü kasa cihaz kaydı: kurulum sonrası pending → merkez web onayı → giriş

CREATE TABLE IF NOT EXISTS public.pos_terminal_registrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       TEXT NOT NULL UNIQUE,
  terminal_name   VARCHAR(100) NOT NULL,
  store_id        UUID REFERENCES public.stores(id),
  firm_nr         VARCHAR(10) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'blocked')),
  role            VARCHAR(50) DEFAULT 'client',
  hostname        VARCHAR(255),
  os_user         VARCHAR(100),
  app_version     VARCHAR(50),
  metadata        JSONB DEFAULT '{}'::jsonb,
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ,
  approved_at     TIMESTAMPTZ,
  approved_by     UUID REFERENCES public.users(id),
  rejected_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_terminal_reg_firm_status
  ON public.pos_terminal_registrations (firm_nr, status, registered_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_terminal_reg_store
  ON public.pos_terminal_registrations (store_id)
  WHERE store_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.get_pos_terminal_status(TEXT);
DROP FUNCTION IF EXISTS public.register_pos_terminal(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.register_pos_terminal(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.approve_pos_terminal(UUID, UUID);
DROP FUNCTION IF EXISTS public.approve_pos_terminal(UUID, UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.register_pos_terminal(
  p_device_id     TEXT,
  p_terminal_name TEXT,
  p_store_id      UUID DEFAULT NULL,
  p_firm_nr       TEXT DEFAULT '001',
  p_role          TEXT DEFAULT 'client',
  p_hostname      TEXT DEFAULT NULL,
  p_os_user       TEXT DEFAULT NULL,
  p_app_version   TEXT DEFAULT NULL
)
RETURNS TABLE (out_id UUID, out_status TEXT, out_message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_firm TEXT := lpad(ltrim(COALESCE(p_firm_nr, ''), '0'), 3, '0');
  v_name TEXT := COALESCE(NULLIF(trim(p_terminal_name), ''), p_device_id);
BEGIN
  IF p_device_id IS NULL OR trim(p_device_id) = '' THEN
    RETURN QUERY SELECT NULL::UUID, 'error'::TEXT, 'device_id zorunlu'::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.pos_terminal_registrations (
    device_id, terminal_name, store_id, firm_nr, status, role,
    hostname, os_user, app_version, last_seen_at
  )
  VALUES (
    trim(p_device_id), v_name, p_store_id, v_firm, 'pending', COALESCE(NULLIF(trim(p_role), ''), 'client'),
    p_hostname, p_os_user, p_app_version, NOW()
  )
  ON CONFLICT (device_id) DO UPDATE SET
    terminal_name = EXCLUDED.terminal_name,
    store_id = COALESCE(EXCLUDED.store_id, pos_terminal_registrations.store_id),
    firm_nr = EXCLUDED.firm_nr,
    role = EXCLUDED.role,
    hostname = COALESCE(EXCLUDED.hostname, pos_terminal_registrations.hostname),
    os_user = COALESCE(EXCLUDED.os_user, pos_terminal_registrations.os_user),
    app_version = COALESCE(EXCLUDED.app_version, pos_terminal_registrations.app_version),
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

CREATE OR REPLACE FUNCTION public.get_pos_terminal_status(p_device_id TEXT)
RETURNS TABLE (out_status TEXT, out_terminal_name TEXT, out_message TEXT)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT r.status, r.terminal_name,
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
    RETURN QUERY SELECT 'not_registered'::TEXT, NULL::TEXT, 'Cihaz kaydı yok'::TEXT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_pos_terminal(
  p_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (ok BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.pos_terminal_registrations
  SET status = 'approved',
      approved_at = NOW(),
      approved_by = p_user_id,
      rejected_reason = NULL
  WHERE id = p_id AND status = 'pending';

  IF FOUND THEN
    RETURN QUERY SELECT true, 'Cihaz onaylandı.'::TEXT;
  ELSE
    RETURN QUERY SELECT false, 'Kayıt bulunamadı veya zaten işlenmiş.'::TEXT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_pos_terminal(
  p_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (ok BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.pos_terminal_registrations
  SET status = 'rejected',
      approved_at = NOW(),
      approved_by = p_user_id,
      rejected_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Merkez tarafından reddedildi.')
  WHERE id = p_id AND status = 'pending';

  IF FOUND THEN
    RETURN QUERY SELECT true, 'Cihaz reddedildi.'::TEXT;
  ELSE
    RETURN QUERY SELECT false, 'Kayıt bulunamadı veya zaten işlenmiş.'::TEXT;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE ON public.pos_terminal_registrations TO anon;
    GRANT EXECUTE ON FUNCTION public.register_pos_terminal(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
    GRANT EXECUTE ON FUNCTION public.get_pos_terminal_status(TEXT) TO anon;
    GRANT EXECUTE ON FUNCTION public.approve_pos_terminal(UUID, UUID) TO anon;
    GRANT EXECUTE ON FUNCTION public.reject_pos_terminal(UUID, UUID, TEXT) TO anon;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
