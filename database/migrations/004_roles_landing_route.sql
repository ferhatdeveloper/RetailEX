-- Rol bazlı giriş sonrası yönlendirme (garson → restoran vb.)
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS landing_route VARCHAR(100) DEFAULT NULL;
COMMENT ON COLUMN public.roles.landing_route IS 'Giriş sonrası açılacak modül: restaurant, pos, management, wms, beauty veya boş (ana sayfa).';

-- Garson rolü yoksa ekle, varsa landing_route güncelle
INSERT INTO public.roles (id, name, description, is_system_role, color, permissions, landing_route) VALUES
('00000000-0000-0000-0000-000000000005', 'garson', 'Garson — Restoran masa servisi', true, '#F97316', '["restaurant.pos", "restaurant.kds"]', 'restaurant')
ON CONFLICT (name) DO UPDATE SET landing_route = EXCLUDED.landing_route;
