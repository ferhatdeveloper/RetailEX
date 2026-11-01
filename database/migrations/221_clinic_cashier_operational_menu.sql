-- Klinik kasiyerine operasyon menüsü.
-- Yalnızca izin dizisi hâlâ yalnızca pos.view / pos.sell ise ve firmada beauty modülü varsa.
-- pos.view, pos.sell, beauty READ, beauty.surveys READ/CREATE/UPDATE/EXECUTE.
-- Sistem yönetimi, kullanıcı, rol, firma/dönem ve menü yönetimi eklenmez.
-- beauty yetkisi olan kasiyer satırı (klinik örneği) değişmez.
-- Market firmasına (pos var, beauty yok) uygulanmaz.

UPDATE public.roles AS r
SET
  permissions = '[
    {"module":"pos.view","actions":["READ","CREATE","UPDATE","DELETE","EXECUTE"]},
    {"module":"pos.sell","actions":["READ","CREATE","UPDATE","DELETE","EXECUTE"]},
    {"module":"beauty","actions":["READ"]},
    {"module":"beauty.surveys","actions":["READ","CREATE","UPDATE","EXECUTE"]}
  ]'::jsonb,
  updated_at = CURRENT_TIMESTAMP
WHERE lower(btrim(r.name)) NOT LIKE '%anket%'
  AND (
    r.id = '00000000-0000-0000-0000-000000000003'
    OR lower(btrim(r.name)) IN ('cashier', 'kasiyer')
    OR lower(btrim(r.name)) LIKE 'kasiyer%'
  )
  AND (
    r.permissions = '["pos.view","pos.sell"]'::jsonb
    OR r.permissions = '["pos.sell","pos.view"]'::jsonb
  )
  AND EXISTS (
    SELECT 1
    FROM public.firms AS f
    WHERE COALESCE(f.is_active, true)
      AND COALESCE(f.enabled_modules, '[]'::jsonb) @> '["beauty"]'::jsonb
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.firms AS f
    WHERE COALESCE(f.is_active, true)
      AND COALESCE(f.enabled_modules, '[]'::jsonb) @> '["pos"]'::jsonb
      AND NOT (COALESCE(f.enabled_modules, '[]'::jsonb) @> '["beauty"]'::jsonb)
  );
