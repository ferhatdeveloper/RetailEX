-- Finans → Tanımlar (finance-definitions): tüm firmalarda varsayılan gizli.
-- Alt maddeler (payment-plans, cost-centers) zaten 160 ile gizlenmişti; boş üst grup
-- orphan leaf olarak kalmasın. Menü Yönetimi’nden istenirse açılır.

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS menu_preferences JSONB DEFAULT '{}'::jsonb;

UPDATE public.system_settings AS ss
SET
  menu_preferences = jsonb_set(
    COALESCE(ss.menu_preferences, '{}'::jsonb),
    '{presets}',
    COALESCE(
      (
        SELECT jsonb_agg(updated_elem)
        FROM (
          SELECT
            jsonb_set(
              elem,
              '{hidden_modules}',
              (
                SELECT COALESCE(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
                FROM (
                  SELECT DISTINCT v
                  FROM (
                    SELECT jsonb_array_elements_text(
                      COALESCE(elem -> 'hidden_modules', '[]'::jsonb)
                    ) AS v
                    UNION
                    SELECT 'finance-definitions'::text
                  ) u
                ) d
              )
            ) AS updated_elem
          FROM jsonb_array_elements(
            COALESCE(ss.menu_preferences -> 'presets', '[]'::jsonb)
          ) AS elem
        ) q
      ),
      '[]'::jsonb
    )
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE ss.id = 1
  AND jsonb_typeof(COALESCE(ss.menu_preferences -> 'presets', '[]'::jsonb)) = 'array'
  AND jsonb_array_length(COALESCE(ss.menu_preferences -> 'presets', '[]'::jsonb)) > 0;

INSERT INTO public.system_settings (id, default_currency, menu_preferences)
SELECT 1, 'IQD', jsonb_build_object(
  'version', 2,
  'active_preset_id', 'retailex-factory-default',
  'presets', jsonb_build_array(
    jsonb_build_object(
      'id', 'retailex-factory-default',
      'name', 'Varsayılan',
      'saved_by', 'sistem',
      'saved_at', '2026-09-21T21:00:00.000Z',
      'hidden_modules', to_jsonb(ARRAY[
        'databroadcast','integrations','human-resources','hr','attendance','payroll','performance',
        'production-recipe','butcher-production','material-classes','unit-sets','variants','special-codes',
        'brand-definitions','scale','group-codes','product-categories','smart-material-add',
        'purchaserequest','purchase','sales-invoice-standard','sales-invoice-wholesale','sales-invoice-consignment',
        'etransform','waybill','Siparişler','Teklifler','delivery-management','logistics','delivery-live',
        'couriers','retail','pricing','cashier-scale','scale-management','notifications','smsmanage',
        'emailcamp','print-options','pendingposdevices','supabase-migration','logaudit',
        'finance-definitions','payment-plans','cost-centers'
      ]::text[]),
      'item_orders', '{}'::jsonb
    )
  )
)
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE id = 1);
