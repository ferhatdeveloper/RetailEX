-- Kiracı DB'lerde köprü URL'sini /__wa_bridge yap (eski trycloudflare / harici URL'leri temizler)
UPDATE public.rex_001_messaging_settings
SET
  whatsapp_provider = 'EMBEDDED',
  whatsapp_base_url = '/__wa_bridge',
  updated_at = NOW()
WHERE whatsapp_base_url IS DISTINCT FROM '/__wa_bridge'
   OR whatsapp_provider IS DISTINCT FROM 'EMBEDDED';
