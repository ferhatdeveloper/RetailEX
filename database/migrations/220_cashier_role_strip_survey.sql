-- Market kasiyerinden memnuniyet anketi (beauty.surveys) çıkarılır.
-- Klinik kiracı (firms.enabled_modules içinde beauty) kasiyerine dokunulmaz;
-- anket satırı klinik menüsünde kalır, iniş sayfası olmaz.
-- admin, anket ve diğer özel rollerin izin dizisi değişmez.

UPDATE public.roles AS r
SET
  permissions = COALESCE(
    (
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(r.permissions) = 'array' THEN r.permissions
          ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE NOT (
        (
          jsonb_typeof(elem) = 'string'
          AND (
            elem #>> '{}' = 'beauty.surveys'
            OR elem #>> '{}' LIKE 'beauty.surveys.%'
          )
        )
        OR (
          jsonb_typeof(elem) = 'object'
          AND elem->>'module' = 'beauty.surveys'
        )
      )
    ),
    '[]'::jsonb
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE r.permissions IS NOT NULL
  AND r.permissions::text ILIKE '%beauty.surveys%'
  AND lower(btrim(r.name)) NOT LIKE '%anket%'
  AND (
    r.id = '00000000-0000-0000-0000-000000000003'
    OR lower(btrim(r.name)) IN ('cashier', 'kasiyer')
    OR lower(btrim(r.name)) LIKE 'kasiyer%'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.firms AS f
    WHERE COALESCE(f.is_active, true)
      AND COALESCE(f.enabled_modules, '[]'::jsonb) @> '["beauty"]'::jsonb
  );
