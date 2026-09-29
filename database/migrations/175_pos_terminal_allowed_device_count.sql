-- Firma başına onaylı masaüstü/POS cihaz kotası (ilsasupport maxSessions eşleniği)
-- Tablo: mevcut pos_terminal_registrations (merkez/kiracı PG). Limit: firms.allowed_device_count.

ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS allowed_device_count INTEGER NOT NULL DEFAULT 10;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'firms_allowed_device_count_chk'
      AND conrelid = 'public.firms'::regclass
  ) THEN
    ALTER TABLE public.firms
      ADD CONSTRAINT firms_allowed_device_count_chk
      CHECK (allowed_device_count >= 1 AND allowed_device_count <= 500);
  END IF;
END $$;

COMMENT ON COLUMN public.firms.allowed_device_count IS
  'Firma başına onaylı masaüstü/POS (DeskApp EXE/Portable) cihaz üst sınırı';

CREATE OR REPLACE FUNCTION public.get_firm_device_quota(p_firm_nr TEXT DEFAULT '001')
RETURNS TABLE (
  out_allowed INTEGER,
  out_approved_count INTEGER,
  out_remaining INTEGER,
  out_firm_nr TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_firm TEXT := lpad(ltrim(COALESCE(NULLIF(trim(p_firm_nr), ''), '001'), '0'), 3, '0');
  v_allowed INTEGER := 10;
  v_approved INTEGER := 0;
BEGIN
  SELECT COALESCE(f.allowed_device_count, 10)
    INTO v_allowed
  FROM public.firms f
  WHERE lpad(ltrim(f.firm_nr, '0'), 3, '0') = v_firm
  LIMIT 1;

  IF NOT FOUND THEN
    v_allowed := 10;
  END IF;

  SELECT COUNT(*)::int
    INTO v_approved
  FROM public.pos_terminal_registrations r
  WHERE lpad(ltrim(r.firm_nr, '0'), 3, '0') = v_firm
    AND r.status = 'approved';

  RETURN QUERY SELECT
    v_allowed,
    v_approved,
    GREATEST(v_allowed - v_approved, 0),
    v_firm;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_firm_allowed_device_count(
  p_firm_nr TEXT,
  p_count INTEGER
)
RETURNS TABLE (ok BOOLEAN, message TEXT, out_allowed INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_firm TEXT := lpad(ltrim(COALESCE(NULLIF(trim(p_firm_nr), ''), '001'), '0'), 3, '0');
  v_count INTEGER := GREATEST(1, LEAST(COALESCE(p_count, 10), 500));
  v_updated INTEGER := 0;
BEGIN
  UPDATE public.firms
  SET allowed_device_count = v_count
  WHERE lpad(ltrim(firm_nr, '0'), 3, '0') = v_firm;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN QUERY SELECT false, 'Firma bulunamadı.'::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, format('İzin verilen cihaz sayısı %s olarak ayarlandı.', v_count)::TEXT, v_count;
END;
$$;

-- Onay: kota doluysa reddet (çalışan kasayı otomatik düşürme — operatör bilinçli yönetsin)
DROP FUNCTION IF EXISTS public.approve_pos_terminal(UUID, UUID, UUID, TEXT, TEXT);

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
  v_row_firm TEXT;
  v_allowed INTEGER := 10;
  v_approved INTEGER := 0;
  v_status TEXT;
BEGIN
  SELECT r.status, r.firm_nr
    INTO v_status, v_row_firm
  FROM public.pos_terminal_registrations r
  WHERE r.id = p_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Kayıt bulunamadı.'::TEXT;
    RETURN;
  END IF;

  IF v_status <> 'pending' THEN
    RETURN QUERY SELECT false, 'Kayıt bulunamadı veya zaten işlenmiş.'::TEXT;
    RETURN;
  END IF;

  IF p_firm_nr IS NOT NULL AND trim(p_firm_nr) <> '' THEN
    v_firm := lpad(ltrim(trim(p_firm_nr), '0'), 3, '0');
  ELSE
    v_firm := lpad(ltrim(COALESCE(v_row_firm, '001'), '0'), 3, '0');
  END IF;

  SELECT q.out_allowed, q.out_approved_count
    INTO v_allowed, v_approved
  FROM public.get_firm_device_quota(v_firm) q;

  IF v_approved >= v_allowed THEN
    RETURN QUERY SELECT false,
      format(
        'Bu firma için izin verilen cihaz sayısına ulaşıldı (%s/%s). Önce bir onaylı cihazı kotadan çıkarın veya limiti artırın.',
        v_approved, v_allowed
      )::TEXT;
    RETURN;
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

-- Onaylı cihazı kotadan çıkar (blocked) — yer açmak için
CREATE OR REPLACE FUNCTION public.revoke_pos_terminal(
  p_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (ok BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.pos_terminal_registrations
  SET status = 'blocked',
      approved_by = COALESCE(p_user_id, approved_by),
      rejected_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Kotadan çıkarıldı / engellendi.'),
      last_seen_at = NOW()
  WHERE id = p_id AND status = 'approved';

  IF FOUND THEN
    RETURN QUERY SELECT true, 'Cihaz kotadan çıkarıldı (engellendi).'::TEXT;
  ELSE
    RETURN QUERY SELECT false, 'Onaylı kayıt bulunamadı.'::TEXT;
  END IF;
END;
$$;

-- Durum sorgusu: kota doluyken pending mesajını netleştir
DROP FUNCTION IF EXISTS public.get_pos_terminal_status(TEXT);

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
DECLARE
  v_status TEXT;
  v_name TEXT;
  v_store UUID;
  v_firm TEXT;
  v_reason TEXT;
  v_allowed INTEGER;
  v_approved INTEGER;
  v_msg TEXT;
BEGIN
  SELECT r.status::text, r.terminal_name::text, r.store_id, r.firm_nr, r.rejected_reason
    INTO v_status, v_name, v_store, v_firm, v_reason
  FROM public.pos_terminal_registrations r
  WHERE r.device_id = trim(p_device_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_registered'::TEXT, NULL::TEXT, NULL::UUID, 'Cihaz kaydı yok'::TEXT;
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

  RETURN QUERY SELECT v_status, v_name, v_store, v_msg;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.get_firm_device_quota(TEXT) TO anon;
    GRANT EXECUTE ON FUNCTION public.set_firm_allowed_device_count(TEXT, INTEGER) TO anon;
    GRANT EXECUTE ON FUNCTION public.get_pos_terminal_status(TEXT) TO anon;
    GRANT EXECUTE ON FUNCTION public.approve_pos_terminal(UUID, UUID, UUID, TEXT, TEXT) TO anon;
    GRANT EXECUTE ON FUNCTION public.revoke_pos_terminal(UUID, UUID, TEXT) TO anon;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
