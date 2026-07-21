-- ============================================================================
-- RetailEX — MASTER SCHEMA (v6.0 — CLEAN CONSOLIDATED)
-- ============================================================================
-- Bu dosya TEMİZ bir PostgreSQL veritabanına tek seferde uygulanabilir.
-- Mevcut kurulumlar için 001–007 numaralı migration dosyalarını kullanın.
-- ============================================================================
-- Çalıştırma: psql -U postgres -d retailex_local -f 000_master_schema.sql
-- ============================================================================

-- Sunucu UTF-8; Windows psql ile WIN1254 karışıklığını önlemek için
SET client_encoding = 'UTF8';

-- Şifre hash: crypt()/gen_salt() (admin seed + Login sorguları). Tam PostgreSQL/contrib;
-- yalnızca "database engine" kopyası olan minimal kurulumlarda 58P01 verebilir — o zaman contrib kurun.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 0. SCHEMAS
-- ============================================================================
-- UUID varsayılanları: PostgreSQL 13+ yerleşik gen_random_uuid() (uuid-ossp dosyası
-- olmayan kurulumlarda 58P01 önlenir). Şifreler için pgcrypto yukarıda açıkça gerekir.

CREATE SCHEMA IF NOT EXISTS auth;

-- Supabase kullanılmayan ortamlarda FK'ların çalışması için minimal auth.users
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE SCHEMA IF NOT EXISTS logic;
CREATE SCHEMA IF NOT EXISTS wms;
CREATE SCHEMA IF NOT EXISTS rest;
CREATE SCHEMA IF NOT EXISTS beauty;
CREATE SCHEMA IF NOT EXISTS pos;

-- ============================================================================
-- 1. ORGANIZATIONAL TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS firms (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr               VARCHAR(10) NOT NULL UNIQUE,
  name                  VARCHAR(255) NOT NULL,
  title                 VARCHAR(255),
  tax_nr                VARCHAR(50),
  tax_office            VARCHAR(100),
  address               TEXT,
  city                  VARCHAR(100),
  country               VARCHAR(100),
  email                 VARCHAR(100),
  phone                 VARCHAR(50),
  ana_para_birimi       VARCHAR(10) DEFAULT 'IQD',
  raporlama_para_birimi VARCHAR(10) DEFAULT 'IQD',
  regulatory_region     VARCHAR(2) NOT NULL DEFAULT 'IQ',
  gib_integration_mode   VARCHAR(20) NOT NULL DEFAULT 'mock',
  gib_ubl_profile       VARCHAR(40) DEFAULT 'TICARIFATURA',
  gib_sender_alias      VARCHAR(255),
  gib_integrator_base_url VARCHAR(512),
  gib_integrator_username VARCHAR(255),
  gib_integrator_password VARCHAR(255),
  gib_use_test_environment BOOLEAN DEFAULT true,
  "default"             BOOLEAN DEFAULT false,
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- İsteğe bağlı: Supabase senkronu (006 ile de eklenebilir; sıfır kurulumda tek script yeter)
ALTER TABLE firms ADD COLUMN IF NOT EXISTS supabase_firm_id VARCHAR(255);

ALTER TABLE firms ADD COLUMN IF NOT EXISTS regulatory_region VARCHAR(2) NOT NULL DEFAULT 'IQ';

-- Web / çok istemci: açılış varsayılanları (tek satır)
CREATE TABLE IF NOT EXISTS public.system_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  CONSTRAINT system_settings_singleton CHECK (id = 1),
  default_currency VARCHAR(10) NOT NULL DEFAULT 'IQD',
  primary_firm_nr VARCHAR(10),
  primary_period_nr VARCHAR(10),
  eticaret_settings JSONB DEFAULT '{}'::jsonb,
  menu_preferences JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO public.system_settings (id, default_currency, primary_firm_nr, primary_period_nr)
VALUES (1, 'IQD', '001', '01')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.gib_edocument_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr VARCHAR(10) NOT NULL,
  period_nr VARCHAR(10) NOT NULL,
  source_type VARCHAR(32) NOT NULL DEFAULT 'sales_fiche',
  source_id UUID NOT NULL,
  document_no VARCHAR(100),
  doc_type VARCHAR(32) NOT NULL DEFAULT 'E-Fatura',
  customer_name TEXT,
  doc_date DATE,
  amount NUMERIC(18,4) DEFAULT 0,
  tax_amount NUMERIC(18,4) DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'Taslak',
  gib_uuid UUID,
  payload_json JSONB,
  xml_snapshot TEXT,
  gib_response_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gib_edocument_queue_unique_source UNIQUE (firm_nr, period_nr, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_gib_edoc_firm_period ON public.gib_edocument_queue (firm_nr, period_nr, created_at DESC);

CREATE TABLE IF NOT EXISTS periods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id    UUID REFERENCES firms(id) ON DELETE CASCADE,
  nr         INTEGER NOT NULL,
  beg_date   DATE NOT NULL,
  end_date   DATE NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  "default"  BOOLEAN DEFAULT false,
  UNIQUE(firm_id, nr)
);

CREATE TABLE IF NOT EXISTS stores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             VARCHAR(50) NOT NULL UNIQUE,
  name             VARCHAR(255) NOT NULL,
  type             VARCHAR(50),
  city             VARCHAR(100),
  region           VARCHAR(100),
  address          TEXT,
  phone            VARCHAR(50),
  email            VARCHAR(100),
  tax_office       VARCHAR(100),
  tax_number       VARCHAR(50),
  firm_nr          VARCHAR(10) NOT NULL,
  manager_name     VARCHAR(100),
  is_main          BOOLEAN DEFAULT false,
  is_active        BOOLEAN DEFAULT true,
  "default"        BOOLEAN DEFAULT false,
  logo_warehouse_id INTEGER,
  logo_division_id  INTEGER,
  logo_firm_id      INTEGER,
  scale_bridge_url  TEXT,
  scale_bridge_token TEXT,
  created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS currencies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             VARCHAR(10) NOT NULL UNIQUE,
  name             VARCHAR(100) NOT NULL,
  symbol           VARCHAR(10),
  is_base_currency BOOLEAN DEFAULT false,
  sort_order       INTEGER DEFAULT 0,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. RBAC SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL UNIQUE,
  description   TEXT,
  permissions   JSONB DEFAULT '[]',
  is_system_role BOOLEAN DEFAULT false,
  color         VARCHAR(20) DEFAULT '#3B82F6',
  landing_route VARCHAR(100) DEFAULT NULL,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON COLUMN public.roles.landing_route IS 'Giriş sonrası açılacak modül: restaurant, pos, management, wms, beauty veya boş (ana sayfa).';

CREATE TABLE IF NOT EXISTS public.users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr      VARCHAR(10) NOT NULL,
  username     VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT,
  full_name    VARCHAR(255) NOT NULL,
  email        VARCHAR(255),
  phone        VARCHAR(50),
  role         VARCHAR(50) DEFAULT 'cashier',
  role_id      UUID REFERENCES public.roles(id),
  store_id     UUID REFERENCES public.stores(id),
  is_active    BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  allowed_firm_nrs   JSONB DEFAULT '[]',
  allowed_periods    JSONB DEFAULT '[]',
  allowed_store_ids  JSONB DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. GLOBAL INFRASTRUCTURE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code  VARCHAR(10) NOT NULL,
  date           DATE NOT NULL,
  buy_rate       DECIMAL(18,8) NOT NULL,
  sell_rate      DECIMAL(18,8) NOT NULL,
  effective_buy  DECIMAL(18,8),
  effective_sell DECIMAL(18,8),
  source         VARCHAR(50) DEFAULT 'manual',
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(currency_code, date, source)
);

