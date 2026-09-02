-- ============================================================================
-- Migration 127: Print Designer için PostgREST grant'leri
-- ============================================================================
-- RetailEX PrintServer.Designer (C# WinForms) FRX tasarımlarını PostgREST
-- üzerinden public.report_templates tablosuna INSERT/UPDATE yapar. PostgREST
-- varsayılan olarak RLS yoksa read-only anonymouse bağlantıda bile bu
-- işlemleri yapamaz; aşağıdaki grant'ler anon rolüne INSERT/UPDATE hakkı
-- verir (firm_nr/period_nr Designer tarafında zaten UI'dan gelir).
--
-- 007_postgrest_anon_role.sql anon rolünü oluşturmuştu; bu migration yalnızca
-- raporlama/print tasarımı için INSERT/UPDATE grant'lerini ekler.
--
-- Idempotent: her blok IF EXISTS ile sarılmıştır.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) public.report_templates için INSERT/UPDATE/SELECT grant
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.report_templates TO anon';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2) public.firms, public.periods SELECT (kiracı listesi için zaten gerekli
-- ama Designer da kullanıyor; idempotent)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT SELECT ON public.firms TO anon';
    EXECUTE 'GRANT SELECT ON public.periods TO anon';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3) print_designer adında bir rol öner (PostgREST bearer auth ile kullanılır).
-- Eğer admin tarafından özel bir bearer atanacaksa bu rol GRANT'larla
-- oluşturulur. İdempotent: rol yoksa oluştur.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'print_designer') THEN
    CREATE ROLE print_designer NOLOGIN;
  END IF;
  EXECUTE 'GRANT USAGE ON SCHEMA public TO print_designer';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.report_templates TO print_designer';
  EXECUTE 'GRANT SELECT ON public.firms TO print_designer';
  EXECUTE 'GRANT SELECT ON public.periods TO print_designer';
END $$;

COMMENT ON ROLE print_designer IS
  'RetailEX Print Server Designer icin PostgREST bearer auth rolu; public.report_templates INSERT/UPDATE ve public.firms/periods SELECT yetkisi verir. Uretim ortaminda yalnizca POSTGREST_JWT_SECRET uzerinden JWT token ile oturum acilir.';

-- ============================================================================
-- Migration 127 tamamlandi.
-- Beklenen etki:
--   * Designer, DesignerConfig.PostgRest.BearerToken uzerinden baglanir
--   * Token icindeki "role": "print_designer" claim ile POSTGREST yetkilendirmesi yapar
--   * Rapor tasarimi (INSERT) ve guncelleme (UPDATE) PostgREST uzerinden calisir
--   * Mevcut anon uzerinden sadece SELECT yetkisi korunur (RLS acilmadikca)
-- ============================================================================
