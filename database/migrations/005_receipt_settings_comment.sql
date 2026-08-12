-- Fiş / Firma bilgisi ayarları app_settings tablosunda key='receipt_settings' ile tutulur.
-- value (JSONB) örnek: { "companyName": "...", "companyAddress": "...", "logoDataUrl": "data:image/...", ... }
-- Bu migration sadece dokümantasyon amaçlıdır; app_settings zaten 000_master_schema.sql içinde tanımlı.

COMMENT ON TABLE app_settings IS 'Uygulama ayarları; key+firm_nr ile benzersiz. receipt_settings: fiş logosu ve firma bilgisi.';