CREATE TABLE IF NOT EXISTS public.service_health (
  service_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL UNIQUE,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       TEXT NOT NULL CHECK (status IN ('ONLINE', 'OFFLINE', 'ERROR', 'MAINTENANCE')),
  version      TEXT,
  metadata     JSONB DEFAULT '{}',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sync_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr         VARCHAR(10) NOT NULL,
  store_code      TEXT,
  sync_type       TEXT NOT NULL,
  last_sync_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detail          JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_last_sync
  ON public.sync_logs (last_sync_date DESC);

CREATE INDEX IF NOT EXISTS idx_sync_logs_firm_store
  ON public.sync_logs (firm_nr, store_code, last_sync_date DESC);

CREATE TABLE IF NOT EXISTS public.customer_call_plan_weekly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr VARCHAR(10) NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  customer_id UUID NOT NULL,
  customer_code VARCHAR(50),
  customer_name TEXT NOT NULL,
  call_plan_weekdays SMALLINT[] DEFAULT '{}'::smallint[],
  call_plan_note TEXT,
  call_last_status VARCHAR(30) NOT NULL DEFAULT 'planned',
  call_last_note TEXT,
  call_last_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (firm_nr, week_start, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_call_plan_weekly_firm_week
  ON public.customer_call_plan_weekly (firm_nr, week_start DESC);

CREATE TABLE IF NOT EXISTS public.customer_call_plan_rollover (
  firm_nr VARCHAR(10) PRIMARY KEY,
  current_week_start DATE NOT NULL,
  rolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Kiracı WebSocket hub (075) — hibrit public.sync_queue ile karışmaz
CREATE TABLE IF NOT EXISTS public.broadcast_messages (
  id UUID PRIMARY KEY,
  message_type TEXT NOT NULL,
  action TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  target_stores UUID[],
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_targets INTEGER NOT NULL DEFAULT 0,
  successful INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  pending INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES public.broadcast_messages(id) ON DELETE CASCADE,
  store_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.broadcast_delivery_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES public.broadcast_messages(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.broadcast_recipients(id) ON DELETE SET NULL,
  store_id UUID NOT NULL,
  priority INTEGER NOT NULL DEFAULT 3,
  sequence_number BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}',
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  error_message TEXT,
  last_error_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  device_id TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'offline',
  last_seen TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  pending_messages INTEGER NOT NULL DEFAULT 0,
  app_version TEXT NOT NULL DEFAULT '',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.terminal_sync_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr           VARCHAR(10) NOT NULL,
  store_id          UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  terminal_name     VARCHAR(100),
  terminal_device_id TEXT,
  direction         VARCHAR(10) NOT NULL CHECK (direction IN ('send', 'receive')),
  file_type         VARCHAR(64) NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'failed', 'partial')),
  record_count      INTEGER NOT NULL DEFAULT 0,
  business_date     DATE,
  message           TEXT,
  detail            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terminal_sync_log_firm_created
  ON public.terminal_sync_log (firm_nr, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_terminal_sync_log_store_terminal
  ON public.terminal_sync_log (store_id, terminal_name, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pos_quick_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr     VARCHAR(10) NOT NULL,
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  page_index  SMALLINT NOT NULL DEFAULT 0 CHECK (page_index >= 0 AND page_index < 4),
  slot_index  SMALLINT NOT NULL CHECK (slot_index >= 0 AND slot_index < 12),
  product_id  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, page_index, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_pos_quick_slots_store
  ON public.pos_quick_slots (store_id, page_index, slot_index);

CREATE TABLE IF NOT EXISTS pos_terminal_registrations (
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
  computer_name   VARCHAR(255),
  os_platform     VARCHAR(50),
  os_arch         VARCHAR(50),
  os_version      VARCHAR(120),
  local_ip        VARCHAR(45),
  timezone        VARCHAR(80),
  locale          VARCHAR(20),
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
  SELECT r.id, r.status::text,
         CASE r.status
           WHEN 'approved' THEN 'Cihaz zaten onaylı.'
           WHEN 'blocked' THEN 'Cihaz engellenmiş.'
           WHEN 'pending' THEN 'Kayıt alındı, merkez onayı bekleniyor.'
           ELSE 'Kayıt güncellendi.'
         END::text
  FROM public.pos_terminal_registrations r
  WHERE r.device_id = trim(p_device_id);
END;
$$;

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

CREATE OR REPLACE FUNCTION public.upsert_service_health(
  p_service_name TEXT,
  p_status TEXT,
  p_version TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.service_health (
    service_name, last_heartbeat, status, version, metadata, updated_at
  )
  VALUES (
    p_service_name,
    NOW(),
    p_status,
    p_version,
    COALESCE(p_metadata, '{}'::jsonb),
    NOW()
  )
  ON CONFLICT (service_name) DO UPDATE SET
    last_heartbeat = EXCLUDED.last_heartbeat,
    status = EXCLUDED.status,
    version = COALESCE(EXCLUDED.version, public.service_health.version),
    metadata = COALESCE(EXCLUDED.metadata, public.service_health.metadata),
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_services(
  p_stale_after INTERVAL DEFAULT INTERVAL '5 minutes'
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.service_health
  SET status = 'OFFLINE',
      updated_at = NOW()
  WHERE status = 'ONLINE'
    AND last_heartbeat < NOW() - p_stale_after;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

CREATE TABLE IF NOT EXISTS public.report_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  category      VARCHAR(50) NOT NULL,
  template_type VARCHAR(50) DEFAULT 'json',
  content       JSONB NOT NULL,
  is_default    BOOLEAN DEFAULT false,
  firm_nr       VARCHAR(10),
  period_nr     VARCHAR(10),
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN public.report_templates.template_type IS
  'json, template_designer_v2 veya FastReport .frx icin fastreport_frx.';
COMMENT ON COLUMN public.report_templates.content IS
  'JSONB sablon icerigi; fastreport_frx satirlarinda { "frxXml": "..." } bicimi beklenir.';

CREATE TABLE IF NOT EXISTS public.print_design_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr VARCHAR(10) NOT NULL,
  scope VARCHAR(64) NOT NULL,
  design_kind VARCHAR(32) NOT NULL DEFAULT 'fastreport_frx',
  design_id UUID,
  design_ref TEXT,
  design_name TEXT,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(firm_nr, scope),
  CONSTRAINT print_design_bindings_design_kind_chk
    CHECK (design_kind IN ('fastreport_frx', 'design_center', 'builtin'))
);
CREATE INDEX IF NOT EXISTS idx_print_design_bindings_firm_active
  ON public.print_design_bindings (firm_nr, is_active, scope);
COMMENT ON TABLE public.print_design_bindings IS
  'Firma bazinda belge turu -> yazdirma dizayni eslestirmesi.';
COMMENT ON COLUMN public.print_design_bindings.scope IS
  'PrintDesignScope: pos_receipt, invoice_sales, kitchen_ticket, account_receipt, cash_voucher vb.';
COMMENT ON COLUMN public.print_design_bindings.design_kind IS
  'fastreport_frx | design_center | builtin';
COMMENT ON COLUMN public.print_design_bindings.design_id IS
  'fastreport_frx icin public.report_templates.id.';
COMMENT ON COLUMN public.print_design_bindings.design_ref IS
  'Design Center katalog sablon id''si veya ilerideki harici referans.';

CREATE TABLE IF NOT EXISTS public.service_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr          VARCHAR(10) NOT NULL,
  store_id         UUID REFERENCES public.stores(id),
  transaction_type VARCHAR(20) NOT NULL,
  provider         VARCHAR(50) NOT NULL,
  target_number    VARCHAR(50) NOT NULL,
  package_name     VARCHAR(100),
  amount           DECIMAL(15,2) NOT NULL,
  cost             DECIMAL(15,2) DEFAULT 0,
  profit           DECIMAL(15,2) GENERATED ALWAYS AS (amount - cost) STORED,
  currency         VARCHAR(10) DEFAULT 'IQD',
  status           VARCHAR(20) DEFAULT 'completed',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. LOGIC SCHEMA (Firm-level global)
-- ============================================================================

CREATE TABLE IF NOT EXISTS logic.bank_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr       VARCHAR(10) NOT NULL,
  code          VARCHAR(50) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  bank_name     VARCHAR(255),
  iban          VARCHAR(50),
  currency_code VARCHAR(10),
  balance       DECIMAL(15,2) DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(firm_nr, code)
);

CREATE TABLE IF NOT EXISTS logic.campaigns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr        VARCHAR(10) NOT NULL,
  code           VARCHAR(50) NOT NULL,
  name           VARCHAR(255) NOT NULL,
  campaign_type  VARCHAR(50) NOT NULL,
  discount_value DECIMAL(15,2),
  start_date     TIMESTAMPTZ,
  end_date       TIMESTAMPTZ,
  is_active      BOOLEAN DEFAULT true,
  conditions     JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(firm_nr, code)
);

-- ============================================================================
-- 5. WMS SCHEMA (Warehouse Management)
-- ============================================================================

CREATE TABLE IF NOT EXISTS wms.bins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID REFERENCES public.stores(id),
  code        VARCHAR(50) NOT NULL,
  zone        VARCHAR(50),
  aisle       VARCHAR(50),
  shelf       VARCHAR(50),
  bin         VARCHAR(50),
  capacity_m3 DECIMAL(15,3),
  max_weight  DECIMAL(15,2),
  is_active   BOOLEAN DEFAULT true,
  UNIQUE(store_id, code)
);

CREATE TABLE IF NOT EXISTS wms.personnel (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID REFERENCES public.users(id),
  store_id  UUID REFERENCES public.stores(id),
  role      VARCHAR(50),
  is_active BOOLEAN DEFAULT true
);

-- Sayım Fişleri (Inventory Counting Slips)
CREATE TABLE IF NOT EXISTS wms.counting_slips (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr      VARCHAR(10) NOT NULL,
  store_id     UUID NOT NULL,
  fiche_no     VARCHAR(50) NOT NULL,
  date         TIMESTAMPTZ DEFAULT NOW(),
  status       VARCHAR(20) DEFAULT 'draft',
  count_type   VARCHAR(20) DEFAULT 'full',
  location_code VARCHAR(50),
  description  TEXT,
  created_by   UUID,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(firm_nr, fiche_no)
);

COMMENT ON COLUMN wms.counting_slips.status IS 'draft | active | counting | reconciliation | completed | cancelled';
COMMENT ON COLUMN wms.counting_slips.count_type IS 'full | cycle | location';

-- Sayım Satırları (Counting Lines)
CREATE TABLE IF NOT EXISTS wms.counting_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_id      UUID REFERENCES wms.counting_slips(id) ON DELETE CASCADE,
  firm_nr      VARCHAR(10),
  product_id   UUID,
  product_ref  INTEGER,
  barcode      VARCHAR(100),
  product_name VARCHAR(500),
  bin_id       UUID REFERENCES wms.bins(id),
  location_code VARCHAR(50),
  expected_qty  DECIMAL(15,2),
  counted_qty   DECIMAL(15,2),
  variance      DECIMAL(15,2),
  counted_by    VARCHAR(255),
  counted_at    TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Transfer Emirleri (Warehouse Transfers)
CREATE TABLE IF NOT EXISTS wms.transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr         VARCHAR(10) NOT NULL,
  fiche_no        VARCHAR(50) NOT NULL,
  source_store_id UUID NOT NULL,
  target_store_id UUID NOT NULL,
  date            TIMESTAMPTZ DEFAULT NOW(),
  status          VARCHAR(20) DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(firm_nr, fiche_no)
);

CREATE TABLE IF NOT EXISTS wms.transfer_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID REFERENCES wms.transfers(id) ON DELETE CASCADE,
  product_id  UUID,
  quantity    DECIMAL(15,2) DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Mal Kabul Fişleri (Receiving Slips)
CREATE TABLE IF NOT EXISTS wms.receiving_slips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr       VARCHAR(10) NOT NULL,
  store_id      UUID REFERENCES public.stores(id),
  slip_no       VARCHAR(50) UNIQUE NOT NULL,
  supplier_name VARCHAR(255),
  notes         TEXT,
  status        VARCHAR(20) DEFAULT 'draft',
  created_by    VARCHAR(100),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wms.receiving_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_id       UUID REFERENCES wms.receiving_slips(id) ON DELETE CASCADE,
  product_id    UUID,
  product_code  VARCHAR(100),
  product_name  VARCHAR(255),
  barcode       VARCHAR(100),
  ordered_qty   DECIMAL(15,3) DEFAULT 0,
  received_qty  DECIMAL(15,3) DEFAULT 0,
  unit          VARCHAR(20),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Sevkiyat Fişleri (Dispatch Slips)
CREATE TABLE IF NOT EXISTS wms.dispatch_slips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr       VARCHAR(10) NOT NULL,
  store_id      UUID REFERENCES public.stores(id),
  slip_no       VARCHAR(50) UNIQUE NOT NULL,
  customer_name VARCHAR(255),
  priority      VARCHAR(20) DEFAULT 'normal',
  notes         TEXT,
  status        VARCHAR(20) DEFAULT 'draft',
  created_by    VARCHAR(100),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wms.dispatch_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_id       UUID REFERENCES wms.dispatch_slips(id) ON DELETE CASCADE,
  product_id    UUID,
  product_code  VARCHAR(100),
  product_name  VARCHAR(255),
  barcode       VARCHAR(100),
  requested_qty DECIMAL(15,3) DEFAULT 0,
  picked_qty    DECIMAL(15,3) DEFAULT 0,
  unit          VARCHAR(20),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Toplama Dalgaları (Pick Waves)
CREATE TABLE IF NOT EXISTS wms.pick_waves (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_no      VARCHAR(50) UNIQUE NOT NULL,
  firm_nr      VARCHAR(10),
  warehouse_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  status       VARCHAR(20) DEFAULT 'draft',
  priority     INTEGER DEFAULT 5,
  wave_type    VARCHAR(30) DEFAULT 'standard',
  total_lines  INTEGER DEFAULT 0,
  picked_lines INTEGER DEFAULT 0,
  total_qty    NUMERIC(18,5) DEFAULT 0,
  picked_qty   NUMERIC(18,5) DEFAULT 0,
  assigned_to  VARCHAR(255),
  released_at  TIMESTAMPTZ,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  due_date     TIMESTAMPTZ,
  notes        TEXT,
  created_by   VARCHAR(255),
  created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Avlu / Park Alanı (Yard Locations)
CREATE TABLE IF NOT EXISTS wms.yard_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr       VARCHAR(10),
  code          VARCHAR(50) UNIQUE NOT NULL,
  type          VARCHAR(50) DEFAULT 'parking',
  status        VARCHAR(20) DEFAULT 'available',
  vehicle_plate VARCHAR(20),
  driver_name   VARCHAR(255),
  entry_time    TIMESTAMPTZ,
  exit_time     TIMESTAMPTZ,
  warehouse_id  UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- İşgücü Verimliliği (Labor Productivity)
CREATE TABLE IF NOT EXISTS wms.labor_productivity (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr         VARCHAR(10),
  user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  username        VARCHAR(255),
  task_type       VARCHAR(50),
  reference_id    UUID,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ,
  duration_min    NUMERIC(10,2)
    GENERATED ALWAYS AS (
      CASE WHEN end_time IS NOT NULL
           THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 60
           ELSE NULL END
    ) STORED,
  items_processed NUMERIC(18,5) DEFAULT 0,
  lines_processed INTEGER DEFAULT 0,
  efficiency_rate NUMERIC(5,2),
  warehouse_id    UUID,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Raf Yerleşim Önerileri (Slotting Recommendations)
CREATE TABLE IF NOT EXISTS wms.slotting_recommendations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr              VARCHAR(10),
  product_id           UUID,
  product_code         VARCHAR(100),
  product_name         VARCHAR(255),
  current_location     VARCHAR(50),
  recommended_location VARCHAR(50),
  reason               VARCHAR(255),
  velocity_class       VARCHAR(1),
  daily_picks          NUMERIC(10,2) DEFAULT 0,
  distance_saved_m     NUMERIC(8,2),
  is_applied           BOOLEAN DEFAULT false,
  applied_at           TIMESTAMPTZ,
  applied_by           VARCHAR(255),
  created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Rampa Kapıları (Dock Doors)
CREATE TABLE IF NOT EXISTS wms.dock_doors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr       VARCHAR(10),
  code          VARCHAR(20) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  type          VARCHAR(20) DEFAULT 'inbound',
  warehouse_id  UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  status        VARCHAR(20) DEFAULT 'available',
  vehicle_plate VARCHAR(20),
  carrier_name  VARCHAR(100),
  assigned_at   TIMESTAMPTZ,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- İş Kuyruğu (Task Queue)
CREATE TABLE IF NOT EXISTS wms.task_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr      VARCHAR(10),
  task_type    VARCHAR(30) NOT NULL,
  reference_id UUID,
  reference_no VARCHAR(50),
  priority     INTEGER DEFAULT 5,
  status       VARCHAR(20) DEFAULT 'pending',
  assigned_to  VARCHAR(255),
  assigned_at  TIMESTAMPTZ,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  warehouse_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  bin_location VARCHAR(50),
  product_code VARCHAR(100),
  quantity     NUMERIC(18,5) DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- WMS Indeksleri
CREATE INDEX IF NOT EXISTS idx_counting_slips_firm_nr ON wms.counting_slips(firm_nr);
CREATE INDEX IF NOT EXISTS idx_counting_slips_status ON wms.counting_slips(status);
CREATE INDEX IF NOT EXISTS idx_counting_slips_store_id ON wms.counting_slips(store_id);
CREATE INDEX IF NOT EXISTS idx_counting_lines_slip_id ON wms.counting_lines(slip_id);
CREATE INDEX IF NOT EXISTS idx_counting_lines_product_id ON wms.counting_lines(product_id);
CREATE INDEX IF NOT EXISTS idx_counting_lines_barcode ON wms.counting_lines(barcode);
CREATE INDEX IF NOT EXISTS idx_receiving_slips_firm ON wms.receiving_slips(firm_nr);
CREATE INDEX IF NOT EXISTS idx_receiving_slips_status ON wms.receiving_slips(status);
CREATE INDEX IF NOT EXISTS idx_receiving_lines_slip ON wms.receiving_lines(slip_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_slips_firm ON wms.dispatch_slips(firm_nr);
CREATE INDEX IF NOT EXISTS idx_dispatch_slips_status ON wms.dispatch_slips(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_lines_slip ON wms.dispatch_lines(slip_id);
CREATE INDEX IF NOT EXISTS idx_wms_pick_waves_status ON wms.pick_waves(status, priority);
CREATE INDEX IF NOT EXISTS idx_wms_pick_waves_firm_status ON wms.pick_waves(firm_nr, status, priority);
CREATE INDEX IF NOT EXISTS idx_wms_yard_firm_status ON wms.yard_locations(firm_nr, status);
CREATE INDEX IF NOT EXISTS idx_wms_task_queue_status ON wms.task_queue(status, priority, assigned_to);
CREATE INDEX IF NOT EXISTS idx_wms_task_queue_type ON wms.task_queue(task_type, status);
CREATE INDEX IF NOT EXISTS idx_wms_task_queue_firm_status ON wms.task_queue(firm_nr, status, priority);

-- ============================================================================
-- 6. RESTAURANT SCHEMA (Global REST tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS rest.staff_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(50) NOT NULL UNIQUE,
  permissions JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS rest.floors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  color         VARCHAR(50) DEFAULT '#3B82F6',
  display_order INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rest.kroki_layouts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  floor_name  VARCHAR(100) NOT NULL DEFAULT 'Tümü',
  layout_data JSONB NOT NULL DEFAULT '{}',
  UNIQUE(store_id, floor_name)
);

CREATE TABLE IF NOT EXISTS rest.printer_profiles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  type       VARCHAR(20) DEFAULT 'thermal',
  address    VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- İade/iptal raporu (VoidReturnReport) — 002 / SETUP_RESTAURANT_CHAT_ADDITIONS ile uyumlu
CREATE TABLE IF NOT EXISTS rest.return_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number    VARCHAR(50) NOT NULL,
  original_receipt VARCHAR(100),
  product_id       UUID,
  product_name     VARCHAR(255) NOT NULL,
  quantity         DECIMAL(15,3) NOT NULL DEFAULT 1,
  unit_price       DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
  return_reason    TEXT NOT NULL,
  staff_name       VARCHAR(255),
  created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_return_log_created_at ON rest.return_log(created_at);
CREATE INDEX IF NOT EXISTS idx_return_log_reason ON rest.return_log(return_reason);

-- ============================================================================
-- 7. BEAUTY SCHEMA (Static global)
-- ============================================================================

CREATE TABLE IF NOT EXISTS beauty.body_regions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL UNIQUE,
  avg_shots  INTEGER DEFAULT 100,
  min_shots  INTEGER DEFAULT 50,
  max_shots  INTEGER DEFAULT 200,
  sort_order INTEGER DEFAULT 0
);

-- ============================================================================
-- 8. SYSTEM TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_settings (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key     VARCHAR(100) NOT NULL,
  value   JSONB NOT NULL,
  firm_nr VARCHAR(10) NOT NULL,
  UNIQUE(key, firm_nr)
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name     VARCHAR(100) NOT NULL,
  record_id      UUID NOT NULL,
  action         VARCHAR(20) NOT NULL,
  firm_nr        VARCHAR(10) NOT NULL,
  data           JSONB,
  status         VARCHAR(20) DEFAULT 'pending',
  target_store_id UUID REFERENCES public.stores(id),
  source_store_id UUID REFERENCES public.stores(id),
  source_user_id UUID REFERENCES public.users(id),
  terminal_name  VARCHAR(100),
  source_system  VARCHAR(50) DEFAULT 'RetailEX',
  synced_at      TIMESTAMPTZ,
  retry_count    INTEGER DEFAULT 0,
  error_message  TEXT,
  created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_target_store_pending
  ON public.sync_queue (target_store_id, status, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sync_queue_target_terminal_pending
  ON public.sync_queue (target_store_id, terminal_name, status, created_at ASC)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.device_sync_cursor (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id          TEXT NOT NULL,
  firm_nr            VARCHAR(10) NOT NULL,
  scope              VARCHAR(32) NOT NULL,
  last_success_at    TIMESTAMPTZ,
  last_watermark_at  TIMESTAMPTZ,
  sync_mode          VARCHAR(16) NOT NULL DEFAULT 'incremental',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (device_id, firm_nr, scope)
);

CREATE INDEX IF NOT EXISTS idx_device_sync_cursor_device_firm
  ON public.device_sync_cursor (device_id, firm_nr);

CREATE TABLE IF NOT EXISTS public.device_sync_transfer_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id          TEXT NOT NULL,
  firm_nr            VARCHAR(10) NOT NULL,
  store_id           UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  terminal_name      VARCHAR(100),
  direction          VARCHAR(20) NOT NULL,
  sync_mode          VARCHAR(16) NOT NULL DEFAULT 'incremental',
  status             VARCHAR(20) NOT NULL DEFAULT 'ok',
  record_count       INTEGER NOT NULL DEFAULT 0,
  inserted_count     INTEGER NOT NULL DEFAULT 0,
  updated_count      INTEGER NOT NULL DEFAULT 0,
  skipped_count      INTEGER NOT NULL DEFAULT 0,
  failed_count       INTEGER NOT NULL DEFAULT 0,
  price_change_count INTEGER NOT NULL DEFAULT 0,
  watermark_from     TIMESTAMPTZ,
  watermark_to       TIMESTAMPTZ,
  table_breakdown    JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_changes      JSONB NOT NULL DEFAULT '[]'::jsonb,
  message            TEXT,
  detail             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_sync_transfer_log_device_created
  ON public.device_sync_transfer_log (device_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.price_change_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr       VARCHAR(10) NOT NULL,
  table_name    VARCHAR(100) NOT NULL,
  record_id     UUID NOT NULL,
  product_code  VARCHAR(100),
  product_name  VARCHAR(255),
  old_prices    JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_prices    JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_diff    JSONB NOT NULL DEFAULT '[]'::jsonb,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source        VARCHAR(32) NOT NULL DEFAULT 'db_trigger'
);

CREATE INDEX IF NOT EXISTS idx_price_change_log_record_changed
  ON public.price_change_log (record_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_change_log_firm_changed
  ON public.price_change_log (firm_nr, changed_at DESC);

CREATE TABLE IF NOT EXISTS public.device_price_ack (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_change_log_id UUID REFERENCES public.price_change_log(id) ON DELETE SET NULL,
  device_id           TEXT NOT NULL,
  store_id            UUID,
  terminal_name       VARCHAR(100),
  firm_nr             VARCHAR(10) NOT NULL,
  table_name          VARCHAR(100) NOT NULL,
  record_id           UUID NOT NULL,
  product_code        VARCHAR(100),
  old_prices          JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_prices          JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_diff          JSONB NOT NULL DEFAULT '[]'::jsonb,
  ack_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_price_ack_log_device
  ON public.device_price_ack (device_id, price_change_log_id)
  WHERE price_change_log_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_price_ack_device_ack
  ON public.device_price_ack (device_id, ack_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_price_ack_log
  ON public.device_price_ack (price_change_log_id);

CREATE TABLE IF NOT EXISTS public.device_sync_ack (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id            TEXT NOT NULL,
  firm_nr              VARCHAR(10) NOT NULL,
  store_id             UUID,
  terminal_name        VARCHAR(100),
  direction            VARCHAR(20) NOT NULL,
  sync_mode            VARCHAR(16) NOT NULL DEFAULT 'incremental',
  status               VARCHAR(20) NOT NULL DEFAULT 'ok',
  record_count         INTEGER NOT NULL DEFAULT 0,
  inserted_count       INTEGER NOT NULL DEFAULT 0,
  updated_count        INTEGER NOT NULL DEFAULT 0,
  skipped_count        INTEGER NOT NULL DEFAULT 0,
  failed_count         INTEGER NOT NULL DEFAULT 0,
  price_change_count   INTEGER NOT NULL DEFAULT 0,
  price_ack_count      INTEGER NOT NULL DEFAULT 0,
  pending_price_count  INTEGER NOT NULL DEFAULT 0,
  products_with_price  INTEGER NOT NULL DEFAULT 0,
  table_breakdown      JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_changes        JSONB NOT NULL DEFAULT '[]'::jsonb,
  watermark_from       TIMESTAMPTZ,
  watermark_to         TIMESTAMPTZ,
  app_version          VARCHAR(50),
  message              TEXT,
  detail               JSONB NOT NULL DEFAULT '{}'::jsonb,
  local_log_id         UUID,
  ack_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_sync_ack_device_ack
  ON public.device_sync_ack (device_id, ack_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_sync_ack_firm_direction_ack
  ON public.device_sync_ack (firm_nr, direction, ack_at DESC);

CREATE OR REPLACE FUNCTION public.extract_product_price_fields(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_keys TEXT[] := ARRAY[
    'price','cost','purchase_price',
    'price_list_1','price_list_2','price_list_3','price_list_4','price_list_5','price_list_6',
    'pricelist1','pricelist2','pricelist3','pricelist4','pricelist5','pricelist6',
    'sale_price_usd','sale_price_eur','purchase_price_usd','purchase_price_eur','custom_exchange_rate'
  ];
  v_out JSONB := '{}'::jsonb;
  k TEXT;
BEGIN
  IF p_row IS NULL THEN RETURN v_out; END IF;
  FOREACH k IN ARRAY v_keys LOOP
    IF p_row ? k AND p_row->k IS NOT NULL AND p_row->k <> 'null'::jsonb THEN
      v_out := v_out || jsonb_build_object(k, p_row->k);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.build_price_diff_json(p_old JSONB, p_new JSONB)
RETURNS JSONB AS $$
DECLARE
  v_diff JSONB := '[]'::jsonb;
  k TEXT;
  v_old TEXT;
  v_new TEXT;
BEGIN
  FOR k IN SELECT jsonb_object_keys(p_new) LOOP
    v_old := COALESCE(p_old->>k, '');
    v_new := COALESCE(p_new->>k, '');
    IF v_old IS DISTINCT FROM v_new THEN
      v_diff := v_diff || jsonb_build_array(jsonb_build_object('field', k, 'old', p_old->k, 'new', p_new->k));
    END IF;
  END LOOP;
  RETURN v_diff;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.log_rex_product_price_change()
RETURNS TRIGGER AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_diff JSONB;
  v_firm TEXT;
BEGIN
  v_old := public.extract_product_price_fields(to_jsonb(OLD));
  v_new := public.extract_product_price_fields(to_jsonb(NEW));
  v_diff := public.build_price_diff_json(v_old, v_new);
  IF jsonb_array_length(v_diff) = 0 THEN
    RETURN NEW;
  END IF;
  v_firm := COALESCE(NULLIF(trim(NEW.firm_nr), ''), '001');
  INSERT INTO public.price_change_log (
    firm_nr, table_name, record_id, product_code, product_name,
    old_prices, new_prices, price_diff, source
  ) VALUES (
    v_firm,
    TG_TABLE_NAME,
    NEW.id,
    NEW.code,
    NEW.name,
    v_old,
    v_new,
    v_diff,
    'db_trigger'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID,
  firm_nr    VARCHAR(10) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id  UUID NOT NULL,
  action     VARCHAR(20) NOT NULL,
  old_data   JSONB,
  new_data   JSONB,
  client_info JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 9. GLOBAL MASTER DATA
-- ============================================================================

CREATE TABLE IF NOT EXISTS brands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS product_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(50) NOT NULL UNIQUE,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  parent_id     UUID REFERENCES categories(id),
  is_restaurant BOOLEAN DEFAULT false,
  icon          VARCHAR(100),
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.menu_items (
  id            SERIAL PRIMARY KEY,
  menu_type     VARCHAR(50) NOT NULL,
  title         VARCHAR(255),
  label         VARCHAR(255) NOT NULL,
  label_tr      VARCHAR(255),
  label_en      VARCHAR(255),
  label_ar      VARCHAR(255),
  parent_id     INTEGER,
  section_id    INTEGER,
  screen_id     VARCHAR(100),
  icon_name     VARCHAR(100),
  badge         VARCHAR(50),
  display_order INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  is_visible    BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Barcode Templates for automatic generation
CREATE TABLE IF NOT EXISTS public.barcode_templates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL DEFAULT 'Varsayilan Sablon',
    prefix        VARCHAR(20) DEFAULT '869',
    current_value BIGINT DEFAULT 1000000,
    length        INTEGER DEFAULT 13,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial barcode template
INSERT INTO public.barcode_templates (name, prefix, current_value, length)
SELECT 'Varsayilan Sablon', '869', 1000000, 13
WHERE NOT EXISTS (SELECT 1 FROM public.barcode_templates);

-- History table for tracking product exchange rate changes
CREATE TABLE IF NOT EXISTS public.product_exchange_rate_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    old_rate NUMERIC,
    new_rate NUMERIC,
    changed_by TEXT,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prod_rate_history_product_id ON public.product_exchange_rate_history(product_id);

-- ============================================================================
-- 10. FUNCTIONS & TRIGGERS
-- ============================================================================

-- 10.1 Timestamp Update Helper
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10.2 Sync Queue Trigger
CREATE OR REPLACE FUNCTION enqueue_sync_event()
RETURNS TRIGGER AS $$
DECLARE
  v_firm_nr  VARCHAR;
  v_record_id UUID;
  v_data     JSONB;
  v_sig TEXT;
BEGIN
  IF COALESCE(current_setting('retailex.sync_apply', true), '') = '1' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    IF (TG_OP = 'DELETE') THEN
      v_firm_nr := OLD.firm_nr; v_record_id := OLD.id; v_data := row_to_json(OLD)::JSONB;
    ELSE
      v_firm_nr := NEW.firm_nr; v_record_id := NEW.id; v_data := row_to_json(NEW)::JSONB;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_firm_nr := '001';
    IF (TG_OP = 'DELETE') THEN v_record_id := OLD.id; v_data := row_to_json(OLD)::JSONB;
    ELSE v_record_id := NEW.id; v_data := row_to_json(NEW)::JSONB; END IF;
  END;

  IF TG_OP <> 'DELETE' THEN
    v_sig := COALESCE(v_data->>'updated_at', md5(v_data::text));
    IF EXISTS (
      SELECT 1
      FROM sync_queue sq
      WHERE sq.table_name = TG_TABLE_NAME
        AND sq.record_id = v_record_id
        AND sq.status = 'completed'
        AND COALESCE(sq.data->>'updated_at', md5(sq.data::text)) IS NOT DISTINCT FROM v_sig
      ORDER BY sq.synced_at DESC NULLS LAST
      LIMIT 1
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  UPDATE sync_queue SET data = v_data, action = TG_OP, created_at = NOW()
  WHERE table_name = TG_TABLE_NAME AND record_id = v_record_id AND status = 'pending';
  IF NOT FOUND THEN
    INSERT INTO sync_queue (table_name, record_id, action, firm_nr, data)
    VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_firm_nr, v_data);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.reset_exhausted_sync_queue(p_firm_nr VARCHAR DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
  v_norm TEXT;
BEGIN
  v_norm := lpad(ltrim(COALESCE(p_firm_nr, ''), '0'), 3, '0');
  UPDATE sync_queue
  SET retry_count = 0,
      error_message = NULL,
      status = 'pending',
      created_at = NOW()
  WHERE status = 'pending'
    AND retry_count >= 10
    AND (
      p_firm_nr IS NULL OR p_firm_nr = ''
      OR lpad(ltrim(firm_nr, '0'), 3, '0') = v_norm
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.prune_redundant_sync_queue(p_firm_nr VARCHAR DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
  v_norm TEXT;
BEGIN
  v_norm := lpad(ltrim(COALESCE(p_firm_nr, ''), '0'), 3, '0');
  DELETE FROM sync_queue p
  WHERE p.status = 'pending'
    AND (
      p_firm_nr IS NULL OR p_firm_nr = ''
      OR lpad(ltrim(p.firm_nr, '0'), 3, '0') = v_norm
    )
    AND EXISTS (
      SELECT 1
      FROM sync_queue c
      WHERE c.table_name = p.table_name
        AND c.record_id = p.record_id
        AND c.status = 'completed'
        AND COALESCE(c.data->>'updated_at', md5(c.data::text))
            IS NOT DISTINCT FROM COALESCE(p.data->>'updated_at', md5(p.data::text))
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.enqueue_hybrid_backfill(
  p_firm_nr VARCHAR,
  p_row_limit INTEGER DEFAULT 2000,
  p_changed_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_firm_raw TEXT := ltrim(COALESCE(p_firm_nr, '001'), '0');
  v_firm_padded TEXT := lpad(COALESCE(NULLIF(v_firm_raw, ''), '1'), 3, '0');
  v_table RECORD;
  v_row RECORD;
  v_total INTEGER := 0;
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_row_limit, 2000), 10000));
  v_pat_card TEXT;
  v_pat_period TEXT;
  v_has_updated_at BOOLEAN;
  v_sql TEXT;
BEGIN
  v_pat_card := '^rex_(' || v_firm_raw || '|' || v_firm_padded || ')_(customers|suppliers|products)$';
  v_pat_period := '^rex_(' || v_firm_raw || '|' || v_firm_padded || ')_[0-9]+_(sales|sale_items|cash_lines|stock_movements|stock_movement_items)$';

  FOR v_table IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND (tablename ~ v_pat_card OR tablename ~ v_pat_period)
    ORDER BY tablename
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = v_table.tablename
        AND c.column_name = 'updated_at'
    ) INTO v_has_updated_at;

    IF v_has_updated_at AND p_changed_since IS NOT NULL THEN
      v_sql := format(
        $q$
        SELECT t.id, COALESCE(NULLIF(t.firm_nr, ''), %L)::varchar AS firm_nr, to_jsonb(t) AS data
        FROM %I t
        WHERE NOT EXISTS (
          SELECT 1 FROM sync_queue sq
          WHERE sq.table_name = %L AND sq.record_id = t.id AND sq.status = 'completed'
        )
        AND NOT EXISTS (
          SELECT 1 FROM sync_queue sq
          WHERE sq.table_name = %L AND sq.record_id = t.id
            AND sq.status = 'pending' AND sq.retry_count < 10
        )
        AND t.updated_at >= %L::timestamptz
        ORDER BY t.updated_at ASC NULLS LAST
        LIMIT %s
        $q$,
        v_firm_padded,
        v_table.tablename,
        v_table.tablename,
        v_table.tablename,
        p_changed_since,
        v_limit
      );
    ELSE
      v_sql := format(
        $q$
        SELECT t.id, COALESCE(NULLIF(t.firm_nr, ''), %L)::varchar AS firm_nr, to_jsonb(t) AS data
        FROM %I t
        WHERE NOT EXISTS (
          SELECT 1 FROM sync_queue sq
          WHERE sq.table_name = %L AND sq.record_id = t.id AND sq.status = 'completed'
        )
        AND NOT EXISTS (
          SELECT 1 FROM sync_queue sq
          WHERE sq.table_name = %L AND sq.record_id = t.id
            AND sq.status = 'pending' AND sq.retry_count < 10
        )
        LIMIT %s
        $q$,
        v_firm_padded,
        v_table.tablename,
        v_table.tablename,
        v_table.tablename,
        v_limit
      );
    END IF;

    FOR v_row IN EXECUTE v_sql
    LOOP
      INSERT INTO sync_queue (table_name, record_id, action, firm_nr, data)
      VALUES (v_table.tablename, v_row.id, 'UPDATE', v_row.firm_nr, v_row.data);
      v_total := v_total + 1;
      EXIT WHEN v_total >= v_limit;
    END LOOP;
    EXIT WHEN v_total >= v_limit;
  END LOOP;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.resolve_table_schema(p_table_name TEXT)
RETURNS TEXT AS $$
  SELECT table_schema
  FROM information_schema.tables
  WHERE table_name = p_table_name
    AND table_schema IN ('public', 'wms', 'rest', 'beauty', 'auth', 'logic', 'pos')
  ORDER BY CASE table_schema WHEN 'public' THEN 0 ELSE 1 END
  LIMIT 1;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.normalize_sync_queue_data(
  p_schema TEXT,
  p_table_name TEXT,
  p_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_out JSONB := COALESCE(p_data, '{}'::jsonb);
  r RECORD;
BEGIN
  IF p_data IS NULL OR p_data = 'null'::jsonb THEN
    RETURN p_data;
  END IF;

  IF p_table_name ~ '_products$' THEN
    IF NOT (v_out ? 'expiry_tracking') OR v_out->'expiry_tracking' IS NULL OR v_out->'expiry_tracking' = 'null'::jsonb THEN
      v_out := v_out || '{"expiry_tracking": false}'::jsonb;
    END IF;
    IF NOT (v_out ? 'is_scale_product') OR v_out->'is_scale_product' IS NULL OR v_out->'is_scale_product' = 'null'::jsonb THEN
      v_out := v_out || '{"is_scale_product": false}'::jsonb;
    END IF;
    IF NOT (v_out ? 'has_variants') OR v_out->'has_variants' IS NULL OR v_out->'has_variants' = 'null'::jsonb THEN
      v_out := v_out || '{"has_variants": false}'::jsonb;
    END IF;
    IF NOT (v_out ? 'is_active') OR v_out->'is_active' IS NULL OR v_out->'is_active' = 'null'::jsonb THEN
      v_out := v_out || '{"is_active": true}'::jsonb;
    END IF;
    IF NOT (v_out ? 'auto_calculate_usd') OR v_out->'auto_calculate_usd' IS NULL OR v_out->'auto_calculate_usd' = 'null'::jsonb THEN
      v_out := v_out || '{"auto_calculate_usd": false}'::jsonb;
    END IF;
  END IF;

  FOR r IN
    SELECT c.column_name, c.column_default, c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = p_schema
      AND c.table_name = p_table_name
      AND c.is_nullable = 'NO'
      AND c.column_default IS NOT NULL
      AND c.column_name <> 'id'
      AND (
        NOT (v_out ? c.column_name)
        OR v_out->c.column_name IS NULL
        OR v_out->c.column_name = 'null'::jsonb
      )
  LOOP
    IF r.udt_name = 'bool' THEN
      IF r.column_default LIKE '%true%' THEN
        v_out := v_out || jsonb_build_object(r.column_name, true);
      ELSE
        v_out := v_out || jsonb_build_object(r.column_name, false);
      END IF;
    ELSIF r.udt_name IN ('int2', 'int4', 'int8', 'numeric', 'float4', 'float8') THEN
      IF r.column_default ~ '^[0-9]+(\.[0-9]+)?' THEN
        v_out := v_out || jsonb_build_object(r.column_name, (regexp_match(r.column_default, '^[0-9]+(\.[0-9]+)?'))[1]::numeric);
      END IF;
    ELSIF r.udt_name = 'varchar' OR r.udt_name = 'text' THEN
      IF r.column_default ~ '''([^'']*)''' THEN
        v_out := v_out || jsonb_build_object(r.column_name, (regexp_match(r.column_default, '''([^'']*)'''))[1]);
      END IF;
    END IF;
  END LOOP;

  RETURN v_out;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.apply_sync_queue_item(
  p_table_name TEXT,
  p_action TEXT,
  p_record_id UUID,
  p_data JSONB
) RETURNS TEXT AS $$
DECLARE
  v_schema TEXT;
  v_updates TEXT;
  v_sql TEXT;
  v_exists BOOLEAN;
  v_affected INT;
  v_data JSONB;
  v_code TEXT;
  v_ref_id INTEGER;
  v_existing_id UUID;
  v_record_id UUID := p_record_id;
BEGIN
  PERFORM set_config('retailex.sync_apply', '1', true);

  v_schema := public.resolve_table_schema(p_table_name);
  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'Tablo bulunamadı: %', p_table_name;
  END IF;

  IF upper(p_action) = 'DELETE' THEN
    v_sql := format('DELETE FROM %I.%I WHERE id = $1', v_schema, p_table_name);
    EXECUTE v_sql USING v_record_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected > 0 THEN
      RETURN 'delete';
    END IF;
    RETURN 'skip';
  END IF;

  IF p_data IS NULL OR p_data = 'null'::jsonb THEN
    RETURN 'noop';
  END IF;

  v_data := public.normalize_sync_queue_data(v_schema, p_table_name, p_data);

  IF NOT (v_data ? 'id') OR v_data->>'id' IS NULL OR v_data->'id' = 'null'::jsonb THEN
    v_data := v_data || jsonb_build_object('id', v_record_id);
  END IF;

  IF p_table_name ~ '_(customers|suppliers)$' THEN
    v_code := NULLIF(trim(v_data->>'code'), '');
    IF v_code IS NOT NULL THEN
      EXECUTE format('SELECT id FROM %I.%I WHERE code = $1 LIMIT 1', v_schema, p_table_name)
        INTO v_existing_id
        USING v_code;
      IF v_existing_id IS NOT NULL AND v_existing_id <> v_record_id THEN
        v_record_id := v_existing_id;
        v_data := v_data || jsonb_build_object('id', v_existing_id);
      END IF;
    END IF;
  END IF;

  IF p_table_name ~ '_products$' THEN
    v_ref_id := NULLIF(regexp_replace(COALESCE(v_data->>'ref_id', ''), '\D', '', 'g'), '')::INTEGER;
    IF v_ref_id IS NOT NULL AND v_ref_id > 0 THEN
      EXECUTE format('SELECT id FROM %I.%I WHERE ref_id = $1 LIMIT 1', v_schema, p_table_name)
        INTO v_existing_id
        USING v_ref_id;
      IF v_existing_id IS NOT NULL AND v_existing_id <> v_record_id THEN
        v_record_id := v_existing_id;
        v_data := v_data || jsonb_build_object('id', v_existing_id);
      END IF;
    END IF;
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE id = $1)', v_schema, p_table_name)
    INTO v_exists
    USING v_record_id;

  SELECT string_agg(format('%I = EXCLUDED.%I', column_name, column_name), ', ')
  INTO v_updates
  FROM information_schema.columns
  WHERE table_schema = v_schema
    AND table_name = p_table_name
    AND column_name <> 'id';

  IF v_updates IS NULL OR v_updates = '' THEN
    v_sql := format(
      'INSERT INTO %I.%I SELECT * FROM jsonb_populate_record(null::%I.%I, $1) ON CONFLICT (id) DO NOTHING',
      v_schema, p_table_name, v_schema, p_table_name
    );
    EXECUTE v_sql USING v_data;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected > 0 THEN
      RETURN 'insert';
    END IF;
    RETURN 'skip';
  END IF;

  v_sql := format(
    'INSERT INTO %I.%I SELECT * FROM jsonb_populate_record(null::%I.%I, $1) ON CONFLICT (id) DO UPDATE SET %s',
    v_schema, p_table_name, v_schema, p_table_name, v_updates
  );
  EXECUTE v_sql USING v_data;

  IF v_exists THEN
    RETURN 'update';
  END IF;
  RETURN 'insert';
EXCEPTION
  WHEN unique_violation THEN
    IF p_table_name ~ '_(customers|suppliers)$' AND (v_data->>'code') IS NOT NULL THEN
      EXECUTE format(
        'UPDATE %I.%I t SET %s FROM jsonb_populate_record(null::%I.%I, $1) AS src WHERE t.code = $2',
        v_schema,
        p_table_name,
        (
          SELECT string_agg(format('%I = src.%I', column_name, column_name), ', ')
          FROM information_schema.columns
          WHERE table_schema = v_schema
            AND table_name = p_table_name
            AND column_name NOT IN ('id', 'code')
        ),
        v_schema,
        p_table_name
      ) USING v_data, v_data->>'code';
      GET DIAGNOSTICS v_affected = ROW_COUNT;
      IF v_affected > 0 THEN
        RETURN 'update';
      END IF;
      RETURN 'skip';
    END IF;
    IF p_table_name ~ '_products$' AND (v_data->>'ref_id') IS NOT NULL THEN
      v_ref_id := NULLIF(regexp_replace(v_data->>'ref_id', '\D', '', 'g'), '')::INTEGER;
      IF v_ref_id IS NOT NULL AND v_ref_id > 0 THEN
        EXECUTE format(
          'UPDATE %I.%I t SET %s FROM jsonb_populate_record(null::%I.%I, $1) AS src WHERE t.ref_id = $2',
          v_schema,
          p_table_name,
          (
            SELECT string_agg(format('%I = src.%I', column_name, column_name), ', ')
            FROM information_schema.columns
            WHERE table_schema = v_schema
              AND table_name = p_table_name
              AND column_name NOT IN ('id', 'ref_id')
          ),
          v_schema,
          p_table_name
        ) USING v_data, v_ref_id;
        GET DIAGNOSTICS v_affected = ROW_COUNT;
        IF v_affected > 0 THEN
          RETURN 'update';
        END IF;
        RETURN 'skip';
      END IF;
    END IF;
    RAISE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.provision_firm_schema(
  p_firm_nr TEXT,
  p_period_nr TEXT DEFAULT '01',
  p_firm_name TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT 'IQD',
  p_bootstrap_modules BOOLEAN DEFAULT TRUE
) RETURNS TABLE (
  out_ok BOOLEAN,
  out_message TEXT
) AS $$
DECLARE
  v_firm TEXT;
  v_period TEXT;
  v_name TEXT;
  v_firm_id UUID;
  v_period_int INTEGER;
BEGIN
  v_firm := lpad(ltrim(regexp_replace(COALESCE(p_firm_nr, ''), '[^0-9]', '', 'g'), '0'), 3, '0');
  IF v_firm = '' OR v_firm = '000' THEN v_firm := '001'; END IF;
  v_period := lpad(ltrim(regexp_replace(COALESCE(p_period_nr, '01'), '[^0-9]', '', 'g'), '0'), 2, '0');
  IF v_period = '' OR v_period = '00' THEN v_period := '01'; END IF;
  v_period_int := v_period::integer;
  v_name := COALESCE(NULLIF(trim(p_firm_name), ''), 'Firma ' || v_firm);

  INSERT INTO public.firms (firm_nr, name, ana_para_birimi, raporlama_para_birimi, is_active)
  VALUES (v_firm, v_name, COALESCE(NULLIF(trim(p_currency), ''), 'IQD'), COALESCE(NULLIF(trim(p_currency), ''), 'IQD'), true)
  ON CONFLICT (firm_nr) DO UPDATE SET name = EXCLUDED.name, is_active = true;

  SELECT id INTO v_firm_id FROM public.firms WHERE firm_nr = v_firm LIMIT 1;
  IF v_firm_id IS NOT NULL THEN
    INSERT INTO public.periods (firm_id, nr, beg_date, end_date, is_active, "default")
    VALUES (v_firm_id, v_period_int, DATE '2026-01-01', DATE '2026-12-31', true, true)
    ON CONFLICT (firm_id, nr) DO UPDATE SET is_active = true;
  END IF;

  PERFORM public.CREATE_FIRM_TABLES(v_firm);
  PERFORM public.CREATE_PERIOD_TABLES(v_firm, v_period);

  IF COALESCE(p_bootstrap_modules, true) THEN
    BEGIN
      PERFORM public.INIT_RESTAURANT_FIRM_TABLES(v_firm);
      PERFORM public.INIT_BEAUTY_FIRM_TABLES(v_firm);
      PERFORM public.INIT_RESTAURANT_PERIOD_TABLES(v_firm, v_period);
      PERFORM public.INIT_BEAUTY_PERIOD_TABLES(v_firm, v_period);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  out_ok := true;
  out_message := format('Firma %s dönem %s şeması hazır.', v_firm, v_period);
  RETURN NEXT;
EXCEPTION WHEN OTHERS THEN
  out_ok := false;
  out_message := SQLERRM;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10.3 Apply Sync Triggers Helper
CREATE OR REPLACE FUNCTION public.apply_sync_triggers(p_table_name TEXT)
RETURNS void AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I; CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE PROCEDURE public.enqueue_sync_event();',
    'sync_trg_' || p_table_name, p_table_name, 'sync_trg_' || p_table_name, p_table_name);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.try_apply_sync_triggers(p_table_name TEXT)
RETURNS void AS $$
BEGIN
  BEGIN
    PERFORM public.apply_sync_triggers(p_table_name);
  EXCEPTION
    WHEN undefined_function THEN NULL;
    WHEN undefined_table THEN NULL;
    WHEN OTHERS THEN
      IF SQLSTATE = '42883' THEN RETURN; END IF;
      RAISE;
  END;
END;
$$ LANGUAGE plpgsql;

-- 10.4 Audit Log
CREATE OR REPLACE FUNCTION public.log_row_change()
RETURNS TRIGGER AS $$
DECLARE
  v_old_data JSONB := NULL;
  v_new_data JSONB := NULL;
  v_firm_nr  VARCHAR(10);
BEGIN
  IF (TG_OP = 'UPDATE') THEN v_old_data := to_jsonb(OLD); v_new_data := to_jsonb(NEW);
  ELSIF (TG_OP = 'DELETE') THEN v_old_data := to_jsonb(OLD);
  ELSIF (TG_OP = 'INSERT') THEN v_new_data := to_jsonb(NEW);
  END IF;
  BEGIN v_firm_nr := NEW.firm_nr; EXCEPTION WHEN OTHERS THEN
  BEGIN v_firm_nr := OLD.firm_nr; EXCEPTION WHEN OTHERS THEN v_firm_nr := 'SYSTEM'; END; END;
  INSERT INTO public.audit_logs (user_id, firm_nr, table_name, record_id, action, old_data, new_data, client_info)
  VALUES (current_setting('app.current_user_id', true)::UUID,
          COALESCE(v_firm_nr, 'SYSTEM'), TG_TABLE_NAME,
          COALESCE(NEW.id, OLD.id), TG_OP, v_old_data, v_new_data,
          jsonb_build_object('ip', inet_client_addr(), 'backend_pid', pg_backend_pid()));
  IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.ATTACH_AUDIT_LOG(p_table_name TEXT)
RETURNS void AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON %I', p_table_name);
  EXECUTE format('CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE PROCEDURE public.log_row_change()', p_table_name);
END;
$$ LANGUAGE plpgsql;

-- 10.5 WMS Timestamp Trigger
CREATE OR REPLACE FUNCTION wms.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION wms.update_counting_slips_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_counting_slips_updated_at ON wms.counting_slips;
CREATE TRIGGER trg_counting_slips_updated_at
  BEFORE UPDATE ON wms.counting_slips FOR EACH ROW EXECUTE PROCEDURE wms.update_counting_slips_updated_at();

DROP TRIGGER IF EXISTS trg_counting_lines_updated_at ON wms.counting_lines;
CREATE TRIGGER trg_counting_lines_updated_at
  BEFORE UPDATE ON wms.counting_lines FOR EACH ROW EXECUTE PROCEDURE wms.update_counting_slips_updated_at();

DROP TRIGGER IF EXISTS trg_wms_pick_waves_updated ON wms.pick_waves;
CREATE TRIGGER trg_wms_pick_waves_updated
  BEFORE UPDATE ON wms.pick_waves FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();

DROP TRIGGER IF EXISTS trg_wms_task_queue_updated ON wms.task_queue;
CREATE TRIGGER trg_wms_task_queue_updated
  BEFORE UPDATE ON wms.task_queue FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();

DROP TRIGGER IF EXISTS trg_wms_dock_updated ON wms.dock_doors;
CREATE TRIGGER trg_wms_dock_updated
  BEFORE UPDATE ON wms.dock_doors FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();

DROP TRIGGER IF EXISTS trg_wms_yard_updated ON wms.yard_locations;
CREATE TRIGGER trg_wms_yard_updated
  BEFORE UPDATE ON wms.yard_locations FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();

-- ============================================================================
-- 11. DYNAMIC ENGINE: CREATE_FIRM_TABLES (v6.0 — Definitive)
-- ============================================================================
-- Bu fonksiyon yeni bir firma kurulduğunda çağrılır.
-- Tüm firma-seviyesi tablolar bu fonksiyon ile oluşturulur.
-- ============================================================================

CREATE OR REPLACE FUNCTION CREATE_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
  v_prefix    TEXT := lower('rex_' || p_firm_nr);
  v_unitset_id UUID;
BEGIN
  -- 1. Products (tam şema — tüm kolonlar dahil)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr           VARCHAR(10) NOT NULL,
      ref_id            INTEGER UNIQUE,
      code              VARCHAR(100) UNIQUE,
      barcode           VARCHAR(100),
      name              VARCHAR(255) NOT NULL,
      name2             VARCHAR(255),
      image_url         TEXT,
      image_url_cdn     TEXT,
      description       TEXT,
      description_tr    TEXT,
      description_en    TEXT,
      description_ar    TEXT,
      description_ku    TEXT,
      category_id       UUID,
      category_code     VARCHAR(50),
      categorycode      VARCHAR(50),
      "categoryCode"    VARCHAR(50),
      group_code        VARCHAR(50),
      groupcode         VARCHAR(50),
      "groupCode"       VARCHAR(50),
      sub_group_code    VARCHAR(50),
      subgroupcode      VARCHAR(50),
      "subGroupCode"    VARCHAR(50),
      brand             VARCHAR(100),
      model             VARCHAR(100),
      manufacturer      VARCHAR(100),
      supplier          VARCHAR(100),
      origin            VARCHAR(50),
      material_type     VARCHAR(50),
      materialtype      VARCHAR(50),
      "materialType"    VARCHAR(50),
      unit              VARCHAR(50) DEFAULT ''Adet'',
      unit2             VARCHAR(20),
      unit3             VARCHAR(20),
      unit_id           UUID,
      unitset_id        UUID,
      unitsetid         UUID,
      "unitsetId"       UUID,
      vat_rate          DECIMAL(5,2) DEFAULT 20,
      vatrate           DECIMAL(5,2) DEFAULT 20,
      "vatRate"         DECIMAL(5,2) DEFAULT 20,
      tax_type          VARCHAR(20),
      withholding_rate  DECIMAL(5,2),
      currency          VARCHAR(10) DEFAULT ''IQD'',
      price             DECIMAL(15,2) DEFAULT 0,
      cost              DECIMAL(15,2) DEFAULT 0,
      stock             DECIMAL(15,2) DEFAULT 0,
      min_stock         DECIMAL(15,2) DEFAULT 0,
      max_stock         DECIMAL(15,2) DEFAULT 0,
      critical_stock    DECIMAL(15,2) DEFAULT 0,
      tracking_type     VARCHAR(20) DEFAULT ''none'',
      shelf_location    VARCHAR(50),
      warehouse_code    VARCHAR(50),
      special_code_1    VARCHAR(50),
      special_code_2    VARCHAR(50),
      special_code_3    VARCHAR(50),
      special_code_4    VARCHAR(50),
      special_code_5    VARCHAR(50),
      special_code_6    VARCHAR(50),
      specialcode1      VARCHAR(50),
      specialcode2      VARCHAR(50),
      specialcode3      VARCHAR(50),
      specialcode4      VARCHAR(50),
      specialcode5      VARCHAR(50),
      specialcode6      VARCHAR(50),
      price_list_1      DECIMAL(15,2) DEFAULT 0,
      price_list_2      DECIMAL(15,2) DEFAULT 0,
      price_list_3      DECIMAL(15,2) DEFAULT 0,
      price_list_4      DECIMAL(15,2) DEFAULT 0,
      price_list_5      DECIMAL(15,2) DEFAULT 0,
      price_list_6      DECIMAL(15,2) DEFAULT 0,
      pricelist1        DECIMAL(15,2),
      pricelist2        DECIMAL(15,2),
      pricelist3        DECIMAL(15,2),
      pricelist4        DECIMAL(15,2),
      pricelist5        DECIMAL(15,2),
      pricelist6        DECIMAL(15,2),
      purchase_price    DECIMAL(15,4) DEFAULT 0,
      purchase_price_usd DECIMAL(15,2) DEFAULT 0,
      purchase_price_eur DECIMAL(15,2) DEFAULT 0,
      sale_price_usd    DECIMAL(15,2) DEFAULT 0,
      sale_price_eur    DECIMAL(15,2) DEFAULT 0,
      custom_exchange_rate NUMERIC DEFAULT 0,
      auto_calculate_usd BOOLEAN DEFAULT false,
      preparation_time  INTEGER DEFAULT 5,
      follow_up_reminder_days INTEGER,
      is_scale_product  BOOLEAN NOT NULL DEFAULT false,
      plu_code          VARCHAR(20),
      expiry_date         DATE,
      expiry_tracking     BOOLEAN NOT NULL DEFAULT false,
      shelf_life_days     INTEGER,
      has_variants      BOOLEAN DEFAULT false,
      hasvariants       BOOLEAN DEFAULT false,
      "hasVariants"     BOOLEAN DEFAULT false,
      is_active         BOOLEAN DEFAULT true,
      created_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_products');

  -- 2. Customers
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr      VARCHAR(10) NOT NULL,
      ref_id       INTEGER UNIQUE,
      code         VARCHAR(50) UNIQUE,
      name         VARCHAR(255) NOT NULL,
      phone        VARCHAR(50),
      phone2       VARCHAR(50),
      age          INTEGER,
      file_id      VARCHAR(120),
      occupation   VARCHAR(150),
      gender       VARCHAR(20),
      customer_tier VARCHAR(20) DEFAULT ''normal'',
      heard_from   VARCHAR(150),
      email        VARCHAR(255),
      tax_nr       VARCHAR(50),
      taxi_nr      VARCHAR(50),
      tax_office   VARCHAR(100),
      address      TEXT,
      city         VARCHAR(100),
      neighborhood VARCHAR(100),
      district     VARCHAR(100),
      balance      DECIMAL(15,2) DEFAULT 0,
      points       DECIMAL(15,2) DEFAULT 0,
      total_spent  DECIMAL(15,2) DEFAULT 0,
      notes        TEXT,
      call_plan_enabled BOOLEAN DEFAULT false,
      call_plan_weekdays SMALLINT[] DEFAULT ''{}''::smallint[],
      call_plan_note TEXT,
      call_last_status VARCHAR(30) DEFAULT ''planned'',
      call_last_note TEXT,
      call_last_at TIMESTAMPTZ,
      is_active    BOOLEAN DEFAULT true,
      created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_customers');

  -- 3. Suppliers
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr              VARCHAR(10) NOT NULL,
      ref_id               INTEGER UNIQUE,
      code                 VARCHAR(50) UNIQUE,
      name                 VARCHAR(255) NOT NULL,
      phone                VARCHAR(50),
      email                VARCHAR(255),
      tax_nr               VARCHAR(50),
      tax_office           VARCHAR(100),
      address              TEXT,
      city                 VARCHAR(100),
      neighborhood         VARCHAR(100),
      district             VARCHAR(100),
      contact_person       VARCHAR(150),
      contact_person_phone VARCHAR(50),
      payment_terms        VARCHAR(100),
      credit_limit         DECIMAL(15,2) DEFAULT 0,
      notes                TEXT,
      balance              DECIMAL(15,2) DEFAULT 0,
      is_active            BOOLEAN DEFAULT true,
      created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_suppliers');

  -- 3b. Services (hizmet kartları — fatura / Excel / kasa)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      code VARCHAR(100) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      description_tr TEXT,
      description_en TEXT,
      description_ar TEXT,
      description_ku TEXT,
      category VARCHAR(255),
      category_id UUID,
      category_code VARCHAR(50),
      brand VARCHAR(100),
      model VARCHAR(100),
      manufacturer VARCHAR(100),
      supplier VARCHAR(100),
      origin VARCHAR(50),
      group_code VARCHAR(50),
      sub_group_code VARCHAR(50),
      special_code_1 VARCHAR(50),
      special_code_2 VARCHAR(50),
      special_code_3 VARCHAR(50),
      special_code_4 VARCHAR(50),
      special_code_5 VARCHAR(50),
      special_code_6 VARCHAR(50),
      unit VARCHAR(50) DEFAULT ''Adet'',
      unit_price DECIMAL(15,2) DEFAULT 0,
      unit_price_usd DECIMAL(15,2) DEFAULT 0,
      unit_price_eur DECIMAL(15,2) DEFAULT 0,
      purchase_price DECIMAL(15,2) DEFAULT 0,
      purchase_price_usd DECIMAL(15,2) DEFAULT 0,
      purchase_price_eur DECIMAL(15,2) DEFAULT 0,
      tax_rate DECIMAL(5,2) DEFAULT 18,
      tax_type VARCHAR(20),
      withholding_rate DECIMAL(5,2) DEFAULT 0,
      discount1 DECIMAL(15,2) DEFAULT 0,
      discount2 DECIMAL(15,2) DEFAULT 0,
      discount3 DECIMAL(15,2) DEFAULT 0,
      image_url TEXT,
      price_list_1 DECIMAL(15,2) DEFAULT 0,
      price_list_2 DECIMAL(15,2) DEFAULT 0,
      price_list_3 DECIMAL(15,2) DEFAULT 0,
      price_list_4 DECIMAL(15,2) DEFAULT 0,
      price_list_5 DECIMAL(15,2) DEFAULT 0,
      price_list_6 DECIMAL(15,2) DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT %I UNIQUE (firm_nr, code)
    );
  ', v_prefix || '_services', v_prefix || '_services_firm_code_uq');

  -- 4. Definitions (Categories, Brands, Units)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code          VARCHAR(50) UNIQUE,
      name          VARCHAR(255) NOT NULL,
      description   TEXT,
      parent_id     UUID,
      is_restaurant BOOLEAN DEFAULT false,
      icon          VARCHAR(100),
      is_active     BOOLEAN DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_categories');

  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_brands');
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(20) UNIQUE, name VARCHAR(100) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_units');

  -- Tax Rates
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate        DECIMAL(5,2) NOT NULL,
    description VARCHAR(255),
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );', v_prefix || '_tax_rates');

  -- Special Codes
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(50),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    module_type VARCHAR(50),
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );', v_prefix || '_special_codes');

  -- Seed standard tax rates
  EXECUTE format('INSERT INTO %I (rate, description) VALUES
    (0,    ''Vergisiz''),
    (1,    ''%%1 KDV''),
    (8,    ''%%8 KDV''),
    (10,   ''%%10 KDV''),
    (18,   ''%%18 KDV''),
    (20,   ''%%20 KDV'')
    ON CONFLICT DO NOTHING;', v_prefix || '_tax_rates');

  -- Seed standard units (Comprehensive list matching default unit sets)
  EXECUTE format('INSERT INTO %I (code, name) VALUES 
    (''ADET'', ''Adet''), (''KG'', ''Kilogram''), (''GRAM'', ''Gram''), (''TON'', ''Ton''),
    (''METRE'', ''Metre''), (''TOP'', ''Top''), (''LITRE'', ''Litre''), (''ML'', ''Mililitre''),
    (''PAKET'', ''Paket''), (''KOLI'', ''Koli''), (''PALET'', ''Palet''), (''DUZINE'', ''Düzine''),
    (''M2'', ''Metrekare''), (''SAAT'', ''Saat''), (''DAK'', ''Dakika''), (''KUTU'', ''Kutu''),
    (''SET'', ''Set''), (''PARCA'', ''Parca''), (''SISE'', ''Sise''), (''KASA'', ''Kasa'')
    ON CONFLICT (code) DO NOTHING;', v_prefix || '_units');

  -- 5. Unit Sets & Lines (tam şema — code, name, main_unit, conv_fact1, conv_fact2)
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT true);', v_prefix || '_unitsets');
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      unitset_id  UUID,
      item_code   VARCHAR(20) NOT NULL,
      code        VARCHAR(50),
      name        VARCHAR(100),
      main_unit   BOOLEAN DEFAULT false,
      multiplier1 DECIMAL(15,2) DEFAULT 1,
      multiplier2 DECIMAL(15,2) DEFAULT 1,
      conv_fact1  DECIMAL(15,6) DEFAULT 1,
      conv_fact2  DECIMAL(15,6) DEFAULT 1,
      CONSTRAINT %I UNIQUE(unitset_id, item_code)
    );
  ', v_prefix || '_unitsetl', v_prefix || '_unitsetl_unique');

  -- 6. Product Variants
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID, sku VARCHAR(100) UNIQUE, attributes JSONB);', v_prefix || '_product_variants');

  -- 6b. Product Barcodes (multiple barcodes per product, each with its own unit)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id   UUID NOT NULL,
      barcode_code VARCHAR(100) NOT NULL,
      unit         VARCHAR(50),
      sale_price   DECIMAL(15,2) DEFAULT 0,
      is_primary   BOOLEAN DEFAULT false,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_prefix || '_product_barcodes');

  -- 6c. Product Unit Conversions (e.g. 1 Koli = 12 Adet)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL,
      from_unit  VARCHAR(50) NOT NULL,
      to_unit    VARCHAR(50) NOT NULL,
      factor     DECIMAL(15,6) NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_prefix || '_product_unit_conversions');

  -- 7. Campaigns
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr               VARCHAR(10) NOT NULL,
      name                  VARCHAR(255) NOT NULL,
      description           TEXT,
      type                  VARCHAR(50) NOT NULL,
      discount_type         VARCHAR(50) NOT NULL,
      discount_value        DECIMAL(15,2) DEFAULT 0,
      start_date            TIMESTAMPTZ,
      end_date              TIMESTAMPTZ,
      is_active             BOOLEAN DEFAULT true,
      min_purchase_amount   DECIMAL(15,2) DEFAULT 0,
      max_discount_amount   DECIMAL(15,2),
      applicable_categories VARCHAR(255),
      applicable_products   JSONB DEFAULT ''[]'',
      priority              INTEGER DEFAULT 0,
      created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_campaigns');

  -- 8. Finance Registers
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, currency_code VARCHAR(10) DEFAULT ''IQD'', balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_cash_registers');
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, bank_name VARCHAR(255), iban VARCHAR(50), currency_code VARCHAR(10) DEFAULT ''IQD'', balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_bank_registers');
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_expense_cards');
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255), is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_sales_reps');
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(50) NOT NULL, name VARCHAR(100) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, firm_nr VARCHAR(10) NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, UNIQUE(code, firm_nr));', v_prefix || '_cost_centers');
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), category VARCHAR(50) NOT NULL, description TEXT NOT NULL, amount DECIMAL(18,2) NOT NULL, payment_method VARCHAR(50) NOT NULL, document_number VARCHAR(100), document_url TEXT, store_id UUID, cost_center_id UUID, expense_date DATE NOT NULL, notes TEXT, created_by UUID, firm_nr VARCHAR(10) NOT NULL, cash_line_id UUID, cash_register_id UUID, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_expenses');
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon', v_prefix || '_cost_centers');
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon', v_prefix || '_expenses');

  -- Sync Triggers
  PERFORM public.try_apply_sync_triggers(v_prefix || '_products');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_customers');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_suppliers');
  PERFORM public.INIT_PRODUCTION_TABLES(p_firm_nr);
  PERFORM public.INIT_DISASSEMBLY_TABLES(p_firm_nr);
  PERFORM public.INIT_BUTCHER_PRODUCTION_TABLES(p_firm_nr);
  PERFORM public.try_apply_sync_triggers(v_prefix || '_services');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_cash_registers');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_bank_registers');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_expense_cards');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_cost_centers');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_expenses');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_sales_reps');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_categories');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_brands');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_units');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_tax_rates');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_special_codes');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_campaigns');

  -- ═══════════════════════════════════════════════════════════════════
  -- STANDART BİRİM SETLERİ — tüm perakende/toptan senaryoları
  -- Ana birim = faturada varsayılan olarak kullanılan birim
  -- conv_fact1 = "1 ana birimde kaç alt birim var" (stok çarpanı)
  -- ═══════════════════════════════════════════════════════════════════

  -- 01 · Tekil (sadece Adet)
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''01-ADET'', ''Tekil (Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true, 1, 1 FROM %I WHERE code = ''01-ADET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 02 · Kilogram / Gram
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''02-KG'', ''Kilogram / Gram'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KG'',   ''KG'',   ''Kilogram'', true,  1,    1 FROM %I WHERE code = ''02-KG'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''GRAM'', ''GRAM'', ''Gram'',     false, 1000, 1 FROM %I WHERE code = ''02-KG'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 03 · Litre / Mililitre
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''03-LT'', ''Litre / Mililitre'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''LT'', ''LT'', ''Litre'',     true,  1,    1 FROM %I WHERE code = ''03-LT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ML'', ''ML'', ''Mililitre'', false, 1000, 1 FROM %I WHERE code = ''03-LT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 04 · Koli (6 Adet) — büyük ürünler / elektrikli ev aletleri
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''04-KOLI6'', ''Koli (6 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1, 1 FROM %I WHERE code = ''04-KOLI6'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'', ''KOLI'', ''Koli'', false, 6, 1 FROM %I WHERE code = ''04-KOLI6'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 05 · Koli (12 Adet) — içecek / deterjan
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''05-KOLI12'', ''Koli (12 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1,  1 FROM %I WHERE code = ''05-KOLI12'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'', ''KOLI'', ''Koli'', false, 12, 1 FROM %I WHERE code = ''05-KOLI12'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 06 · Koli (24 Adet) — su / küçük gıda ürünleri
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''06-KOLI24'', ''Koli (24 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1,  1 FROM %I WHERE code = ''06-KOLI24'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'', ''KOLI'', ''Koli'', false, 24, 1 FROM %I WHERE code = ''06-KOLI24'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 07 · Koli (48 Adet) — küçük paket ürünler / atıştırmalık
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''07-KOLI48'', ''Koli (48 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1,  1 FROM %I WHERE code = ''07-KOLI48'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'', ''KOLI'', ''Koli'', false, 48, 1 FROM %I WHERE code = ''07-KOLI48'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 08 · Adet / Koli (12) / Palet (144) — 3 kademeli hiyerarşi
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''08-PALET'', ''Adet / Koli(12) / Palet(144)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'',  ''ADET'',  ''Adet'',  true,  1,   1 FROM %I WHERE code = ''08-PALET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KOLI'',  ''KOLI'',  ''Koli'',  false, 12,  1 FROM %I WHERE code = ''08-PALET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''PALET'', ''PALET'', ''Palet'', false, 144, 1 FROM %I WHERE code = ''08-PALET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 09 · Düzine (12 Adet) — küçük aksesuar / tuhafiye
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''09-DUZINE'', ''Düzine (12 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'',   ''ADET'',   ''Adet'',   true,  1,  1 FROM %I WHERE code = ''09-DUZINE'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''DUZINE'', ''DUZINE'', ''Düzine'', false, 12, 1 FROM %I WHERE code = ''09-DUZINE'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 10 · Paket (10 Adet) — kırtasiye / ilaç / ambalaj
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''10-PKT10'', ''Paket (10 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'',  ''ADET'',  ''Adet'',  true,  1,  1 FROM %I WHERE code = ''10-PKT10'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''PAKET'', ''PAKET'', ''Paket'', false, 10, 1 FROM %I WHERE code = ''10-PKT10'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 11 · Paket (5 Adet) — güzellik / sağlık ürünleri
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''11-PKT5'', ''Paket (5 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'',  ''ADET'',  ''Adet'',  true,  1, 1 FROM %I WHERE code = ''11-PKT5'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''PAKET'', ''PAKET'', ''Paket'', false, 5, 1 FROM %I WHERE code = ''11-PKT5'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 12 · Metre / Top (50m) — tekstil / kumaş
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''12-METRE-TOP50'', ''Metre / Top (50m)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''METRE'', ''METRE'', ''Metre'', true,  1,  1 FROM %I WHERE code = ''12-METRE-TOP50'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''TOP'',   ''TOP'',   ''Top'',   false, 50, 1 FROM %I WHERE code = ''12-METRE-TOP50'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 13 · Metre / Top (100m) — halı / ip / büyük rulolar
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''13-METRE-TOP100'', ''Metre / Top (100m)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''METRE'', ''METRE'', ''Metre'', true,  1,   1 FROM %I WHERE code = ''13-METRE-TOP100'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''TOP'',   ''TOP'',   ''Top'',   false, 100, 1 FROM %I WHERE code = ''13-METRE-TOP100'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 14 · KG / Ton — demir-çelik / inşaat malzemesi
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''14-KG-TON'', ''Kilogram / Ton'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KG'',  ''KG'',  ''Kilogram'', true,  1,    1 FROM %I WHERE code = ''14-KG-TON'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''TON'', ''TON'', ''Ton'',      false, 1000, 1 FROM %I WHERE code = ''14-KG-TON'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 15 · Metrekare (M²) — zemin / fayans / cam
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''15-M2'', ''Metrekare (M²)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''M2'', ''M2'', ''Metrekare'', true, 1, 1 FROM %I WHERE code = ''15-M2'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 16 · Saat / Dakika — hizmet / iş gücü
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''16-SAAT'', ''Saat / Dakika'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''SAAT'', ''SAAT'', ''Saat'',    true,  1,  1 FROM %I WHERE code = ''16-SAAT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''DAK'',  ''DAK'',  ''Dakika'',  false, 60, 1 FROM %I WHERE code = ''16-SAAT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 17 · Kutu / Adet — ilaç / kimyasal / ampul
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''17-KUTU'', ''Kutu / Adet'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''ADET'', ''ADET'', ''Adet'', true,  1,  1 FROM %I WHERE code = ''17-KUTU'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''KUTU'', ''KUTU'', ''Kutu'', false, 10, 1 FROM %I WHERE code = ''17-KUTU'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- 18 · Set (Takım) — mobilya / spor ekipmanı
  EXECUTE format('INSERT INTO %I (code, name) VALUES (''18-SET'', ''Set / Parca'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''SET'',   ''SET'',   ''Set'',   true,  1, 1 FROM %I WHERE code = ''18-SET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
  EXECUTE format('INSERT INTO %I (unitset_id, item_code, code, name, main_unit, conv_fact1, conv_fact2) SELECT id, ''PARCA'', ''PARCA'', ''Parca'', false, 1, 1 FROM %I WHERE code = ''18-SET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

  -- Mesajlaşma ayarları (WhatsApp / SMS — firma düzeyi)
  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS %I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sms_user VARCHAR(255),
      sms_password VARCHAR(255),
      sms_sender VARCHAR(80),
      sms_template TEXT,
      whatsapp_template TEXT,
      whatsapp_provider VARCHAR(30) DEFAULT 'NONE',
      whatsapp_base_url TEXT,
      whatsapp_token TEXT,
      whatsapp_instance_id VARCHAR(255),
      whatsapp_phone_id VARCHAR(80),
      default_reminder_channel VARCHAR(20) DEFAULT 'whatsapp',
      notify_invoice_whatsapp BOOLEAN DEFAULT false,
      invoice_whatsapp_template TEXT,
      notify_sale_categories TEXT DEFAULT 'Satis,Hizmet',
      meta_invoice_template_name VARCHAR(120),
      meta_invoice_template_language VARCHAR(10),
      meta_appointment_template_name VARCHAR(120),
      meta_appointment_template_language VARCHAR(10),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  $f$, v_prefix || '_messaging_settings');

  -- Varsayılan Kasa
  EXECUTE format('INSERT INTO %I (id, firm_nr, code, name, is_active) VALUES (''00000000-0000-0000-0000-000000000001'', %L, ''KASA.001'', ''MERKEZ KASA'', true) ON CONFLICT DO NOTHING;', v_prefix || '_cash_registers', p_firm_nr);

  -- Varsayılan cari kartları (POS / fatura — yerel kurulumda boş liste olmasın)
  EXECUTE format('INSERT INTO %I (firm_nr, code, name, is_active) VALUES (%L, ''PESIN'', ''Peşin Müşteri'', true) ON CONFLICT (code) DO NOTHING;', v_prefix || '_customers', p_firm_nr);
  EXECUTE format('INSERT INTO %I (firm_nr, code, name, is_active) VALUES (%L, ''GENEL'', ''Genel Tedarikçi'', true) ON CONFLICT (code) DO NOTHING;', v_prefix || '_suppliers', p_firm_nr);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 12. DYNAMIC ENGINE: CREATE_PERIOD_TABLES (v6.0 — Definitive)
-- ============================================================================

CREATE OR REPLACE FUNCTION CREATE_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE
  v_prefix       TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
  v_tbl_sales    TEXT := v_prefix || '_sales';
  v_tbl_items    TEXT := v_prefix || '_sale_items';
BEGIN
  -- 1. Sales Header
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr        VARCHAR(10) NOT NULL,
      period_nr      VARCHAR(10) NOT NULL,
      ref_id         INTEGER,
      logo_client_ref INTEGER,
      logo_salesman_ref INTEGER,
      fiche_no       VARCHAR(100) UNIQUE,
      document_no    VARCHAR(100),
      trcode         INTEGER,
      fiche_type     VARCHAR(50),
      date           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      customer_id    UUID,
      customer_name  VARCHAR(255),
      store_id       UUID REFERENCES stores(id),
      total_net      DECIMAL(15,2) DEFAULT 0,
      total_vat      DECIMAL(15,2) DEFAULT 0,
      total_gross    DECIMAL(15,2) DEFAULT 0,
      total_discount DECIMAL(15,2) DEFAULT 0,
      net_amount     DECIMAL(15,2) DEFAULT 0,
      total_cost     DECIMAL(15,2) DEFAULT 0,
      gross_profit   DECIMAL(15,2) DEFAULT 0,
      profit_margin  DECIMAL(15,2) DEFAULT 0,
      currency       VARCHAR(10) DEFAULT ''IQD'',
      currency_rate  DECIMAL(15,6) DEFAULT 1,
      status         VARCHAR(20) DEFAULT ''completed'',
      logo_sync_status VARCHAR(20) DEFAULT ''pending'',
      logo_sync_error TEXT,
      logo_sync_date TIMESTAMPTZ,
      payment_method VARCHAR(50),
      cashier        VARCHAR(100),
      created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      is_cancelled   BOOLEAN DEFAULT false,
      credit_amount  DECIMAL(15,2) DEFAULT 0,
      notes          TEXT,
      header_fields  JSONB NOT NULL DEFAULT ''{}''::jsonb,
      created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_tbl_sales);

  -- 2. Sale Items (kur desteği + birim çarpan dahil)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ref_id          INTEGER,
      logo_product_ref INTEGER,
      invoice_id      UUID REFERENCES %I(id) ON DELETE CASCADE,
      firm_nr         VARCHAR(10),
      period_nr       VARCHAR(10),
      item_code       VARCHAR(100),
      item_name       VARCHAR(255),
      product_id      UUID,
      quantity        DECIMAL(15,3) NOT NULL,
      unit_price      DECIMAL(15,2) NOT NULL,
      vat_rate        DECIMAL(5,2) DEFAULT 0,
      discount_rate   DECIMAL(15,4) DEFAULT 0,
      discount_amount DECIMAL(15,2) DEFAULT 0,
      total_amount    DECIMAL(15,2) DEFAULT 0,
      net_amount      DECIMAL(15,2) NOT NULL,
      unit_cost       DECIMAL(15,2) DEFAULT 0,
      total_cost      DECIMAL(15,2) DEFAULT 0,
      gross_profit    DECIMAL(15,2) DEFAULT 0,
      unit            VARCHAR(20) DEFAULT ''Adet'',
      unit_multiplier DECIMAL(15,6) DEFAULT 1,
      base_quantity   DECIMAL(15,3),
      unit_price_fc   DECIMAL(15,4) DEFAULT 0,
      currency        VARCHAR(10) DEFAULT ''IQD'',
      expiry_date     DATE,
      batch_no        VARCHAR(120),
      item_type       VARCHAR(20) DEFAULT ''Malzeme'',
      qty_shipped     DECIMAL(18,4) DEFAULT 0,
      qty_delivered   DECIMAL(18,4) DEFAULT 0
    );
  ', v_tbl_items, v_tbl_sales);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (expiry_date) WHERE expiry_date IS NOT NULL', v_tbl_items || '_expiry_date_idx', v_tbl_items);

  -- 3. Cash Transactions
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr              VARCHAR(10) NOT NULL,
      period_nr            VARCHAR(10),
      ref_id               INTEGER,
      logo_cash_ref        INTEGER,
      logo_client_ref      INTEGER,
      register_id          UUID,
      fiche_no             VARCHAR(100) UNIQUE,
      date                 TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      amount               DECIMAL(15,2) DEFAULT 0,
      sign                 INTEGER DEFAULT 1,
      trcode               INTEGER,
      definition           TEXT,
      transaction_type     VARCHAR(50),
      customer_id          UUID,
      bank_id              UUID,
      bank_account_id      UUID,
      target_register_id   UUID,
      expense_card_id      UUID,
      currency_code        VARCHAR(10) DEFAULT ''IQD'',
      exchange_rate        DECIMAL(15,6) DEFAULT 1,
      f_amount             DECIMAL(15,2) DEFAULT 0,
      transfer_status      INTEGER DEFAULT 0,
      special_code         VARCHAR(50),
      tax_rate             DECIMAL(5,2) DEFAULT 0,
      withholding_tax_rate DECIMAL(5,2) DEFAULT 0,
      store_id             UUID,
      created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_cash_lines');

  -- 3b. Cari hesap hareketleri (Logo CLFLINE)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr      VARCHAR(10) NOT NULL,
      period_nr    VARCHAR(10) NOT NULL,
      ref_id       INTEGER,
      client_ref   INTEGER,
      customer_id  UUID,
      supplier_id  UUID,
      fiche_no     VARCHAR(100),
      date         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      amount       DECIMAL(15,2) DEFAULT 0,
      sign         INTEGER DEFAULT 0,
      trcode       INTEGER,
      module_nr    INTEGER,
      definition   TEXT,
      created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_account_movements');

  -- 4. Bank Transactions
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr          VARCHAR(10) NOT NULL,
      period_nr        VARCHAR(10),
      register_id      UUID,
      fiche_no         VARCHAR(100) UNIQUE,
      date             TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      amount           DECIMAL(15,2) DEFAULT 0,
      sign             INTEGER DEFAULT 1,
      trcode           INTEGER,
      definition       TEXT,
      transaction_type VARCHAR(50),
      customer_id      UUID,
      cash_register_id UUID,
      currency_code    VARCHAR(10) DEFAULT ''IQD'',
      exchange_rate    DECIMAL(15,6) DEFAULT 1,
      f_amount         DECIMAL(15,2) DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_bank_lines');

  -- 5. Virman (Warehouse Transfer Notes)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr          VARCHAR(10) NOT NULL,
      period_nr        VARCHAR(10),
      virman_no        VARCHAR(100) NOT NULL,
      from_warehouse_id UUID,
      to_warehouse_id  UUID,
      operation_date   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      status           VARCHAR(50) DEFAULT ''draft'',
      notes            TEXT,
      created_by       VARCHAR(100),
      created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_virman_operations');

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      virman_id   UUID REFERENCES %I(id) ON DELETE CASCADE,
      product_id  UUID,
      quantity    DECIMAL(15,4) DEFAULT 0,
      notes       TEXT,
      created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_virman_items', v_prefix || '_virman_operations');

  -- 6. Stock Movements (Header)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr          VARCHAR(10) NOT NULL,
      period_nr        VARCHAR(10) NOT NULL,
      ref_id           INTEGER,
      document_no      VARCHAR(50) UNIQUE,
      trcode           INTEGER,
      movement_type    VARCHAR(20), -- ''in'' | ''out'' | ''transfer'' | ''adjustment''
      warehouse_id     UUID REFERENCES stores(id),
      target_warehouse_id UUID REFERENCES stores(id),
      movement_date    TIMESTAMPTZ DEFAULT NOW(),
      exchange_rate    NUMERIC DEFAULT 1,
      description      TEXT,
      status           VARCHAR(20) DEFAULT ''completed'',
      created_by       UUID,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_prefix || '_stock_movements');
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ref_id) WHERE ref_id IS NOT NULL',
    v_prefix || '_stock_movements_logo_ref_id_uidx',
    v_prefix || '_stock_movements'
  );

  -- 7. Stock Movement Items (Lines)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ref_id           INTEGER,
      movement_id      UUID REFERENCES %I(id) ON DELETE CASCADE,
      product_id       UUID,
      quantity         DECIMAL(15,4) DEFAULT 0,
      unit_price       DECIMAL(15,2) DEFAULT 0,
      cost_price       DECIMAL(15,2) DEFAULT 0,
      exchange_rate    NUMERIC DEFAULT 1,
      unit_name        VARCHAR(100),
      convert_factor   NUMERIC DEFAULT 1,
      notes            TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_prefix || '_stock_movement_items', v_prefix || '_stock_movements');
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ref_id) WHERE ref_id IS NOT NULL',
    v_prefix || '_stock_movement_items_logo_ref_id_uidx',
    v_prefix || '_stock_movement_items'
  );

  -- Bildirim kuyruğu (WhatsApp / SMS — fatura, randevu vb.)
  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS %I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      period_nr VARCHAR(10) NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
      recipient_phone VARCHAR(30),
      recipient_name VARCHAR(255),
      message_text TEXT,
      reference_type VARCHAR(50),
      reference_id UUID,
      payload_json JSONB DEFAULT '{}'::jsonb,
      status VARCHAR(20) DEFAULT 'pending',
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      error_text TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  $f$, v_prefix || '_notification_queue');
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I (status, created_at DESC)',
    v_prefix || '_notification_queue_status_idx',
    v_prefix || '_notification_queue'
  );

  PERFORM public.try_apply_sync_triggers(v_tbl_sales);
  PERFORM public.try_apply_sync_triggers(v_prefix || '_cash_lines');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_bank_lines');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_stock_movements');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_stock_movement_items');
  PERFORM public.try_apply_sync_triggers(v_prefix || '_account_movements');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 13. PRODUCTION SYSTEM
