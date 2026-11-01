-- Klinik kasiyerinden yalnızca Leads & CRM ve Klinik operasyon anahtarlarını düşürür.
-- Anahtar yoksa satır yazılmaz. Örnek klinik kasiyer satırı (beauty READ, anket) aynı kalır.
-- Yönetici ve anket rolü değişmez. Ekranlar silinmez.

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
            elem #>> '{}' IN ('leads', 'clinic_ops', 'beauty.leads', 'beauty.clinic_ops')
            OR elem #>> '{}' LIKE 'leads.%'
            OR elem #>> '{}' LIKE 'clinic_ops.%'
            OR elem #>> '{}' LIKE 'beauty.leads.%'
            OR elem #>> '{}' LIKE 'beauty.clinic_ops.%'
          )
        )
        OR (
          jsonb_typeof(elem) = 'object'
          AND (
            COALESCE(elem->>'module', '') IN ('leads', 'clinic_ops', 'beauty.leads', 'beauty.clinic_ops')
            OR COALESCE(elem->>'module', '') LIKE 'leads.%'
            OR COALESCE(elem->>'module', '') LIKE 'clinic_ops.%'
            OR COALESCE(elem->>'module', '') LIKE 'beauty.leads.%'
            OR COALESCE(elem->>'module', '') LIKE 'beauty.clinic_ops.%'
          )
        )
      )
    ),
    '[]'::jsonb
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE r.permissions IS NOT NULL
  AND (
    r.permissions::text ILIKE '%"leads"%'
    OR r.permissions::text ILIKE '%"clinic_ops"%'
    OR r.permissions::text ILIKE '%beauty.leads%'
    OR r.permissions::text ILIKE '%beauty.clinic_ops%'
  )
  AND lower(btrim(r.name)) NOT LIKE '%anket%'
  AND lower(btrim(r.name)) NOT IN ('admin', 'sistem yöneticisi')
  AND lower(btrim(COALESCE(r.id::text, ''))) <> 'admin'
  AND (
    r.id::text = '00000000-0000-0000-0000-000000000003'
    OR lower(btrim(r.name)) IN ('cashier', 'kasiyer')
    OR lower(btrim(r.name)) LIKE 'kasiyer%'
  );
