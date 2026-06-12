-- ============================================================================
-- 043: Meta Cloud API onaylı şablon adları (messaging_settings)
-- ============================================================================

DO $$
DECLARE
  f RECORD;
  v_prefix TEXT;
BEGIN
  FOR f IN SELECT firm_nr FROM firms WHERE COALESCE(is_active, true) LOOP
    v_prefix := lower('rex_' || f.firm_nr);
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS meta_invoice_template_name VARCHAR(120)',
      v_prefix || '_messaging_settings'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS meta_invoice_template_language VARCHAR(10)',
      v_prefix || '_messaging_settings'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS meta_appointment_template_name VARCHAR(120)',
      v_prefix || '_messaging_settings'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS meta_appointment_template_language VARCHAR(10)',
      v_prefix || '_messaging_settings'
    );
  END LOOP;
END $$;