-- ============================================================================

CREATE OR REPLACE FUNCTION public.INIT_PRODUCTION_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), firm_nr VARCHAR(10) NOT NULL, product_id UUID NOT NULL, name VARCHAR(255) NOT NULL, description TEXT, total_cost DECIMAL(15,2) DEFAULT 0, wastage_percent DECIMAL(5,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_production_recipes');
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), recipe_id UUID NOT NULL, material_id UUID NOT NULL, quantity DECIMAL(15,3) NOT NULL, unit VARCHAR(20), cost DECIMAL(15,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_production_recipe_ingredients');
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), firm_nr VARCHAR(10) NOT NULL, order_no VARCHAR(50) UNIQUE, recipe_id UUID NOT NULL, product_id UUID NOT NULL, planned_qty DECIMAL(15,3) NOT NULL, produced_qty DECIMAL(15,3) DEFAULT 0, status VARCHAR(20) DEFAULT ''draft'', start_date DATE, end_date DATE, completed_at TIMESTAMPTZ, note TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_production_orders');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_recipes');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_recipe_ingredients');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_orders');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 13b. CARCASS DISASSEMBLY (KASAP PARÇALAMA)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.INIT_DISASSEMBLY_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      name VARCHAR(255) NOT NULL,
      animal_type VARCHAR(20) NOT NULL DEFAULT ''cattle'',
      input_product_id UUID,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_disassembly_templates'
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID NOT NULL,
      product_id UUID NOT NULL,
      sort_order INTEGER DEFAULT 0,
      standard_ratio_percent DECIMAL(8,3),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_disassembly_template_outputs'
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      order_no VARCHAR(50) UNIQUE,
      template_id UUID,
      animal_type VARCHAR(20) NOT NULL DEFAULT ''cattle'',
      input_product_id UUID NOT NULL,
      input_qty_kg DECIMAL(15,3) NOT NULL,
      input_unit_cost DECIMAL(15,4) NOT NULL DEFAULT 0,
      input_total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
      output_qty_kg DECIMAL(15,3) NOT NULL DEFAULT 0,
      waste_qty_kg DECIMAL(15,3) NOT NULL DEFAULT 0,
      waste_cost_allocated DECIMAL(15,2) NOT NULL DEFAULT 0,
      cost_per_kg_salable DECIMAL(15,4) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT ''draft'',
      note TEXT,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_disassembly_orders'
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL,
      product_id UUID NOT NULL,
      output_kg DECIMAL(15,3) NOT NULL,
      unit_cost DECIMAL(15,4) NOT NULL DEFAULT 0,
      total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
      cost_share_percent DECIMAL(8,3) NOT NULL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_disassembly_order_outputs'
  );
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_disassembly_templates');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_disassembly_template_outputs');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_disassembly_orders');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_disassembly_order_outputs');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 13c. BUTCHER PRODUCTION (KASAP ÜRETİM / MALİYET)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.INIT_BUTCHER_PRODUCTION_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      default_cost_method VARCHAR(30) NOT NULL DEFAULT ''by_weight'',
      default_warehouse_id UUID,
      allow_complete_without_stock BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_butcher_settings'
  );
  EXECUTE format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS allow_complete_without_stock BOOLEAN NOT NULL DEFAULT true',
    v_prefix || '_butcher_settings'
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      code VARCHAR(50),
      name VARCHAR(255) NOT NULL,
      animal_type VARCHAR(30) NOT NULL DEFAULT ''sheep'',
      input_product_id UUID,
      waste_product_id UUID,
      cost_method VARCHAR(30),
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_butcher_recipes'
  );
  EXECUTE format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS code VARCHAR(50)',
    v_prefix || '_butcher_recipes'
  );
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, lower(code)) WHERE code IS NOT NULL AND btrim(code) <> ''''',
    v_prefix || '_butcher_recipes_code_uidx',
    v_prefix || '_butcher_recipes'
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      recipe_id UUID NOT NULL,
      product_id UUID NOT NULL,
      sort_order INTEGER DEFAULT 0,
      standard_ratio_percent DECIMAL(8,3),
      coefficient DECIMAL(12,4) NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_butcher_recipe_outputs'
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      order_no VARCHAR(50) UNIQUE,
      recipe_id UUID,
      animal_type VARCHAR(30) NOT NULL DEFAULT ''sheep'',
      input_product_id UUID NOT NULL,
      input_qty_kg DECIMAL(15,3) NOT NULL,
      input_unit_cost DECIMAL(15,4) NOT NULL DEFAULT 0,
      input_total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
      warehouse_id UUID,
      waste_product_id UUID,
      lot_no VARCHAR(80),
      cost_method VARCHAR(30) NOT NULL DEFAULT ''by_weight'',
      output_qty_kg DECIMAL(15,3) NOT NULL DEFAULT 0,
      waste_qty_kg DECIMAL(15,3) NOT NULL DEFAULT 0,
      waste_percent DECIMAL(8,3) NOT NULL DEFAULT 0,
      waste_cost_allocated DECIMAL(15,2) NOT NULL DEFAULT 0,
      cost_per_kg_salable DECIMAL(15,4) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT ''draft'',
      note TEXT,
      purchase_invoice_id UUID,
      purchase_invoice_no VARCHAR(80),
      supplier_id UUID,
      supplier_name VARCHAR(255),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_butcher_orders'
  );
  EXECUTE format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS purchase_invoice_id UUID',
    v_prefix || '_butcher_orders'
  );
  EXECUTE format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS purchase_invoice_no VARCHAR(80)',
    v_prefix || '_butcher_orders'
  );
  EXECUTE format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS supplier_id UUID',
    v_prefix || '_butcher_orders'
  );
  EXECUTE format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255)',
    v_prefix || '_butcher_orders'
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL,
      product_id UUID NOT NULL,
      output_kg DECIMAL(15,3) NOT NULL DEFAULT 0,
      coefficient DECIMAL(12,4) NOT NULL DEFAULT 1,
      sale_price DECIMAL(15,4) NOT NULL DEFAULT 0,
      unit_cost DECIMAL(15,4) NOT NULL DEFAULT 0,
      total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
      cost_share_percent DECIMAL(8,3) NOT NULL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );',
    v_prefix || '_butcher_order_outputs'
  );
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_butcher_settings');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_butcher_recipes');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_butcher_recipe_outputs');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_butcher_orders');
  PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_butcher_order_outputs');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 14. RESTAURANT INITIALIZERS
-- ============================================================================

CREATE OR REPLACE FUNCTION INIT_RESTAURANT_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      floor_id             UUID REFERENCES rest.floors(id),
      number               VARCHAR(50) NOT NULL,
      seats                INTEGER DEFAULT 4,
      status               VARCHAR(20) DEFAULT ''empty'',
      total                DECIMAL(15,2) DEFAULT 0,
      pos_x                INTEGER DEFAULT 0,
      pos_y                INTEGER DEFAULT 0,
      is_large             BOOLEAN DEFAULT false,
      waiter               VARCHAR(255),
      staff_id             UUID,
      start_time           TIMESTAMPTZ,
      locked_by_staff_id   UUID,
      locked_by_staff_name VARCHAR(255),
      locked_at            TIMESTAMPTZ,
      linked_order_ids     text[] DEFAULT ''{}'',
      color                VARCHAR(20) DEFAULT NULL,
      updated_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_rest_tables');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), menu_item_id UUID, product_id UUID, total_cost DECIMAL(15,2) DEFAULT 0, wastage_percent DECIMAL(5,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_rest_recipes');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), recipe_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE, material_id UUID, quantity DECIMAL(15,3), unit VARCHAR(20), cost DECIMAL(15,2) DEFAULT 0);', v_prefix || '_rest_recipe_ingredients', v_prefix || '_rest_recipes');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(100) NOT NULL, role VARCHAR(50) DEFAULT ''Waiter'', pin VARCHAR(10) NOT NULL UNIQUE, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_rest_staff');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION INIT_RESTAURANT_KITCHEN_PRINT_JOBS_TABLE(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE
  v_firm TEXT := lower(trim(p_firm_nr));
  v_period TEXT := lower(trim(p_period_nr));
  v_table TEXT;
BEGIN
  IF length(v_firm) <= 3 THEN
    v_firm := lpad(v_firm, 3, '0');
  END IF;
  IF length(v_period) <= 2 THEN
    v_period := lpad(v_period, 2, '0');
  END IF;

  v_table := 'rex_' || v_firm || '_' || v_period || '_kitchen_print_jobs';

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_type           VARCHAR(40) NOT NULL DEFAULT ''kitchen_ticket'',
      kitchen_order_id   UUID,
      order_id           UUID,
      printer_profile_id TEXT,
      printer_name       TEXT,
      connection         TEXT,
      address            TEXT,
      port               INT,
      locale             TEXT DEFAULT ''tr'',
      payload            JSONB NOT NULL,
      status             VARCHAR(20) NOT NULL DEFAULT ''pending'',
      attempts           INT NOT NULL DEFAULT 0,
      last_error         TEXT,
      claimed_by         TEXT,
      claimed_at         TIMESTAMPTZ,
      printed_at         TIMESTAMPTZ,
      source_system      TEXT,
      source_db          TEXT,
      created_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_table);

  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS job_type VARCHAR(40) NOT NULL DEFAULT ''kitchen_ticket''', v_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON rest.%I (status, created_at) WHERE status IN (''pending'', ''failed'')',
    'idx_' || v_table || '_status_created_at',
    v_table
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION INIT_RESTAURANT_PRINT_JOBS_TABLE(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE
  v_firm TEXT := lower(trim(p_firm_nr));
  v_period TEXT := lower(trim(p_period_nr));
  v_table TEXT;
  v_kitchen_table TEXT;
BEGIN
  IF length(v_firm) <= 3 THEN
    v_firm := lpad(v_firm, 3, '0');
  END IF;
  IF length(v_period) <= 2 THEN
    v_period := lpad(v_period, 2, '0');
  END IF;

  v_table := 'rex_' || v_firm || '_' || v_period || '_print_jobs';
  v_kitchen_table := 'rex_' || v_firm || '_' || v_period || '_kitchen_print_jobs';

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_type           VARCHAR(40) NOT NULL DEFAULT ''kitchen_ticket'',
      status             VARCHAR(20) NOT NULL DEFAULT ''pending'',
      priority           INT NOT NULL DEFAULT 100,
      connection         TEXT,
      address            TEXT,
      port               INT,
      printer_name       TEXT,
      printer_profile_id TEXT,
      locale             TEXT DEFAULT ''tr'',
      copies             INT NOT NULL DEFAULT 1,
      payload            JSONB NOT NULL,
      ref_type           TEXT,
      ref_id             TEXT,
      attempts           INT DEFAULT 0,
      last_error         TEXT,
      claimed_by         TEXT,
      claimed_at         TIMESTAMPTZ,
      printed_at         TIMESTAMPTZ,
      source_system      TEXT,
      source_db          TEXT,
      created_at         TIMESTAMPTZ DEFAULT NOW()
    );
  ', v_table);

  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS job_type VARCHAR(40) NOT NULL DEFAULT ''kitchen_ticket''', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT ''pending''', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 100', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS connection TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS address TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS port INT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS printer_name TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS printer_profile_id TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT ''tr''', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS copies INT NOT NULL DEFAULT 1', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT ''{}''::jsonb', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS ref_type TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS ref_id TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS attempts INT DEFAULT 0', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS last_error TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS claimed_by TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS source_system TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS source_db TEXT', v_table);
  EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()', v_table);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON rest.%I (status, priority, created_at) WHERE status IN (''pending'', ''failed'')',
    'idx_' || v_table || '_status_priority_created_at',
    v_table
  );

  IF to_regclass('rest.' || v_kitchen_table) IS NOT NULL THEN
    EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS job_type VARCHAR(40) NOT NULL DEFAULT ''kitchen_ticket''', v_kitchen_table);
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION INIT_RESTAURANT_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_no        VARCHAR(50) UNIQUE,
      table_id        UUID,
      floor_id        UUID REFERENCES rest.floors(id),
      waiter          VARCHAR(255),
      staff_id        UUID,
      customer_id     UUID,
      status          VARCHAR(20) DEFAULT ''open'',
      total_amount    DECIMAL(15,2) DEFAULT 0,
      discount_amount DECIMAL(15,2) DEFAULT 0,
      order_discount_pct DECIMAL(5,2) DEFAULT 0,
      tax_amount      DECIMAL(15,2) DEFAULT 0,
      note            TEXT,
      parent_order_id UUID,
      kitchen_note    TEXT,
      estimated_ready_at TIMESTAMPTZ,
      opened_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      billed_at       TIMESTAMPTZ,
      closed_at       TIMESTAMPTZ,
      payment_method  VARCHAR(50),
      created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_rest_orders');
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS rest.%I (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id         UUID REFERENCES rest.%I(id) ON DELETE CASCADE,
      product_id       UUID,
      product_name     VARCHAR(255) NOT NULL,
      quantity         DECIMAL(15,3) NOT NULL DEFAULT 1,
      unit_price       DECIMAL(15,2) NOT NULL,
      discount_pct     DECIMAL(5,2) DEFAULT 0,
      subtotal         DECIMAL(15,2) NOT NULL,
      status           VARCHAR(20) DEFAULT ''pending'',
      course           VARCHAR(50),
      note             TEXT,
      options          JSONB,
      is_void          BOOLEAN DEFAULT false,
      void_reason      TEXT,
      is_complimentary BOOLEAN DEFAULT false,
      preparation_time INTEGER,
      sent_to_kitchen_at TIMESTAMPTZ,
      served_at        TIMESTAMPTZ,
      created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  ', v_prefix || '_rest_order_items', v_prefix || '_rest_orders');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE, table_number VARCHAR(50), floor_name VARCHAR(100), waiter VARCHAR(255), staff_id UUID, status VARCHAR(20) DEFAULT ''new'', note TEXT, estimated_ready_at TIMESTAMPTZ, sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_rest_kitchen_orders', v_prefix || '_rest_orders');
  EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), kitchen_order_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE, order_item_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE, product_name VARCHAR(255) NOT NULL, quantity DECIMAL(15,3) NOT NULL, course VARCHAR(50), note TEXT, status VARCHAR(20) DEFAULT ''new'', preparation_time INTEGER, start_at TIMESTAMPTZ, estimated_ready_at TIMESTAMPTZ, served_at TIMESTAMPTZ);', v_prefix || '_rest_kitchen_items', v_prefix || '_rest_kitchen_orders', v_prefix || '_rest_order_items');
  PERFORM INIT_RESTAURANT_KITCHEN_PRINT_JOBS_TABLE(p_firm_nr, p_period_nr);
  PERFORM INIT_RESTAURANT_PRINT_JOBS_TABLE(p_firm_nr, p_period_nr);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 15. BEAUTY INITIALIZERS
-- ============================================================================

CREATE OR REPLACE FUNCTION INIT_BEAUTY_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255), specialty VARCHAR(100), color VARCHAR(20) DEFAULT ''#9333ea'', commission_rate DECIMAL(5,2) DEFAULT 0, product_unit_commission DECIMAL(15,2) NOT NULL DEFAULT 0, avatar_url TEXT, working_hours JSONB, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_specialists');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, category VARCHAR(50) DEFAULT ''beauty'', parent_category VARCHAR(100), duration_min INTEGER DEFAULT 30, price DECIMAL(15,2) DEFAULT 0, cost_price DECIMAL(15,2) DEFAULT 0, color VARCHAR(20) DEFAULT ''#9333ea'', commission_rate DECIMAL(5,2) DEFAULT 0, description TEXT, requires_device BOOLEAN DEFAULT false, expected_shots INTEGER DEFAULT 0, default_sessions INTEGER NOT NULL DEFAULT 1, follow_up_reminder_days INTEGER, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_services');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, description TEXT, service_id UUID, total_sessions INTEGER DEFAULT 1, price DECIMAL(15,2) DEFAULT 0, cost_price DECIMAL(15,2) DEFAULT 0, discount_pct DECIMAL(5,2) DEFAULT 0, validity_days INTEGER DEFAULT 365, color VARCHAR(20) DEFAULT ''#6366f1'', is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_packages');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, device_type VARCHAR(50) DEFAULT ''laser'', serial_number VARCHAR(100), manufacturer VARCHAR(100), model VARCHAR(100), total_shots BIGINT DEFAULT 0, max_shots BIGINT DEFAULT 500000, maintenance_due DATE, last_maintenance DATE, purchase_date DATE, warranty_expiry DATE, status VARCHAR(20) DEFAULT ''active'', notes TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_devices');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255), source VARCHAR(30) DEFAULT ''other'', status VARCHAR(30) DEFAULT ''new'', interested_services JSONB DEFAULT ''[]'', notes TEXT, assigned_to UUID, first_contact_date DATE DEFAULT CURRENT_DATE, last_contact_date DATE, converted_customer_id UUID, lost_reason TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_leads');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT false, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_satisfaction_surveys');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), survey_id UUID NOT NULL REFERENCES beauty.%I(id) ON DELETE CASCADE, sort_order INTEGER DEFAULT 0, question_type VARCHAR(30) DEFAULT ''rating'', scale_max SMALLINT DEFAULT 5, is_required BOOLEAN DEFAULT true, labels_json JSONB NOT NULL DEFAULT ''{}''::jsonb, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_satisfaction_questions', v_prefix || '_beauty_satisfaction_surveys');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, address TEXT, phone VARCHAR(50), is_active BOOLEAN DEFAULT true, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_branches');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), branch_id UUID, name VARCHAR(255) NOT NULL, capacity INTEGER DEFAULT 1, is_active BOOLEAN DEFAULT true, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_rooms');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), online_booking_enabled BOOLEAN DEFAULT false, allow_staff_slot_overlap BOOLEAN DEFAULT false, public_slug VARCHAR(120), public_token VARCHAR(128) NOT NULL DEFAULT encode(gen_random_bytes(24), ''hex''), reminder_hours_before SMALLINT DEFAULT 24, sms_template TEXT, whatsapp_template TEXT, sms_user VARCHAR(255), sms_password VARCHAR(255), sms_sender VARCHAR(80), whatsapp_provider VARCHAR(30) DEFAULT ''NONE'', whatsapp_base_url TEXT, whatsapp_token TEXT, whatsapp_instance_id VARCHAR(255), whatsapp_phone_id VARCHAR(80), default_reminder_channel VARCHAR(20) DEFAULT ''sms'', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_portal_settings');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, tax_nr VARCHAR(50), discount_pct DECIMAL(5,2) DEFAULT 0, notes TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_corporate_accounts');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title VARCHAR(255) NOT NULL, body_html TEXT, is_active BOOLEAN DEFAULT true, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_consent_templates');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, monthly_price DECIMAL(15,2) DEFAULT 0, session_credit INTEGER DEFAULT 0, benefits_json JSONB DEFAULT ''{}''::jsonb, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_memberships');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), service_id UUID NOT NULL, product_id UUID NOT NULL, qty_per_service DECIMAL(15,4) NOT NULL DEFAULT 1, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_service_consumables');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (customer_id UUID PRIMARY KEY, allergies TEXT, medications TEXT, pregnancy BOOLEAN DEFAULT false, chronic_notes TEXT, warnings_banner TEXT, kvkk_consent_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_customer_health');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID NOT NULL, lot_code VARCHAR(80), expiry_date DATE, qty DECIMAL(15,3) DEFAULT 0, barcode VARCHAR(80), created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_product_batches');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, channel VARCHAR(30) DEFAULT ''sms'', segment_filter_json JSONB DEFAULT ''{}''::jsonb, message_template TEXT, scheduled_at TIMESTAMPTZ, status VARCHAR(20) DEFAULT ''draft'', sent_count INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_marketing_campaigns');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1), google_calendar_id TEXT, external_calendar_json JSONB DEFAULT ''{}''::jsonb, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_integration_settings');
  EXECUTE format('INSERT INTO beauty.%I (id) VALUES (1) ON CONFLICT (id) DO NOTHING', v_prefix || '_beauty_integration_settings');
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS beauty.%I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(10) NOT NULL,
      customer_id UUID NOT NULL,
      service_id UUID NOT NULL,
      product_id UUID,
      reminder_kind VARCHAR(20) NOT NULL DEFAULT ''service'',
      last_completed_date DATE NOT NULL,
      natural_due_date DATE NOT NULL,
      reminder_days INTEGER,
      customer_name VARCHAR(255),
      customer_phone VARCHAR(50),
      service_name VARCHAR(255),
      product_name VARCHAR(255),
      status VARCHAR(30) NOT NULL DEFAULT ''due'',
      postponed_due_date DATE,
      show_natural_when_postponed BOOLEAN NOT NULL DEFAULT false,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )',
    v_prefix || '_follow_up_reminder_actions'
  );
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON beauty.%I (
      customer_id, service_id, COALESCE(product_id, ''00000000-0000-0000-0000-000000000000''::uuid),
      last_completed_date, natural_due_date, reminder_kind
    )',
    v_prefix || '_follow_up_reminder_actions_uniq',
    v_prefix || '_follow_up_reminder_actions'
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (postponed_due_date)',
    v_prefix || '_follow_up_reminder_actions_postponed_idx',
    v_prefix || '_follow_up_reminder_actions'
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION INIT_BEAUTY_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID, service_id UUID, specialist_id UUID, device_id UUID, body_region_id UUID, appointment_date DATE, appointment_time TIME, duration INTEGER DEFAULT 30, status VARCHAR(20) DEFAULT ''scheduled'', type VARCHAR(20) DEFAULT ''regular'', notes TEXT, total_price DECIMAL(15,2) DEFAULT 0, commission_amount DECIMAL(15,2) DEFAULT 0, is_package_session BOOLEAN DEFAULT false, package_purchase_id UUID, reminder_sent BOOLEAN DEFAULT false, branch_id UUID, room_id UUID, tele_meeting_url TEXT, booking_channel VARCHAR(40) DEFAULT ''staff'', corporate_account_id UUID, reminder_sent_at TIMESTAMPTZ, last_notification_channel VARCHAR(30), session_series_id UUID, confirmation_call_at TIMESTAMPTZ, pre_visit_activity_at TIMESTAMPTZ, treatment_degree VARCHAR(80), treatment_shots VARCHAR(80), clinical_data JSONB DEFAULT ''{}''::jsonb, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_appointments');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID, specialist_id UUID, service_id UUID, appointment_id UUID, session_date DATE DEFAULT CURRENT_DATE, shots_used INTEGER DEFAULT 0, skin_type VARCHAR(20), before_photo TEXT, after_photo TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_sessions');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), package_purchase_id UUID, appointment_id UUID, session_number INTEGER, recorded_at TIMESTAMPTZ DEFAULT NOW())', v_prefix || '_beauty_session_logs');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID, package_id UUID, total_sessions INTEGER DEFAULT 1, used_sessions INTEGER DEFAULT 0, remaining_sessions INTEGER DEFAULT 1, sale_price DECIMAL(15,2) DEFAULT 0, purchase_date DATE DEFAULT CURRENT_DATE, expiry_date DATE, status VARCHAR(20) DEFAULT ''active'', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_package_purchases');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID, package_id UUID, total_sessions INTEGER, sale_price DECIMAL(15,2), sale_date DATE, expiry_date DATE, status VARCHAR(20))', v_prefix || '_beauty_package_sales');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), device_id UUID, appointment_id UUID, customer_id UUID, specialist_id UUID, body_region_id UUID, shots_used INTEGER DEFAULT 0, expected_shots INTEGER DEFAULT 0, is_excessive BOOLEAN DEFAULT false, usage_date DATE DEFAULT CURRENT_DATE, notes TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_device_usage');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), device_id UUID, usage_id UUID, alert_type VARCHAR(50), message TEXT, severity VARCHAR(20) DEFAULT ''warning'', acknowledged BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_device_alerts');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id UUID, customer_id UUID, service_rating SMALLINT DEFAULT 5, staff_rating SMALLINT DEFAULT 5, cleanliness_rating SMALLINT DEFAULT 5, overall_rating SMALLINT DEFAULT 5, comment TEXT, would_recommend BOOLEAN DEFAULT true, survey_id UUID, survey_answers JSONB, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_customer_feedback');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number VARCHAR(30), customer_id UUID, subtotal DECIMAL(15,2) DEFAULT 0, discount DECIMAL(15,2) DEFAULT 0, tax DECIMAL(15,2) DEFAULT 0, total DECIMAL(15,2) DEFAULT 0, payment_method VARCHAR(30) DEFAULT ''cash'', payment_status VARCHAR(20) DEFAULT ''paid'', paid_amount DECIMAL(15,2) DEFAULT 0, remaining_amount DECIMAL(15,2) DEFAULT 0, notes TEXT, created_by UUID, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_sales');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sale_id UUID, item_type VARCHAR(20) DEFAULT ''service'', item_id UUID, name VARCHAR(255), quantity INTEGER DEFAULT 1, unit_price DECIMAL(15,2) DEFAULT 0, discount DECIMAL(15,2) DEFAULT 0, total DECIMAL(15,2) DEFAULT 0, staff_id UUID, commission_amount DECIMAL(15,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_sale_items');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID, service_id UUID, specialist_id UUID, preferred_date_from DATE, preferred_date_to DATE, notes TEXT, status VARCHAR(20) DEFAULT ''active'', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_waitlist');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, phone VARCHAR(50) NOT NULL, email VARCHAR(255), service_id UUID, requested_date DATE, requested_time TIME, notes TEXT, status VARCHAR(20) DEFAULT ''pending'', public_token_used VARCHAR(128), processed_appointment_id UUID, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_booking_requests');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id UUID, channel VARCHAR(30) NOT NULL, payload_json JSONB DEFAULT ''{}''::jsonb, status VARCHAR(20) DEFAULT ''pending'', scheduled_at TIMESTAMPTZ, sent_at TIMESTAMPTZ, error_text TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_notification_queue');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID, appointment_id UUID, template_id UUID, signed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, signature_data TEXT, meta_json JSONB DEFAULT ''{}''::jsonb, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_consent_submissions');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id UUID, customer_id UUID, subjective TEXT, objective TEXT, assessment TEXT, plan TEXT, extra_json JSONB DEFAULT ''{}''::jsonb, created_by UUID, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_clinical_notes');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID NOT NULL, appointment_id UUID, kind VARCHAR(20) DEFAULT ''before'', storage_url TEXT NOT NULL, caption TEXT, taken_at DATE, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_patient_photos');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID NOT NULL, membership_id UUID NOT NULL, start_date DATE, end_date DATE, status VARCHAR(20) DEFAULT ''active'', auto_renew BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_membership_subscriptions');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), table_name VARCHAR(80) NOT NULL, record_id UUID, action VARCHAR(40) NOT NULL, user_id UUID, payload_json JSONB DEFAULT ''{}''::jsonb, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_audit_log');
  EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id UUID, product_id UUID NOT NULL, qty DECIMAL(15,4) NOT NULL, batch_id UUID, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)', v_prefix || '_beauty_consumable_usage_log');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 16. REFRESH FUNCTION (Mevcut Kurulumları Güncellemek İçin)
-- ============================================================================
-- Bu fonksiyon mevcut tüm firma/dönem tablolarını yeniden initialize eder.
-- Yeni kolonlar zaten IF NOT EXISTS ile eklenir.

CREATE OR REPLACE FUNCTION public.REFRESH_ALL_FIRM_TABLES()
RETURNS void AS $$
DECLARE
  f RECORD;
  p RECORD;
BEGIN
  FOR f IN SELECT firm_nr FROM firms WHERE is_active = true LOOP
    RAISE NOTICE 'Refreshing firm: %', f.firm_nr;
    PERFORM CREATE_FIRM_TABLES(f.firm_nr);
    FOR p IN SELECT nr FROM periods WHERE firm_id = (SELECT id FROM firms WHERE firm_nr = f.firm_nr) LOOP
      RAISE NOTICE 'Refreshing period: % / %', f.firm_nr, p.nr;
      PERFORM CREATE_PERIOD_TABLES(f.firm_nr, p.nr::varchar);
    END LOOP;
    PERFORM INIT_RESTAURANT_FIRM_TABLES(f.firm_nr);
    PERFORM INIT_BEAUTY_FIRM_TABLES(f.firm_nr);
    FOR p IN SELECT nr FROM periods WHERE firm_id = (SELECT id FROM firms WHERE firm_nr = f.firm_nr) LOOP
      PERFORM INIT_RESTAURANT_PERIOD_TABLES(f.firm_nr, p.nr::varchar);
      PERFORM INIT_BEAUTY_PERIOD_TABLES(f.firm_nr, p.nr::varchar);
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 17. SEED DATA
-- ============================================================================

-- Para Birimleri
INSERT INTO currencies (code, name, symbol, is_base_currency, sort_order) VALUES
('IQD', 'Iraqi Dinar', 'د.ع', true, 1),
('USD', 'US Dollar', '$', false, 2),
('EUR', 'Euro', '€', false, 3),
('TRY', 'Turkish Lira', '₺', false, 4),
('SAR', 'Saudi Riyal', '﷼', false, 5),
('AED', 'UAE Dirham', 'د.إ', false, 6),
('KWD', 'Kuwaiti Dinar', 'د.ك', false, 7),
('GBP', 'British Pound', '£', false, 8)
ON CONFLICT (code) DO NOTHING;

-- Birimler
INSERT INTO units (code, name) VALUES
('ADET', 'Adet'),
('KG',   'Kilogram'),
('GRAM', 'Gram'),
('LT',   'Litre'),
('ML',   'Militre'),
('KOLI', 'Koli'),
('PKT',  'Paket'),
('MT',   'Metre'),
('M2',   'Metrekare')
ON CONFLICT (code) DO NOTHING;

-- RBAC Rolleri (landing_route: giriş sonrası açılacak modül)
INSERT INTO public.roles (id, name, description, is_system_role, color, permissions, landing_route) VALUES
('00000000-0000-0000-0000-000000000001', 'admin',   'Tam yetkili sistem yöneticisi',  true, '#9333ea', '["*"]', NULL),
('00000000-0000-0000-0000-000000000002', 'manager', 'Mağaza Müdürü',                  true, '#3B82F6', '["pos.*", "management.*", "reports.*"]', NULL),
('00000000-0000-0000-0000-000000000003', 'cashier', 'Kasiyer — Satış Yetkisi',        true, '#10B981', '["pos.view", "pos.sell"]', 'pos'),
('00000000-0000-0000-0000-000000000004', 'stock',   'Stok ve Depo Sorumlusu',         true, '#F59E0B', '["management.products", "reports.inventory"]', NULL),
('00000000-0000-0000-0000-000000000005', 'garson', 'Garson — Restoran masa servisi', true, '#F97316', '["restaurant.pos", "restaurant.kds"]', 'restaurant'),
('00000000-0000-0000-0000-000000000006', 'anket', 'Anket operatörü — yalnızca memnuniyet anketi uygulama', true, '#8B5CF6', '[{"module":"beauty.surveys","actions":["READ","EXECUTE"]}]', 'beauty')
ON CONFLICT (name) DO UPDATE SET landing_route = EXCLUDED.landing_route;

-- Admin Kullanıcısı
INSERT INTO public.users (id, firm_nr, username, password_hash, full_name, email, role, role_id, is_active)
VALUES (
  '10000000-0000-4000-a000-000000000001',
  '001',
  'admin',
  crypt('admin', gen_salt('bf')),
  'System Administrator',
  'admin@retailex.com',
  'admin',
  '00000000-0000-0000-0000-000000000001',
  true
) ON CONFLICT (username) DO UPDATE SET role_id = EXCLUDED.role_id, role = EXCLUDED.role;

-- Kategoriler
INSERT INTO categories (code, name) VALUES
('GENEL',   'Genel Ürünler'),
('HIZMET',  'Hizmetler'),
('GIDA',    'Gıda'),
('ICECEK',  'İçecek')
ON CONFLICT (code) DO NOTHING;

-- Rapor Şablonları
INSERT INTO public.report_templates (name, description, category, content, is_default)
VALUES
('Modern Satış Faturası', 'Temiz ve modern fatura tasarımı', 'fatura', '{"pageSize": {"width": 210, "height": 297}, "components": []}', true),
('Standart Ürün Etiketi (40x20mm)', 'Barkodlu raf etiketi', 'etiket', '{"pageSize": {"width": 40, "height": 20}, "components": []}', true)
ON CONFLICT DO NOTHING;

-- Restoran Rolleri
INSERT INTO rest.staff_roles (name) VALUES ('Manager'), ('Waiter'), ('Chef'), ('Cashier') ON CONFLICT DO NOTHING;

-- Beauty Bölgeleri
INSERT INTO beauty.body_regions (name, avg_shots, min_shots, max_shots, sort_order) VALUES
('Yüz',              200, 150, 350,  1),
('Koltuk Altı',      150, 100, 250,  2),
('Bacak (Tam)',      1200, 800,1800,  3),
('Bacak (Alt Yarı)',  600, 400, 900,  4),
('Bacak (Üst Yarı)', 600, 400, 900,  5),
('Bikini (Tam)',      300, 200, 500,  6),
('Bikini (Dar)',      150, 100, 250,  7),
('Kol (Tam)',         500, 350, 750,  8),
('Kol (Yarım)',       250, 175, 400,  9),
('Sırt',              800, 500,1200, 10),
('Göğüs',             500, 300, 800, 11),
('Yüz + Boyun',       350, 250, 500, 12),
('Bıyık / Çene',      100,  60, 180, 13)
ON CONFLICT (name) DO NOTHING;

-- Servis Sağlığı
INSERT INTO public.service_health (service_name, status, version, metadata)
VALUES
('RetailEX-Sync-Service', 'OFFLINE', '2.0.0', '{"description": "Kiracı WebSocket hub", "ws_path": "/{tenant}/ws", "api_path": "/{tenant}/sync"}'),
('RetailEX-Logo-Connector', 'OFFLINE', '1.0.0', '{"description": "Logo ERP bridge"}')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 18. BOOTSTRAP — Şablon firma (001) ve tablo motoru
-- "RetailEx OS" yalnızca CREATE_FIRM_TABLES vb. fonksiyonların çalışması için şablondur.
-- Kurulum sihirbazı gerçek firma adını yazar; gereksizse 015 / SetupWizard ile kaldırılır.
-- İkinci demo firma (002) artık sıfır kurulumda seed edilmez (yalnızca yeni kurulum).
-- ============================================================================

INSERT INTO firms (id, firm_nr, name, "default", ana_para_birimi, raporlama_para_birimi)
VALUES ('00000000-0000-4000-a000-000000000001', '001', 'RetailEx OS', true, 'IQD', 'IQD')
ON CONFLICT DO NOTHING;

INSERT INTO periods (firm_id, nr, beg_date, end_date, "default")
VALUES ('00000000-0000-4000-a000-000000000001', 1, '2026-01-01', '2026-12-31', true)
ON CONFLICT DO NOTHING;

INSERT INTO stores (code, name, firm_nr, is_main, "default")
VALUES ('ST_01', 'Merkez Depo', '001', true, true)
ON CONFLICT DO NOTHING;

SELECT CREATE_FIRM_TABLES('001');
SELECT CREATE_PERIOD_TABLES('001', '01');
SELECT INIT_RESTAURANT_FIRM_TABLES('001');
SELECT INIT_BEAUTY_FIRM_TABLES('001');
SELECT INIT_RESTAURANT_PERIOD_TABLES('001', '01');
SELECT INIT_BEAUTY_PERIOD_TABLES('001', '01');

-- ============================================================================
-- POSTGREST: anon rolü ve izinler (sıfır kurulum uyumu)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA logic  TO anon;
GRANT USAGE ON SCHEMA wms    TO anon;
GRANT USAGE ON SCHEMA rest   TO anon;
GRANT USAGE ON SCHEMA beauty TO anon;
GRANT USAGE ON SCHEMA pos    TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA logic TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA logic TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA wms TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA wms TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA rest TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA rest TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA beauty TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA beauty TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pos TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pos TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA logic  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA logic  GRANT USAGE, SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA wms    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA wms    GRANT USAGE, SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA rest   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA rest   GRANT USAGE, SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA beauty GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA beauty GRANT USAGE, SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA pos    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA pos    GRANT USAGE, SELECT ON SEQUENCES TO anon;

-- ============================================================================
-- POSTGREST RPC: verify_login (logic şeması)
-- ============================================================================
CREATE OR REPLACE FUNCTION logic.verify_login(
  username text,
  password text,
  firm_nr text
)
RETURNS TABLE (
  id uuid, username text, email text, full_name text, firm_nr text,
  store_id uuid, role_id uuid, role_name text, role_permissions jsonb,
  role_color text, role_landing_route text, allowed_firm_nrs jsonb,
  allowed_periods jsonb, created_at timestamptz
)
AS $$
  SELECT u.id, u.username, u.email, u.full_name, u.firm_nr, u.store_id,
         r.id, r.name, r.permissions, r.color, r.landing_route,
         u.allowed_firm_nrs, u.allowed_periods, u.created_at
  FROM public.users u
  LEFT JOIN public.roles r ON r.id = u.role_id
  WHERE u.is_active = true
    AND LOWER(u.username) = LOWER(verify_login.username)
    AND u.password_hash IS NOT NULL
    AND u.password_hash = crypt(verify_login.password, u.password_hash)
    AND (
      verify_login.firm_nr IS NULL OR verify_login.firm_nr = ''
      OR u.firm_nr = verify_login.firm_nr::text
      OR (COALESCE(jsonb_array_length(u.allowed_firm_nrs), 0) > 0
          AND u.allowed_firm_nrs @> jsonb_build_array(verify_login.firm_nr::text))
    )
  LIMIT 1;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION logic.verify_login(text, text, text) TO anon;

-- POS sepet audit (satır iptali / fiyat değişikliği — ödeme öncesi)
CREATE TABLE IF NOT EXISTS public.pos_cart_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr VARCHAR(20),
  store_id VARCHAR(64),
  receipt_number VARCHAR(64) NOT NULL,
  session_id VARCHAR(64),
  event_type VARCHAR(40) NOT NULL,
  product_id VARCHAR(64),
  product_name TEXT,
  product_code VARCHAR(120),
  barcode VARCHAR(120),
  quantity NUMERIC(18,4),
  old_price NUMERIC(18,4),
  new_price NUMERIC(18,4),
  metadata JSONB DEFAULT '{}',
  user_id VARCHAR(64),
  user_name TEXT,
  staff_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_cart_audit_receipt ON public.pos_cart_audit(receipt_number);
CREATE INDEX IF NOT EXISTS idx_pos_cart_audit_created ON public.pos_cart_audit(created_at DESC);

-- Online mağaza web siparişleri (094)
CREATE TABLE IF NOT EXISTS public.eticaret_web_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_code       VARCHAR(64) NOT NULL DEFAULT '',
  order_no          VARCHAR(50) NOT NULL UNIQUE,
  status            VARCHAR(30) NOT NULL DEFAULT 'pending',
  demo_mode         BOOLEAN NOT NULL DEFAULT false,
  customer_name     VARCHAR(255),
  customer_email    VARCHAR(255),
  customer_phone    VARCHAR(50),
  shipping_address  TEXT,
  payment_provider  VARCHAR(50),
  payment_status    VARCHAR(30) NOT NULL DEFAULT 'pending',
  payment_ref       TEXT,
  currency          VARCHAR(10) NOT NULL DEFAULT 'TRY',
  subtotal          DECIMAL(15,2) NOT NULL DEFAULT 0,
  total             DECIMAL(15,2) NOT NULL DEFAULT 0,
  items             JSONB NOT NULL DEFAULT '[]'::jsonb,
  sales_fiche_id    UUID,
  sales_fiche_no    VARCHAR(100),
  firm_nr           VARCHAR(10),
  period_nr         VARCHAR(10),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eticaret_web_orders_tenant ON public.eticaret_web_orders (tenant_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eticaret_web_orders_status ON public.eticaret_web_orders (status);

CREATE OR REPLACE FUNCTION public.eticaret_submit_web_order(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_demo          BOOLEAN := COALESCE((payload->>'demo_mode')::boolean, false);
  v_tenant        TEXT := COALESCE(NULLIF(TRIM(payload->>'tenant_code'), ''), 'default');
  v_firm          TEXT;
  v_period        TEXT;
  v_eticaret      JSONB;
  v_currency      TEXT := COALESCE(NULLIF(TRIM(payload->>'currency'), ''), 'TRY');
  v_order_no      TEXT;
  v_order_id      UUID := gen_random_uuid();
  v_sales_id      UUID;
  v_tbl_sales     TEXT;
  v_tbl_items     TEXT;
  v_subtotal      DECIMAL(15,2) := COALESCE((payload->>'subtotal')::decimal, 0);
  v_total         DECIMAL(15,2) := COALESCE((payload->>'total')::decimal, 0);
  v_items         JSONB := COALESCE(payload->'items', '[]'::jsonb);
  v_item          JSONB;
  v_pay_provider  TEXT := NULLIF(TRIM(payload->>'payment_provider'), '');
  v_pay_status    TEXT := COALESCE(NULLIF(TRIM(payload->>'payment_status'), ''), 'pending');
  v_customer_name TEXT := NULLIF(TRIM(payload->>'customer_name'), '');
  v_customer_email TEXT := NULLIF(TRIM(payload->>'customer_email'), '');
  v_customer_phone TEXT := NULLIF(TRIM(payload->>'customer_phone'), '');
  v_address       TEXT := NULLIF(TRIM(payload->>'shipping_address'), '');
  v_year          TEXT := to_char(now(), 'YYYY');
  v_seq           INT;
BEGIN
  SELECT primary_firm_nr, primary_period_nr, eticaret_settings
  INTO v_firm, v_period, v_eticaret
  FROM public.system_settings
  WHERE id = 1;

  IF NULLIF(TRIM(payload->>'firm_nr'), '') IS NOT NULL THEN
    v_firm := NULLIF(TRIM(payload->>'firm_nr'), '');
  ELSIF v_eticaret IS NOT NULL
    AND NULLIF(TRIM(v_eticaret->>'catalogFirmNr'), '') IS NOT NULL THEN
    v_firm := NULLIF(TRIM(v_eticaret->>'catalogFirmNr'), '');
  END IF;

  v_firm := COALESCE(NULLIF(TRIM(v_firm), ''), '001');
  v_period := COALESCE(NULLIF(TRIM(v_period), ''), '01');
  v_firm := lpad(v_firm, 3, '0');
  v_period := lpad(v_period, 2, '0');

  SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(order_no, '^WEB-' || v_year || '-', ''), '') AS INT)), 0) + 1
  INTO v_seq
  FROM public.eticaret_web_orders
  WHERE order_no LIKE 'WEB-' || v_year || '-%';

  v_order_no := 'WEB-' || v_year || '-' || lpad(v_seq::text, 5, '0');

  INSERT INTO public.eticaret_web_orders (
    id, tenant_code, order_no, status, demo_mode,
    customer_name, customer_email, customer_phone, shipping_address,
    payment_provider, payment_status, payment_ref,
    currency, subtotal, total, items, firm_nr, period_nr, notes
  ) VALUES (
    v_order_id, v_tenant, v_order_no,
    CASE WHEN v_demo THEN 'demo' ELSE 'pending' END,
    v_demo,
    v_customer_name, v_customer_email, v_customer_phone, v_address,
    v_pay_provider, v_pay_status, NULLIF(TRIM(payload->>'payment_ref'), ''),
    v_currency, v_subtotal, v_total, v_items, v_firm, v_period,
    COALESCE(NULLIF(TRIM(payload->>'notes'), ''), 'Online mağaza siparişi')
  );

  IF v_demo THEN
    RETURN jsonb_build_object(
      'ok', true,
      'demo', true,
      'order_id', v_order_id,
      'order_no', v_order_no,
      'message', 'Demo modu — sipariş fişi oluşturulmadı'
    );
  END IF;

  v_tbl_sales := 'rex_' || v_firm || '_' || v_period || '_sales';
  v_tbl_items := 'rex_' || v_firm || '_' || v_period || '_sale_items';
  v_sales_id := gen_random_uuid();

  EXECUTE format(
    'INSERT INTO %I (
      id, firm_nr, period_nr, fiche_no, document_no, trcode, fiche_type, date,
      customer_name, total_net, total_vat, total_discount, net_amount,
      currency, currency_rate, status, payment_method, notes, header_fields
    ) VALUES (
      $1, $2, $3, $4, $4, 20, ''order'', now(),
      $5, $6, 0, 0, $6,
      $7, 1, ''approved'', $8, $9, $10::jsonb
    )',
    v_tbl_sales
  ) USING
    v_sales_id, v_firm, v_period, v_order_no,
    COALESCE(v_customer_name, 'Online Müşteri'),
    v_total, v_currency,
    COALESCE(v_pay_provider, 'online'),
    'Web sipariş: ' || v_order_no || COALESCE(' · ' || v_address, ''),
    jsonb_build_object(
      'source', 'eticaret_web',
      'web_order_id', v_order_id::text,
      'tenant_code', v_tenant,
      'customer_email', v_customer_email,
      'customer_phone', v_customer_phone
    );

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    EXECUTE format(
      'INSERT INTO %I (
        id, invoice_id, firm_nr, period_nr, item_code, item_name, product_id,
        quantity, unit_price, vat_rate, total_amount, net_amount, unit
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, NULLIF($6, '''')::uuid,
        $7, $8, COALESCE(($9)::decimal, 0), $10, $10, COALESCE(NULLIF($11, ''''), ''Adet'')
      )',
      v_tbl_items
    ) USING
      v_sales_id, v_firm, v_period,
      COALESCE(v_item->>'code', v_item->>'product_code', ''),
      COALESCE(v_item->>'name', v_item->>'product_name', 'Ürün'),
      COALESCE(v_item->>'product_id', ''),
      COALESCE((v_item->>'quantity')::decimal, 1),
      COALESCE((v_item->>'price')::decimal, 0),
      v_item->>'vat_rate',
      COALESCE((v_item->>'line_total')::decimal,
        COALESCE((v_item->>'quantity')::decimal, 1) * COALESCE((v_item->>'price')::decimal, 0)),
      v_item->>'unit';
  END LOOP;

  UPDATE public.eticaret_web_orders
  SET status = 'converted',
      sales_fiche_id = v_sales_id,
      sales_fiche_no = v_order_no,
      updated_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'demo', false,
    'order_id', v_order_id,
    'order_no', v_order_no,
    'sales_fiche_id', v_sales_id,
    'sales_fiche_no', v_order_no,
    'fiche_type', 'order',
    'trcode', 20,
    'firm_nr', v_firm
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.eticaret_submit_web_order(JSONB) TO anon;


-- ============================================================================
-- LOGISTICS — Teslimat Yönetim Modülü (105 ile senkron)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS logistics;

CREATE TABLE IF NOT EXISTS logistics.vehicles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr         VARCHAR(10) NOT NULL,
  plate           VARCHAR(32) NOT NULL,
  brand           VARCHAR(100),
  model           VARCHAR(100),
  capacity_kg     NUMERIC(14,3),
  capacity_m3     NUMERIC(14,3),
  cold_chain      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  maintenance_due DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (firm_nr, plate)
);
CREATE INDEX IF NOT EXISTS idx_logistics_vehicles_firm ON logistics.vehicles(firm_nr) WHERE is_active;

CREATE TABLE IF NOT EXISTS logistics.couriers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr            VARCHAR(10) NOT NULL,
  user_id            UUID,
  full_name          VARCHAR(255) NOT NULL,
  phone              VARCHAR(50),
  default_vehicle_id UUID REFERENCES logistics.vehicles(id) ON DELETE SET NULL,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  last_lat           NUMERIC(10,7),
  last_lng           NUMERIC(10,7),
  last_location_at   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logistics_couriers_firm ON logistics.couriers(firm_nr) WHERE is_active;

CREATE TABLE IF NOT EXISTS logistics.delivery_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr         VARCHAR(10) NOT NULL,
  period_nr       VARCHAR(10) NOT NULL,
  branch_id       VARCHAR(50),
  warehouse_id    VARCHAR(50),
  plan_date       DATE NOT NULL,
  vehicle_id      UUID REFERENCES logistics.vehicles(id) ON DELETE SET NULL,
  courier_id      UUID REFERENCES logistics.couriers(id) ON DELETE SET NULL,
  status          VARCHAR(30) NOT NULL DEFAULT 'draft',
  route_polyline  TEXT,
  notes           TEXT,
  created_by      VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logistics_plans_firm_date ON logistics.delivery_plans(firm_nr, plan_date);

CREATE TABLE IF NOT EXISTS logistics.deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr          VARCHAR(10) NOT NULL,
  period_nr        VARCHAR(10) NOT NULL,
  delivery_no      VARCHAR(50) NOT NULL,
  delivery_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_time    TIME,
  branch_id        VARCHAR(50),
  warehouse_id     VARCHAR(50),
  plan_id          UUID REFERENCES logistics.delivery_plans(id) ON DELETE SET NULL,
  sales_id         UUID NOT NULL,
  sales_fiche_no   VARCHAR(50),
  customer_id      UUID,
  customer_name    VARCHAR(255),
  address_text     TEXT,
  phone            VARCHAR(50),
  lat              NUMERIC(10,7),
  lng              NUMERIC(10,7),
  vehicle_id       UUID REFERENCES logistics.vehicles(id) ON DELETE SET NULL,
  courier_id       UUID REFERENCES logistics.couriers(id) ON DELETE SET NULL,
  driver_name      VARCHAR(255),
  dispatch_slip_id UUID,
  waybill_sales_id UUID,
  invoice_sales_id UUID,
  status           VARCHAR(40) NOT NULL DEFAULT 'draft',
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes            TEXT,
  created_by       VARCHAR(100),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (firm_nr, period_nr, delivery_no)
);
CREATE INDEX IF NOT EXISTS idx_logistics_del_firm_status ON logistics.deliveries(firm_nr, status);
CREATE INDEX IF NOT EXISTS idx_logistics_del_sales ON logistics.deliveries(sales_id);
CREATE INDEX IF NOT EXISTS idx_logistics_del_courier_date ON logistics.deliveries(courier_id, delivery_date);
CREATE INDEX IF NOT EXISTS idx_logistics_del_date ON logistics.deliveries(firm_nr, delivery_date DESC);

CREATE TABLE IF NOT EXISTS logistics.delivery_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id      UUID NOT NULL REFERENCES logistics.deliveries(id) ON DELETE CASCADE,
  sale_item_id     UUID,
  product_id       UUID,
  product_code     VARCHAR(100),
  product_name     VARCHAR(255),
  unit             VARCHAR(30),
  qty_ordered      NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_planned      NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_picked       NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_packed       NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_shipped      NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_delivered    NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_returned     NUMERIC(18,4) NOT NULL DEFAULT 0,
  line_status      VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logistics_del_lines_delivery ON logistics.delivery_lines(delivery_id);

CREATE TABLE IF NOT EXISTS logistics.delivery_status_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id  UUID NOT NULL REFERENCES logistics.deliveries(id) ON DELETE CASCADE,
  from_status  VARCHAR(40),
  to_status    VARCHAR(40) NOT NULL,
  actor_id     VARCHAR(100),
  actor_role   VARCHAR(50),
  note         TEXT,
  lat          NUMERIC(10,7),
  lng          NUMERIC(10,7),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logistics_del_events ON logistics.delivery_status_events(delivery_id, created_at);

CREATE TABLE IF NOT EXISTS logistics.delivery_proofs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id     UUID NOT NULL REFERENCES logistics.deliveries(id) ON DELETE CASCADE,
  recipient_name  VARCHAR(255),
  signature_url   TEXT,
  photo_urls      JSONB NOT NULL DEFAULT '[]'::jsonb,
  lat             NUMERIC(10,7),
  lng             NUMERIC(10,7),
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  note            TEXT
);
CREATE INDEX IF NOT EXISTS idx_logistics_proofs_delivery ON logistics.delivery_proofs(delivery_id);

CREATE TABLE IF NOT EXISTS logistics.courier_locations (
  id           BIGSERIAL PRIMARY KEY,
  firm_nr      VARCHAR(10) NOT NULL,
  courier_id   UUID NOT NULL REFERENCES logistics.couriers(id) ON DELETE CASCADE,
  delivery_id  UUID REFERENCES logistics.deliveries(id) ON DELETE SET NULL,
  lat          NUMERIC(10,7) NOT NULL,
  lng          NUMERIC(10,7) NOT NULL,
  speed_kmh    NUMERIC(8,2),
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logistics_courier_loc ON logistics.courier_locations(courier_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS logistics.delivery_returns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr      VARCHAR(10) NOT NULL,
  period_nr    VARCHAR(10) NOT NULL,
  delivery_id  UUID NOT NULL REFERENCES logistics.deliveries(id) ON DELETE CASCADE,
  reason_code  VARCHAR(50),
  reason_text  TEXT,
  status       VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logistics.delivery_return_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id        UUID NOT NULL REFERENCES logistics.delivery_returns(id) ON DELETE CASCADE,
  delivery_line_id UUID REFERENCES logistics.delivery_lines(id) ON DELETE SET NULL,
  product_id       UUID,
  qty              NUMERIC(18,4) NOT NULL,
  condition        VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS logistics.notification_outbox (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr      VARCHAR(10) NOT NULL,
  delivery_id  UUID REFERENCES logistics.deliveries(id) ON DELETE SET NULL,
  channel      VARCHAR(30) NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logistics_notify_pending ON logistics.notification_outbox(status, created_at)
  WHERE status = 'pending';

ALTER TABLE wms.pick_waves
  ADD COLUMN IF NOT EXISTS delivery_id UUID,
  ADD COLUMN IF NOT EXISTS sales_ids UUID[];

CREATE TABLE IF NOT EXISTS wms.pick_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_id          UUID REFERENCES wms.pick_waves(id) ON DELETE CASCADE,
  delivery_id      UUID,
  delivery_line_id UUID,
  product_id       UUID,
  product_code     VARCHAR(100),
  product_name     VARCHAR(255),
  bin_code         VARCHAR(50),
  qty_to_pick      NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_picked       NUMERIC(18,4) NOT NULL DEFAULT 0,
  status           VARCHAR(30) NOT NULL DEFAULT 'open',
  assigned_user    VARCHAR(100),
  firm_nr          VARCHAR(10) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wms_pick_tasks_wave ON wms.pick_tasks(wave_id);
CREATE INDEX IF NOT EXISTS idx_wms_pick_tasks_delivery ON wms.pick_tasks(delivery_id);
CREATE INDEX IF NOT EXISTS idx_wms_pick_tasks_firm_status ON wms.pick_tasks(firm_nr, status);

GRANT USAGE ON SCHEMA logistics TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA logistics TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA logistics TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA logistics
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA logistics
  GRANT USAGE, SELECT ON SEQUENCES TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON wms.pick_tasks TO anon;



CREATE OR REPLACE FUNCTION logic.create_delivery_from_sales(
  p_firm_nr VARCHAR,
  p_period_nr VARCHAR,
  p_sales_id UUID,
  p_created_by VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sales RECORD;
  v_tbl_sales TEXT;
  v_tbl_items TEXT;
  v_delivery_id UUID := gen_random_uuid();
  v_delivery_no VARCHAR(50);
  v_seq INT;
  v_line RECORD;
  v_line_count INT := 0;
BEGIN
  v_tbl_sales := 'rex_' || lpad(trim(p_firm_nr), 3, '0') || '_' || lpad(trim(p_period_nr), 2, '0') || '_sales';
  v_tbl_items := 'rex_' || lpad(trim(p_firm_nr), 3, '0') || '_' || lpad(trim(p_period_nr), 2, '0') || '_sale_items';

  IF to_regclass('public.' || v_tbl_sales) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sales_table_missing');
  END IF;

  EXECUTE format(
    'SELECT id, fiche_no, customer_id, customer_name, notes, store_id::text AS store_id
     FROM %I WHERE id = $1',
    v_tbl_sales
  ) INTO v_sales USING p_sales_id;

  IF v_sales.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sales_not_found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM logistics.deliveries d
    WHERE d.firm_nr = trim(p_firm_nr)
      AND d.period_nr = trim(p_period_nr)
      AND d.sales_id = p_sales_id
      AND d.status <> 'cancelled'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'delivery_already_exists');
  END IF;

  SELECT COUNT(*)::int + 1
  INTO v_seq
  FROM logistics.deliveries
  WHERE firm_nr = trim(p_firm_nr)
    AND period_nr = trim(p_period_nr)
    AND delivery_no LIKE ('TSL-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-%');

  v_delivery_no := 'TSL-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO logistics.deliveries (
    id, firm_nr, period_nr, delivery_no, delivery_date,
    branch_id, sales_id, sales_fiche_no, customer_id, customer_name,
    address_text, status, created_by
  ) VALUES (
    v_delivery_id, trim(p_firm_nr), trim(p_period_nr), v_delivery_no, CURRENT_DATE,
    v_sales.store_id, p_sales_id, v_sales.fiche_no, v_sales.customer_id, v_sales.customer_name,
    v_sales.notes, 'draft', p_created_by
  );

  IF to_regclass('public.' || v_tbl_items) IS NOT NULL THEN
    FOR v_line IN EXECUTE format(
      'SELECT id, product_id, item_code, item_name, unit, quantity
       FROM %I WHERE invoice_id = $1',
      v_tbl_items
    ) USING p_sales_id
    LOOP
      INSERT INTO logistics.delivery_lines (
        delivery_id, sale_item_id, product_id, product_code, product_name,
        unit, qty_ordered, qty_planned
      ) VALUES (
        v_delivery_id, v_line.id, v_line.product_id, v_line.item_code, v_line.item_name,
        COALESCE(v_line.unit, 'Adet'), COALESCE(v_line.quantity, 0), COALESCE(v_line.quantity, 0)
      );
      v_line_count := v_line_count + 1;
    END LOOP;
  END IF;

  INSERT INTO logistics.delivery_status_events (delivery_id, from_status, to_status, actor_id, note)
  VALUES (v_delivery_id, NULL, 'draft', p_created_by, 'Siparişten oluşturuldu');

  RETURN jsonb_build_object(
    'ok', true,
    'delivery_id', v_delivery_id,
    'delivery_no', v_delivery_no,
    'line_count', v_line_count
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION logic.create_delivery_from_sales(VARCHAR, VARCHAR, UUID, VARCHAR) TO anon;


-- ============================================================================
-- WMS KURUMSAL KATMAN (106 ile senkron)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS wms;
CREATE SCHEMA IF NOT EXISTS logic;

-- ============================================================================
-- 1) Lokasyon / Bin hiyerarşisi genişletme
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('wms.bins') IS NOT NULL THEN
    ALTER TABLE wms.bins ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10);
    ALTER TABLE wms.bins ADD COLUMN IF NOT EXISTS rack VARCHAR(50);
    ALTER TABLE wms.bins ADD COLUMN IF NOT EXISTS bin_type VARCHAR(30) DEFAULT 'storage';
    ALTER TABLE wms.bins ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
    ALTER TABLE wms.bins ADD COLUMN IF NOT EXISTS pick_sequence INTEGER;
    ALTER TABLE wms.bins ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
    ALTER TABLE wms.bins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
    CREATE INDEX IF NOT EXISTS idx_wms_bins_store ON wms.bins(store_id);
    CREATE INDEX IF NOT EXISTS idx_wms_bins_firm ON wms.bins(firm_nr);
    CREATE INDEX IF NOT EXISTS idx_wms_bins_barcode ON wms.bins(barcode) WHERE barcode IS NOT NULL;
  ELSE
    CREATE TABLE wms.bins (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id     UUID,
      firm_nr      VARCHAR(10),
      code         VARCHAR(50) NOT NULL,
      zone         VARCHAR(50),
      aisle        VARCHAR(50),
      rack         VARCHAR(50),
      shelf        VARCHAR(50),
      bin          VARCHAR(50),
      bin_type     VARCHAR(30) DEFAULT 'storage',
      barcode      VARCHAR(100),
      pick_sequence INTEGER,
      capacity_m3  DECIMAL(14,3),
      max_weight   DECIMAL(14,3),
      is_active    BOOLEAN DEFAULT true,
      created_at   TIMESTAMPTZ DEFAULT now(),
      updated_at   TIMESTAMPTZ DEFAULT now(),
      UNIQUE (store_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_wms_bins_store ON wms.bins(store_id);
    CREATE INDEX IF NOT EXISTS idx_wms_bins_firm ON wms.bins(firm_nr);
  END IF;
END $$;

-- ============================================================================
-- 2) Bin bazlı envanter (lot/seri + SKT) — FEFO/FIFO çekirdeği
-- ============================================================================
CREATE TABLE IF NOT EXISTS wms.bin_inventory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr       VARCHAR(10) NOT NULL,
  store_id      UUID,
  bin_id        UUID REFERENCES wms.bins(id) ON DELETE SET NULL,
  bin_code      VARCHAR(50),
  product_id    UUID,
  product_code  VARCHAR(100),
  product_name  VARCHAR(255),
  lot_no        VARCHAR(120),
  serial_no     VARCHAR(120),
  expiry_date   DATE,
  qty           NUMERIC(18,4) NOT NULL DEFAULT 0,
  reserved_qty  NUMERIC(18,4) NOT NULL DEFAULT 0,
  uom           VARCHAR(30) DEFAULT 'Adet',
  received_at   TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wms_bin_inventory
  ON wms.bin_inventory (
    firm_nr, COALESCE(store_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(bin_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(lot_no, ''), COALESCE(serial_no, ''), COALESCE(expiry_date, '1900-01-01'::date)
  );
CREATE INDEX IF NOT EXISTS idx_wms_bininv_fefo ON wms.bin_inventory(firm_nr, product_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_wms_bininv_store_prod ON wms.bin_inventory(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_wms_bininv_bin ON wms.bin_inventory(bin_id);

-- ============================================================================
-- 3) Putaway (yerleştirme) görevleri — mal kabul → raf
-- ============================================================================
CREATE TABLE IF NOT EXISTS wms.putaway_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr           VARCHAR(10) NOT NULL,
  store_id          UUID,
  receiving_slip_id UUID,
  receiving_line_id UUID,
  product_id        UUID,
  product_code      VARCHAR(100),
  product_name      VARCHAR(255),
  lot_no            VARCHAR(120),
  expiry_date       DATE,
  qty               NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_done          NUMERIC(18,4) NOT NULL DEFAULT 0,
  from_bin_id       UUID,
  suggested_bin_id  UUID,
  to_bin_id         UUID,
  status            VARCHAR(30) NOT NULL DEFAULT 'open',
  assigned_user     VARCHAR(100),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wms_putaway_firm_status ON wms.putaway_tasks(firm_nr, status);
CREATE INDEX IF NOT EXISTS idx_wms_putaway_receiving ON wms.putaway_tasks(receiving_slip_id);

-- ============================================================================
-- 4) Packing (paketleme) — istasyon + koli (SSCC / kargo takip)
-- ============================================================================
CREATE TABLE IF NOT EXISTS wms.packing_slips (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr          VARCHAR(10) NOT NULL,
  store_id         UUID,
  pack_no          VARCHAR(50) NOT NULL,
  dispatch_slip_id UUID,
  delivery_id      UUID,
  sales_id         UUID,
  status           VARCHAR(30) NOT NULL DEFAULT 'open',
  packed_by        VARCHAR(100),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (firm_nr, pack_no)
);
CREATE INDEX IF NOT EXISTS idx_wms_packing_firm_status ON wms.packing_slips(firm_nr, status);

CREATE TABLE IF NOT EXISTS wms.packing_cartons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packing_slip_id UUID NOT NULL REFERENCES wms.packing_slips(id) ON DELETE CASCADE,
  carton_no       VARCHAR(50),
  sscc            VARCHAR(30),
  tracking_no     VARCHAR(80),
  weight_kg       NUMERIC(14,3),
  length_cm       NUMERIC(10,2),
  width_cm        NUMERIC(10,2),
  height_cm       NUMERIC(10,2),
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wms_cartons_slip ON wms.packing_cartons(packing_slip_id);

CREATE TABLE IF NOT EXISTS wms.packing_carton_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carton_id    UUID NOT NULL REFERENCES wms.packing_cartons(id) ON DELETE CASCADE,
  product_id   UUID,
  product_code VARCHAR(100),
  lot_no       VARCHAR(120),
  expiry_date  DATE,
  qty          NUMERIC(18,4) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_wms_carton_lines_carton ON wms.packing_carton_lines(carton_id);

-- ============================================================================
-- 5) Fire / hurda / stok düzeltme (shrinkage) — nedene bağlı
-- ============================================================================
CREATE TABLE IF NOT EXISTS wms.stock_adjustments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr      VARCHAR(10) NOT NULL,
  store_id     UUID,
  adj_no       VARCHAR(50) NOT NULL,
  adj_type     VARCHAR(30) NOT NULL DEFAULT 'fire',
  reason_code  VARCHAR(50),
  reason_text  TEXT,
  status       VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by   VARCHAR(100),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (firm_nr, adj_no)
);
CREATE INDEX IF NOT EXISTS idx_wms_adj_firm_status ON wms.stock_adjustments(firm_nr, status);

CREATE TABLE IF NOT EXISTS wms.stock_adjustment_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id  UUID NOT NULL REFERENCES wms.stock_adjustments(id) ON DELETE CASCADE,
  product_id     UUID,
  product_code   VARCHAR(100),
  product_name   VARCHAR(255),
  bin_id         UUID,
  lot_no         VARCHAR(120),
  expiry_date    DATE,
  qty_delta      NUMERIC(18,4) NOT NULL DEFAULT 0,
  reason_code    VARCHAR(50)
);
CREATE INDEX IF NOT EXISTS idx_wms_adj_lines_adj ON wms.stock_adjustment_lines(adjustment_id);

-- ============================================================================
-- 6) Cross-dock işaretleme
-- ============================================================================
CREATE TABLE IF NOT EXISTS wms.cross_dock_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr           VARCHAR(10) NOT NULL,
  receiving_slip_id UUID,
  receiving_line_id UUID,
  dispatch_slip_id  UUID,
  delivery_id       UUID,
  product_id        UUID,
  qty               NUMERIC(18,4) NOT NULL DEFAULT 0,
  status            VARCHAR(30) NOT NULL DEFAULT 'planned',
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wms_crossdock_firm ON wms.cross_dock_links(firm_nr, status);

-- ============================================================================
-- 7) Logo senkron kuyruğu (WMS belgeleri → Logo)
-- ============================================================================
CREATE TABLE IF NOT EXISTS wms.logo_sync_outbox (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr      VARCHAR(10) NOT NULL,
  doc_type     VARCHAR(40) NOT NULL,
  doc_id       UUID,
  doc_no       VARCHAR(80),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       VARCHAR(30) NOT NULL DEFAULT 'pending',
  logo_ref     INTEGER,
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wms_logo_outbox_pending ON wms.logo_sync_outbox(status, created_at) WHERE status = 'pending';

-- ============================================================================
-- 8) Mevcut WMS belgelerini genişlet (lot/SKT/bin + Logo + kargo)
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('wms.receiving_slips') IS NOT NULL THEN
    ALTER TABLE wms.receiving_slips ADD COLUMN IF NOT EXISTS asn_no VARCHAR(80);
    ALTER TABLE wms.receiving_slips ADD COLUMN IF NOT EXISTS po_ref VARCHAR(80);
    ALTER TABLE wms.receiving_slips ADD COLUMN IF NOT EXISTS eta DATE;
    ALTER TABLE wms.receiving_slips ADD COLUMN IF NOT EXISTS dock_door_id UUID;
    ALTER TABLE wms.receiving_slips ADD COLUMN IF NOT EXISTS logo_ref INTEGER;
    ALTER TABLE wms.receiving_slips ADD COLUMN IF NOT EXISTS logo_sync_status VARCHAR(20) DEFAULT 'pending';
  END IF;
  IF to_regclass('wms.receiving_lines') IS NOT NULL THEN
    ALTER TABLE wms.receiving_lines ADD COLUMN IF NOT EXISTS lot_no VARCHAR(120);
    ALTER TABLE wms.receiving_lines ADD COLUMN IF NOT EXISTS expiry_date DATE;
    ALTER TABLE wms.receiving_lines ADD COLUMN IF NOT EXISTS bin_id UUID;
    ALTER TABLE wms.receiving_lines ADD COLUMN IF NOT EXISTS putaway_status VARCHAR(30) DEFAULT 'pending';
  END IF;

  IF to_regclass('wms.dispatch_slips') IS NOT NULL THEN
    ALTER TABLE wms.dispatch_slips ADD COLUMN IF NOT EXISTS carrier_name VARCHAR(120);
    ALTER TABLE wms.dispatch_slips ADD COLUMN IF NOT EXISTS tracking_no VARCHAR(80);
    ALTER TABLE wms.dispatch_slips ADD COLUMN IF NOT EXISTS freight_cost NUMERIC(14,2);
    ALTER TABLE wms.dispatch_slips ADD COLUMN IF NOT EXISTS delivery_id UUID;
    ALTER TABLE wms.dispatch_slips ADD COLUMN IF NOT EXISTS logo_ref INTEGER;
    ALTER TABLE wms.dispatch_slips ADD COLUMN IF NOT EXISTS logo_sync_status VARCHAR(20) DEFAULT 'pending';
  END IF;
  IF to_regclass('wms.dispatch_lines') IS NOT NULL THEN
    ALTER TABLE wms.dispatch_lines ADD COLUMN IF NOT EXISTS packed_qty NUMERIC(18,4) DEFAULT 0;
    ALTER TABLE wms.dispatch_lines ADD COLUMN IF NOT EXISTS shipped_qty NUMERIC(18,4) DEFAULT 0;
    ALTER TABLE wms.dispatch_lines ADD COLUMN IF NOT EXISTS bin_id UUID;
    ALTER TABLE wms.dispatch_lines ADD COLUMN IF NOT EXISTS lot_no VARCHAR(120);
    ALTER TABLE wms.dispatch_lines ADD COLUMN IF NOT EXISTS expiry_date DATE;
  END IF;

  IF to_regclass('wms.pick_tasks') IS NOT NULL THEN
    ALTER TABLE wms.pick_tasks ADD COLUMN IF NOT EXISTS bin_id UUID;
    ALTER TABLE wms.pick_tasks ADD COLUMN IF NOT EXISTS lot_no VARCHAR(120);
    ALTER TABLE wms.pick_tasks ADD COLUMN IF NOT EXISTS expiry_date DATE;
    ALTER TABLE wms.pick_tasks ADD COLUMN IF NOT EXISTS uom VARCHAR(30) DEFAULT 'Adet';
  END IF;

  IF to_regclass('wms.transfers') IS NOT NULL THEN
    ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
    ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
    ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS logo_ref INTEGER;
    ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS logo_sync_status VARCHAR(20) DEFAULT 'pending';
  END IF;
  IF to_regclass('wms.transfer_items') IS NOT NULL THEN
    ALTER TABLE wms.transfer_items ADD COLUMN IF NOT EXISTS source_bin_id UUID;
    ALTER TABLE wms.transfer_items ADD COLUMN IF NOT EXISTS target_bin_id UUID;
    ALTER TABLE wms.transfer_items ADD COLUMN IF NOT EXISTS lot_no VARCHAR(120);
    ALTER TABLE wms.transfer_items ADD COLUMN IF NOT EXISTS expiry_date DATE;
    ALTER TABLE wms.transfer_items ADD COLUMN IF NOT EXISTS received_qty NUMERIC(18,4) DEFAULT 0;
  END IF;

  IF to_regclass('wms.counting_slips') IS NOT NULL THEN
    ALTER TABLE wms.counting_slips ADD COLUMN IF NOT EXISTS logo_ref INTEGER;
    ALTER TABLE wms.counting_slips ADD COLUMN IF NOT EXISTS logo_sync_status VARCHAR(20) DEFAULT 'pending';
  END IF;
  IF to_regclass('wms.counting_lines') IS NOT NULL THEN
    ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS lot_no VARCHAR(120);
    ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS expiry_date DATE;
  END IF;
END $$;

-- ============================================================================
-- 9) FEFO/FIFO tahsis fonksiyonu — bin_inventory üzerinden
-- ============================================================================
CREATE OR REPLACE FUNCTION wms.allocate_fefo(
  p_firm_nr VARCHAR,
  p_product_id UUID,
  p_qty NUMERIC,
  p_store_id UUID DEFAULT NULL,
  p_strategy VARCHAR DEFAULT 'fefo'
)
RETURNS TABLE (
  bin_id UUID,
  bin_code VARCHAR,
  lot_no VARCHAR,
  expiry_date DATE,
  alloc_qty NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining NUMERIC := COALESCE(p_qty, 0);
  r RECORD;
  v_avail NUMERIC;
  v_take NUMERIC;
BEGIN
  IF v_remaining <= 0 THEN RETURN; END IF;
  FOR r IN
    SELECT bi.bin_id, bi.bin_code, bi.lot_no, bi.expiry_date,
           (bi.qty - bi.reserved_qty) AS available
    FROM wms.bin_inventory bi
    WHERE bi.firm_nr = trim(p_firm_nr)
      AND bi.product_id = p_product_id
      AND (p_store_id IS NULL OR bi.store_id = p_store_id)
      AND (bi.qty - bi.reserved_qty) > 0
    ORDER BY
      CASE WHEN p_strategy = 'fifo' THEN bi.received_at END ASC NULLS LAST,
      bi.expiry_date ASC NULLS LAST,
      bi.received_at ASC NULLS LAST
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_avail := r.available;
    v_take := LEAST(v_avail, v_remaining);
    IF v_take > 0 THEN
      bin_id := r.bin_id; bin_code := r.bin_code; lot_no := r.lot_no;
      expiry_date := r.expiry_date; alloc_qty := v_take;
      RETURN NEXT;
      v_remaining := v_remaining - v_take;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- 10) Bin envanteri upsert (delta ile artır/azalt)
-- ============================================================================
CREATE OR REPLACE FUNCTION wms.upsert_bin_inventory(
  p_firm_nr VARCHAR,
  p_store_id UUID,
  p_bin_id UUID,
  p_product_id UUID,
  p_qty_delta NUMERIC,
  p_lot_no VARCHAR DEFAULT NULL,
  p_expiry_date DATE DEFAULT NULL,
  p_product_code VARCHAR DEFAULT NULL,
  p_product_name VARCHAR DEFAULT NULL,
  p_uom VARCHAR DEFAULT 'Adet'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_bin_code VARCHAR;
BEGIN
  SELECT code INTO v_bin_code FROM wms.bins WHERE id = p_bin_id;

  INSERT INTO wms.bin_inventory (
    firm_nr, store_id, bin_id, bin_code, product_id, product_code, product_name,
    lot_no, expiry_date, qty, uom
  ) VALUES (
    trim(p_firm_nr), p_store_id, p_bin_id, v_bin_code, p_product_id, p_product_code, p_product_name,
    p_lot_no, p_expiry_date, GREATEST(p_qty_delta, 0), COALESCE(p_uom, 'Adet')
  )
  ON CONFLICT (
    firm_nr, COALESCE(store_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(bin_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(lot_no, ''), COALESCE(serial_no, ''), COALESCE(expiry_date, '1900-01-01'::date)
  )
  DO UPDATE SET
    qty = wms.bin_inventory.qty + p_qty_delta,
    product_code = COALESCE(EXCLUDED.product_code, wms.bin_inventory.product_code),
    product_name = COALESCE(EXCLUDED.product_name, wms.bin_inventory.product_name),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================================
-- 11) updated_at trigger'ları (yeni tablolar + pick_tasks)
-- ============================================================================
DO $$
BEGIN
  IF to_regprocedure('wms.update_timestamp()') IS NULL THEN
    CREATE FUNCTION wms.update_timestamp() RETURNS trigger LANGUAGE plpgsql AS
    $fn$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $fn$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_wms_bin_inventory_updated ON wms.bin_inventory;
CREATE TRIGGER trg_wms_bin_inventory_updated BEFORE UPDATE ON wms.bin_inventory
  FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();
DROP TRIGGER IF EXISTS trg_wms_putaway_updated ON wms.putaway_tasks;
CREATE TRIGGER trg_wms_putaway_updated BEFORE UPDATE ON wms.putaway_tasks
  FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();
DROP TRIGGER IF EXISTS trg_wms_packing_updated ON wms.packing_slips;
CREATE TRIGGER trg_wms_packing_updated BEFORE UPDATE ON wms.packing_slips
  FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();
DROP TRIGGER IF EXISTS trg_wms_adj_updated ON wms.stock_adjustments;
CREATE TRIGGER trg_wms_adj_updated BEFORE UPDATE ON wms.stock_adjustments
  FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();

DO $$
BEGIN
  IF to_regclass('wms.pick_tasks') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_wms_pick_tasks_updated ON wms.pick_tasks;
    CREATE TRIGGER trg_wms_pick_tasks_updated BEFORE UPDATE ON wms.pick_tasks
      FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();
  END IF;
  IF to_regclass('wms.bins') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_wms_bins_updated ON wms.bins;
    CREATE TRIGGER trg_wms_bins_updated BEFORE UPDATE ON wms.bins
      FOR EACH ROW EXECUTE PROCEDURE wms.update_timestamp();
  END IF;
END $$;

-- ============================================================================
-- 12) PostgREST anon yetkileri (rol yoksa atlanır)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA wms TO anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA wms TO anon';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA wms TO anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA wms GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA wms GRANT USAGE, SELECT ON SEQUENCES TO anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION wms.allocate_fefo(VARCHAR, UUID, NUMERIC, UUID, VARCHAR) TO anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION wms.upsert_bin_inventory(VARCHAR, UUID, UUID, UUID, NUMERIC, VARCHAR, DATE, VARCHAR, VARCHAR, VARCHAR) TO anon';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Tamamlandı kaydı
INSERT INTO public.audit_logs (firm_nr, table_name, record_id, action, new_data)
VALUES ('000', 'system', '00000000-0000-0000-0000-000000000000', 'MASTER_SCHEMA_V6',
        '{"status": "completed", "version": "6.0", "description": "Clean consolidated master schema"}'::JSONB)
ON CONFLICT DO NOTHING;
