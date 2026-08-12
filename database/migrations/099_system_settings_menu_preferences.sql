-- Statik menü yönetimi: gizli modüller ve sıra tercihleri (localStorage yedek; asıl kaynak PG)
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS menu_preferences JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.system_settings.menu_preferences IS
  'Menü yönetimi: hidden_modules[], item_orders{screen_id:order}, updated_at. İstemci açılışında PG→localStorage senkron.';

NOTIFY pgrst, 'reload schema';
