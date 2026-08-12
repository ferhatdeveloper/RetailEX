-- merkez_db: demo kiracı için module='all' izni
-- Çalıştır: psql -d merkez_db -f database/scripts/merkez_tenant_registry_allow_module_all.sql

ALTER TABLE public.tenant_registry DROP CONSTRAINT IF EXISTS tenant_registry_module_check;

ALTER TABLE public.tenant_registry
  ADD CONSTRAINT tenant_registry_module_check
  CHECK (module = ANY (ARRAY[
    'tenant_registry'::text,
    'clinic'::text,
    'restaurant'::text,
    'hrm'::text,
    'retail'::text,
    'pdks'::text,
    'wms'::text,
    'all'::text
  ]));

UPDATE public.tenant_registry
SET module = 'all',
    notes = 'Demo — tüm kabuk modülleri açık',
    updated_at = NOW()
WHERE database_name = 'retailex_demo'
   OR lower(code) IN ('demo', 'retailex_demo');
