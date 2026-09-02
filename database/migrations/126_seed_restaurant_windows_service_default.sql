-- ============================================================================
-- Migration 126: Restoran modülü için varsayılan printViaWindowsService = true
-- ============================================================================
-- Amaç: Mevcut tüm aktif firmalara app_settings anahtarı
--       'restaurant_printer_config' seed'lenir. Varsayılan değer:
--         {
--           printerProfiles: [],
--           printerRoutes:   [],
--           printViaWindowsService: true
--         }
-- Böylece restoran modülünde Windows yazıcı servisi varsayılan olarak
-- etkinleştirilir; kullanıcı isterse UI üzerinden kapatabilir.
--
-- İlişkili migration'lar:
--   110 — public.print_design_bindings (yazıcı/dizayn eşlemesi)
--   124 — public.INIT_RESTAURANT_PRINT_JOBS_TABLE + kitchen_print_jobs
--   125 — party_ledger catch-up (bu dosyadan bağımsız; bağlam için)
--
-- Idempotent: ON CONFLICT (key, firm_nr) DO NOTHING.
-- Birden fazla kez çalıştırılabilir; mevcut kayıtlar korunur, üzerine
-- yazılmaz. Sıfır kurulum senaryosunda `public.firms` yoksa demo firmalarla
-- birlikte tablo oluşturulur.
-- ============================================================================

-- Sıfır kurulum fallback: public.firms yoksa demo seed ile birlikte oluştur
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'firms'
  ) THEN
    CREATE TABLE public.firms (
      firm_nr varchar(10) PRIMARY KEY,
      name text NOT NULL,
      is_active boolean DEFAULT true
    );
    INSERT INTO public.firms (firm_nr, name, is_active) VALUES
      ('001', 'Demo Firma 1', true),
      ('002', 'Demo Firma 2', true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- app_settings tablosunun varlığını idempotent güvenceye al
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key varchar(128) NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  firm_nr varchar(10) NOT NULL DEFAULT '001',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT app_settings_key_firm_unique UNIQUE (key, firm_nr)
);

CREATE INDEX IF NOT EXISTS idx_app_settings_key_firm
  ON public.app_settings (key, firm_nr);

-- Seed: tüm aktif firmalar için restaurant_printer_config
INSERT INTO public.app_settings (key, value, firm_nr)
SELECT
  'restaurant_printer_config'::varchar AS key,
  jsonb_build_object(
    'printerProfiles', '[]'::jsonb,
    'printerRoutes',   '[]'::jsonb,
    'printViaWindowsService', true
  ) AS value,
  f.firm_nr
FROM public.firms f
WHERE f.is_active = true
ON CONFLICT (key, firm_nr) DO NOTHING;

-- ============================================================================
-- Beklenen etki:
--   * Yeni kurulumlarda: restoran modülü açıldığında Windows yazıcı servisi
--     otomatik olarak AÇIK gelir (printViaWindowsService = true).
--   * Mevcut kurulumlarda: app_settings zaten varsa atlanır; kullanıcının
--     kayıtlı tercihleri korunur.
--   * UI: restoran ayarlar ekranında durum rozeti (PrintServiceStatusBadge)
--     AÇIK görünür.
-- ============================================================================
