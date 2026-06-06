-- Anket operatörü: yalnızca güzellik modülünde memnuniyet anketi uygulama
INSERT INTO public.roles (id, name, description, is_system_role, color, permissions, landing_route) VALUES
(
  '00000000-0000-0000-0000-000000000006',
  'anket',
  'Anket operatörü — yalnızca memnuniyet anketi uygulama',
  true,
  '#8B5CF6',
  '[{"module":"beauty.surveys","actions":["READ","EXECUTE"]}]',
  'beauty'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  permissions = EXCLUDED.permissions,
  landing_route = EXCLUDED.landing_route;
