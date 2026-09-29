-- POS terminal kayıt kontrolünü günlükten aylık periyoda çevir.
-- Amaç: her login'de merkez RPC register_pos_terminal çağrısı yapılmaz;
--       yalnızca (a) yeni cihaz / kayıt yok ya da (b) son kontrolden
--       itibaren belirlenen eşik (varsayılan 30 gün) geçmişse merkezle
--       konuşulur. Bu, hibrit modda her oturum açılışında gereksiz
--       ağ/RPC trafiğini ve register_pos_terminal güncellemesini ortadan kaldırır.
--
-- Kapsam: yalnızca periyodik re-check. Kota (allowed_device_count) ve onay
-- akışı (pending → approved/rejected/blocked) değişmez.

ALTER TABLE public.pos_terminal_registrations
  ADD COLUMN IF NOT EXISTS last_check_at TIMESTAMPTZ;

COMMENT ON COLUMN public.pos_terminal_registrations.last_check_at IS
  'Cihazın merkezle son periyodik kontrol (re-check) zamanı. Aylık kontrol için kullanılır; ilk açılış veya yeni kayıtta register_pos_terminal tarafından NOW() atanır.';

-- Mevcut satırlarda: status=approved ise ve last_check_at NULL ise
-- last_seen_at ya da registered_at ile başlat (geriye dönük uyumlu).
UPDATE public.pos_terminal_registrations
   SET last_check_at = COALESCE(last_seen_at, registered_at, NOW())
 WHERE last_check_at IS NULL;

-- get_pos_terminal_status: artık last_check_at'ı da döndür (UI / cache için).
-- Çıktı imzası genişletiliyor — mevcut çağıranlar etkilenmez (out_* ek alanlar
-- SELECT * veya sütun seçimi ile okunuyorsa hazır; PostgREST row döner).
DROP FUNCTION IF EXISTS public.get_pos_terminal_status(TEXT);

CREATE OR REPLACE FUNCTION public.get_pos_terminal_status(p_device_id TEXT)
RETURNS TABLE (
  out_status           TEXT,
  out_terminal_name    TEXT,
  out_store_id         UUID,
  out_message          TEXT,
  out_last_check_at    TIMESTAMPTZ,
  out_firm_nr          TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_status  TEXT;
  v_name    TEXT;
  v_store   UUID;
  v_firm    TEXT;
  v_reason  TEXT;
  v_last_chk TIMESTAMPTZ;
  v_allowed INTEGER;
  v_approved INTEGER;
  v_msg     TEXT;
BEGIN
  SELECT r.status::text,
         r.terminal_name::text,
         r.store_id,
         r.firm_nr,
         r.rejected_reason,
         r.last_check_at
    INTO v_status, v_name, v_store, v_firm, v_reason, v_last_chk
    FROM public.pos_terminal_registrations r
   WHERE r.device_id = trim(p_device_id)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_registered'::TEXT, NULL::TEXT, NULL::UUID,
                         'Cihaz kaydı yok'::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT;
    RETURN;
  END IF;

  IF v_status = 'approved' THEN
    v_msg := 'Onaylı — giriş yapılabilir.';
  ELSIF v_status = 'blocked' THEN
    v_msg := 'Cihaz engellendi.';
  ELSIF v_status = 'rejected' THEN
    v_msg := COALESCE(v_reason, 'Cihaz reddedildi.');
  ELSIF v_status = 'pending' THEN
    SELECT q.out_allowed, q.out_approved_count
      INTO v_allowed, v_approved
      FROM public.get_firm_device_quota(v_firm) q;
    IF v_approved >= v_allowed THEN
      v_msg := format(
        'Merkez onayı bekleniyor; izin verilen cihaz kotası dolu (%s/%s). Yönetici bir cihazı serbest bırakmalı veya limiti artırmalı.',
        v_approved, v_allowed
      );
    ELSE
      v_msg := 'Merkez onayı bekleniyor.';
    END IF;
  ELSE
    v_msg := 'Kayıt bulunamadı.';
  END IF;

  RETURN QUERY SELECT v_status, v_name, v_store, v_msg, v_last_chk, v_firm;
END;
$$;

-- register_pos_terminal: her çağrıda last_check_at'ı NOW() yap.
-- Eski tek-overload fonksiyonu (068/069) yenisiyle değiştirilmiştir;
-- burada yalnızca p_metadata alan imzası korunur (069 overload kararı).
DROP FUNCTION IF EXISTS public.register_pos_terminal(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

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
BEGIN
  IF p_device_id IS NULL OR trim(p_device_id) = '' THEN
    RETURN QUERY SELECT NULL::UUID, 'error'::TEXT, 'device_id zorunlu'::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.pos_terminal_registrations (
    device_id, terminal_name, store_id, firm_nr, status, role,
    hostname, os_user, app_version, metadata, last_seen_at, last_check_at
  )
  VALUES (
    trim(p_device_id), v_name, p_store_id, v_firm, 'pending',
    COALESCE(NULLIF(trim(p_role), ''), 'client'),
    p_hostname, p_os_user, p_app_version, COALESCE(p_metadata, '{}'::jsonb),
    NOW(), NOW()
  )
  ON CONFLICT (device_id) DO UPDATE SET
    terminal_name = EXCLUDED.terminal_name,
    store_id      = COALESCE(EXCLUDED.store_id, pos_terminal_registrations.store_id),
    firm_nr       = EXCLUDED.firm_nr,
    role          = EXCLUDED.role,
    hostname      = COALESCE(EXCLUDED.hostname, pos_terminal_registrations.hostname),
    os_user       = COALESCE(EXCLUDED.os_user, pos_terminal_registrations.os_user),
    app_version   = COALESCE(EXCLUDED.app_version, pos_terminal_registrations.app_version),
    metadata      = COALESCE(EXCLUDED.metadata, pos_terminal_registrations.metadata),
    last_seen_at  = NOW(),
    last_check_at = NOW(),
    status = CASE
      WHEN pos_terminal_registrations.status = 'approved' THEN 'approved'
      WHEN pos_terminal_registrations.status = 'blocked'  THEN 'blocked'
      ELSE 'pending'
    END,
    registered_at = CASE
      WHEN pos_terminal_registrations.status IN ('approved', 'blocked')
        THEN pos_terminal_registrations.registered_at
      ELSE NOW()
    END;

  RETURN QUERY
    SELECT r.id, r.status,
           CASE r.status
             WHEN 'approved' THEN 'Cihaz zaten onaylı.'
             WHEN 'blocked'  THEN 'Cihaz engellenmiş.'
             WHEN 'pending'  THEN 'Kayıt alındı, merkez onayı bekleniyor.'
             ELSE 'Kayıt güncellendi.'
           END
      FROM public.pos_terminal_registrations r
     WHERE r.device_id = trim(p_device_id);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.get_pos_terminal_status(TEXT) TO anon;
    GRANT EXECUTE ON FUNCTION public.register_pos_terminal(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
