-- Mağaza başına terazi köprüsü (Windows servisi) URL ve token
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS scale_bridge_url TEXT;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS scale_bridge_token TEXT;

COMMENT ON COLUMN public.stores.scale_bridge_url IS
  'Mağaza PC''deki RetailEX Terazi Köprüsü HTTP adresi (örn. http://192.168.1.50:3012).';

COMMENT ON COLUMN public.stores.scale_bridge_token IS
  'Köprü authToken (scale-bridge.json); boşsa token doğrulaması yapılmaz.';
